#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  cp config/local.env.example .env
  chmod 600 .env
  echo 'Arquivo .env local criado a partir de config/local.env.example.'
fi

echo 'Removendo containers, redes e volumes descartáveis do Compose local...'
docker compose down --volumes --remove-orphans

echo 'Recriando o ambiente e os dados de demonstração desde o zero...'
./scripts/seed-local-demo.sh

echo ''
echo 'Ambiente local recriado com sucesso.'
echo 'Web: http://localhost:15173'
echo 'Administração: http://localhost:15175'
echo 'Credenciais privadas: config/local-demo-accounts.json'
