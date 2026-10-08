#!/usr/bin/env bash
# Installs the 1Password CLI (op) from 1Password's apt repository, following
# https://developer.1password.com/docs/cli/get-started/. apt checks the packages'
# signatures with 1Password's key, and the key itself is checked against the
# fingerprint 1Password publishes before anything trusts it.
set -euo pipefail

VERSION="${VERSION:-2.40.0}"
FINGERPRINT=3FEF9748469ADBE15DA7CA80AC2D62742012EA22
KEY_ID=AC2D62742012EA22
arch="$(dpkg --print-architecture)" # amd64 or arm64

export DEBIAN_FRONTEND=noninteractive
missing=()
for tool in curl gpg; do command -v "$tool" >/dev/null 2>&1 || missing+=("$tool"); done
if [ "${#missing[@]}" -gt 0 ]; then
  apt-get update -qq
  apt-get install -y -qq --no-install-recommends curl ca-certificates gnupg
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
export GNUPGHOME="$tmp/gnupg" # no keyring left behind in root's home
mkdir -m 700 "$GNUPGHOME"
curl -fsSL https://downloads.1password.com/linux/keys/1password.asc -o "$tmp/1password.asc"
got="$(gpg --batch --quiet --show-keys --with-colons "$tmp/1password.asc" | awk -F: '/^fpr:/ { print $10; exit }')"
if [ "$got" != "$FINGERPRINT" ]; then
  echo "1password-cli: the signing key's fingerprint is $got, expected $FINGERPRINT." >&2
  exit 1
fi

gpg --batch --quiet --dearmor < "$tmp/1password.asc" > /usr/share/keyrings/1password-archive-keyring.gpg
echo "deb [arch=${arch} signed-by=/usr/share/keyrings/1password-archive-keyring.gpg] https://downloads.1password.com/linux/debian/${arch} stable main" \
  > /etc/apt/sources.list.d/1password.list
# debsig policy: the package files are signed too, not only the repository
mkdir -p "/etc/debsig/policies/${KEY_ID}" "/usr/share/debsig/keyrings/${KEY_ID}"
curl -fsSL https://downloads.1password.com/linux/debian/debsig/1password.pol -o "/etc/debsig/policies/${KEY_ID}/1password.pol"
cp /usr/share/keyrings/1password-archive-keyring.gpg "/usr/share/debsig/keyrings/${KEY_ID}/debsig.gpg"

apt-get update -qq
if [ "$VERSION" = latest ]; then
  apt-get install -y -qq --no-install-recommends 1password-cli
else
  apt-get install -y -qq --no-install-recommends "1password-cli=${VERSION}-*"
fi
rm -rf /var/lib/apt/lists/*
op --version
