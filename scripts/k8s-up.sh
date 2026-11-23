#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
CLUSTER_NAME="${UNIR_KIND_CLUSTER:-unir-local}"
NAMESPACE="unir"
INGRESS_PORT="${UNIR_K8S_PORT:-18080}"
SEED_MODE="${UNIR_SEED_MODE:-demo}"
if [[ "$SEED_MODE" != "clean" && "$SEED_MODE" != "demo" ]]; then
  echo "UNIR_SEED_MODE inválido: '$SEED_MODE' (use 'clean' ou 'demo')." >&2
  exit 1
fi
LOCAL_IMAGES_REBUILT=()
EXISTING_DEPLOYMENTS=()

ensure_kind() {
  if command -v kind >/dev/null 2>&1; then
    return 0
  fi
  mkdir -p "$HOME/.local/bin"
  local os arch
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  arch="$(uname -m)"
  case "$arch" in
    x86_64) arch="amd64" ;;
    arm64|aarch64) arch="arm64" ;;
  esac
  echo "Installing kind v0.27.0 (${os}/${arch}) to $HOME/.local/bin/kind..."
  curl -fsSL "https://kind.sigs.k8s.io/dl/v0.27.0/kind-${os}-${arch}" -o "$HOME/.local/bin/kind"
  chmod +x "$HOME/.local/bin/kind"
}

load_env_defaults() {
  local env_file="$ROOT/config/local.env.example"
  if [[ -f "$ROOT/.env" ]]; then
    env_file="$ROOT/.env"
  fi
  set -a
  # shellcheck disable=SC1090
  source "$env_file"
  set +a
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

create_cluster_if_needed() {
  if kind get clusters 2>/dev/null | grep -Fxq "$CLUSTER_NAME"; then
    echo "Kind cluster '$CLUSTER_NAME' already exists."
    kubectl config use-context "kind-${CLUSTER_NAME}" >/dev/null
    return 0
  fi

  local kind_cfg
  kind_cfg="$(mktemp)"
  trap 'rm -f "${kind_cfg:-}"' RETURN
  cat > "$kind_cfg" <<EOF
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
  - role: control-plane
    extraPortMappings:
      - containerPort: 80
        hostPort: ${INGRESS_PORT}
        listenAddress: "127.0.0.1"
        protocol: TCP
EOF

  echo "Creating kind cluster '$CLUSTER_NAME' (Ingress exposed on http://localhost:${INGRESS_PORT})..."
  kind create cluster --name "$CLUSTER_NAME" --config "$kind_cfg" --wait 90s
}

build_and_load_images() {
  local services=(
    "keycloak-theme:unir-keycloak:local"
    "campus:unir-campus:local"
    "engagement:unir-engagement:local"
    "ai-rag:unir-ai-rag:local"
    "payment:unir-payment:local"
    "access:unir-access:local"
    "web-bff:unir-web-bff:local"
    "admin-bff:unir-admin-bff:local"
    "gateway:unir-gateway:local"
    "web:unir-web:local"
    "admin-web:unir-admin-web:local"
  )

  local entry dir image
  for entry in "${services[@]}"; do
    dir="${entry%%:*}"
    image="${entry#*:}"
    if [[ "${UNIR_K8S_REBUILD:-false}" == "true" ]] || ! docker image inspect "$image" >/dev/null 2>&1; then
      echo "Building image $image from ./$dir..."
      docker build -t "$image" "./$dir"
      LOCAL_IMAGES_REBUILT+=("$image")
    fi
  done

  local third_party_images=(
    "postgres:16-alpine"
    "mongo:7.0"
    "rabbitmq:4.4.0-management-alpine"
    "axllent/mailpit:v1.29.5"
    "traefik:v3.2"
    "qdrant/qdrant:v1.12.5"
  )
  for image in "${third_party_images[@]}"; do
    if ! docker image inspect "$image" >/dev/null 2>&1; then
      echo "Pulling $image..."
      docker pull "$image"
    fi
  done

  echo "Loading local UNIR images into kind cluster '$CLUSTER_NAME'..."
  local arch
  arch="$(uname -m)"
  case "$arch" in
    x86_64) arch="amd64" ;;
    arm64|aarch64) arch="arm64" ;;
  esac

  local all_images=(
    "unir-keycloak:local"
    "unir-campus:local"
    "unir-engagement:local"
    "unir-ai-rag:local"
    "unir-payment:local"
    "unir-access:local"
    "unir-web-bff:local"
    "unir-admin-bff:local"
    "unir-gateway:local"
    "unir-web:local"
    "unir-admin-web:local"
    "postgres:16-alpine"
    "mongo:7.0"
    "rabbitmq:4.4.0-management-alpine"
    "axllent/mailpit:v1.29.5"
    "traefik:v3.2"
    "qdrant/qdrant:v1.12.5"
  )

  for image in "${all_images[@]}"; do
    local image_was_rebuilt=false
    local rebuilt_image
    # Bash 3.2 (macOS) treats an empty array expansion as unbound with `set -u`.
    for rebuilt_image in "${LOCAL_IMAGES_REBUILT[@]+"${LOCAL_IMAGES_REBUILT[@]}"}"; do
      if [[ "$rebuilt_image" == "$image" ]]; then
        image_was_rebuilt=true
        break
      fi
    done
    if [[ "$image_was_rebuilt" != "true" ]] && docker exec "${CLUSTER_NAME}-control-plane" crictl inspecti "$image" >/dev/null 2>&1; then
      echo "  - $image already loaded in kind node."
      continue
    fi
    echo "  - Loading $image into kind node..."
    docker save --platform "linux/${arch}" "$image" | \
      docker exec -i "${CLUSTER_NAME}-control-plane" ctr --namespace=k8s.io images import --snapshotter=overlayfs - >/dev/null
  done
}

