#!/usr/bin/env bash
# Brings the blockout realm in line with what Blockout needs, on a running
# Keycloak: realm-blockout.json is only imported into an empty Keycloak, so
# changes to an existing realm go through Keycloak's admin CLI (kcadm.sh in the
# pod). Safe to run again. Run by install.sh; on its own:
#
#   BLOCKOUT_URLS="https://blockout.example.org http://localhost:8080" deploy/keycloak/realm.sh
#
#   BLOCKOUT_URLS  Blockout's addresses: sign-in sends people back only to these
#   keycloak-smtp  (Secret, optional: host, port, from, user, password) mail for
#                  checking addresses and resetting passwords; without it, both are off
set -euo pipefail

NS="${NAMESPACE:-keycloak}"
POD="${POD:-keycloak-keycloakx-0}"
REALM=blockout
URLS="${BLOCKOUT_URLS:-http://localhost:8080 http://localhost:5173}"

secret() { kubectl -n "$NS" get secret "$1" -o jsonpath="{.data.$2}" 2>/dev/null | base64 -d; }
kc() { kubectl -n "$NS" exec "$POD" -c keycloak -- /opt/keycloak/bin/kcadm.sh "$@" --config /tmp/kcadm.config; }

kc config credentials --server http://localhost:8080 --realm master --user "$(secret keycloak-admin username)" --password "$(secret keycloak-admin password)" >/dev/null

# The client: Blockout's addresses only (no wildcards beyond each address's own paths)
redirects=$(printf '"%s/*",' $URLS); origins=$(printf '"%s",' $URLS)
logout=$(printf '%s/*##' $URLS)
id=$(kc get clients -r "$REALM" -q clientId=blockout --fields id --format csv --noquotes)
kc update "clients/$id" -r "$REALM" \
  -s "redirectUris=[${redirects%,}]" -s "webOrigins=[${origins%,}]" \
  -s "attributes.\"post.logout.redirect.uris\"=${logout%##}"
echo "  client blockout: $URLS"

# Admins are the only role Keycloak keeps for Blockout (ADR-0008)
kc get "roles/admin" -r "$REALM" >/dev/null 2>&1 || kc create roles -r "$REALM" -s name=admin -s 'description=Blockout admin: accounts and roles, teacher codes, schools.'
echo "  realm role admin"

# Guessing passwords is slowed down; passwords are at least 10 characters
kc update "realms/$REALM" -s bruteForceProtected=true -s failureFactor=10 -s waitIncrementSeconds=60 -s maxFailureWaitSeconds=900 -s 'passwordPolicy=length(10)'
echo "  brute-force protection, passwords of 10 or more"

# Mail: check addresses and reset passwords only when Keycloak can send mail
if host=$(secret keycloak-smtp host) && [ -n "$host" ]; then
  kc update "realms/$REALM" -s verifyEmail=true -s resetPasswordAllowed=true \
    -s "smtpServer.host=$host" -s "smtpServer.port=$(secret keycloak-smtp port)" -s "smtpServer.from=$(secret keycloak-smtp from)" \
    -s "smtpServer.auth=true" -s "smtpServer.user=$(secret keycloak-smtp user)" -s "smtpServer.password=$(secret keycloak-smtp password)" \
    -s "smtpServer.starttls=true" -s "smtpServer.fromDisplayName=Blockout"
  echo "  mail through $host: addresses are checked, passwords can be reset"
else
  kc update "realms/$REALM" -s verifyEmail=false -s resetPasswordAllowed=false
  echo "  no keycloak-smtp Secret: no address checks or password resets (nothing could send the mail)"
fi
