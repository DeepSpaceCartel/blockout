#!/usr/bin/env bash
# Finishes setting up the dev container once the workspace is mounted.
# System tools come from the features in devcontainer.json; this installs the
# npm packages and the docs site's Python venv (.venv).
set -euo pipefail

cd "$(dirname "$0")/.."

say() { printf '\n\033[1m▶ %s\033[0m\n' "$*"; }

say "npm packages"
npm ci

say "Chromium for Playwright"
# Already in the image; downloads a new one only if package-lock.json moved Playwright on
npx playwright install chromium

say "Docs site venv (MkDocs Material)"
[ -d .venv ] || python3 -m venv .venv
.venv/bin/pip install --quiet --disable-pip-version-check -r docs/requirements.txt

say "Versions"
echo "node $(node --version)"
npx playwright --version
cloudflared --version | head -n 1
python3 --version
gh --version | head -n 1
.venv/bin/mkdocs --version

cat <<'MSG'

Ready. Handy commands:
  npm test                      unit tests (every app and package)
  npm run lint                  ESLint
  npm run dev                   Vite dev servers + the API server (game at http://localhost:5173)
  npm start                     build everything and serve it on http://localhost:8080
  .venv/bin/mkdocs serve        the docs site on http://localhost:8000
  cloudflared tunnel --url http://localhost:8080
                                share it; then restart the server with
                                npm start -- --public-url https://<tunnel>.trycloudflare.com
MSG