restart_rebuilt_deployments() {
  local entry image deployment rebuilt_image image_was_rebuilt
  local deployments=(
    "unir-keycloak:local=keycloak"
    "unir-campus:local=campus"
    "unir-engagement:local=engagement"
    "unir-payment:local=payment"
    "unir-access:local=access"
    "unir-web-bff:local=web-bff"
    "unir-admin-bff:local=admin-bff"
    "unir-gateway:local=gateway"
    "unir-web:local=web"
    "unir-admin-web:local=admin-web"
    "unir-ai-rag:local=ai-rag"
  )

  for entry in "${deployments[@]}"; do
    image="${entry%%=*}"
    deployment="${entry#*=}"
    image_was_rebuilt=false
    for rebuilt_image in "${LOCAL_IMAGES_REBUILT[@]+"${LOCAL_IMAGES_REBUILT[@]}"}"; do
      if [[ "$rebuilt_image" == "$image" ]]; then
        image_was_rebuilt=true
        break
      fi
    done
    if [[ "$image_was_rebuilt" == "true" || "$deployment" == "ai-rag" ]]; then
      if ! deployment_existed_before_apply "$deployment"; then
        echo "Skipping restart for $deployment: it was created during this run."
        continue
      fi
      echo "Restarting $deployment to load rebuilt image/configuration..."
      kubectl -n "$NAMESPACE" rollout restart "deployment/$deployment"
    fi
  done
}

snapshot_existing_deployments() {
  EXISTING_DEPLOYMENTS=()
  local deployment
  while IFS= read -r deployment; do
    [[ -n "$deployment" ]] && EXISTING_DEPLOYMENTS+=("$deployment")
  done < <(kubectl -n "$NAMESPACE" get deployments -o name 2>/dev/null | sed 's|^deployment.apps/||')
}

deployment_existed_before_apply() {
  local expected="$1"
  local deployment
  for deployment in "${EXISTING_DEPLOYMENTS[@]+"${EXISTING_DEPLOYMENTS[@]}"}"; do
    if [[ "$deployment" == "$expected" ]]; then
      return 0
    fi
  done
  return 1
}

