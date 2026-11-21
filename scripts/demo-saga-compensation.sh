#!/usr/bin/env bash
set -euo pipefail

# Demonstração ao vivo da Saga Coreografada (caminho feliz pago + compensação por cancelamento)
# e medição da defasagem do CQRS (PostgreSQL -> RabbitMQ -> MongoDB) + HATEOAS.
# Funciona contra Docker Compose (GATEWAY_URL=http://localhost:18084, KEYCLOAK_URL=http://localhost:18081)
# ou Kubernetes local (GATEWAY_URL=http://localhost:18080, KEYCLOAK_URL=http://localhost:18080).

GATEWAY_URL="${GATEWAY_URL:-http://localhost:18080}"
KEYCLOAK_URL="${KEYCLOAK_URL:-$GATEWAY_URL}"
DEMO_USER="${DEMO_USER:-unir-admin@unir-demo.test}"
DEMO_PASSWORD="${DEMO_PASSWORD:-}"
if [[ -z "$DEMO_PASSWORD" && -f "config/local-demo-accounts.json" ]]; then
  DEMO_PASSWORD="$(python3 -c 'import json; d=json.load(open("config/local-demo-accounts.json")); print(d.get("accounts", d).get("unir.admin", {}).get("password", ""))' 2>/dev/null || true)"
fi
if [[ -z "$DEMO_PASSWORD" ]]; then
  echo "Defina DEMO_USER e DEMO_PASSWORD (ou rode 'make local-reset' para gerar config/local-demo-accounts.json)." >&2
  exit 1
fi

echo "==> 1. Autenticando no Keycloak ($KEYCLOAK_URL) como $DEMO_USER..."
TOKEN="$(curl -fsS -X POST "$KEYCLOAK_URL/realms/unir/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password&client_id=unir-web&username=${DEMO_USER}&password=${DEMO_PASSWORD}" \
  | python3 -c "import sys, json; print(json.load(sys.stdin)['access_token'])")"

echo "==> 2. Consultando contexto de organizador no Campus..."
ORG_JSON="$(curl -fsS -H "Authorization: Bearer $TOKEN" "$GATEWAY_URL/api/v1/web/events/organizer-contexts")"
ORG_TYPE="$(echo "$ORG_JSON" | python3 -c "import sys, json; items=json.load(sys.stdin)['items']; print(items[0]['organizerType'])")"
ORG_ID="$(echo "$ORG_JSON" | python3 -c "import sys, json; items=json.load(sys.stdin)['items']; print(items[0]['organizerId'])")"
echo "    Organizador: $ORG_TYPE ($ORG_ID)"

echo "==> 3. Criando evento pago com presença habilitada (Write Model PostgreSQL)..."
NOW_MS="$(python3 -c 'import time; print(int(time.time()*1000))')"
EVENT_JSON="$(curl -fsS -X POST "$GATEWAY_URL/api/v1/web/events" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"title\": \"Demo Saga GCC129 ${NOW_MS}\",
    \"description\": \"Evento pago para demonstrar Saga coreografada, compensação e CQRS.\",
    \"organizerType\": \"${ORG_TYPE}\",
    \"organizerId\": \"${ORG_ID}\",
    \"location\": \"Auditório Central UFLA\",
    \"startsAt\": \"2027-07-10T18:00:00Z\",
    \"endsAt\": \"2027-07-10T21:00:00Z\",
    \"category\": \"TECH\",
    \"capacity\": 50,
    \"registrationDeadline\": \"2027-07-09T23:59:00Z\",
    \"registrationMode\": \"INTERNAL_PAID\",
    \"price\": 2500,
    \"attendanceEnabled\": true,
    \"attendanceMode\": \"ORGANIZER_SCANS_PARTICIPANT\"
  }")"
EVENT_ID="$(echo "$EVENT_JSON" | python3 -c "import sys, json; print(json.load(sys.stdin)['id'])")"
echo "    Evento criado: $EVENT_ID"
echo "    Links HATEOAS retornados:"
echo "$EVENT_JSON" | python3 -c "import sys, json; print(json.dumps(json.load(sys.stdin).get('_links', {}), indent=4))"

