<title>Set up MongoDB and Valkey</title>

# Set up MongoDB and Valkey

Blockout keeps accounts in MongoDB and live classes in Valkey, a Redis-compatible server ([ADR-0006](../decisions/0006-mongodb-and-redis.md)). This guide installs both in the cluster, for a deployment or for development.

You don't need them to try Blockout on your own computer. Without `BLOCKOUT_MONGO_URL`, `npm start` keeps accounts in the sqlite file `data/blockout.db`, and `BLOCKOUT_STORE=memory` keeps nothing at all.

## What gets installed

| Piece | What |
|---|---|
| `mongo` StatefulSet | MongoDB 8.0, a replica set of one member (`rs0`), with a password and a 10 GB volume |
| `valkey` StatefulSet | Valkey 8.1 with a password, no volume (live classes only last hours) |
| Secret `blockout-mongo` | the root password, the members' shared key and `url`, the connection string inside the cluster |
| Secret `blockout-redis` | the password and `url` |

The passwords are random, made once by the install script, and never stored in the repository.

## Install

You need `kubectl` with access to the cluster.

```sh
deploy/data/install.sh                            # namespace blockout-data
NAMESPACE=blockout-dev deploy/data/install.sh     # development
```

It's safe to run again: it keeps the Secrets and the data, and only applies what changed.

## Use them from your computer

```sh
npm run services          # NAMESPACE=blockout-dev by default
```

This forwards MongoDB to `localhost:27017` and Valkey to `localhost:6379`, and prints the two URLs to start Blockout with. Keep it running; Ctrl+C stops it. The URLs hold the passwords, so don't paste them anywhere public.

The tests use the same URLs: with `BLOCKOUT_MONGO_URL` set, `npm test` also runs the store tests against MongoDB, each in a database of its own that it drops afterwards.

## Troubleshooting

| Problem | What to do |
|---|---|
| `MongoDB didn't become ready` | Look at `kubectl -n <namespace> logs mongo-0`. On a first start MongoDB restarts once after creating the root user; the script waits for that. |
| `MongoServerSelectionError` from your computer | `npm run services` isn't running, or the URL lacks `directConnection=true` (the replica set's member name only resolves inside the cluster). |
| `BLOCKOUT_STORE=mongo needs BLOCKOUT_MONGO_URL` | Set the URL, or start without `BLOCKOUT_STORE`. |
