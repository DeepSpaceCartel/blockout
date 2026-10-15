<title>Run it day to day</title>

# Run it day to day

What to do when something happens, for whoever looks after Blockout in the cluster. Namespaces: `blockout` (the servers), `blockout-data` (MongoDB, Valkey, backups), `keycloak` (sign-in).

## Where to look

| What | Where |
|---|---|
| Is it up? | `https://<blockout>/health/ready` answers `{"status":"ready"}` |
| Logs | Grafana › Explore › Loki: `{namespace="blockout"} \| json`. Every request is an `http.request` record (route, status, time); errors are `http.error`; account changes are audit records (`class.created`, `invite.redeemed`, `role.changed`, `user.deleted`, …), by id only |
| Metrics | Grafana › Explore › Prometheus: `blockout_http_requests_total`, `blockout_http_request_duration_seconds`, `blockout_streams`, `blockout_polls`, `blockout_rooms_owned`, `blockout_rate_limited_total` |
| Alerts | Prometheus › Alerts (and Grafana): `BlockoutDown`, `BlockoutServersMissing`, `BlockoutServerErrors`, `BlockoutSlow`, `BlockoutBackupMissing`. The workspace cluster has no Alertmanager, so nothing sends them on yet |

## Deploy, and go back

```sh
deploy/blockout/install.sh 0.4.0                 # waits for every new server; rolls back by itself if they don't get ready
helm -n blockout history blockout
helm -n blockout rollback blockout <revision>    # back to an earlier one by hand
```

Updates replace one server at a time. Each one ends its event streams (browsers reconnect to another server) and hands its classes over, so classes keep going. Database changes run once, as the first new server starts (the others wait).

## Backups

Every night `blockout-backup` (in `blockout-data`) dumps MongoDB, and `keycloak-backup` (in `keycloak`) dumps Keycloak's Postgres. rclone encrypts each dump and copies it to object storage: `daily/` is kept 31 days and `monthly/` a year. `BlockoutBackupMissing` fires when the last good one is more than 26 hours old.

**Set up** (once, and again for each namespace): the `blockout-backup` Secret holds rclone's settings. For S3-style storage:

```sh
for ns in blockout-data keycloak; do
kubectl -n $ns create secret generic blockout-backup \
  --from-literal=RCLONE_CONFIG_STORE_TYPE=s3 \
  --from-literal=RCLONE_CONFIG_STORE_PROVIDER=Other \
  --from-literal=RCLONE_CONFIG_STORE_ENDPOINT=https://<endpoint> \
  --from-literal=RCLONE_CONFIG_STORE_ACCESS_KEY_ID=<key> \
  --from-literal=RCLONE_CONFIG_STORE_SECRET_ACCESS_KEY=<secret> \
  --from-literal=RCLONE_CONFIG_CRYPT_TYPE=crypt \
  --from-literal=RCLONE_CONFIG_CRYPT_REMOTE=store:<bucket>/blockout \
  --from-literal=RCLONE_CONFIG_CRYPT_PASSWORD="$(rclone obscure '<a long password>')"
done
deploy/data/install.sh && deploy/keycloak/install.sh    # (they add the CronJobs once the Secret is there)
```

Keep the plain encryption password in 1Password: without it, the backups can't be read.

**Run one now:** `kubectl -n blockout-data create job backup-now --from=cronjob/blockout-backup`, then `kubectl -n blockout-data logs job/backup-now -c upload`.

### The monthly restore drill

```sh
kubectl -n blockout-data apply -f deploy/data/restore-check.yaml
kubectl -n blockout-data wait --for=condition=complete job/blockout-restore-check --timeout=10m
kubectl -n blockout-data logs job/blockout-restore-check -c restore
kubectl -n blockout-data delete job blockout-restore-check
```

It restores the newest backup into a scratch database, prints how many users, classes and saves it holds, and drops it again. The counts should look like the real ones.

### Restore for real

1. Stop the servers writing: `kubectl -n blockout scale deployment/blockout --replicas=0`.
2. Fetch the backup: `rclone copyto crypt:daily/blockout-<date>.archive.gz .` (with the same settings as the Secret).
3. Restore over the database: `mongorestore --uri "$BLOCKOUT_MONGO_URL" --gzip --archive=blockout-<date>.archive.gz --drop` (from `npm run services`, with the `blockout-data` URL).
4. Start them again: `kubectl -n blockout scale deployment/blockout --replicas=2`.

Keycloak: `pg_restore --clean -h … -U keycloak -d keycloak keycloak-<date>.dump`, with Keycloak scaled to 0.

## When a database is down

- **MongoDB:** `/health/ready` reports `database` and the gateway stops sending traffic, so pages don't load. Look at `kubectl -n blockout-data logs mongo-0`. Live classes in Valkey are untouched and carry on once it's back.
- **Valkey:** live classes and rate limits stop: class requests fail, and the rest of the game still works (rate limits let requests through). Valkey keeps nothing on disk, so classes running at the time are lost: teachers start new ones.
- **Keycloak:** nobody can sign in. People already signed in keep going while their token lasts (15 minutes) and can't renew it.

## Accounts

- **Make someone an admin:** the `admin` realm role in Keycloak ([how](set-up-keycloak.md#make-someone-an-admin)).
- **A request to delete a child's data** (from a school or a family): `/admin/` › Accounts › find them › **Delete**. Everything in the account goes with it. Backups keep it until they age out (31 days, or a year for the monthly ones). Say so when you answer the request.
- **Someone was made a teacher by mistake:** `/admin/` › change the role (they may need to delete their classes first). The account's `invitedBy` shows whose code it was; their codes are under **Teacher codes**.

## Change a password or key

| Secret | How |
|---|---|
| MongoDB root (`blockout-mongo`) | Change it in MongoDB (`db.changeUserPassword`), update `root-password` and `url` in the Secret (both namespaces: `deploy/blockout/install.sh` copies it), restart Blockout |
| Valkey (`blockout-redis`) | Update the Secret, restart Valkey, then Blockout (`deploy/blockout/install.sh`) |
| Keycloak admin (`keycloak-admin`) | Change it in the admin console, then the Secret |
| Google client secret (`google-oauth`) | [Switch sign-in to Keycloak › Change the Google client secret](set-up-keycloak.md#change-the-google-client-secret) |
| Backup storage keys | Update `blockout-backup` in both namespaces; the next run uses them |
