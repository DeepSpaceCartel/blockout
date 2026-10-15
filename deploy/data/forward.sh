#!/usr/bin/env bash
# Development: forwards MongoDB (localhost:27017) and Valkey (localhost:6379)
# from the cluster (namespace blockout-dev, or NAMESPACE=…) and prints the URLs
# to start Blockout with. Stops with Ctrl+C.
#
#   npm run services
set -euo pipefail
NS="${NAMESPACE:-blockout-dev}"
secret() { kubectl -n "$NS" get secret "$1" -o jsonpath="{.data.$2}" | base64 -d; }
mongo_pw="$(secret blockout-mongo root-password)"
redis_pw="$(secret blockout-redis password)"
echo "Forwarding MongoDB and Valkey from namespace $NS. Start Blockout with:"
echo "  BLOCKOUT_MONGO_URL='mongodb://root:$mongo_pw@localhost:27017/blockout?authSource=admin&directConnection=true' \\"
echo "  BLOCKOUT_REDIS_URL='redis://:$redis_pw@localhost:6379' npm start"
trap 'kill 0' EXIT
kubectl -n "$NS" port-forward pod/mongo-0 27017:27017 >/dev/null &
kubectl -n "$NS" port-forward svc/valkey 6379:6379 >/dev/null &
wait
