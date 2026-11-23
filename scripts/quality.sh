#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.local/bin:$HOME/.local/share/fnm/node-versions/v24.21.0/installation/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

future_components() {
  local entry
  for entry in campus:Gemfile payment:go.mod access:Cargo.toml ai-rag:pyproject.toml \
    gateway:pom.xml engagement:pom.xml admin-bff:package.json admin-web:package.json; do
    if [[ -f "${entry%%:*}/${entry#*:}" ]]; then
      printf '%s\n' "${entry%%:*}"
    fi
  done
}

component() {
  case "$1" in
    web|keycloak-theme|web-bff)
      pnpm run "lint:$1"
      pnpm run "format:check:$1"
      case "$1" in
        web) pnpm --dir web test; pnpm --dir web build ;;
        keycloak-theme) CI=true pnpm --dir keycloak-theme build-keycloak-theme ;;
        web-bff) pnpm --dir web-bff test ;;
      esac
      ;;
    *) future_target "$1" quality ;;
  esac
}

future_target() {
  if ! future_components | grep -Fxq -- "$1" || [[ ! -f "$1/Makefile" ]]; then
    printf 'Componente sem interface de qualidade disponível: %s\n' "$1" >&2
    return 1
  fi
  make -C "$1" "$2"
}

repository_files() {
  git ls-files --cached --others --exclude-standard -z -- "$@"
}

infrastructure() {
  pnpm run lint:tooling
  pnpm run format:check:tooling
  pnpm run architecture:check
  actionlint

  local file
  local dockerfiles=() manifests=()
  while IFS= read -r -d '' file; do
    [[ -f "$file" ]] && dockerfiles+=("$file")
  done < <(repository_files 'Dockerfile*' ':(glob)**/Dockerfile*' ':(glob)**/*.Dockerfile')
  hadolint "${dockerfiles[@]}"

  while IFS= read -r -d '' file; do
    [[ -f "$file" ]] && manifests+=("$file")
  done < <(repository_files ':(glob)infra/k8s/**/*.yaml' ':(glob)infra/k8s/**/*.yml')
  if (( ${#manifests[@]} )); then
    kubeconform -strict -summary "${manifests[@]}"
  else
    printf 'Kubeconform: nenhum manifesto em infra/k8s.\n'
  fi
}

dependencies() (
  local file inventory
  inventory=$(mktemp -d)
  trap 'rm -rf "$inventory"' EXIT
  local inputs=()
  while IFS= read -r -d '' file; do
    [[ -f "$file" ]] || continue
    if [[ "${file##*/}" == pom.xml ]]; then
      local sbom_dir="$inventory/${#inputs[@]}"
      mkdir -p "$sbom_dir"
      mvn --batch-mode -f "$file" org.cyclonedx:cyclonedx-maven-plugin:2.9.1:makeBom \
        -DoutputFormat=json -DoutputDirectory="$sbom_dir" -Dcyclonedx.skipAttach=true
      inputs+=("--lockfile=$sbom_dir/bom.json")
    else
      inputs+=("--lockfile=$file")
    fi
  done < <(repository_files pnpm-lock.yaml ':(glob)**/pnpm-lock.yaml' ':(glob)**/pom.xml' \
    ':(glob)**/Gemfile.lock' ':(glob)**/go.mod' ':(glob)**/Cargo.lock' \
    ':(glob)**/uv.lock' ':(glob)**/poetry.lock' ':(glob)**/requirements.txt')
  osv-scanner scan source "${inputs[@]}"
)

case "${1:-}" in
  future) future_components ;;
  component) component "${2:?informe o componente}" ;;
  test)
    shift
    for project in "$@"; do
      case "$project" in
        web-bff) pnpm --dir web-bff test ;;
        web) pnpm --dir web test ;;
        keycloak-theme) printf '%s: sem suíte de testes própria.\n' "$project" ;;
        *) future_target "$project" test ;;
      esac
    done
    ;;
  infra) infrastructure ;;
  secrets) gitleaks git --baseline-path scripts/gitleaks-baseline.json --redact --no-banner . ;;
  dependencies) dependencies ;;
  *) printf 'Uso: %s {component|test|infra|secrets|dependencies|future}\n' "$0" >&2; exit 2 ;;
esac
