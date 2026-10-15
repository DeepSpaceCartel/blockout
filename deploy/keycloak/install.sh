#!/usr/bin/env bash
# Installs or updates Keycloak for Blockout sign-in in the cluster (namespace
# keycloak), then waits until it's ready. Safe to run again: it keeps existing
# Secrets and data, and only changes what differs.
#
#   deploy/keycloak/install.sh                     # development: http://localhost:8180
#   KEYCLOAK_URL=https://id.example.org BLOCKOUT_URLS="https://blockout.example.org" \
#   GATEWAY=rts-gateway GATEWAY_NAMESPACE=gateway LISTENER=id-example-org deploy/keycloak/install.sh
#
#   KEYCLOAK_URL   Keycloak's address (the tokens' issuer is KEYCLOAK_URL/realms/blockout)
#   BLOCKOUT_URLS  Blockout's addresses, for sign-in to send people back to
#   GATEWAY…       with an https KEYCLOAK_URL: the Gateway listener to publish it on
#
# The Google OAuth client secret: from 1Password when OP_SERVICE_ACCOUNT_TOKEN and
# GOOGLE_SECRET_REF (op://vault/item/field) are set, else GOOGLE_CLIENT_SECRET,
# else asked for. Mail (address checks, password resets) needs a keycloak-smtp
# Secret: see realm.sh. Needs kubectl and helm with access to the cluster.
# NAMESPACE=… installs somewhere else (for testing).
set -euo pipefail

NS="${NAMESPACE:-keycloak}"
CHART_VERSION=7.3.2
KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8180}"
export BLOCKOUT_URLS="${BLOCKOUT_URLS:-http://localhost:8080 http://localhost:5173}" NAMESPACE="$NS"
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
  if [ -z "${GOOGLE_CLIENT_SECRET:-}" ] && [ -n "${OP_SERVICE_ACCOUNT_TOKEN:-}" ] && [ -n "${GOOGLE_SECRET_REF:-}" ]; then
    GOOGLE_CLIENT_SECRET="$(op read "$GOOGLE_SECRET_REF")"
  fi
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
helm upgrade --install keycloak codecentric/keycloakx --version "$CHART_VERSION" -n "$NS" -f values.yaml \
  --set-string blockout.hostname="$KEYCLOAK_URL" --wait --timeout 10m >/dev/null

if [[ "$KEYCLOAK_URL" == https://* ]]; then
  say "Public address $KEYCLOAK_URL (gateway ${GATEWAY:?set GATEWAY, GATEWAY_NAMESPACE and LISTENER}/${LISTENER:?})"
  host="${KEYCLOAK_URL#https://}"; host="${host%%/*}"
  sed -e "s/GATEWAY_NAMESPACE/${GATEWAY_NAMESPACE:-gateway}/" -e "s/GATEWAY/$GATEWAY/" -e "s/LISTENER/$LISTENER/" -e "s/HOST/$host/" httproute.yaml | kubectl -n "$NS" apply -f -
fi

say "Realm settings (for a new or an existing realm)"
./realm.sh

say "Nightly backup"
if kubectl -n "$NS" get secret blockout-backup >/dev/null 2>&1; then
  kubectl -n "$NS" apply -f backup.yaml
else
  echo "  No blockout-backup Secret here: no backups yet. See docs/guides/operate.md (Backups)."
fi

[[ "$KEYCLOAK_URL" == https://* ]] && cat <<MSG

Keycloak is ready at $KEYCLOAK_URL. Blockout: KEYCLOAK_ISSUER=$KEYCLOAK_URL/realms/blockout KEYCLOAK_CLIENT_ID=blockout
(The admin console isn't public: npm run keycloak, then http://localhost:8180/admin.)
MSG
[[ "$KEYCLOAK_URL" == https://* ]] || cat <<MSG

Keycloak is ready. Next:
  npm run keycloak              forward it to http://localhost:8180 (keep it running)
  BLOCKOUT_AUTH=keycloak KEYCLOAK_ISSUER=http://localhost:8180/realms/blockout KEYCLOAK_CLIENT_ID=blockout npm start
Admin console: http://localhost:8180/admin (user admin), password:
  kubectl -n $NS get secret keycloak-admin -o jsonpath='{.data.password}' | base64 -d
MSG
