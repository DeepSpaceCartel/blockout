<title>Set up MongoDB and Valkey</title>

# Set up MongoDB and Valkey

Blockout keeps accounts in MongoDB and live classes in Valkey, a Redis-compatible server ([ADR-0006](../decisions/0006-mongodb-and-redis.md)). In a deployment, the `blockout` chart runs both next to the servers ([Deploy to a cluster](deploy.md)). This guide is about the ones for development.

You don't need them to try Blockout on your own computer: without `BLOCKOUT_MONGO_URL` and `BLOCKOUT_REDIS_URL`, `npm start` keeps accounts and live classes in memory, and forgets them when it stops.

## What gets installed

The same chart with `values-dev.yaml`: only MongoDB and Valkey, no servers and no Keycloak.

| Piece | What |
|---|---|
| StatefulSet `blockout-dev-mongo` | MongoDB 8.0, a replica set of one member (`rs0`), with a password and a 10 GB volume |
| StatefulSet `blockout-dev-valkey` | Valkey 8.1 with a password, no volume (live classes only last hours) |
| Secret `blockout-dev-mongo` | the root password, the members' shared key and `url`, the connection string inside the cluster |
| Secret `blockout-dev-redis` | the password and `url` |

The passwords are random, made once by the chart, and never stored in the repository.

## Install

You need `helm` with access to the cluster.

```sh
helm repo add codecentric https://codecentric.github.io/helm-charts && helm dependency build deploy/blockout
helm upgrade --install blockout-dev deploy/blockout -n blockout-dev --create-namespace \
  -f deploy/blockout/values-dev.yaml --wait
```

It's safe to run again: it keeps the Secrets and the data.

## Use them from your computer

```sh
npm run services          # release blockout-dev by default (RELEASE=…, NAMESPACE=…)
```

This forwards MongoDB to `localhost:27017` and Valkey to `localhost:6379`, and prints the two URLs to start Blockout with. Keep it running; Ctrl+C stops it. The URLs hold the passwords, so don't paste them anywhere public.

The tests use the same URLs: with `BLOCKOUT_MONGO_URL` set, `npm test` also runs the store tests against MongoDB, each in a database of its own that it drops afterwards.

## Move accounts from the sqlite file

Before MongoDB, Blockout kept accounts in the sqlite file `data/blockout.db`. To bring them along:

```sh
node apps/server/scripts/sqlite-to-mongo.js --dry-run                 # count what's there
BLOCKOUT_MONGO_URL='mongodb://…' node apps/server/scripts/sqlite-to-mongo.js [data/blockout.db]
```

It copies every account, save, class, link, homework and schedule by its id, so it's safe to run again, and prints the counts on both sides. Start Blockout with `BLOCKOUT_MONGO_URL` afterwards.

## Troubleshooting

| Problem | What to do |
|---|---|
| MongoDB isn't ready | `kubectl -n <namespace> logs <release>-mongo-0 -c replica-set` says when the replica set is up. On a first start MongoDB restarts once after creating the root user; that's fine. |
| `MongoServerSelectionError` from your computer | `npm run services` isn't running, or the URL lacks `directConnection=true` (the replica set's member name only resolves inside the cluster). |
| `BLOCKOUT_STORE=mongo needs BLOCKOUT_MONGO_URL` | Set the URL, or start without `BLOCKOUT_STORE`. |
| Accounts are gone after a restart | The server ran without `BLOCKOUT_MONGO_URL` (it says `Accounts: memory` when it starts). |
