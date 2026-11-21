#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
NAMESPACE="unir"
INGRESS_URL="http://localhost:${UNIR_K8S_PORT:-18080}"

MONGODB_USERNAME="$(kubectl -n "$NAMESPACE" get secret unir-mongodb-credentials -o jsonpath='{.data.MONGODB_USERNAME}' | python3 -c 'import base64,sys; print(base64.b64decode(sys.stdin.read()).decode())')"
MONGODB_PASSWORD="$(kubectl -n "$NAMESPACE" get secret unir-mongodb-credentials -o jsonpath='{.data.MONGODB_PASSWORD}' | python3 -c 'import base64,sys; print(base64.b64decode(sys.stdin.read()).decode())')"

mongo_event() {
  local event_id="$1"
  kubectl -n "$NAMESPACE" exec deploy/engagement-read-db -- mongosh --quiet \
    --username "$MONGODB_USERNAME" --password "$MONGODB_PASSWORD" \
    --authenticationDatabase admin unir_engagement_read --eval \
    "const d = db.event_views.findOne({_id: \"$event_id\"}); print(d ? JSON.stringify({id:d._id,aggregateVersion:Number(d.aggregateVersion),status:d.status,title:d.title}) : \"\");"
}

wait_for_projection() {
  local event_id="$1" expected_version="$2" expected_status="$3" expected_title="$4"
  local doc=""
  for attempt in $(seq 1 120); do
    doc="$(mongo_event "$event_id")"
    if [[ -n "$doc" ]] && python3 -c '
import json, sys
doc = json.loads(sys.argv[1])
expected_version, expected_status, expected_title = int(sys.argv[2]), sys.argv[3], sys.argv[4]
raise SystemExit(0 if doc["aggregateVersion"] == expected_version
                 and doc["status"] == expected_status and doc["title"] == expected_title else 1)
' "$doc" "$expected_version" "$expected_status" "$expected_title"; then
      printf '%s\n' "$doc"
      return 0
    fi
    sleep 0.5
  done
  echo "MongoDB projection did not reach version $expected_version for event $event_id: $doc" >&2
  return 1
}

assert_outbox_published() {
  local event_id="$1" event_type="$2"
  local result
  result="$(kubectl -n "$NAMESPACE" exec deploy/engagement-db -- psql -v ON_ERROR_STOP=1 -U unir -d unir_engagement -Atc \
    "SELECT event_type || '|' || (published_at IS NOT NULL)::text FROM outbox_events WHERE aggregate_id='$event_id' ORDER BY created_at DESC LIMIT 1;")"
  [[ "$result" == "$event_type|true" ]]
}

wait_for_outbox_publish() {
  local event_id="$1" event_type="$2"
  for attempt in $(seq 1 40); do
    if assert_outbox_published "$event_id" "$event_type"; then
      return 0
    fi
    sleep 0.5
  done
  echo "Outbox event $event_type for $event_id was not confirmed by RabbitMQ" >&2
  return 1
}

echo "=== 1. Checking Kubernetes Pods, Services, PVCs, and Ingress ==="
kubectl -n "$NAMESPACE" get pods,svc,pvc,ingress

echo ""
echo "=== 2. Verifying Web, Administration, and Keycloak via Ingress ==="
web_status="$(curl -s -o /dev/null -w '%{http_code}' "$INGRESS_URL/")"
admin_status="$(curl -s -o /dev/null -w '%{http_code}' -H 'Host: admin.localhost' "$INGRESS_URL/")"
oidc_issuer="$(curl -fsS "$INGRESS_URL/realms/unir/.well-known/openid-configuration" | python3 -c 'import json,sys; print(json.load(sys.stdin)["issuer"])')"
echo "UNIR Web HTTP status: $web_status"
echo "UNIR Administration HTTP status: $admin_status"
echo "Keycloak OIDC issuer: $oidc_issuer"
[[ "$web_status" == "200" ]]
[[ "$admin_status" == "200" ]]
[[ "$oidc_issuer" == "$INGRESS_URL/realms/unir" ]]

