#!/usr/bin/env bash
# Installs or updates Blockout's data services in the cluster: MongoDB (accounts)
# and Valkey (live classes), in namespace blockout-data, or NAMESPACE=… (for
# example blockout-dev for development). Safe to run again: it keeps existing
# Secrets and data.
#
#   deploy/data/install.sh
#   NAMESPACE=blockout-dev deploy/data/install.sh
#
# Then Blockout connects with the URLs in the blockout-mongo and blockout-redis
# Secrets (key url). From your computer: npm run services, then use the
# localhost URLs it prints. Needs kubectl with access to the cluster.
set -euo pipefail

NS="${NAMESPACE:-blockout-data}"
cd "$(dirname "$0")"

say() { printf '\n\033[1m▶ %s\033[0m\n' "$*"; }
has() { kubectl -n "$NS" get secret "$1" >/dev/null 2>&1; }

say "Namespace $NS"
kubectl get namespace "$NS" >/dev/null 2>&1 || kubectl create namespace "$NS"

say "Secrets (random passwords, made once)"
if ! has blockout-mongo; then
  pw="$(openssl rand -hex 24)"
  kubectl -n "$NS" create secret generic blockout-mongo \
    --from-literal=root-password="$pw" \
    --from-literal=keyfile="$(openssl rand -base64 756 | tr -d '\n')" \
    --from-literal=url="mongodb://root:$pw@mongo-0.mongo.$NS.svc.cluster.local:27017/blockout?authSource=admin&replicaSet=rs0" >/dev/null
fi
if ! has blockout-redis; then
  pw="$(openssl rand -hex 24)"
  kubectl -n "$NS" create secret generic blockout-redis \
    --from-literal=password="$pw" \
    --from-literal=url="redis://:$pw@valkey.$NS.svc.cluster.local:6379" >/dev/null
fi

say "MongoDB"
kubectl -n "$NS" apply -f mongo.yaml
kubectl -n "$NS" rollout status statefulset/mongo --timeout=5m
# A replica set of one: started once, then left alone. (On a first start the
# image restarts mongod once after creating the root user: try for a while.)
pw="$(kubectl -n "$NS" get secret blockout-mongo -o jsonpath='{.data.root-password}' | base64 -d)"
mongosh() { kubectl -n "$NS" exec mongo-0 -c mongo -- mongosh --quiet -u root -p "$pw" --authenticationDatabase admin --eval "$1" >/dev/null 2>&1; }
for i in $(seq 1 30); do
  mongosh "try { rs.status().ok } catch (e) { rs.initiate({ _id: 'rs0', members: [{ _id: 0, host: 'mongo-0.mongo.$NS.svc.cluster.local:27017' }] }).ok }" &&
    mongosh 'for (let i = 0; i < 30 && !db.hello().isWritablePrimary; i++) sleep(1000); if (!db.hello().isWritablePrimary) quit(1)' && break
  [ "$i" = 30 ] && { echo "MongoDB didn't become ready: kubectl -n $NS logs mongo-0" >&2; exit 1; }
  sleep 5
done

say "Valkey"
kubectl -n "$NS" apply -f valkey.yaml
kubectl -n "$NS" rollout status statefulset/valkey --timeout=5m

say "Ready in namespace $NS"
echo "  Inside the cluster: the url keys of Secrets blockout-mongo and blockout-redis."
echo "  From here: npm run services (NAMESPACE=$NS), then the URLs it prints."
