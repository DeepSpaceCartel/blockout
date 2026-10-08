# Work in progress

Where things stand on the `v0.3.0` branch, for picking the work up again. No secrets, tokens, passwords, IDs or addresses are recorded here: they live in the cluster's Secrets or in 1Password.

## Done and committed (`fdb8f12 Cleanup` and earlier)

- **Dev container:** Node 26 image (`typescript-node:5-26-trixie`), `hostRequirements` (1 CPU, 4 GB, 10 GB). A full test run peaks at about 2.4 GB, so 4 GB is about the minimum.
- **Local Dev Container Features** in `.devcontainer/features/`: `cloudflared`, `playwright-chromium` (Chromium in `/ms-playwright`), `python-venv`, `agent-skills` (DeepSpaceCartel skills, pinned to a commit, user-level in `~/.claude/skills`), `coder-cli` (from the Coder deployment, so it matches the server). Official features: `github-cli`, `kubectl-helm-minikube` (minikube off).
- **`postCreateCommand.sh`** only installs npm packages, checks Playwright's Chromium and creates the docs venv (`.venv`).
- **CI:** `ci.yml` on Node 26 with `node .devcontainer/check.mjs` (Playwright version in `devcontainer.json` must match `package-lock.json`); `devcontainer.yml` builds the container and smoke-tests the tools; Dependabot covers dev container features.
- **Node 26 everywhere:** `engines` `>=26`, CI, docs, changelog.

## Done, not committed yet

| Area | Files | What |
|---|---|---|
| Landscape menu | `packages/ui/src/css/menu.css`, 3 screenshots, `CHANGELOG.md` | Two-column start menu on landscape screens ≥ 900×560 (Chromebooks, sideways iPads): Start is on screen without scrolling. Phones and portrait unchanged. Menu buttons 3 a row (2 below 1100 px), last row stretches. |
| 1Password CLI | `.devcontainer/features/1password-cli/`, `devcontainer.json`, `devcontainer.yml`, `CLAUDE.md`, `docs/project/installing.md` | `op` from 1Password's signed apt repo; key fingerprint checked; pinned to 2.40.0. |
| Keycloak in the cluster | `deploy/keycloak/` (`install.sh`, `values.yaml`, `postgres.yaml`, `realm-blockout.json`), `package.json` (`npm run keycloak`), port 8180 in `devcontainer.json`, `docs/guides/set-up-keycloak.md`, `CLAUDE.md` | See below. |
| Sign out of Keycloak too | `packages/auth/src/client.js`, `apps/multiplication/src/accounts.js` | Sign out ends the Keycloak session (via `id_token_hint`), so the next Sign in asks again. After signing out of a Google account, a "Signed out" dialog offers **Also sign out of Google** (opens Google's sign-out in a new tab). |

Tests, lint and `mkdocs build --strict` pass with all of it.

## Keycloak: how it's set up

- **Development only:** Keycloak runs in the workspace's cluster (namespace `keycloak`) and is reached on `http://localhost:8180` through `npm run keycloak` (a `kubectl port-forward`). Only the browser of the person running the port-forward can sign in.
- **Pieces:** Helm chart `codecentric/keycloakx` 7.3.2 (Keycloak 26.7.4), Postgres 17 on a 10 GB volume, Secrets `keycloak-admin`, `keycloak-db` (random passwords) and `google-oauth` (the Google client secret).
- **Realm `blockout`** (`realm-blockout.json`, imported only when the realm doesn't exist):
  - public client `blockout`, PKCE S256, redirects to `http://localhost:8080/*` and `:5173/*`
  - realm roles `student`, `teacher`, `parent`
  - access tokens last 8 hours (Blockout doesn't refresh tokens yet)
  - Google identity provider: secret read as `${vault.google-secret}` from the mounted `google-oauth` Secret, `prompt=select_account`
  - a mapper adding `identity_provider` to the ID token
- **The running Keycloak matches the file:** the Google provider, the vault reference, `prompt` and the mapper were also applied through the admin API.
- **Rebuild:** `deploy/keycloak/install.sh` (idempotent; asks for the Google client secret when the `google-oauth` Secret is missing). Tested from scratch in a throwaway namespace.
- **Run Blockout against it:**
  ```sh
  npm run keycloak
  BLOCKOUT_AUTH=keycloak KEYCLOAK_ISSUER=http://localhost:8180/realms/blockout KEYCLOAK_CLIENT_ID=blockout npm start
  ```
- **Tested** with temporary password users (deleted afterwards): sign in as a teacher, sign out ends the Keycloak session, the Google button sends the right client and `prompt=select_account`.

## Still to do

1. **Check a real Google sign-in end to end:** sign in with Google, then sign out: the "Signed out" dialog should appear (it needs `identity_provider: "google"` in the ID token, which hasn't been seen from a real Google login yet).
2. **Read the Google secret from 1Password** in `install.sh` (`op read "op://<vault>/<item>/<field>"`, keeping the prompt as a fallback). Needs a 1Password service account, given to workspaces as `OP_SERVICE_ACCOUNT_TOKEN` (ideally a Coder secret). Vault and item names not decided.
3. **Decide** whether the Google OAuth client ID should stay in `realm-blockout.json` (it isn't secret, but it's committed with the repo).
4. **Commit** the work above (Conventional Commits; probably separate commits for the menu, the 1Password feature, Keycloak deploy, and sign-out).
5. **Later:**
   - token refresh in `@blockout/auth`, then shorter token lifespans
   - an option to send people straight to Google (`kc_idp_hint=google`)
   - a public Keycloak (and Blockout) hostname for classrooms (gateway listener, certificate, DNS; see "On a public server" in the guide)
   - secrets synced into the cluster (External Secrets Operator or 1Password's operator) once more apps need them
   - the landscape layout for the other games' menus (game-kit), and phones held sideways
   - pinning `cloudflared`, `agent-skills`, Playwright and `op` versions by hand when they move on (Dependabot can't see local features)

## Security to fix

- **The workspace's Kubernetes service account is cluster-admin.** Any code running in a workspace (an npm install script, a dependency, an agent) can read every Secret and change anything in the cluster. A Role limited to the namespaces the workspace needs (like `keycloak`) is enough for this work.