echo ""
echo "=== 3. Authenticating Student and Admin accounts via Keycloak OIDC ==="
TOKENS_JSON="$(python3 - "$ROOT" "$INGRESS_URL" <<'PY'
import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

root = Path(sys.argv[1])
ingress_url = sys.argv[2]
accounts = json.loads((root / "config" / "local-demo-accounts.json").read_text(encoding="utf-8"))["accounts"]

def token_for(alias):
    acc = accounts[alias]
    data = urllib.parse.urlencode({
        "grant_type": "password",
        "client_id": "unir-web",
        "username": acc["email"],
        "password": acc["password"],
    }).encode("utf-8")
    req = urllib.request.Request(
        f"{ingress_url}/realms/unir/protocol/openid-connect/token",
        data=data,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read().decode("utf-8"))["access_token"]

print(json.dumps({
    "student": token_for("unir.aluno1"),
    "admin": token_for("unir.admin"),
}))
PY
)"
STUDENT_TOKEN="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["student"])' "$TOKENS_JSON")"
ADMIN_TOKEN="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["admin"])' "$TOKENS_JSON")"
echo "Student and Admin JWT tokens issued by Keycloak."

echo ""
echo "=== 4. Validating Qdrant-backed RAG through Gateway -> Web BFF ==="
RAG_READY="$(kubectl -n "$NAMESPACE" exec deploy/ai-rag -- python -c 'import json,urllib.request; print(json.dumps(json.load(urllib.request.urlopen("http://localhost:8090/health/ready", timeout=10))))')"
RAG_QUERY="$(curl -fsS -X POST -H "Authorization: Bearer $STUDENT_TOKEN" -H 'Content-Type: application/json' \
  --data '{"question":"Quais eventos acadêmicos estão disponíveis?","top_k":5}' \
  "$INGRESS_URL/api/v1/web/rag/query")"
python3 -c '
import json, sys
ready, result = json.loads(sys.argv[1]), json.loads(sys.argv[2])
sources = result.get("sources", [])
assert ready["status"] == "ok" and ready["indexedPoints"] > 0, ready
assert sources, "RAG returned no real source records"
assert all(source.get("record_id") and source.get("source_type") in {"EVENT", "OPPORTUNITY"} for source in sources)
if not ready["geminiConfigured"]:
    assert result["generation_status"] == "FALLBACK_RETRIEVAL_ONLY", result
    assert result["fallback_used"] is True, result
    assert "AVISO DE FALLBACK" in result["answer"], result
print("Qdrant indexed points:", ready["indexedPoints"])
print("RAG sources:", [(source["source_type"], source["record_id"]) for source in sources])
print("RAG generation:", result["generation_status"], "Gemini configured:", ready["geminiConfigured"])
' "$RAG_READY" "$RAG_QUERY"

SYNC_TOKEN="$(kubectl -n "$NAMESPACE" get secret unir-rag-credentials -o jsonpath='{.data.RAG_SYNC_TOKEN}' | python3 -c 'import base64,sys; print(base64.b64decode(sys.stdin.read()).decode())')"
INVALID_JWT_STATUS="$(curl -s -o /dev/null -w '%{http_code}' -X POST \
  -H 'Authorization: Bearer not-a-signed-jwt' -H 'Content-Type: application/json' \
  --data '{"question":"Quais eventos existem?","top_k":2}' \
  "$INGRESS_URL/api/v1/web/rag/query")"
SYNC_AS_USER_STATUS="$(curl -s -o /dev/null -w '%{http_code}' -X POST \
  -H "Authorization: Bearer $SYNC_TOKEN" -H 'Content-Type: application/json' \
  --data '{"question":"Quais eventos existem?","top_k":2}' \
  "$INGRESS_URL/api/v1/web/rag/query")"
PUBLIC_INGEST_STATUS="$(curl -s -o /dev/null -w '%{http_code}' -X POST \
  "$INGRESS_URL/api/v1/rag/ingest")"