diagnose_rollout_failure() {
  local deployment="$1"
  local pod
  local -a pods=()

  echo ""
  echo "=== Diagnostics for failed deployment/$deployment ===" >&2
  kubectl -n "$NAMESPACE" get deployment "$deployment" -o wide >&2 || true
  kubectl -n "$NAMESPACE" get pods -l "app.kubernetes.io/name=$deployment" -o wide >&2 || true
  kubectl -n "$NAMESPACE" describe deployment "$deployment" >&2 || true

  read -r -a pods <<< "$(kubectl -n "$NAMESPACE" get pods -l "app.kubernetes.io/name=$deployment" -o jsonpath='{.items[*].metadata.name}' 2>/dev/null || true)"
  for pod in "${pods[@]+"${pods[@]}"}"; do
    kubectl -n "$NAMESPACE" describe pod "$pod" >&2 || true
    kubectl -n "$NAMESPACE" logs "$pod" --all-containers=true --tail=80 >&2 || true
    kubectl -n "$NAMESPACE" logs "$pod" --all-containers=true --previous --tail=80 >&2 || true
  done
  kubectl -n "$NAMESPACE" get events --sort-by=.lastTimestamp >&2 || true
}

wait_for_rollout() {
  local deployment="$1"
  local timeout="${2:-240s}"
  local status
  if kubectl -n "$NAMESPACE" rollout status "deployment/$deployment" --timeout="$timeout"; then
    return 0
  else
    status=$?
  fi
  diagnose_rollout_failure "$deployment"
  return "$status"
}

apply_namespace_config_and_secrets() {
  kubectl apply -f "$ROOT/infra/k8s/00-namespace.yaml"
  kubectl apply -f "$ROOT/infra/k8s/01-configmaps.yaml"
  local rag_config_patch
  rag_config_patch="$(RAG_SYNC_CLIENT_ID="$RAG_SYNC_CLIENT_ID" python3 -c 'import json,os; print(json.dumps({"data":{"RAG_SYNC_CLIENT_ID":os.environ["RAG_SYNC_CLIENT_ID"]}}))')"
  kubectl -n "$NAMESPACE" patch configmap unir-common-config --type merge -p "$rag_config_patch"

  kubectl -n "$NAMESPACE" create configmap unir-keycloak-realm \
    --from-file=unir-realm.json="$ROOT/config/keycloak/unir-realm.json" \
    --dry-run=client -o yaml | kubectl apply -f -

  kubectl -n "$NAMESPACE" create secret generic unir-db-credentials \
    --from-literal=DB_USERNAME="unir" \
    --from-literal=DB_PASSWORD="$DB_PASSWORD" \
    --from-literal=CAMPUS_DB_NAME="unir_campus" \
    --from-literal=ENGAGEMENT_DB_URL="jdbc:postgresql://engagement-db:5432/unir_engagement" \
    --from-literal=PAYMENT_DB_URL="postgres://unir:${DB_PASSWORD}@payment-db:5432/unir_payment?sslmode=disable" \
    --from-literal=ACCESS_DB_URL="postgres://unir:${DB_PASSWORD}@access-db:5432/unir_access" \
    --dry-run=client -o yaml | kubectl apply -f -

  kubectl -n "$NAMESPACE" create secret generic unir-keycloak-credentials \
    --from-literal=KEYCLOAK_DB_USERNAME="keycloak" \
    --from-literal=KEYCLOAK_DB_PASSWORD="$KEYCLOAK_DB_PASSWORD" \
    --from-literal=KEYCLOAK_ADMIN_USERNAME="$KEYCLOAK_ADMIN_USERNAME" \
    --from-literal=KEYCLOAK_ADMIN_PASSWORD="$KEYCLOAK_ADMIN_PASSWORD" \
    --dry-run=client -o yaml | kubectl apply -f -

  kubectl -n "$NAMESPACE" create secret generic unir-rabbitmq-credentials \
    --from-literal=RABBITMQ_USERNAME="$RABBITMQ_USERNAME" \
    --from-literal=RABBITMQ_PASSWORD="$RABBITMQ_PASSWORD" \
    --dry-run=client -o yaml | kubectl apply -f -

  kubectl -n "$NAMESPACE" create secret generic unir-mongodb-credentials \
    --from-literal=MONGODB_USERNAME="$MONGODB_USERNAME" \
    --from-literal=MONGODB_PASSWORD="$MONGODB_PASSWORD" \
    --from-literal=MONGODB_URI="mongodb://${MONGODB_USERNAME}:${MONGODB_PASSWORD}@engagement-read-db:27017/unir_engagement_read?authSource=admin" \
    --from-literal=SPRING_DATA_MONGODB_URI="mongodb://${MONGODB_USERNAME}:${MONGODB_PASSWORD}@engagement-read-db:27017/unir_engagement_read?authSource=admin" \
    --dry-run=client -o yaml | kubectl apply -f -

  kubectl -n "$NAMESPACE" create secret generic unir-rag-credentials \
    --from-literal=RAG_SYNC_TOKEN="$RAG_SYNC_TOKEN" \
    --from-literal=RAG_SYNC_CLIENT_SECRET="$RAG_SYNC_CLIENT_SECRET" \
    --from-literal=GEMINI_API_KEY="$GEMINI_API_KEY" \
    --dry-run=client -o yaml | kubectl apply -f -
}

