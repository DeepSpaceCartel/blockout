<title>Decision log</title>

# Decision log

Architecture Decision Records: one hard-to-reverse decision per file, numbered, never reused. To change one, write a new ADR that supersedes it rather than editing the old one.

| ADR | Decision | Status |
|---|---|---|
| [0001](0001-turborepo-monorepo.md) | A Turborepo of plain-JavaScript Vite apps and shared packages | accepted |
| [0002](0002-swappable-sign-in.md) | Sign-in behind one provider interface: dev sign-in now, Keycloak later | accepted |
| [0003](0003-sqlite-with-node-builtin.md) | Store accounts in sqlite through Node's built-in `node:sqlite` | superseded by [0006](0006-mongodb-and-redis.md) |
| [0004](0004-store-minimum-child-data.md) | Keep only a first name, last initial, role and email domain for each person | accepted |
| [0005](0005-game-modules-run-phase.md) | Game modules declare at import and do their load-time work in `run()` | accepted |
| [0006](0006-mongodb-and-redis.md) | Accounts in MongoDB and live classes in Redis (Valkey), so several servers can run | accepted |
| [0007](0007-live-classes-in-redis.md) | Live classes in Redis for up to 4 hours, one server running each class's timers | accepted |
