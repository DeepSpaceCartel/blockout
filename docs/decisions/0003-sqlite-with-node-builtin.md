<title>ADR-0003</title>

# ADR-0003: Store accounts in sqlite through Node's built-in `node:sqlite`

Status: accepted
Date: 2026-09-23

## Context

Until now the server kept everything in memory, because classes only lived as long as a lesson. Accounts, rosters, synced progress, homework, parent links and scheduled tournaments have to survive restarts. The server had no npm dependencies, and it runs on one machine (a teacher's computer or a small host).

## Decision

We will keep account data in a single sqlite file (`data/blockout.db`, or the path in `BLOCKOUT_DB`) through Node's built-in `node:sqlite`. Everything goes through one module, `apps/server/src/store.js`, so the rest of the server never writes SQL; tests use `:memory:`.

### Alternatives considered
- **A JSON file:** no transactions or queries, and it grows badly as progress saves pile up.
- **Postgres or another server database:** more to install and run for a single-school deployment. The store module keeps that change contained if it's ever needed.

## Consequences

- **No new dependencies, and backups are one file.**
- **Node 22.12 or newer** is required.
- **One server process writes the database,** so running several servers behind a load balancer would need a different store.
- **Schema changes need care:** the schema is created with `CREATE TABLE IF NOT EXISTS`. The first change to an existing table needs a proper migration step, not just an edit to `SCHEMA`.
