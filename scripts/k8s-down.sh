#!/usr/bin/env bash
set -euo pipefail

export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
CLUSTER_NAME="${UNIR_KIND_CLUSTER:-unir-local}"

if ! command -v kind >/dev/null 2>&1; then
  echo "kind binary not found; nothing to delete."
  exit 0
fi

if kind get clusters 2>/dev/null | grep -Fxq "$CLUSTER_NAME"; then
  echo "Deleting UNIR kind cluster '$CLUSTER_NAME'..."
  kind delete cluster --name "$CLUSTER_NAME"
  echo "Cluster '$CLUSTER_NAME' removed."
else
  echo "Cluster '$CLUSTER_NAME' does not exist."
fi