echo "Invalid JWT query: HTTP $INVALID_JWT_STATUS"
echo "Sync credential presented as user JWT: HTTP $SYNC_AS_USER_STATUS"
echo "Direct public ingestion path: HTTP $PUBLIC_INGEST_STATUS"
[[ "$INVALID_JWT_STATUS" == "401" ]]
[[ "$SYNC_AS_USER_STATUS" == "401" ]]
[[ "$PUBLIC_INGEST_STATUS" == "401" || "$PUBLIC_INGEST_STATUS" == "404" ]]

echo ""
echo "=== 5. Validating Gateway -> Web BFF -> Campus & Admin BFF -> Campus ==="
curl -fsS -H "Authorization: Bearer $STUDENT_TOKEN" "$INGRESS_URL/api/v1/me" | python3 -c 'import json,sys; d=json.load(sys.stdin); print("Student Profile:", d["id"], d["name"], d["course"])'
curl -fsS -H "Authorization: Bearer $ADMIN_TOKEN" "$INGRESS_URL/api/v1/admin/me" | python3 -c 'import json,sys; d=json.load(sys.stdin); print("Admin Profile via Admin BFF:", d["id"], d["name"])'
curl -fsS -H "Authorization: Bearer $STUDENT_TOKEN" "$INGRESS_URL/api/v1/web/departments" | python3 -c 'import json,sys; d=json.load(sys.stdin); print("Campus Departments count:", len(d.get("items", d if isinstance(d, list) else [])))'

echo ""
echo "=== 6. Validating PostgreSQL -> Outbox -> RabbitMQ -> MongoDB CQRS lifecycle ==="
ORGANIZER_CONTEXTS="$(curl -fsS -H "Authorization: Bearer $ADMIN_TOKEN" \
  "$INGRESS_URL/api/v1/web/events/organizer-contexts")"
ORGANIZER_JSON="$(python3 -c '
import json,sys
contexts = json.loads(sys.argv[1]).get("items", [])
department = next((item for item in contexts if item.get("organizerType") == "DEPARTMENT"), None)
if not department:
    raise SystemExit("The local admin account has no verified Department organizer context")
print(json.dumps(department))
' "$ORGANIZER_CONTEXTS")"
CREATE_BODY="$(python3 - "$ORGANIZER_JSON" <<'PY'
import json, sys, uuid
from datetime import datetime, timedelta, timezone

organizer = json.loads(sys.argv[1])
now = datetime.now(timezone.utc).replace(microsecond=0)
event_id = str(uuid.uuid4())
starts_at = now + timedelta(days=2)
print(json.dumps({
    "title": f"Kubernetes CQRS verification {event_id[:8]}",
    "description": "Temporary local integration verification for the event projection flow.",
    "organizerType": organizer["organizerType"],
    "organizerId": organizer["organizerId"],
    "location": "UNIR local verification",
    "startsAt": starts_at.isoformat().replace("+00:00", "Z"),
    "endsAt": (starts_at + timedelta(hours=2)).isoformat().replace("+00:00", "Z"),
    "category": "ACADEMIC",
    "capacity": 30,
    "registrationDeadline": (now + timedelta(days=1)).isoformat().replace("+00:00", "Z"),
    "registrationMode": "INTERNAL_FREE",
    "price": None,
    "externalUrl": None,
    "attendanceEnabled": False,
    "attendanceMode": None,
    "imageUrl": None,
}))
PY
)"
CREATE_RESPONSE="$(curl -fsS -X POST -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  --data "$CREATE_BODY" "$INGRESS_URL/api/v1/web/events")"
CQRS_EVENT_ID="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["id"])' "$CREATE_RESPONSE")"
INITIAL_TITLE="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["title"])' "$CREATE_RESPONSE")"
CREATE_STARTED_MS="$(python3 -c 'import datetime,json,re,sys; value=json.loads(sys.argv[1])["createdAt"].replace("Z","+00:00"); value=re.sub(r"(\.\d{6})\d+(?=[+-]\d{2}:\d{2}$)",r"\1",value); print(int(datetime.datetime.fromisoformat(value).timestamp()*1000))' "$CREATE_RESPONSE")"
POSTGRES_EVENT="$(kubectl -n "$NAMESPACE" exec deploy/engagement-db -- psql -v ON_ERROR_STOP=1 -U unir -d unir_engagement -Atc \
  "SELECT version || '|' || status FROM events WHERE id='$CQRS_EVENT_ID';")"
