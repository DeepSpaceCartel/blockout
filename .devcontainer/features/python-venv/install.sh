#!/usr/bin/env bash
# Installs python3-venv, for the docs site's virtualenv (see docs/project/installing.md).
set -euo pipefail

if python3 -c 'import ensurepip' >/dev/null 2>&1; then
  echo "python3-venv: already there"
  exit 0
fi

apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends python3-venv
rm -rf /var/lib/apt/lists/*
