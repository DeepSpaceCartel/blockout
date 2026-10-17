#!/usr/bin/env bash
# Installs the coder CLI from a Coder deployment's /bin endpoint, so the CLI is the
# same version as the server. CODER_AGENT_URL only exists at runtime, hence the option.
set -euo pipefail

URL="${URL:-https://coder.deepspacecartel.com}"
URL="${URL%/}"
arch="$(dpkg --print-architecture)" # amd64 or arm64

if ! command -v curl >/dev/null 2>&1; then
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends curl ca-certificates
  rm -rf /var/lib/apt/lists/*
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
curl -fsSL -o "$tmp/coder" "${URL}/bin/coder-linux-${arch}"
install -m 0755 "$tmp/coder" /usr/local/bin/coder
coder version
