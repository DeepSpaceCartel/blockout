<title>ADR-0009</title>

# ADR-0009: One Helm chart deploys Blockout with its databases and Keycloak

Status: accepted
Date: 2026-10-16

## Context

Until 0.4.1, a deployment took three steps, each run by hand: `deploy/data/install.sh` (MongoDB, Valkey and their backup, with `kubectl apply` and `kubectl exec`), `deploy/keycloak/install.sh` (Postgres, Keycloak, the realm through `kcadm.sh`, the HTTPRoute through `sed`), and the `blockout` chart, which only ran the servers and read Secrets that the scripts had made. Secrets were made with `kubectl create secret` and copied between namespaces. The cluster held objects that no release owned, so nobody could tell from Helm what was running, and a cluster rebuild needed every step again in order.

The project owner wants nothing created by hand: one `helm install` should bring up the whole production setup, and secrets should be values.

## Decision

- **One chart, `blockout`, in one namespace,** installs the servers, MongoDB, Valkey, Keycloak with its Postgres, the backup CronJobs and the monthly restore check.
- **Keycloak comes from the upstream `codecentric/keycloakx` chart** as a dependency, pinned in `Chart.lock`. MongoDB, Valkey and Postgres are the chart's own small StatefulSets: there's no maintained upstream chart for them without Bitnami's paid images, and we don't want an operator for one member each.
- **What the scripts did by hand runs in the cluster:** the MongoDB replica set is started by a container beside `mongod`; the realm is brought in line by a post-install and post-upgrade hook Job.
- **Passwords are made by the chart once** (`lookup`, else random) and kept, also through `helm uninstall` (`helm.sh/resource-policy: keep`), because the data volumes outlive the release too. **Secrets only a person has** (the Google client secret, image credentials, mail, backup storage) **are values,** passed at install time from a file outside git, or the name of an existing Secret where the chart allows it.
- **Each of MongoDB, Valkey and Keycloak can be switched off** to use one run elsewhere; with all of them off and `server.enabled: false`, the same chart gives development its databases.

## Consequences

- **`helm upgrade --install` is the whole deploy and `helm rollback` the whole rollback;** a cluster rebuild is one command again.
- **Tools that render without a cluster** (`helm template`, Argo CD) can't look up the kept passwords and would make new ones. A GitOps setup must provide those Secrets itself.
- **The chart is bigger** (the Keycloak subchart travels with it) and its namespace holds the data, so deleting the namespace deletes the data volumes too. Removing the release alone doesn't.
- **Keycloak's settings from this chart** (its address) are read when it starts: changing `keycloak.url` or the Google secret needs a restart of `blockout-keycloakx`.
- **Production may later move to operators** (managed MongoDB, CloudNativePG) through the `external` settings, without changing the servers' side.
