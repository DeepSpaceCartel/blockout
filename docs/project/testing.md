<title>Running the tests</title>

# Running the tests

```console
$ npm test      # everything, through Turborepo
$ npm run lint
```

Or one package at a time: `cd packages/engine && node --test`.

## What's tested where

| Package | Tests |
|---|---|
| `packages/engine` | Board rules, placement, dice for every difficulty (including that Tricky, Master and Legend games last about as long as Hard), the other operations' rules |
| `packages/progress` | Shop chains and gates, bonuses, achievements, practice picking, migrations of old saves, cheats, homework goals and options, merging a device's save into an account |
| `apps/server` | Rooms (whole class, pairs), tournament formats, name checks, accounts (sign-in, classes, homework, parents, schedules, privacy), the Keycloak token checks with a generated key, and the HTTP API end to end on a real server with an in-memory database |
| `apps/multiplication` | Invite links |

## In the browser

Screens are checked with [Playwright](https://playwright.dev/) scripts that play the real flows (single player, practice, Home multiplayer, shop and Wardrobe, cheats, whole class, pairs, a tournament, accounts, and every other game) against a built copy on a spare port, then look at the screenshots. The rules for writing them are in `CLAUDE.md`.

## Under load

`apps/server/scripts/loadtest.js` plays whole classes against a server: a teacher hosts each one, students join as guests and keep an event stream open, and every round they all answer at the same instant (the worst case). It reports how long each new roll takes to reach every student, and any errors.

```sh
TRUST_PROXY=1 npm start        # or a deployment (dev sign-in, or TEACHER_TOKEN=<a teacher's access token>)
node apps/server/scripts/loadtest.js http://localhost:8080 --classes 30 --students 30 --rounds 10
```

Each class sends its own `X-Forwarded-For`, as a school would have its own address; the server only believes it with `TRUST_PROXY`.

On 2026-10-15, two servers on a workspace (MongoDB and Valkey in the cluster, a round-robin proxy in front): 30 classes × 30 students (900 open streams), 10 rounds each. Every roll reached every student in 404 ms (median), 636 ms (p95) and 848 ms at worst, with no errors. The first run found answers lost when a whole class answered in the same instant on two servers (`503 busy`); the server now retries longer, and the game sends a busy answer again.
