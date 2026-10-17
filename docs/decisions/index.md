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
| [0008](0008-roles-in-blockout.md) | Blockout keeps each account's role; one-time invites change it, only `admin` comes from Keycloak | accepted |
| [0009](0009-one-chart.md) | One Helm chart deploys Blockout with its databases and Keycloak | accepted |
| [0010](0010-journey-progression.md) | Boards and difficulties are Journey levels, not Shop items | accepted (level shapes superseded by [0012](0012-journey-stages.md)) |
| [0011](0011-practice-journey.md) | Practice is free, and its times tables are Practice Journey levels | accepted (level shapes superseded by [0012](0012-journey-stages.md)) |
| [0012](0012-journey-stages.md) | Each Journey level has three stages; Practice's longer rounds are stages too | accepted (Practice rounds superseded by [0013](0013-practice-expert-rounds.md), the first boards' stages and stage 3's goal by [0014](0014-first-boards-one-stage.md)) |
| [0013](0013-practice-expert-rounds.md) | Practice's Journey has Expert rounds; Expert practice and its timers are reached, not bought | accepted |
| [0014](0014-first-boards-one-stage.md) | The first boards have one stage; stage 3 asks for every answer right first try | accepted |
