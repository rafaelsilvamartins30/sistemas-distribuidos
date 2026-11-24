#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SEED_MODE="${UNIR_SEED_MODE:-demo}"
if [[ "$SEED_MODE" != "clean" && "$SEED_MODE" != "demo" ]]; then
  echo "UNIR_SEED_MODE inválido: '$SEED_MODE' (use 'clean' ou 'demo')." >&2
  exit 1
fi

load_env_defaults() {
  local env_file="$ROOT/config/local.env.example"
  if [[ -f "$ROOT/.env" ]]; then
    env_file="$ROOT/.env"
  fi
  set -a
  # shellcheck disable=SC1090
  source "$env_file"
  set +a
  : "${KEYCLOAK_PORT:=18081}"
  : "${GATEWAY_PORT:=18084}"
  : "${WEB_PORT:=15173}"
  : "${ADMIN_WEB_PORT:=15175}"
  : "${MAILPIT_PORT:=18025}"
  : "${RABBITMQ_UI_PORT:=15672}"
  : "${QDRANT_PORT:=16333}"
  : "${AI_RAG_PORT:=18090}"
  : "${DB_PASSWORD:=unir-local-only}"
  : "${KEYCLOAK_DB_PASSWORD:=keycloak-local-only}"
  : "${KEYCLOAK_ADMIN_USERNAME:=admin}"
  : "${KEYCLOAK_ADMIN_PASSWORD:=admin-local-only}"
  : "${RABBITMQ_USERNAME:=unir}"
  : "${RABBITMQ_PASSWORD:=unir-local-only}"
  : "${MONGODB_USERNAME:=unir}"
  : "${MONGODB_PASSWORD:=${DB_PASSWORD}}"
  : "${RAG_SYNC_TOKEN:=unir-rag-sync-local-only}"
  : "${RAG_SYNC_CLIENT_ID:=unir-rag-sync}"
  : "${RAG_SYNC_CLIENT_SECRET:=unir-rag-client-local-only}"
  : "${GEMINI_API_KEY:=}"
}

wait_http() {
  local name="$1" url="$2" attempts="${3:-90}"
  for _ in $(seq 1 "$attempts"); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  echo "Tempo esgotado aguardando ${name} em ${url}." >&2
  return 1
}

provision_keycloak_and_accounts() {
  echo "Configuring Keycloak clients (unir-web + ${RAG_SYNC_CLIENT_ID})..."
  docker compose exec -T \
    -e "WEB_PORT=$WEB_PORT" \
    -e "ADMIN_WEB_PORT=$ADMIN_WEB_PORT" \
    -e "RAG_SYNC_CLIENT_ID=$RAG_SYNC_CLIENT_ID" \
    -e "RAG_SYNC_CLIENT_SECRET=$RAG_SYNC_CLIENT_SECRET" \
    keycloak sh -c '
    set -eu
    KCADM=/opt/keycloak/bin/kcadm.sh
    CFG=/tmp/kcadm-compose.config
    trap "rm -f $CFG" EXIT
    "$KCADM" config credentials --config "$CFG" --server http://localhost:8080 --realm master \
      --user "$KC_BOOTSTRAP_ADMIN_USERNAME" --password "$KC_BOOTSTRAP_ADMIN_PASSWORD" >/dev/null

    WEB_CID=$("$KCADM" get clients --config "$CFG" -r unir -q clientId=unir-web --fields id --format csv --noquotes | head -n 1)
    "$KCADM" update "clients/$WEB_CID" --config "$CFG" -r unir \
      -s "redirectUris=[\"http://localhost:${WEB_PORT}/*\",\"http://localhost:${ADMIN_WEB_PORT}/*\"]" \
      -s "webOrigins=[\"http://localhost:${WEB_PORT}\",\"http://localhost:${ADMIN_WEB_PORT}\"]" \
      -s directAccessGrantsEnabled=true

    RAG_CID=$("$KCADM" get clients --config "$CFG" -r unir -q "clientId=$RAG_SYNC_CLIENT_ID" --fields id --format csv --noquotes | head -n 1)
    if [ -z "$RAG_CID" ]; then
      "$KCADM" create clients --config "$CFG" -r unir -s "clientId=$RAG_SYNC_CLIENT_ID" \
        -s enabled=true -s protocol=openid-connect -s publicClient=false \
        -s serviceAccountsEnabled=true -s standardFlowEnabled=false \
        -s directAccessGrantsEnabled=false -s "secret=$RAG_SYNC_CLIENT_SECRET"
    else
      "$KCADM" update "clients/$RAG_CID" --config "$CFG" -r unir -s enabled=true \
        -s publicClient=false -s serviceAccountsEnabled=true -s standardFlowEnabled=false \
        -s directAccessGrantsEnabled=false -s "secret=$RAG_SYNC_CLIENT_SECRET"
    fi
    "$KCADM" add-roles --config "$CFG" -r unir \
      --uusername "service-account-$RAG_SYNC_CLIENT_ID" --rolename USER
  '

  python3 "$ROOT/scripts/prepare-local-demo-accounts.py" --mode "$SEED_MODE"
  echo "Provisioning UNIR accounts (mode: ${SEED_MODE}) in Docker Compose Keycloak..."
  RAG_SYNC_CLIENT_ID="$RAG_SYNC_CLIENT_ID" \
    RAG_SYNC_CLIENT_SECRET="$RAG_SYNC_CLIENT_SECRET" \
    python3 - "$ROOT" <<'PY'
import importlib.util
import json
import os
import subprocess
import sys
from pathlib import Path

root = Path(sys.argv[1])
spec = importlib.util.spec_from_file_location("prov", root / "scripts" / "provision-local-demo-accounts.py")
prov = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prov)