echo "==> 4. Medindo defasagem do CQRS (aguardando projeção no MongoDB)..."
for i in $(seq 1 30); do
  if curl -fsS -H "Authorization: Bearer $TOKEN" "$GATEWAY_URL/api/v1/web/events/$EVENT_ID" >/dev/null 2>&1; then
    FOUND_MS="$(python3 -c 'import time; print(int(time.time()*1000))')"
    LAG_MS="$((FOUND_MS - NOW_MS))"
    echo "    Evento visível no Read Model MongoDB! Defasagem observada: ${LAG_MS} ms."
    break
  fi
  sleep 0.2
done

echo "==> 5. Iniciando Saga (inscrição paga -> Outbox -> RabbitMQ -> Payment)..."
REG_JSON="$(curl -fsS -X POST "$GATEWAY_URL/api/v1/web/events/$EVENT_ID/registrations" \
  -H "Authorization: Bearer $TOKEN")"
REG_ID="$(echo "$REG_JSON" | python3 -c "import sys, json; print(json.load(sys.stdin)['id'])")"
REG_STATUS="$(echo "$REG_JSON" | python3 -c "import sys, json; print(json.load(sys.stdin)['status'])")"
echo "    Inscrição $REG_ID criada com status: $REG_STATUS"

echo "==> 6. Aguardando cobrança PENDING no serviço Payment..."
for i in $(seq 1 30); do
  CHARGE_STATUS="$(curl -fsS -H "Authorization: Bearer $TOKEN" "$GATEWAY_URL/api/v1/web/payments/me" \
    | python3 -c "import sys, json; items=json.load(sys.stdin)['items']; m=[c['status'] for c in items if c['referenceId']=='${REG_ID}']; print(m[0] if m else '')")"
  if [[ "$CHARGE_STATUS" == "PENDING" ]]; then
    echo "    Cobrança criada no Payment com status: $CHARGE_STATUS"
    break
  fi
  sleep 0.3
done

echo "==> 7. Confirmando pagamento PIX simulado (Payment -> RabbitMQ -> Engagement -> Access)..."
curl -fsS -X POST "$GATEWAY_URL/api/v1/web/payments/$REG_ID/confirm" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{}' >/dev/null

for i in $(seq 1 30); do
  TICKET_COUNT="$(curl -fsS -H "Authorization: Bearer $TOKEN" "$GATEWAY_URL/api/v1/web/me/tickets" \
    | python3 -c "import sys, json; data=json.load(sys.stdin); items=data.get('items', data if isinstance(data, list) else []); print(sum(1 for t in items if t.get('registrationId')=='${REG_ID}'))")"
  if [[ "$TICKET_COUNT" -ge 1 ]]; then
    echo "    Caminho feliz concluído! Inscrição confirmada e Ticket emitido no serviço Access."
    break
  fi
  sleep 0.3
done

echo "==> 8. Provocando COMPENSAÇÃO: cancelando o evento pago..."
curl -fsS -X DELETE -H "Authorization: Bearer $TOKEN" "$GATEWAY_URL/api/v1/web/events/$EVENT_ID" >/dev/null
echo "    Evento cancelado. Aguardando estorno automático (RefundRequested -> Payment -> REFUNDED)..."

for i in $(seq 1 40); do
  FINAL_STATUS="$(curl -fsS -H "Authorization: Bearer $TOKEN" "$GATEWAY_URL/api/v1/web/payments/me" \
    | python3 -c "import sys, json; items=json.load(sys.stdin)['items']; m=[c['status'] for c in items if c['referenceId']=='${REG_ID}']; print(m[0] if m else '')")"
  if [[ "$FINAL_STATUS" == "REFUNDED" ]]; then
    echo "    Compensação concluída com sucesso! Status final no Payment: $FINAL_STATUS"
    exit 0
  fi
  sleep 0.3
done

echo "Aviso: status final no Payment após espera foi '$FINAL_STATUS'."
exit 0
