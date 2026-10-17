<title>Deploy to a cluster</title>

# Deploy to a cluster

One Helm chart, `blockout` (in `deploy/blockout`, released as `oci://ghcr.io/deepspacecartel/charts/blockout`), installs Blockout and everything it runs on into one namespace:

- two or more identical servers
- MongoDB for accounts, and Valkey for live classes
- Keycloak for sign-in, with its Postgres
- nightly backups, and a monthly restore check

A server can stop at any time: its classes carry on at another one. Nothing is created by hand: every object belongs to the release ([ADR-0009](../decisions/0009-one-chart.md)).

## Before the first deploy

1. **The gateway and DNS:** a listener (and certificate) on the cluster's shared Gateway for Blockout's hostname and for Keycloak's, and DNS records for both. In the workspace cluster they're in rts-terraform (`platform/blockout.tf`, `gateway.tf`): `blockout.deepspacecartel.com` and `id.deepspacecartel.com`.
2. **A Google OAuth client** with `https://<keycloak>/realms/blockout/broker/google/endpoint` among its redirect URIs ([Switch sign-in to Keycloak](set-up-keycloak.md#a-google-oauth-client)). Its id is in `files/realm-blockout.json`; keep its secret at hand.
3. **A released image:** tagging `v…` publishes `ghcr.io/deepspacecartel/blockout` ([CI](../project/ci.md#releases)). The package is internal to the DeepSpaceCartel organization, so the cluster pulls it with a token that can read packages (`imageCredentials`).

## Secrets

Every password the chart needs inside the cluster (MongoDB, Valkey, Postgres, Keycloak's admin) is made by the chart on the first install and kept in its Secrets, also through `helm uninstall`. What only you have comes from the environment, or from a values file.

**From 1Password (recommended):** `deploy/blockout/.env.1password` names each secret by its 1Password reference (`op://<vault>/<item>/<field>`), so it holds no secrets and is in git. `op run` fills the environment from it, and `install.sh` hands the values to Helm on its standard input (never its command line, where `ps` would show them):

```sh
op run --env-file=deploy/blockout/.env.1password -- deploy/blockout/install.sh 0.5.0
```

| Variable | Value |
|---|---|
| `BLOCKOUT_GOOGLE_CLIENT_SECRET` | `keycloak.google.clientSecret` (required) |
| `BLOCKOUT_GHCR_USER`, `BLOCKOUT_GHCR_TOKEN` | `imageCredentials`: a token that can read packages |
| `BLOCKOUT_SMTP_HOST`, `_PORT`, `_FROM`, `_USER`, `_PASSWORD` | `keycloak.smtp` (optional) |
| `RCLONE_CONFIG_*` | `backup.rclone`; any of them turns backups on |
| `BLOCKOUT_OPENAI_API_KEY` | `openai.apiKey` (optional) |

Point the references at your own vault and items. The same variables work from anywhere else (a CI secret store, `export`).

**Or a values file** that stays out of git (`secrets*.yaml` is ignored):

```yaml
# secrets.yaml
keycloak:
  google:
    clientSecret: <the Google OAuth client's secret>
imageCredentials:
  username: <GitHub user>
  password: <token with read:packages>
# backup:
#   rclone: { … }     (see Run it day to day › Backups)
# keycloak:
#   smtp: { … }       (mail, see Switch sign-in to Keycloak)
```

```sh
deploy/blockout/install.sh 0.5.0 -f secrets.yaml
```

## Deploy, update, roll back

From a checkout (the chart as it is in the checkout, `values-workspace.yaml` by default), with the secrets from either of the above:

```sh
op run --env-file=deploy/blockout/.env.1password -- deploy/blockout/install.sh 0.5.0
VALUES=values-production.yaml deploy/blockout/install.sh 1.0.0 -f secrets.yaml
```

Or the released chart, with no checkout:

```sh
helm upgrade --install blockout oci://ghcr.io/deepspacecartel/charts/blockout --version 0.5.0 \
  -n blockout --create-namespace -f values-workspace.yaml -f secrets.yaml --atomic --wait --timeout 15m
```

`--atomic --wait`: the update finishes only when every part is ready, and goes back to the previous release by itself if they don't get there. Servers are replaced one at a time, and each finishes its streams first, so classes keep going. The first install takes a few minutes (Keycloak's first start).

To go back by hand:

```sh
helm -n blockout history blockout
helm -n blockout rollback blockout <revision>
```

## What the chart sets up

| Object | Why |
|---|---|
| Deployment `blockout` | 2 servers (3 in production), spread over nodes, read-only root filesystem, no privileges, no service account token. Probes on `/health/startup`, `/health/live` and `/health/ready`; 5 seconds' pause before stopping, 30 to finish. |
| HTTPRoute `blockout` | Blockout's hostname on the shared Gateway, with no request timeout: live classes keep event streams open for hours. |
| PodDisruptionBudget | Node maintenance never takes the last server. |
| CiliumNetworkPolicy | In: only from the gateway. Out: DNS, MongoDB and Valkey, and HTTPS (Keycloak's keys at its public address, OpenAI). |
| HorizontalPodAutoscaler | Production: 3 to 12 servers on CPU. |
| StatefulSet `blockout-mongo` | MongoDB 8.0, a replica set of one (`rs0`, started by the `replica-set` container beside it), 10 GB volume. |
| StatefulSet `blockout-valkey` | Valkey 8.1, no volume (live classes only last hours). |
| StatefulSet `blockout-keycloakx` | Keycloak 26 (the `codecentric/keycloakx` chart), production mode behind the gateway. |
| StatefulSet `blockout-keycloak-db` | Postgres 17 for Keycloak, 10 GB volume. |
| HTTPRoute `blockout-keycloak` | Keycloak's hostname: sign-in only (`/realms/blockout`, `/resources`). The admin console isn't public. |
| Job `blockout-keycloak-realm` | After every install and upgrade: the realm's redirect addresses, the `admin` role, brute-force protection, mail. |
| CronJobs `blockout-backup-*`, `blockout-restore-check` | With `backup.enabled`: nightly encrypted dumps, and the monthly restore check ([Run it day to day](operate.md#backups)). |
| Secrets | `blockout-mongo` and `blockout-redis` (passwords and `url`), `blockout-keycloak-db`, `blockout-keycloak-admin`, `blockout-keycloak-google`, `blockout-pull`. |

Settings are in `values.yaml` (checked by `values.schema.json`), and the ones for each cluster in `values-workspace.yaml` and `values-production.yaml`. The chart refuses to render without `publicUrl` (https), `keycloak.url` and the Google client secret.

**Using databases or a Keycloak run elsewhere:** `mongo.enabled: false` with `mongo.external.secretName` (a Secret holding the URL), the same for `valkey`, and `keycloak.enabled: false` with `keycloak.issuer`.

## Check it

```sh
kubectl -n blockout get pods
kubectl -n blockout logs deployment/blockout | head          # JSON lines: server.started, http.request, audit records
curl -s https://blockout.deepspacecartel.com/health/ready
```

Then make the first admin ([Switch sign-in to Keycloak › Make someone an admin](set-up-keycloak.md#make-someone-an-admin)).