accounts_path = root / "config" / "local-demo-accounts.json"
data = json.loads(accounts_path.read_text(encoding="utf-8"))
script = prov.provision_script(
    data["accounts"],
    os.environ["RAG_SYNC_CLIENT_ID"],
    os.environ["RAG_SYNC_CLIENT_SECRET"],
)
result = subprocess.run(
    ["docker", "compose", "exec", "-T", "keycloak", "sh", "-s"],
    input=script,
    check=True,
    text=True,
    capture_output=True,
)
assigned = dict(line.split("\t", 1) for line in result.stdout.splitlines() if "\t" in line)
for username, sub in assigned.items():
    data["accounts"][username]["sub"] = sub
prov.write_private_json(data)
print(f"Keycloak (Docker Compose): {len(assigned)} account(s) provisioned and synchronized.")
PY
}

seed_databases() {
  echo "Seeding Campus database in Docker Compose (mode: ${SEED_MODE})..."
  tar -C "$ROOT/campus" -cf - db/seeds.rb db/seeders | docker compose exec -T campus tar -C /app -xf -
  docker compose exec -T -e "UNIR_SEED_MODE=$SEED_MODE" campus sh -ec \
    'cat > /tmp/local-demo-accounts.json && chmod 600 /tmp/local-demo-accounts.json && LOCAL_DEMO_ACCOUNTS_FILE=/tmp/local-demo-accounts.json bin/rails db:seed' \
    < "$ROOT/config/local-demo-accounts.json"
}

populate_demo_data() {
  if [[ "$SEED_MODE" != "demo" ]]; then
    return 0
  fi
  echo "Populating local demo data (posts, events, opportunities, and sports)..."
  UNIR_DEMO_BASE_URL="http://localhost:${GATEWAY_PORT}" \
    UNIR_DEMO_KEYCLOAK_URL="http://localhost:${KEYCLOAK_PORT}" \
    python3 "$ROOT/scripts/populate-local-demo.py"
}

rebuild_event_projection() {
  echo "Rebuilding the MongoDB event projection from PostgreSQL after seeds..."
  docker compose exec -T \
    -e SPRING_MAIN_WEB_APPLICATION_TYPE=none \
    -e ENGAGEMENT_EVENT_PROJECTION_REBUILD_AND_EXIT=true \
    engagement java -jar /app/app.jar
}

sync_rag_index() {
  echo "Waiting for AI / RAG readiness and indexing active events and opportunities into Qdrant..."
  wait_http "ai-rag" "http://localhost:${AI_RAG_PORT}/health/ready" 180
  docker compose exec -T ai-rag python -c '
import json, os, urllib.request
request = urllib.request.Request(
    "http://localhost:8090/api/v1/rag/ingest",
    method="POST",
    headers={"X-RAG-Sync-Token": os.environ["RAG_SYNC_TOKEN"]},
)
with urllib.request.urlopen(request, timeout=180) as response:
    result = json.load(response)
print(json.dumps({key: result[key] for key in (
    "events_indexed", "opportunities_indexed", "stale_points_removed", "collection_point_count"
)}))
'
}

main() {
  load_env_defaults

  local build_flag=()
  if [[ "${UNIR_DOCKER_REBUILD:-false}" == "true" ]]; then
    build_flag+=(--build)
  fi

  echo "Starting UNIR stack with Docker Compose (mode: ${SEED_MODE})..."
  docker compose up -d "${build_flag[@]}"

  echo "Waiting for Gateway, Keycloak, Engagement, and Frontends..."
  wait_http "Keycloak" "http://localhost:${KEYCLOAK_PORT}/realms/unir/.well-known/openid-configuration" 90
  wait_http "Gateway" "http://localhost:${GATEWAY_PORT}/health" 90
  wait_http "Engagement" "http://localhost:${ENGAGEMENT_PORT:-18085}/health" 90
  wait_http "UNIR Web" "http://localhost:${WEB_PORT}" 90
  wait_http "UNIR Administration" "http://localhost:${ADMIN_WEB_PORT}" 90

  provision_keycloak_and_accounts
  seed_databases
  populate_demo_data
  rebuild_event_projection
  sync_rag_index

  echo ""
  echo "=== UNIR Docker Compose Stack Ready (mode: ${SEED_MODE}) ==="
  docker compose ps
  echo ""
  echo "Endpoints locais:"
  echo "  - UNIR Web:            http://localhost:${WEB_PORT}"
  echo "  - UNIR Administration: http://localhost:${ADMIN_WEB_PORT}"
  echo "  - API Gateway:         http://localhost:${GATEWAY_PORT}/api/v1/..."
  echo "  - Keycloak OIDC:       http://localhost:${KEYCLOAK_PORT}/realms/unir/.well-known/openid-configuration"
  echo "  - RabbitMQ Management: http://localhost:${RABBITMQ_UI_PORT}"
  echo "  - Mailpit (e-mails):   http://localhost:${MAILPIT_PORT}"
  echo "  - Qdrant (RAG):        http://localhost:${QDRANT_PORT}/dashboard"
  echo ""
  echo "Contas iniciais (senha padrão: ${UNIR_DEMO_PASSWORD:-123}):"
  echo "  - Admin:       admin@gmail.com"
  if [[ "$SEED_MODE" == "demo" ]]; then
    echo "  - Professores: professor1@gmail.com .. professor10@gmail.com (10 verificados)"
    echo "  - Alunos:      aluno1@gmail.com .. aluno40@gmail.com (40 alunos em DCC e DEG)"
  fi
  echo "Rebuild changed local service images with UNIR_DOCKER_REBUILD=true make docker-${SEED_MODE}."
}

main "$@"
