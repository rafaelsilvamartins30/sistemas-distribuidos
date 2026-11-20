#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

python3 scripts/prepare-local-demo-accounts.py
docker compose up --build -d --wait
docker compose exec -T campus bin/rails db:migrate
python3 scripts/provision-local-demo-accounts.py

docker compose exec -T campus sh -ec \
  'cat > /tmp/local-demo-accounts.json && chmod 600 /tmp/local-demo-accounts.json && LOCAL_DEMO_ACCOUNTS_FILE=/tmp/local-demo-accounts.json bin/rails db:seed' \
  < config/local-demo-accounts.json

for attempt in $(seq 1 60); do
  events_table="$(docker compose exec -T engagement-db psql -U unir -d unir_engagement -tAc "SELECT to_regclass('public.events')" 2>/dev/null || true)"
  if [[ "$events_table" == "events" ]]; then
    break
  fi
  if [[ "$attempt" == 60 ]]; then
    echo 'Engagement migrations did not finish in time.' >&2
    exit 1
  fi
  sleep 2
done

docker compose exec -T engagement-db psql -v ON_ERROR_STOP=1 -U unir -d unir_engagement < engagement/seed/local-events.sql
docker compose exec -T engagement-db psql -v ON_ERROR_STOP=1 -U unir -d unir_engagement < engagement/seed/local-opportunities.sql
docker compose exec -T engagement-db psql -v ON_ERROR_STOP=1 -U unir -d unir_engagement < engagement/seed/local-sports.sql

echo 'Ambiente local UFLA preparado. Credenciais: config/local-demo-accounts.json (permissão 0600).'
