<title>Deploy to a cluster</title>

# Deploy to a cluster

Blockout runs in Kubernetes as two or more identical servers (the `blockout` Helm chart in `deploy/blockout`), with MongoDB for accounts, Valkey for live classes and Keycloak for sign-in. A server can stop at any time: its classes carry on at another one.

## Before the first deploy

1. **MongoDB and Valkey:** `deploy/data/install.sh` ([Set up MongoDB and Valkey](set-up-the-databases.md)).
2. **Keycloak on a public address,** with Blockout's address in the `blockout` client's redirect URIs and web origins ([Switch sign-in to Keycloak](set-up-keycloak.md)).
3. **The gateway:** a listener (and certificate) for Blockout's hostname on the cluster's shared Gateway. In the workspace cluster, that's `gateway/rts-gateway`, set up outside this repository; the chart attaches to the listener named in `values-workspace.yaml`.
4. **A released image:** tagging `v…` publishes `ghcr.io/<owner>/blockout` ([CI](../project/ci.md#releases)). If the package isn't public, give the cluster a pull secret and name it in `imagePullSecrets`. In the workspace cluster the package is internal to the org, and `values-workspace.yaml` uses `ghcr-pull`, made from a token that can read packages:

    ```sh
    kubectl create namespace blockout
    kubectl -n blockout create secret docker-registry ghcr-pull \
      --docker-server=ghcr.io --docker-username=<user> --docker-password=<token with read:packages>
    ```

## Deploy, update, roll back

```sh
deploy/blockout/install.sh 0.4.0                              # workspace cluster (values-workspace.yaml)
VALUES=values-production.yaml deploy/blockout/install.sh 1.0.0
```

It copies the database URLs from `blockout-data` into the `blockout` namespace and runs `helm upgrade --install --atomic --wait`: the update finishes only when every new server is ready, and goes back to the previous one by itself if they don't get there. Servers are replaced one at a time, and each finishes its streams first, so classes keep going.

To go back by hand:

```sh
helm -n blockout history blockout
helm -n blockout rollback blockout <revision>
```

## What the chart sets up

| Object | Why |
|---|---|
| Deployment | 2 servers (3 in production), spread over nodes, read-only root filesystem, no privileges, no service account token. Probes on `/health/startup`, `/health/live` and `/health/ready`; 5 seconds' pause before stopping, 30 to finish. |
| HTTPRoute | The hostname on the shared Gateway, with no request timeout: live classes keep event streams open for hours. |
| PodDisruptionBudget | Node maintenance never takes the last server. |
| CiliumNetworkPolicy | In: only from the gateway. Out: DNS, MongoDB and Valkey, and HTTPS (Keycloak's keys, OpenAI). |
| HorizontalPodAutoscaler | Production: 3 to 12 servers on CPU. |

Settings are in `values.yaml` (with `values.schema.json`); the per-cluster ones in `values-workspace.yaml` and `values-production.yaml`. The chart refuses to render without `publicUrl` (https) and `keycloak.issuer`.

## Check it

```sh
kubectl -n blockout get pods
kubectl -n blockout logs deployment/blockout | head          # JSON lines: server.started, http.request, audit records
curl -s https://blockout.example.org/health/ready
```
