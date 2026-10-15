<title>ADR-0006</title>

# ADR-0006: Keep accounts in MongoDB and live classes in Redis (Valkey), so several servers can run

Status: accepted
Date: 2026-10-15
Supersedes: [ADR-0003](0003-sqlite-with-node-builtin.md)

## Context

Blockout is moving from one server on a teacher's computer to a public service in Kubernetes. That needs:

- **More than one server process at a time,** for rolling updates without dropping classes, and to grow with more schools.
- **Live classes that survive a restart or a deploy.**

The sqlite file of ADR-0003 has one writer, and live classes lived in the server's memory. Neither works with two servers.

## Decision

- **Accounts** (users, classes, rosters, progress, homework, parent links, schedules) go in **MongoDB**, through the official `mongodb` driver. The store sits behind one async interface (`apps/server/src/store/`) with:
  - a MongoDB implementation for servers
  - an in-memory one for tests and quick runs
  - the old sqlite store, kept to read old databases

  Every store passes the same contract tests (`apps/server/test/store.contract.js`). Schema steps are numbered migrations that one server runs while the others wait (`store/migrations.js`).
- **Live classes** and the messages between servers go in a **Redis-compatible server**, through the official `redis` client. We run **Valkey** (BSD licensed) rather than Redis 8 (AGPL/SSPL).
- **Production refuses to start without MongoDB.**

### Alternatives considered
- **Postgres with the `pg` package:** a good fit for the data, and the cluster already runs one for Keycloak. Not chosen: the project owner chose MongoDB and Redis.
- **Postgres alone, with LISTEN/NOTIFY for live classes:** one service fewer, but live classes write several times a second, which suits an in-memory store better.
- **Sticky sessions to one server per class:** keeps classes in memory, but a deploy or a crash still ends them, and the accounts would still need a shared database.

## Consequences

- **The server has runtime dependencies** (`mongodb`, `redis`) for the first time. They're official clients with no native code.
- **Two more services to run and back up:** MongoDB (accounts: back it up) and Valkey (live classes, kept for hours: no backup needed). `deploy/data/` installs both in the cluster.
- **Development needs no database:** without `BLOCKOUT_MONGO_URL`, the server uses the sqlite file (or `BLOCKOUT_STORE=memory`). `npm run services` forwards the cluster's development MongoDB and Valkey.
- **Tests run without services,** and against real MongoDB and Valkey when their URLs are set (CI starts both).