[[ "$POSTGRES_EVENT" == "0|ACTIVE" ]]
wait_for_outbox_publish "$CQRS_EVENT_ID" "EventProjectionCreated"
INITIAL_PROJECTION="$(wait_for_projection "$CQRS_EVENT_ID" 0 ACTIVE "$INITIAL_TITLE")"
INITIAL_PROJECTED_MS="$(python3 -c 'import time; print(int(time.time() * 1000))')"
echo "Created event in PostgreSQL and MongoDB: $CQRS_EVENT_ID"
echo "Create-to-projection latency: $((INITIAL_PROJECTED_MS - CREATE_STARTED_MS)) ms"

QUEUE_STATS="$(kubectl -n "$NAMESPACE" exec deploy/rabbitmq -- rabbitmqctl list_queues name messages consumers)"
printf '%s\n' "$QUEUE_STATS" | python3 -c '
import sys
rows = [line.split() for line in sys.stdin if line.strip()]
queue = next((row for row in rows if row[0] == "engagement.event-projections"), None)
assert queue is not None and len(queue) >= 3, rows
assert int(queue[1]) == 0 and int(queue[2]) >= 1, queue
print("RabbitMQ event-projection queue drained with consumers:", queue[2])
'

UPDATED_TITLE="$INITIAL_TITLE — atualizado"
UPDATE_STARTED_MS="$(python3 -c 'import time; print(int(time.time() * 1000))')"
curl -fsS -X PATCH -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  --data "$(python3 -c 'import json,sys; print(json.dumps({"title":sys.argv[1]}))' "$UPDATED_TITLE")" \
  "$INGRESS_URL/api/v1/web/events/$CQRS_EVENT_ID" >/dev/null
UPDATED_POSTGRES="$(kubectl -n "$NAMESPACE" exec deploy/engagement-db -- psql -v ON_ERROR_STOP=1 -U unir -d unir_engagement -Atc \
  "SELECT version || '|' || status FROM events WHERE id='$CQRS_EVENT_ID';")"
[[ "$UPDATED_POSTGRES" == "1|ACTIVE" ]]
wait_for_outbox_publish "$CQRS_EVENT_ID" "EventProjectionUpdated"
wait_for_projection "$CQRS_EVENT_ID" 1 ACTIVE "$UPDATED_TITLE" >/dev/null
UPDATED_PROJECTED_MS="$(python3 -c 'import time; print(int(time.time() * 1000))')"
echo "Update-to-projection latency: $((UPDATED_PROJECTED_MS - UPDATE_STARTED_MS)) ms"

curl -fsS -H "Authorization: Bearer $STUDENT_TOKEN" "$INGRESS_URL/api/v1/web/events/$CQRS_EVENT_ID" | python3 -c \
  'import json,sys; d=json.load(sys.stdin); assert d["title"].endswith("— atualizado"); print("Projected event detail verified:", d["id"], d["status"])'

curl -fsS -X DELETE -H "Authorization: Bearer $ADMIN_TOKEN" \
  "$INGRESS_URL/api/v1/web/events/$CQRS_EVENT_ID" >/dev/null
CANCELLED_POSTGRES="$(kubectl -n "$NAMESPACE" exec deploy/engagement-db -- psql -v ON_ERROR_STOP=1 -U unir -d unir_engagement -Atc \
  "SELECT version || '|' || status FROM events WHERE id='$CQRS_EVENT_ID';")"
