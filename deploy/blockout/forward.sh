#!/usr/bin/env bash
# Development: forwards MongoDB (localhost:27017) and Valkey (localhost:6379)
# from the cluster and prints the URLs to start Blockout with. The services are
# the chart's development release (values-dev.yaml): release blockout-dev in
# namespace blockout-dev, or RELEASE=… NAMESPACE=…. Stops with Ctrl+C.
#
#   npm run services
set -euo pipefail
RELEASE="${RELEASE:-blockout-dev}"
NS="${NAMESPACE:-$RELEASE}"
secret() { kubectl -n "$NS" get secret "$RELEASE-$1" -o jsonpath="{.data.$2}" | base64 -d; }
mongo_pw="$(secret mongo root-password)"
redis_pw="$(secret redis password)"
echo "Forwarding MongoDB and Valkey from namespace $NS. Start Blockout with:"
echo "  BLOCKOUT_MONGO_URL='mongodb://root:$mongo_pw@localhost:27017/blockout?authSource=admin&directConnection=true' \\"
echo "  BLOCKOUT_REDIS_URL='redis://:$redis_pw@localhost:6379' npm start"
trap 'kill 0' EXIT
kubectl -n "$NS" port-forward "pod/$RELEASE-mongo-0" 27017:27017 >/dev/null &
kubectl -n "$NS" port-forward "svc/$RELEASE-valkey" 6379:6379 >/dev/null &
wait
