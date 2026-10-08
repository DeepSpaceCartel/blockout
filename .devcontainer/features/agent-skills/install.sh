#!/usr/bin/env bash
# Installs Agent Skills user-level for the container user. Features run before the
# workspace is mounted, so they can't go in the project's .claude/skills.
# Needs Node (npx) and git, which the base image has.
set -euo pipefail

SOURCE="${SOURCE:-DeepSpaceCartel/skills}"
REF="${REF:-}"
SKILLS="${SKILLS:-*}"
AGENT="${AGENT:-claude-code}"
CLIVERSION="${CLIVERSION:-1.7.1}"
user="${_REMOTE_USER:-root}"

if ! command -v npx >/dev/null 2>&1; then
  echo "agent-skills: needs Node (npx) in the base image." >&2
  exit 1
fi

# The skills CLI takes a ref as a GitHub tree URL
from="$SOURCE"
[ -n "$REF" ] && from="https://github.com/${SOURCE}/tree/${REF}"

# As the container user, so the files land in (and belong to) their home
cmd="npx --yes 'skills@${CLIVERSION}' add '${from}' --global --copy --yes --agent '${AGENT}'"
set -f
for s in $SKILLS; do cmd+=" --skill '${s}'"; done
set +f

su "$user" -s /bin/bash -c "
  set -euo pipefail
  export DO_NOT_TRACK=1 DISABLE_TELEMETRY=1 npm_config_update_notifier=false
  export npm_config_cache=\"\$(mktemp -d)\"
  $cmd
  rm -rf \"\$npm_config_cache\"
"
