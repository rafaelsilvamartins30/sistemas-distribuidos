#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ "${1:-}" == "--volumes" || "${1:-}" == "-v" ]]; then
  echo "Stopping UNIR Docker Compose stack and removing volumes..."
  docker compose down -v --remove-orphans
else
  echo "Stopping UNIR Docker Compose stack (preserving volumes)..."
  docker compose down --remove-orphans
fi
