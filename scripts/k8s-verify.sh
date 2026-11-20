#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
NAMESPACE="unir"
INGRESS_URL="http://localhost:${UNIR_K8S_PORT:-18080}"

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
echo "=== 4. Validating Gateway -> Web BFF -> Campus & Admin BFF -> Campus ==="
curl -fsS -H "Authorization: Bearer $STUDENT_TOKEN" "$INGRESS_URL/api/v1/me" | python3 -c 'import json,sys; d=json.load(sys.stdin); print("Student Profile:", d["id"], d["name"], d["course"])'
curl -fsS -H "Authorization: Bearer $ADMIN_TOKEN" "$INGRESS_URL/api/v1/admin/me" | python3 -c 'import json,sys; d=json.load(sys.stdin); print("Admin Profile via Admin BFF:", d["id"], d["name"])'
curl -fsS -H "Authorization: Bearer $STUDENT_TOKEN" "$INGRESS_URL/api/v1/web/departments" | python3 -c 'import json,sys; d=json.load(sys.stdin); print("Campus Departments count:", len(d.get("items", d if isinstance(d, list) else [])))'

echo ""
echo "=== 5. Validating Gateway -> Web BFF -> Engagement (Events listing & Registration) ==="
FREE_EVENT_ID="ee7dfbd1-214e-55e6-8f1d-27b0b1a20131"
curl -fsS -H "Authorization: Bearer $STUDENT_TOKEN" "$INGRESS_URL/api/v1/web/events?page=0&size=5" | python3 -c 'import json,sys; d=json.load(sys.stdin); print("Total discoverable events:", d["totalElements"])'

REG_HTTP_CODE="$(curl -s -o /tmp/unir-k8s-reg.json -w '%{http_code}' -X POST -H "Authorization: Bearer $STUDENT_TOKEN" "$INGRESS_URL/api/v1/web/events/$FREE_EVENT_ID/registrations")"
echo "POST /api/v1/web/events/$FREE_EVENT_ID/registrations returned HTTP $REG_HTTP_CODE"
cat /tmp/unir-k8s-reg.json
echo ""
[[ "$REG_HTTP_CODE" == "201" || "$REG_HTTP_CODE" == "409" ]]

echo ""
echo "=== 6. Validating RabbitMQ Outbox -> Access Attendance Synchronization ==="
sleep 2
curl -fsS -H "Authorization: Bearer $STUDENT_TOKEN" "$INGRESS_URL/api/v1/web/attendance/me?eventId=$FREE_EVENT_ID" | python3 -c 'import json,sys; d=json.load(sys.stdin); print("Access attendance entry:", d["eventId"], d["status"])'

echo ""
echo "=== 7. Validating Stateful Persistence Across Database Pod Restart ==="
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
