#!/usr/bin/env bash
# Installs or updates Blockout in the cluster (namespace blockout), then waits
# until every server is ready; a failed update is rolled back by itself.
# MongoDB and Valkey come first (deploy/data/install.sh): their Secrets are
# copied into this namespace.
#
#   deploy/blockout/install.sh 0.4.0                       # a released image
#   IMAGE=registry.example.org/blockout:test deploy/blockout/install.sh
#   VALUES=values-production.yaml deploy/blockout/install.sh 1.0.0
#
# Needs kubectl and helm with access to the cluster.
set -euo pipefail

NS="${NAMESPACE:-blockout}"
DATA_NS="${DATA_NAMESPACE:-blockout-data}"
VALUES="${VALUES:-values-workspace.yaml}"
cd "$(dirname "$0")"

say() { printf '\n\033[1m▶ %s\033[0m\n' "$*"; }

image_args=()
if [ -n "${IMAGE:-}" ]; then
  image_args=(--set "image.repository=${IMAGE%:*}" --set "image.tag=${IMAGE##*:}")
elif [ -n "${1:-}" ]; then
  image_args=(--set "image.tag=${1#v}")
else
  echo "Which version? deploy/blockout/install.sh 0.4.0 (or IMAGE=repository:tag)" >&2
  exit 1
fi

say "Namespace $NS"
kubectl get namespace "$NS" >/dev/null 2>&1 || kubectl create namespace "$NS"

say "Database Secrets (from $DATA_NS)"
for s in blockout-mongo blockout-redis; do
  url="$(kubectl -n "$DATA_NS" get secret "$s" -o jsonpath='{.data.url}' | base64 -d)"
  kubectl -n "$NS" create secret generic "$s" --from-literal=url="$url" --dry-run=client -o yaml | kubectl -n "$NS" apply -f - >/dev/null
done

say "Blockout ($VALUES)"
helm upgrade --install blockout . -n "$NS" -f "$VALUES" "${image_args[@]}" --atomic --wait --timeout 10m

say "Ready"
kubectl -n "$NS" get deployment blockout
