#!/usr/bin/env bash
# Installs or updates Blockout and everything it runs on (MongoDB, Valkey,
# Keycloak with its Postgres, backups) from this checkout's chart, then waits
# until every part is ready; a failed update is rolled back by itself. The same
# as installing the released chart (docs/guides/deploy.md), with a local one.
#
#   deploy/blockout/install.sh 0.4.1 -f secrets.yaml           # a released image
#   IMAGE=registry.example.org/blockout:test deploy/blockout/install.sh -f secrets.yaml
#   VALUES=values-production.yaml deploy/blockout/install.sh 1.0.0 -f secrets.yaml
#
# secrets.yaml holds what only you have: keycloak.google.clientSecret,
# imageCredentials, and backup.rclone (see values.yaml). Keep it out of git.
# Any other helm options can follow. Needs helm with access to the cluster.
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

helm repo add codecentric https://codecentric.github.io/helm-charts --force-update >/dev/null
helm dependency build . >/dev/null
helm upgrade --install blockout . -n "$NS" --create-namespace -f "$VALUES" "${image_args[@]}" "$@" \
  --atomic --wait --timeout 15m
