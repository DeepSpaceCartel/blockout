#!/usr/bin/env bash
# Installs or updates Blockout and everything it runs on (MongoDB, Valkey,
# Keycloak with its Postgres, backups) from this checkout's chart, then waits
# until every part is ready; a failed update is rolled back by itself. The same
# as installing the released chart (docs/guides/deploy.md), with a local one.
#
#   op run --env-file=deploy/blockout/.env.1password -- deploy/blockout/install.sh 0.5.0
#   deploy/blockout/install.sh 0.5.0 -f secrets.yaml           # or the secrets in a file
#   IMAGE=registry.example.org/blockout:test deploy/blockout/install.sh
#   VALUES=values-production.yaml deploy/blockout/install.sh 1.0.0
#
# What only you have comes from the environment (op run fills it from
# 1Password; .env.1password holds only references), or from a values file kept
# out of git (secrets.yaml, see values.yaml):
#   BLOCKOUT_GOOGLE_CLIENT_SECRET               keycloak.google.clientSecret (required)
#   BLOCKOUT_GHCR_USER, BLOCKOUT_GHCR_TOKEN     imageCredentials (a token that can read packages)
#   BLOCKOUT_SMTP_HOST, _PORT, _FROM, _USER, _PASSWORD    keycloak.smtp (optional)
#   RCLONE_CONFIG_*                             backup.rclone; any of them turns backups on
#   BLOCKOUT_OPENAI_API_KEY                     openai.apiKey (optional)
# They reach helm on its standard input, never on its command line (where ps
# would show them). Any other helm options can follow. Needs helm and jq with
# access to the cluster.
set -euo pipefail

NS="${NAMESPACE:-blockout}"
VALUES="${VALUES:-values-workspace.yaml}"
cd "$(dirname "$0")"

image_args=()
if [ -n "${IMAGE:-}" ]; then
  image_args=(--set "image.repository=${IMAGE%:*}" --set "image.tag=${IMAGE##*:}")
elif [ -n "${1:-}" ] && [[ "$1" != -* ]]; then
  image_args=(--set "image.tag=${1#v}"); shift
else
  echo "Which version? deploy/blockout/install.sh 0.4.1 -f secrets.yaml (or IMAGE=repository:tag)" >&2
  exit 1
fi

# The secrets from the environment, as values (unset ones are left out)
secrets() {
  jq -n '{
    keycloak: {
      google: { clientSecret: env.BLOCKOUT_GOOGLE_CLIENT_SECRET },
      smtp: { host: env.BLOCKOUT_SMTP_HOST, port: env.BLOCKOUT_SMTP_PORT, from: env.BLOCKOUT_SMTP_FROM,
              user: env.BLOCKOUT_SMTP_USER, password: env.BLOCKOUT_SMTP_PASSWORD }
    },
    imageCredentials: { username: env.BLOCKOUT_GHCR_USER, password: env.BLOCKOUT_GHCR_TOKEN },
    openai: { apiKey: env.BLOCKOUT_OPENAI_API_KEY },
    backup: ([env | to_entries[] | select(.key | startswith("RCLONE_CONFIG_"))]
             | if length > 0 then { enabled: true, rclone: from_entries } else null end)
  } | walk(if type == "object" then with_entries(select(.value != null and .value != "" and .value != {})) else . end)'
}

helm repo add codecentric https://codecentric.github.io/helm-charts --force-update >/dev/null
helm dependency build . >/dev/null
secrets | helm upgrade --install blockout . -n "$NS" --create-namespace -f "$VALUES" -f - "${image_args[@]}" "$@" \
  --atomic --wait --timeout 15m