provision_keycloak_and_accounts() {
  echo "Configuring Keycloak realm profile and OIDC client redirect URIs..."
  kubectl -n "$NAMESPACE" exec -i deploy/keycloak -- sh -c "cat > /tmp/user-profile.json" < "$ROOT/config/keycloak/user-profile.json"
  kubectl -n "$NAMESPACE" exec -i deploy/keycloak -- sh -c "cat > /tmp/apply-user-profile.sh && chmod +x /tmp/apply-user-profile.sh" < "$ROOT/config/keycloak/apply-user-profile.sh"
  kubectl -n "$NAMESPACE" exec deploy/keycloak -- sh -c '
    sed "s|/config/user-profile.json|/tmp/user-profile.json|g" /tmp/apply-user-profile.sh > /tmp/run-profile.sh
    chmod +x /tmp/run-profile.sh
    KEYCLOAK_ADMIN_USERNAME="$KC_BOOTSTRAP_ADMIN_USERNAME" \
    KEYCLOAK_ADMIN_PASSWORD="$KC_BOOTSTRAP_ADMIN_PASSWORD" \
    WEB_PORT=18080 \
    ADMIN_WEB_PORT=15175 \
    RECOVERY_CODES_ENABLED=true \
    /bin/sh /tmp/run-profile.sh

    KCADM=/opt/keycloak/bin/kcadm.sh
    CFG=/tmp/kcadm-k8s.config
    trap "rm -f $CFG" EXIT
    "$KCADM" config credentials --config "$CFG" --server http://localhost:8080 --realm master --user "$KC_BOOTSTRAP_ADMIN_USERNAME" --password "$KC_BOOTSTRAP_ADMIN_PASSWORD" >/dev/null
    CID=$("$KCADM" get clients --config "$CFG" -r unir -q clientId=unir-web --fields id --format csv --noquotes | head -n 1)
    "$KCADM" update "clients/$CID" --config "$CFG" -r unir \
      -s '\''redirectUris=["http://localhost:18080/*","http://admin.localhost:18080/*","http://localhost:15173/*","http://localhost:15175/*"]'\'' \
      -s '\''webOrigins=["http://localhost:18080","http://admin.localhost:18080","http://localhost:15173","http://localhost:15175"]'\'' \
      -s directAccessGrantsEnabled=true
  '

  echo "Provisioning the internal AI/RAG service account in Keycloak..."
  kubectl -n "$NAMESPACE" exec deploy/keycloak -- env \
    "RAG_SYNC_CLIENT_SECRET=$RAG_SYNC_CLIENT_SECRET" \
    "RAG_SYNC_CLIENT_ID=$RAG_SYNC_CLIENT_ID" sh -c '
    set -eu
    KCADM=/opt/keycloak/bin/kcadm.sh
    CFG=/tmp/kcadm-rag-sync.config
    trap "rm -f $CFG" EXIT
    "$KCADM" config credentials --config "$CFG" --server http://localhost:8080 --realm master \
      --user "$KC_BOOTSTRAP_ADMIN_USERNAME" --password "$KC_BOOTSTRAP_ADMIN_PASSWORD" >/dev/null
    CID=$("$KCADM" get clients --config "$CFG" -r unir -q "clientId=$RAG_SYNC_CLIENT_ID" \
      --fields id --format csv --noquotes | head -n 1)
    if [ -z "$CID" ]; then
      "$KCADM" create clients --config "$CFG" -r unir -s "clientId=$RAG_SYNC_CLIENT_ID" \
        -s enabled=true -s protocol=openid-connect -s publicClient=false \
        -s serviceAccountsEnabled=true -s standardFlowEnabled=false \
        -s directAccessGrantsEnabled=false -s "secret=$RAG_SYNC_CLIENT_SECRET"
      CID=$("$KCADM" get clients --config "$CFG" -r unir -q "clientId=$RAG_SYNC_CLIENT_ID" \
        --fields id --format csv --noquotes | head -n 1)
    else
      "$KCADM" update "clients/$CID" --config "$CFG" -r unir -s enabled=true \
        -s publicClient=false -s serviceAccountsEnabled=true -s standardFlowEnabled=false \
        -s directAccessGrantsEnabled=false -s "secret=$RAG_SYNC_CLIENT_SECRET"
    fi
    "$KCADM" add-roles --config "$CFG" -r unir \
      --uusername "service-account-$RAG_SYNC_CLIENT_ID" --rolename USER
  '

  python3 "$ROOT/scripts/prepare-local-demo-accounts.py" --mode "$SEED_MODE"
  echo "Provisioning UNIR accounts (mode: ${SEED_MODE}) in Kubernetes Keycloak..."
  RAG_SYNC_CLIENT_ID="$RAG_SYNC_CLIENT_ID" \
    RAG_SYNC_CLIENT_SECRET="$RAG_SYNC_CLIENT_SECRET" \
    python3 - "$ROOT" "$NAMESPACE" <<'PY'
import importlib.util
import json
import os
import subprocess
import sys
from pathlib import Path

root = Path(sys.argv[1])
namespace = sys.argv[2]
spec = importlib.util.spec_from_file_location("prov", root / "scripts" / "provision-local-demo-accounts.py")
prov = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prov)

