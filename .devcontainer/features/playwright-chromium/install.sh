#!/usr/bin/env bash
# Installs Chromium for Playwright with its Debian packages (fonts, NSS, …).
# Needs Node, which the base image has.
set -euo pipefail

VERSION="${VERSION:-1.63.0}"
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/ms-playwright}"

if ! command -v npx >/dev/null 2>&1; then
  echo "playwright-chromium: needs Node (npx) in the base image." >&2
  exit 1
fi

export npm_config_update_notifier=false npm_config_cache="$(mktemp -d)"
npx --yes "playwright@${VERSION}" install --with-deps chromium
rm -rf "$npm_config_cache"

# The container user (node) runs `playwright install` when package-lock.json moves on
chmod -R a+rwX "$PLAYWRIGHT_BROWSERS_PATH"
