#!/usr/bin/env bash
# Installs or updates Keycloak for Blockout sign-in in the cluster (namespace
# keycloak), then waits until it's ready. Safe to run again: it keeps existing
# Secrets and data, and only changes what differs.
#
#   deploy/keycloak/install.sh
#
# The first time (or after a cluster rebuild) it asks for the Google OAuth
# client secret, or takes it from GOOGLE_CLIENT_SECRET. Needs kubectl and helm
# with access to the cluster. NAMESPACE=… installs somewhere else (for testing).
set -euo pipefail

NS="${NAMESPACE:-keycloak}"
CHART_VERSION=7.3.2
cd "$(dirname "$0")"

say() { printf '\n\033[1m▶ %s\033[0m\n' "$*"; }
# Creates a Secret only when it's missing, so passwords survive reruns
secret() { local name=$1; shift; kubectl -n "$NS" get secret "$name" >/dev/null 2>&1 || kubectl -n "$NS" create secret generic "$name" "$@"; }

say "Namespace $NS"
kubectl get namespace "$NS" >/dev/null 2>&1 || kubectl create namespace "$NS"

say "Secrets (random passwords; the Google secret from you)"
secret keycloak-db --from-literal=password="$(openssl rand -hex 24)"
secret keycloak-admin --from-literal=username=admin --from-literal=password="$(openssl rand -hex 24)"
if ! kubectl -n "$NS" get secret google-oauth >/dev/null 2>&1; then
  if [ -z "${GOOGLE_CLIENT_SECRET:-}" ]; then
    if [ ! -t 0 ]; then echo "No google-oauth Secret: set GOOGLE_CLIENT_SECRET (see docs/guides/set-up-keycloak.md)." >&2; exit 1; fi
    read -rsp "Google OAuth client secret (from Google Cloud Console › Clients): " GOOGLE_CLIENT_SECRET; echo
  fi
  secret google-oauth --from-literal=secret="$GOOGLE_CLIENT_SECRET"
fi

say "Postgres"
kubectl -n "$NS" apply -f postgres.yaml
kubectl -n "$NS" rollout status statefulset/keycloak-db --timeout=5m

say "Realm (imported when Keycloak first starts; an existing realm is left alone)"
kubectl -n "$NS" create configmap keycloak-realm --from-file=realm-blockout.json --dry-run=client -o yaml | kubectl -n "$NS" apply -f -

say "Keycloak (Helm chart codecentric/keycloakx $CHART_VERSION)"
helm repo add codecentric https://codecentric.github.io/helm-charts --force-update >/dev/null
helm upgrade --install keycloak codecentric/keycloakx --version "$CHART_VERSION" -n "$NS" -f values.yaml --wait --timeout 10m >/dev/null

cat <<MSG

Keycloak is ready. Next:
  npm run keycloak              forward it to http://localhost:8180 (keep it running)
  BLOCKOUT_AUTH=keycloak KEYCLOAK_ISSUER=http://localhost:8180/realms/blockout KEYCLOAK_CLIENT_ID=blockout npm start
Admin console: http://localhost:8180/admin (user admin), password:
  kubectl -n $NS get secret keycloak-admin -o jsonpath='{.data.password}' | base64 -d
MSG