accounts_path = root / "config" / "local-demo-accounts.json"
data = json.loads(accounts_path.read_text(encoding="utf-8"))
rag_client_id = os.environ["RAG_SYNC_CLIENT_ID"]
rag_client_secret = os.environ["RAG_SYNC_CLIENT_SECRET"]
script = prov.provision_script(data["accounts"], rag_client_id, rag_client_secret)
result = subprocess.run(
    ["kubectl", "-n", namespace, "exec", "-i", "deploy/keycloak", "--", "sh", "-s"],
    input=script,
    check=True,
    text=True,
    capture_output=True,
)
assigned = dict(line.split("\t", 1) for line in result.stdout.splitlines() if "\t" in line)
for username, sub in assigned.items():
    data["accounts"][username]["sub"] = sub
prov.write_private_json(data)
print(f"Keycloak (K8s): {len(assigned)} account(s) provisioned and synchronized.")
PY
}

seed_databases() {
  echo "Seeding Campus database in Kubernetes (mode: ${SEED_MODE})..."
  tar -C "$ROOT/campus" -cf - db/seeds.rb db/seeders | kubectl -n "$NAMESPACE" exec -i deploy/campus -- tar -C /app -xf -
  kubectl -n "$NAMESPACE" exec -i deploy/campus -- env "UNIR_SEED_MODE=$SEED_MODE" sh -ec \
    'cat > /tmp/local-demo-accounts.json && chmod 600 /tmp/local-demo-accounts.json && LOCAL_DEMO_ACCOUNTS_FILE=/tmp/local-demo-accounts.json bin/rails db:seed' \
    < "$ROOT/config/local-demo-accounts.json"
}

