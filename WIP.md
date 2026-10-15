# Work in progress

Where things stand on the `v0.3.0` branch, for picking the work up again. No secrets, tokens, passwords, IDs or addresses are recorded here: they live in the cluster's Secrets or in 1Password.

## The production-readiness plan

Milestones M0–M8 (approved 2026-10-15). Status:

| | Milestone | State |
|---|---|---|
| M0 | Housekeeping | Done |
| M1 | Server hardening: crash fix, config guard, headers and CSP, secure codes, rate limits, stream caps, `/health/*` and drain, structured logs, fewer writes, token refresh | Done |
| M2 | MongoDB for accounts, Valkey (Redis) for live classes; several servers; classes survive restarts | Done. Checked with two servers behind a proxy: a class carries on through a killed server and a rolling restart |
| M3 | Roles kept by Blockout, one-time invites, admins (`/admin/`), deleting accounts | Done (ADR-0008) |
| M4 | Container image, Helm chart (`deploy/blockout`), release workflow | Done. Image built with the cluster's BuildKit; chart passes server-side validation. CI and release have not run on GitHub yet (nothing pushed) |
| M5 | First public deployment in the workspace cluster | In-repo parts done (public Keycloak via `KEYCLOAK_URL`, `realm.sh`, chart values for the workspace). Waiting on the decisions below |
| M6 | Metrics, alert rules, nightly encrypted backups, restore drill, runbooks | Done; backups and restore drill run in `blockout-dev` with a local remote. Real backups wait for object storage |
| M7 | Retention (13 months), data export, privacy page, accessibility pass | Done |
| M8 | Production cluster: operators, GitOps, load test, cutover | Not started |

## Waiting on decisions (M5, M8)

1. **Hostnames** for Blockout and Keycloak (the workspace values assume `blockout.` and `id.` under the cluster's domain).
2. **Gateway listeners and DNS** for them on `gateway/rts-gateway`: set up outside this repo.
3. **An image in a registry:** push a `v*` tag (GitHub Actions publishes to GHCR), and make the package public or add a pull secret.
4. **SMTP** for Keycloak (address checks, password resets). Without it, `realm.sh` turns both off.
5. **Self-registration:** `realm-blockout.json` has open registration (`registrationAllowed: true`, uncommitted, from before the plan). It's safe with ADR-0008 (new accounts are students), but it's the owner's call; Google's **Hosted domain** is the other lever.
6. **Object storage** for backups (the `blockout-backup` Secret: see `docs/guides/operate.md`).
7. **Google Cloud Console:** add Keycloak's public broker redirect URI.
8. **The production cluster** (M8): provider and region.

## Development setup in the cluster

- **`blockout-dev`:** MongoDB and Valkey for development (`NAMESPACE=blockout-dev deploy/data/install.sh`); `npm run services` forwards them and prints the URLs.
- **`keycloak`:** development Keycloak on `http://localhost:8180` (`npm run keycloak`). `realm.sh` has been applied: the `admin` role, brute-force protection, a 10-character password policy, no mail.

## Notes

- **trivy-action** is pinned by commit; check its release against Aqua's March 2026 advisory before trusting or bumping it.
- **`npm audit`** reports one high-severity advisory in `source-map-js`, a build-time dependency of Vite (not in the image or the pages); Dependabot should bring the fix.
- **The workspace cluster has no Alertmanager:** alerts show in Prometheus and Grafana but notify nobody.
- **Docs screenshots** show the brighter orange buttons from before the contrast fix; retake them with the next round.
- **Still to do from before:** a real Google sign-in end to end (the "Signed out" dialog needs `identity_provider: "google"`), and the landscape layout for game-kit's menus.
