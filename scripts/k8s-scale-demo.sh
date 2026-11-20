#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
NAMESPACE="unir"
INGRESS_URL="http://localhost:${UNIR_K8S_PORT:-18080}"

obtain_token() {
  python3 - "$ROOT" "$INGRESS_URL" <<'PY'
import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

root = Path(sys.argv[1])
ingress_url = sys.argv[2]
accounts = json.loads((root / "config" / "local-demo-accounts.json").read_text(encoding="utf-8"))["accounts"]
user = accounts["unir.aluno1"]

data = urllib.parse.urlencode({
    "grant_type": "password",
    "client_id": "unir-web",
    "username": user["email"],
    "password": user["password"],
}).encode("utf-8")
req = urllib.request.Request(
    f"{ingress_url}/realms/unir/protocol/openid-connect/token",
    data=data,
    headers={"Content-Type": "application/x-www-form-urlencoded"},
)
with urllib.request.urlopen(req, timeout=10) as resp:
    payload = json.loads(resp.read().decode("utf-8"))
print(payload["access_token"])
PY
}

echo "=== 1. Ensuring web-bff starts with 1 replica ==="
kubectl -n "$NAMESPACE" scale deployment/web-bff --replicas=1
kubectl -n "$NAMESPACE" rollout status deployment/web-bff --timeout=120s
kubectl -n "$NAMESPACE" get pods -l app.kubernetes.io/name=web-bff -o wide

TOKEN="$(obtain_token)"
echo "Verifying 1-replica request through Ingress -> Gateway -> Web BFF -> Engagement..."
curl -fsS -H "Authorization: Bearer $TOKEN" "$INGRESS_URL/api/v1/web/events?page=0&size=5" >/dev/null
echo "1-replica request succeeded."

echo ""
echo "=== 2. Scaling web-bff from 1 -> 3 replicas ==="
kubectl -n "$NAMESPACE" scale deployment/web-bff --replicas=3
kubectl -n "$NAMESPACE" rollout status deployment/web-bff --timeout=120s

echo ""
echo "=== 3. Three healthy web-bff pods ==="
kubectl -n "$NAMESPACE" get pods -l app.kubernetes.io/name=web-bff -o wide

SINCE_TIME="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
sleep 1

echo ""
echo "=== 4. Sending 18 requests via Ingress -> Gateway -> Web BFF ==="
for i in $(seq 1 18); do
  curl -fsS -H "Authorization: Bearer $TOKEN" "$INGRESS_URL/api/v1/web/events?page=0&size=2&req=$i" >/dev/null
done

echo ""
echo "=== 5. Verifiable evidence of request distribution across pods ==="
PODS=()
while IFS= read -r pod_name; do
  [[ -n "$pod_name" ]] && PODS+=("$pod_name")
done < <(kubectl -n "$NAMESPACE" get pods -l app.kubernetes.io/name=web-bff -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}')

PODS_HIT=0
for pod in "${PODS[@]}"; do
  count="$(kubectl -n "$NAMESPACE" logs "$pod" --since-time="$SINCE_TIME" | grep -c '"/api/v1/web/events' || true)"
  echo "Pod $pod handled $count requests:"
  kubectl -n "$NAMESPACE" logs "$pod" --since-time="$SINCE_TIME" | grep '"/api/v1/web/events' | head -n 2 || true
  if (( count > 0 )); then
    PODS_HIT=$((PODS_HIT + 1))
  fi
done

echo "Distinct web-bff pods that served traffic: ${PODS_HIT}/${#PODS[@]}"
if (( PODS_HIT < 2 )); then
  echo "ERROR: Traffic was not distributed across multiple pods!" >&2
  exit 1
fi

echo ""
echo "=== 6. Scaling web-bff back to 1 replica ==="
kubectl -n "$NAMESPACE" scale deployment/web-bff --replicas=1
kubectl -n "$NAMESPACE" rollout status deployment/web-bff --timeout=120s
kubectl -n "$NAMESPACE" get pods -l app.kubernetes.io/name=web-bff -o wide
