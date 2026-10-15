<title>Back up the database</title>

# Back up the database

Accounts, classes, homework and synced progress live in MongoDB ([set up](set-up-the-databases.md)). Live classes are in Valkey and only last hours, so they aren't backed up.

## Back up

With `npm run services` running (or from inside the cluster), `mongodump` writes the whole database to one compressed file:

```sh
mongodump --uri "$BLOCKOUT_MONGO_URL" --gzip --archive="backups/blockout-$(date +%F).archive.gz"
```

Or in the cluster, without anything installed locally:

```sh
pw="$(kubectl -n blockout-data get secret blockout-mongo -o jsonpath='{.data.root-password}' | base64 -d)"
kubectl -n blockout-data exec mongo-0 -c mongo -- \
  mongodump -u root -p "$pw" --authenticationDatabase admin --db blockout --gzip --archive > "blockout-$(date +%F).archive.gz"
```

## Restore

```sh
mongorestore --uri "$BLOCKOUT_MONGO_URL" --gzip --archive=blockout-2026-10-15.archive.gz --drop
```

`--drop` replaces each collection with the backup's copy. Restore into a scratch database first (`--nsFrom 'blockout.*' --nsTo 'restore_test.*'`) when you only want to look.

!!! warning "Backups hold children's names"
    Keep them as carefully as the database: encrypted, and not on a shared drive.