rebuild_event_projection() {
  echo "Rebuilding the MongoDB event projection from PostgreSQL after seeds..."
  kubectl -n "$NAMESPACE" exec deploy/engagement -- env \
    SPRING_MAIN_WEB_APPLICATION_TYPE=none \
    ENGAGEMENT_EVENT_PROJECTION_REBUILD_AND_EXIT=true \
    java -jar /app/app.jar
}

sync_rag_index() {
  echo "Indexing active Engagement events and opportunities into Qdrant..."
  kubectl -n "$NAMESPACE" exec deploy/ai-rag -- python -c '
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
  ensure_kind
  load_env_defaults
  create_cluster_if_needed
  build_and_load_images
  apply_namespace_config_and_secrets
  snapshot_existing_deployments

  echo "Applying stateful databases and message broker manifests..."
  kubectl apply -f "$ROOT/infra/k8s/03-databases.yaml"
  kubectl apply -f "$ROOT/infra/k8s/04-rabbitmq-mailpit.yaml"

  for deploy in campus-db engagement-db payment-db access-db keycloak-db engagement-read-db rabbitmq mailpit; do
    wait_for_rollout "$deploy" 180s
  done

  echo "Applying Keycloak manifest..."
  kubectl apply -f "$ROOT/infra/k8s/05-keycloak.yaml"
  wait_for_rollout keycloak 240s

  provision_keycloak_and_accounts

  echo "Applying domain services, BFFs, Gateway, Frontends, and Ingress..."
  kubectl apply -f "$ROOT/infra/k8s/06-domain-services.yaml"
  kubectl apply -f "$ROOT/infra/k8s/07-bffs-gateway.yaml"
  kubectl apply -f "$ROOT/infra/k8s/08-frontends.yaml"
  kubectl apply -f "$ROOT/infra/k8s/09-ingress.yaml"
  kubectl apply -f "$ROOT/infra/k8s/10-ai-rag.yaml"
  restart_rebuilt_deployments

  for deploy in campus engagement payment access web-bff admin-bff gateway web admin-web traefik-ingress qdrant ai-rag; do
    if [[ "$deploy" == "ai-rag" ]]; then
      wait_for_rollout "$deploy" 600s
    else
      wait_for_rollout "$deploy" 240s
    fi
  done

  seed_databases
  rebuild_event_projection
  sync_rag_index

  echo ""
  echo "=== UNIR Kubernetes Cluster Ready (mode: ${SEED_MODE}) ==="
  kubectl -n "$NAMESPACE" get pods,svc,pvc,ingress
  echo ""
  echo "Endpoints via Ingress:"
  echo "  - UNIR Web:            http://localhost:${INGRESS_PORT}"
  echo "  - UNIR Administration: http://admin.localhost:${INGRESS_PORT}"
  echo "  - API Gateway:         http://localhost:${INGRESS_PORT}/api/v1/..."
  echo "  - Keycloak OIDC:       http://localhost:${INGRESS_PORT}/realms/unir/.well-known/openid-configuration"
  echo ""
  echo "Contas iniciais (senha padrão: 123):"
  echo "  - Admin:       admin@gmail.com"
  if [[ "$SEED_MODE" == "demo" ]]; then
    echo "  - Professores: professor1@gmail.com .. professor10@gmail.com (10 verificados)"
    echo "  - Alunos:      aluno1@gmail.com .. aluno40@gmail.com (40 alunos em DCC e DEG)"
  fi
  echo "Rebuild changed local service images with UNIR_K8S_REBUILD=true before rerunning this script."
}

main "$@"
