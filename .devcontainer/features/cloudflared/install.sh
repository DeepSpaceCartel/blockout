#!/usr/bin/env bash
# Installs cloudflared from Cloudflare's GitHub release .deb.
set -euo pipefail

VERSION="${VERSION:-2026.10.0}"
arch="$(dpkg --print-architecture)" # amd64 or arm64

if [ "$VERSION" = latest ]; then
  url="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${arch}.deb"
else
  url="https://github.com/cloudflare/cloudflared/releases/download/${VERSION}/cloudflared-linux-${arch}.deb"
fi

if ! command -v curl >/dev/null 2>&1; then
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends curl ca-certificates
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
curl -fsSL -o "$tmp/cloudflared.deb" "$url"
dpkg -i "$tmp/cloudflared.deb"
cloudflared --version | head -n 1