[[ "$CANCELLED_POSTGRES" == "2|CANCELLED" ]]
wait_for_outbox_publish "$CQRS_EVENT_ID" "EventProjectionCancelled"
wait_for_projection "$CQRS_EVENT_ID" 2 CANCELLED "$UPDATED_TITLE" >/dev/null
curl -fsS -H "Authorization: Bearer $STUDENT_TOKEN" "$INGRESS_URL/api/v1/web/events/$CQRS_EVENT_ID" | python3 -c \
  'import json,sys; d=json.load(sys.stdin); assert d["status"] == "CANCELLED"; print("Historical detail retained after cancellation:", d["id"], d["status"])'
curl -fsS -H "Authorization: Bearer $STUDENT_TOKEN" "$INGRESS_URL/api/v1/web/events?page=0&size=100" | python3 -c \
  'import json,sys; event_id=sys.argv[1]; d=json.load(sys.stdin); assert all(item["id"] != event_id for item in d["items"]); print("Cancelled event excluded from active list")' "$CQRS_EVENT_ID"

echo ""
echo "=== 7. Validating Gateway -> Web BFF -> Engagement (Events listing & Registration) ==="
FREE_EVENT_ID="ee7dfbd1-214e-55e6-8f1d-27b0b1a20131"
curl -fsS -H "Authorization: Bearer $STUDENT_TOKEN" "$INGRESS_URL/api/v1/web/events?page=0&size=5" | python3 -c 'import json,sys; d=json.load(sys.stdin); print("Total discoverable events:", d["totalElements"])'

REG_RESPONSE="$(curl -sS -w '\n%{http_code}' -X POST -H "Authorization: Bearer $STUDENT_TOKEN" "$INGRESS_URL/api/v1/web/events/$FREE_EVENT_ID/registrations")"
REG_HTTP_CODE="${REG_RESPONSE##*$'\n'}"
REG_BODY="${REG_RESPONSE%$'\n'*}"
echo "POST /api/v1/web/events/$FREE_EVENT_ID/registrations returned HTTP $REG_HTTP_CODE"
python3 -c '
import json, sys
payload = json.loads(sys.argv[1])
safe = {key: payload[key] for key in ("id", "eventId", "status") if key in payload}
print("Registration response:", safe)
' "$REG_BODY"
echo ""
[[ "$REG_HTTP_CODE" == "201" || "$REG_HTTP_CODE" == "409" ]]

echo ""
echo "=== 8. Validating RabbitMQ Outbox -> Access Attendance Synchronization ==="
sleep 2
curl -fsS -H "Authorization: Bearer $STUDENT_TOKEN" "$INGRESS_URL/api/v1/web/attendance/me?eventId=$FREE_EVENT_ID" | python3 -c 'import json,sys; d=json.load(sys.stdin); print("Access attendance entry:", d["eventId"], d["status"])'

echo ""
echo "=== 9. Validating Stateful Persistence Across Database Pod Restart ==="
OLD_DB_POD="$(kubectl -n "$NAMESPACE" get pods -l app.kubernetes.io/name=engagement-db -o jsonpath='{.items[0].metadata.name}')"
echo "Deleting engagement-db pod $OLD_DB_POD..."
kubectl -n "$NAMESPACE" delete pod "$OLD_DB_POD" --wait=true
sleep 2
kubectl -n "$NAMESPACE" wait --for=condition=Ready pod -l app.kubernetes.io/name=engagement-db --timeout=120s
NEW_DB_POD="$(kubectl -n "$NAMESPACE" get pods -l app.kubernetes.io/name=engagement-db -o jsonpath='{.items[0].metadata.name}')"
echo "New engagement-db pod is Ready: $NEW_DB_POD (previous: $OLD_DB_POD)"

curl -fsS -H "Authorization: Bearer $STUDENT_TOKEN" "$INGRESS_URL/api/v1/web/me/activities" | python3 -c '
import json, sys
d = json.load(sys.stdin)
items = [item for item in d["items"] if item["eventId"] == "ee7dfbd1-214e-55e6-8f1d-27b0b1a20131"]
assert items, "Registration not found after engagement-db pod restart!"
print("Persisted registration verified after DB pod restart:", items[0]["id"], items[0]["status"])
'
