<title>Run it day to day</title>

# Run it day to day

What to do when something happens, for whoever looks after Blockout in the cluster. Everything is in the namespace `blockout`: one Helm release, `blockout` ([Deploy to a cluster](deploy.md)).

## Where to look

| What | Where |
|---|---|
| Is it up? | `https://<blockout>/health/ready` answers `{"status":"ready"}` |
| Logs | Grafana › Explore › Loki: `{namespace="blockout"} \| json`. Every request is an `http.request` record (route, status, time); errors are `http.error`; account changes are audit records (`class.created`, `invite.redeemed`, `role.changed`, `user.deleted`, …), by id only |
| Metrics | Grafana › Explore › Prometheus: `blockout_http_requests_total`, `blockout_http_request_duration_seconds`, `blockout_streams`, `blockout_polls`, `blockout_rooms_owned`, `blockout_rate_limited_total` |
| Alerts | Prometheus › Alerts (and Grafana): `BlockoutDown`, `BlockoutServersMissing`, `BlockoutServerErrors`, `BlockoutSlow`, `BlockoutBackupMissing`. The workspace cluster has no Alertmanager, so nothing sends them on yet |

## Deploy, and go back

```sh
deploy/blockout/install.sh 0.7.0 -f secrets.yaml    # waits for every part; rolls back by itself if they don't get ready
helm -n blockout history blockout
helm -n blockout rollback blockout <revision>       # back to an earlier one by hand
```

Updates replace one server at a time. Each one ends its event streams (browsers reconnect to another server) and hands its classes over, so classes keep going. Database changes run once, as the first new server starts (the others wait).

## Backups

With `backup.enabled`, every night `blockout-backup-mongo` dumps MongoDB, and `blockout-backup-keycloak` dumps Keycloak's Postgres. rclone encrypts each dump and copies it to object storage: `daily/` is kept 31 days and `monthly/` a year (Keycloak's under `keycloak/`). `BlockoutBackupMissing` fires when the last good MongoDB backup is more than 26 hours old.

**Set up:** rclone's settings go in your secrets file. For S3-style storage:

```yaml
backup:
  enabled: true
  rclone:
    RCLONE_CONFIG_STORE_TYPE: s3
    RCLONE_CONFIG_STORE_PROVIDER: Other
    RCLONE_CONFIG_STORE_ENDPOINT: https://<endpoint>
    RCLONE_CONFIG_STORE_ACCESS_KEY_ID: <key>
    RCLONE_CONFIG_STORE_SECRET_ACCESS_KEY: <secret>
    RCLONE_CONFIG_CRYPT_TYPE: crypt
    RCLONE_CONFIG_CRYPT_REMOTE: store:<bucket>/blockout
    RCLONE_CONFIG_CRYPT_PASSWORD: <the output of: rclone obscure '<a long password>'>
```

Or name a Secret with those keys in `backup.existingSecret`. Keep the plain encryption password in 1Password: without it, the backups can't be read.

**Run one now:** `kubectl -n blockout create job backup-now --from=cronjob/blockout-backup-mongo`, then `kubectl -n blockout logs job/backup-now -c upload`.

### The monthly restore check

`blockout-restore-check` runs on the 2nd of each month. It restores the newest backup into a scratch database, prints how many users, classes and saves it holds, and drops it again. The counts should look like the real ones:

```sh
kubectl -n blockout get jobs
kubectl -n blockout logs job/<the newest blockout-restore-check-… job> -c restore
```

To run it now: `kubectl -n blockout create job restore-now --from=cronjob/blockout-restore-check`.

### Restore for real

1. Stop the servers writing: `kubectl -n blockout scale deployment/blockout --replicas=0`.
2. Fetch the backup: `rclone copyto crypt:daily/blockout-<date>.archive.gz .` (with the same settings).
3. Restore over the database: `mongorestore --uri "$BLOCKOUT_MONGO_URL" --gzip --archive=blockout-<date>.archive.gz --drop`, with the URL from the `blockout-mongo` Secret and a port-forward to `blockout-mongo-0` (`directConnection=true`).
4. Start them again: `kubectl -n blockout scale deployment/blockout --replicas=2`.

Keycloak: `pg_restore --clean -h … -U keycloak -d keycloak keycloak-<date>.dump`, with `blockout-keycloakx` scaled to 0.

## When a database is down

- **MongoDB:** `/health/ready` reports `database` and the gateway stops sending traffic, so pages don't load. Look at `kubectl -n blockout logs blockout-mongo-0 -c mongo`. Live classes in Valkey are untouched and carry on once it's back.
- **Valkey:** live classes and rate limits stop: class requests fail, and the rest of the game still works (rate limits let requests through). Valkey keeps nothing on disk, so classes running at the time are lost: teachers start new ones.
- **Keycloak:** nobody can sign in. People already signed in keep going while their token lasts (15 minutes) and can't renew it.

### MongoDB and the Linux kernel

Every MongoDB 8 refuses to start on Linux kernels 6.19 to 7.0.13 ("MongoDB cannot start: Linux kernel versions 6.19 and newer has a known incompatibility", [SERVER-121912](https://jira.mongodb.org/browse/SERVER-121912)); 7.0.14 and later are fine. The workspace cluster's Talos nodes run 6.18. **Check the kernel before upgrading Talos** (or moving to new nodes): on an affected one, MongoDB stops and nobody can sign in.

## Accounts

- **Make someone an admin:** the `admin` realm role in Keycloak ([how](set-up-keycloak.md#make-someone-an-admin)).
- **A request to delete a child's data** (from a school or a family): `/admin/` › Accounts › find them › **Delete**. Everything in the account goes with it. Backups keep it until they age out (31 days, or a year for the monthly ones). Say so when you answer the request.
- **Someone was made a teacher by mistake:** `/admin/` › change the role (they may need to delete their classes first). The account's `invitedBy` shows whose code it was; their codes are under **Teacher codes**.

## Change a password or key

The chart makes the passwords once and keeps them. To change one, change it where it's used, then in its Secret; the next upgrade keeps the new one.

| Secret | How |
|---|---|
| MongoDB root (`blockout-mongo`) | Change it in MongoDB (`db.changeUserPassword`), update `root-password` and `url` in the Secret, restart Blockout (`kubectl -n blockout rollout restart deployment/blockout`) |
| Valkey (`blockout-redis`) | Update `password` and `url` in the Secret, restart Valkey, then Blockout |
| Keycloak admin (`blockout-keycloak-admin`) | Change it in the admin console, then the Secret |
| Google client secret | Your secrets file ([how](set-up-keycloak.md#change-the-google-client-secret)) |
| Image pull token, backup storage keys, mail | Your secrets file, then upgrade |
