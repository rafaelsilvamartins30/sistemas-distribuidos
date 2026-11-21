#!/usr/bin/env bash
set -euo pipefail
destination=${1:?informe o diretório de instalação}
mkdir -p "$destination"
temporary=$(mktemp -d)
trap 'rm -rf "$temporary"' EXIT

case "$(uname -s)/$(uname -m)" in
  Linux/x86_64)
    hadolint_asset=linux-x86_64
    hadolint_sha=6bf226944684f56c84dd014e8b979d27425c0148f61b3bd99bcc6f39e9dc5a47
    platform=linux
    arch=amd64
    osv_sha=bc98e15319ed0d515e3f9235287ba53cdc5535d576d24fd573978ecfe9ab92dc
    kube_sha=c31518ddd122663b3f3aa874cfe8178cb0988de944f29c74a0b9260920d115d3
    ;;
  Darwin/arm64)
    hadolint_asset=macos-arm64
    hadolint_sha=3625e2e9f43dcfe7bd38738a5f5520ed50ce39ed28485266e6803dd7bc197b10
    platform=darwin
    arch=arm64
    osv_sha=a8cd6507b06239f463a7642430cfd2d154882f150f6e30cdc0653e28dfc34216
    kube_sha=b5d32b2cb77f9c781c976b20a85e2d0bc8f9184d5d1cfe665a2f31a19f99eeb9
    ;;
  *) printf 'Instale Hadolint, OSV-Scanner e kubeconform para esta plataforma.\n' >&2; exit 1 ;;
esac

download() {
  local url=$1 checksum=$2 output=$3
  curl --fail --silent --show-error --location "$url" --output "$output"
  printf '%s  %s\n' "$checksum" "$output" | shasum -a 256 -c -
}

case "${2:?informe infra, dependencies ou all}" in
  infra|all)
    download "https://github.com/hadolint/hadolint/releases/download/v2.14.0/hadolint-$hadolint_asset" \
      "$hadolint_sha" "$temporary/hadolint"
    download "https://github.com/yannh/kubeconform/releases/download/v0.7.0/kubeconform-$platform-$arch.tar.gz" \
      "$kube_sha" "$temporary/kubeconform.tar.gz"
    tar -xzf "$temporary/kubeconform.tar.gz" -C "$temporary" kubeconform
    install -m 755 "$temporary/hadolint" "$temporary/kubeconform" "$destination/"
    ;;
  dependencies) ;;
  *) printf 'Grupo de ferramentas desconhecido: %s\n' "$2" >&2; exit 2 ;;
esac

if [[ "$2" == dependencies || "$2" == all ]]; then
  download "https://github.com/google/osv-scanner/releases/download/v2.3.8/osv-scanner_${platform}_$arch" \
    "$osv_sha" "$temporary/osv-scanner"
  install -m 755 "$temporary/osv-scanner" "$destination/"
fi
