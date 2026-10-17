# Work in progress

Where things stand on the `v0.3.0` branch, for picking the work up again. No secrets, tokens, passwords, IDs or addresses are recorded here: they live in the cluster's Secrets or in 1Password.

The full production-readiness plan (approved 2026-10-15) is at the end of this file.

## Status by milestone

| | Milestone | State |
|---|---|---|
| M0–M3 | Housekeeping, server hardening, MongoDB and Valkey, roles and invites | Done |
| M4 | Container image, Helm chart, CI image scan, release workflow | Done. Releases publish to GHCR (`blockout` is internal to the org, with Actions write access for this repo) |
| M5 | First public deployment in the workspace cluster | **Done (2026-10-17):** 0.5.0 at `https://blockout.deepspacecartel.com`, Keycloak at `https://id.deepspacecartel.com`, Google sign-in tested by the owner |
| M6 | Metrics, alert rules, backups, restore check, runbooks | Done in the chart; **backups are off** until there's object storage |
| M7 | Retention, data export, privacy page, accessibility | Done |
| M8 | Production cluster: operators, GitOps, cutover | Load test done. The rest waits for the production cluster |

## How it's deployed now (0.5.0)

- **One chart, `deploy/blockout`, one release `blockout` in namespace `blockout`** ([ADR-0009](docs/decisions/0009-one-chart.md)): the servers, MongoDB, Valkey, Keycloak (`keycloakx` 7.3.2 as a dependency) with its Postgres, Keycloak's HTTPRoute, the realm Job (post-install/upgrade hook), backup CronJobs and the monthly restore check. Nothing is created by hand; `deploy/data` and `deploy/keycloak` are gone.
- **Passwords** are made by the chart once and kept (`lookup`, `helm.sh/resource-policy: keep`). **Secrets only a person has** come from the environment (`op run --env-file=deploy/blockout/.env.1password -- deploy/blockout/install.sh <version>`) or a gitignored `secrets.yaml`.
- **The workspace cluster currently installs with `deploy/blockout/secrets.yaml`** (the owner's file: the Google client secret and a GHCR token). The 1Password items named in `.env.1password` don't exist yet.
- **Development:** release `blockout-dev` (namespace `blockout-dev`, `values-dev.yaml`): only MongoDB and Valkey; `npm run services` forwards them. Local servers sign in with the workspace Keycloak (`localhost:8080` and `:5173` are allowed redirects).
- **rts-terraform PR #43** (merged, applied): Gateway listeners `blockout-deepspacecartel-com` and `id-deepspacecartel-com`, the shared certificate's SANs, and the DNS records.

## The phone app: porting the rest (started 2026-10-17)

The owner chose: phases 1–6 and 8 (not the other games), and **extract shared rules into pure packages, then both the web game and the app use them**. One phase at a time, each step tested in the app's web build (390×844 and 375×667) and on the owner's iPhone through Expo Go.

1. **Progress: done (2026-10-17).** Shop, achievements and stickers (with sticker drops), stats (the phone's own history), the daily check-in and settings, each shared through `@blockout/progress/{shop,views,stats,settings}` and used by both clients. The app's Settings list only what its game honours; real dice, tap-to-place and the answer timer come in phase 2.
2. **The rest of the game: done (2026-10-17).** Every difficulty (Master's weighting and Legend's board rule in `@blockout/progress/setup`), Expert levels and timers, 3–4 players, boards to 24, real dice, tap to place and auto placing, every setting. The web game now calls the shared rules on its own state, which is shaped like a match (judging a drawing, awarding points, misses, when an answer is decided, the counting plan, Legend's split, the end of the game, tap-to-place); its turn flow (animations, classroom and pairs turns driven by the server) stays in `play.js`.
3. **Practice: done (2026-10-17).** `@blockout/progress/practice` (setup rules and words, the round question by question); the web game's practice and the app's Practice screen both use it.
4. **Wardrobe: done (2026-10-17).** `@blockout/progress/wardrobe` (what's worn, the rows of chips, titles, what's new, how each player looks). The app's Wardrobe screen (menu › Looks) and every look in its games: colours, dice and dots, keypads, boards, rectangle patterns, your avatar and title, the CPU's character, roll styles, placing effects, streak flames, and win celebrations with the confetti look (`src/celebration.js` works the paths out ahead, so the native driver plays them).
5. **Student accounts: done (2026-10-17).** `@blockout/progress/homework` (how the list reads, the menu choice that plays one), used by the web game and the app. The app's menu row: name, 📚 Homework (badge) and Account. Account: classes and joining by code, a grown-up code (QR of the web link, Share…), "I have a code", deleting a teacher's or grown-up's account (a student's is removed by their grown-up, as on the web), sign out. Links: the web's `#code=`/`#roster=` and the app's `blockout://code/…`, `…/--/roster/…` (`src/links.js`). In Expo Go only typed codes and the app's own links work; a web link opens the website.
6. **Live classes as a student: done (2026-10-17).** `@blockout/classroom/core` (`createClient({ base, token, storage, EventSource })`; `client.js` is the browser's) and `@blockout/progress/classroom` (the waiting words, catching a pairs board up, the results, the rewards and history), used by the web game and the app. The app: 🏫 Class beside Play, joining by code or `#class=` link, the whole class's rolls, pairs and tournaments (your partner's moves as they make them), results until the next game, rejoining after the app was closed, the tournament banner on the menu.
8. **Grown-ups' screens: done (2026-10-17).** `@blockout/progress/grownups` (how activity, homework, codes and planned tournaments read; the homework form's choices and goal; whose homework comes off) and `@blockout/progress/hosting` (the host's choices and settings, its buttons, roster, pairs cards, podium and report), used by the web game, the admin page and the app. The app: 🏫 My classes (classes, join code and QR, roster, class homework, a student's page, grown-ups, planned tournaments, teacher codes), hosting a live class (setup, lobby with settings and pairs, the game, the end; the odd one out in pairs plays the CPU or the teacher's other device), 👪 My kids (link a child, their page, delete their account) and 🛠 Admin (accounts, teacher codes, schools).

The phone app has everything the web game's multiplication has, except the other games (the owner's choice).

Working notes: the workspace container is limited to **4 GiB** (`free` shows the node's 7.7 GB). On 2026-10-17 it was OOM-killed: the editor's servers had crept to ~3 GiB, then a full parallel `turbo` test and build (Rolldown workers) filled the rest. Run Turborepo with `--concurrency=2`, builds one at a time, Playwright only when nothing else heavy runs. `devcontainer.json` gives every Node process at most 1.5 GiB of heap (`NODE_OPTIONS`, after a rebuild). Raising the limit to 6 GiB (request ~3 GiB) is a change in rts-terraform's Coder template. The Expo dev server: `npm run tunnel --workspace @blockout/mobile` (needs `npx expo login`).

## What's open

1. **Backups:** object storage and its keys (`RCLONE_CONFIG_*`, see `docs/guides/operate.md`). Until then, losing the MongoDB volume loses every account.
2. **Secrets in 1Password:** create the items `.env.1password` points to, then install with `op run` and retire `secrets.yaml`. Use a dedicated `read:packages` token for the cluster.
3. **Later, External Secrets Operator** with 1Password in rts-terraform; the chart then needs `existingSecret` for the Google secret and the pull secret (today the Google secret is a value only, because the keycloakx subchart mounts it under a fixed name).
4. **Mail for Keycloak:** an SMTP relay on port 587 (25 and 465 are blocked from the cluster), as `keycloak.smtp` or `BLOCKOUT_SMTP_*`. Without it, address checks and password resets stay off.
5. **Classroom smoke test on the public address** with two students and a server killed mid-round. Done so far: health stayed 200 through deleting server pods and a rolling restart.
6. **Production cluster (M8):** provider and region, operators, Alertmanager (the workspace cluster has none: alerts notify nobody).

## Things to know

- **MongoDB 8 and the Linux kernel:** every MongoDB 8 refuses to start on kernels 6.19 to 7.0.13 (SERVER-121912). The Talos nodes run 6.18: check the kernel before any Talos upgrade. CI's `check` job is pinned to `ubuntu-24.04` for the same reason (Ubuntu 26 runners have an affected kernel; `ubuntu-latest` moves to 26 from 2026-10-19).
- **Keycloak reads its address and the Google secret at start:** after changing `keycloak.url` or the secret, `kubectl -n blockout rollout restart statefulset/blockout-keycloakx`.
- **Helm 4** warns that `--atomic` is deprecated (`--rollback-on-failure`); `install.sh` keeps `--atomic` so Helm 3 still works.
- **`helm template` and Argo CD** can't look up the kept passwords and would make new ones: a GitOps setup must provide those Secrets.
- **The uncommitted realm change** from before the plan is gone: the realm keeps `registrationAllowed: false`. Google sign-in is the way in.
- **trivy-action** is pinned by commit; check its release against Aqua's March 2026 supply-chain advisory before trusting or bumping it.
- **`npm audit`** reports one high-severity advisory in `source-map-js`, a build-time dependency of Vite (not in the image or the pages); Dependabot should bring the fix.
- **Docs screenshots:** `other-game-win` still shows the old, brighter orange (it needs a game-kit game played to the end).
- **Still to do from before the plan:** the landscape layout for game-kit's menus.


# Appendix: the production-readiness plan

## The plan (as approved, with later decisions noted above)

### Context

Blockout (v0.3.0 branch) runs well as a single dev server behind a Cloudflare quick tunnel. It is not ready to be a public service for schools:

- **A crash bug.** One malformed URL (`GET /%E0`) kills the process. `decodeURIComponent` runs outside the handler's `try`, at `apps/server/src/index.js:83` and `:407`.
- **Unsafe sign-in defaults.** Dev sign-in is the default and lets anyone pick any role. Keycloak only works on localhost.
- **No role management.** Roles come from the token on every request. There is no admin, and parent codes are permanent and reusable.
- **One process only.** Live classes live in process memory and sqlite is a local file. A restart loses every class, and the server can't run on more than one replica.
- **Nothing to deploy with.** There is no container image, chart, release pipeline, backups, rate limiting, CSP, graceful shutdown, structured logs, retention policy or deletion path.

**Goal:** Blockout runs as 2+ stateless replicas in Kubernetes: first in the workspace cluster, later in a separate production cluster. It uses:
- MongoDB for accounts and Redis for live rooms and pub/sub
- Keycloak on a public HTTPS hostname
- a role model where anyone can sign in as a student, admins and teachers promote people to teacher or parent with one-time invites (admins can also change roles directly), and students hand out one-time parent invites for themselves

**Decisions made with the user:**
- Roles live in Blockout's DB. Only `admin` comes from a Keycloak realm role.
- Parent codes become one-time, expiring invites. Admins and teachers can make teacher and parent invites; students can make parent invites for themselves.
- Packaging is a GHCR image plus a Helm chart.
- Live rooms are persisted and the server scales horizontally.
- MongoDB replaces sqlite for accounts. Redis holds room state and pub/sub.

This breaks two current rules: "server uses Node built-ins only" and ADR-0003 (sqlite). Both get superseding ADRs, and CLAUDE.md gets updated.

### Milestones

Each milestone ends with `npm test && npm run lint` green, `mkdocs build --strict`, a CHANGELOG entry and Conventional Commits.

- **0. Housekeeping:** commit the WIP.
- **1. Hardening:** fix the server and make it safe on the public internet. No architecture change.
- **2. MongoDB and Redis:** async store, rooms in Redis, horizontal scaling.
- **3. Roles and invites:** student by default, admin, teacher and parent invites, admin screen, deletion.
- **4. Packaging and release:** container image, CI publish, Helm chart.
- **5. Workspace-cluster deployment:** MongoDB, Redis and Blockout in the cluster; public Keycloak and Blockout over HTTPS.
- **6. Operations:** backups, logs and metrics, alerts, runbooks.
- **7. Compliance:** retention, export, privacy docs.
- **8. Production cluster:** operators, HA, cutover.

Order rationale:
- M1 fixes live bugs at once, at little cost.
- M2 moves storage to MongoDB and Redis first, so M3's invite, admin and deletion store methods are written once, against the async store and its contract suite.

Versioning:
- Release 0.3.0 after M1. It's the first tagged release; the image pipeline arrives in M4.
- 0.4.0 after M2 and M3.
- 0.5.0 after M4 and M5 (first public deployment).
- 1.0.0 after M8.

---

### M0. Housekeeping

- **Commit the WIP.md "Done, not committed" work** as separate commits:
  - `feat(ui): two-column landscape menu`
  - `build(devcontainer): 1Password CLI feature`
  - `feat(auth): sign out of Keycloak too`
  - `build(keycloak): …`
- **Hold back the uncommitted realm change** (`registrationAllowed: true`, `resetPasswordAllowed` with no SMTP). It's redone properly in M5.
- **Commit `.claude/settings.json`** (`chore: project Claude Code settings`). Check it holds no secrets or machine-specific paths first.

---

### M1. Server hardening (no architecture change)

All in `apps/server/src/index.js` unless noted. Tests go in `apps/server/test/server.test.js`.

1. **Crash fixes**
   - Wrap the decode in `serveStatic` (:83) and `matchAccountRoute` (:407) so a malformed URL returns 400 `bad-request`.
   - Move `route(req)` inside the `try`.
   - `readJson`:
     - listen for `'aborted'` and `'error'`
     - add a 10 s body timeout, answering 408
   - Add `process.on('unhandledRejection'|'uncaughtException')`. They log and exit non-zero (Kubernetes restarts the pod) instead of crashing silently.
   - Tests: `GET /%E0`, `GET /api/classes/%E0`, and an aborted body all leave the server answering `/api/health`.
2. **Production guard**
   - New `apps/server/src/config.js` centralizes every env var that `index.js`, `auth.js`, `store.js` and `moderation.js` read today.
   - With `NODE_ENV=production`, it refuses to start unless all of these hold:
     - `BLOCKOUT_AUTH=keycloak`
     - `PUBLIC_URL` starts with `https://`
     - (after M2) Mongo and Redis URLs are set
   - It fails fast with a clear message. Unit-tested as a pure `loadConfig(env, argv)`.
3. **Security headers**
   - Apply `SECURITY_HEADERS` to the 301 (:86) and to the event stream (:239).
   - Add `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
   - Add `Strict-Transport-Security: max-age=31536000` when `PUBLIC_URL` is https.
4. **CSP:** `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self' <KEYCLOAK_ISSUER origin>; frame-ancestors 'none'; base-uri 'none'; form-action 'self' <issuer origin>`. To get there:
   - Move the inline theme script out of `packages/ui/src/vite-plugin.js` into an emitted `theme.js`, loaded with a blocking `<script src>` in `<head>` so the theme still applies before first paint.
   - Replace `style="display: none"` on the sprite (`packages/ui/src/icons.svg:4`) with a `hidden` attribute or class.
   - Replace the `style=` strings in innerHTML at `apps/demos/src/games/rhythm.js:24` and `packages/game-kit/src/index.js:1021` with `el.style` assignments.
   - Ship first as `Content-Security-Policy-Report-Only` for one Playwright pass over every app, collecting `securitypolicyviolation` events. Then enforce.
5. **Information leaks**
   - `lanUrls()` goes out in `/api/health` and room creation only when not in production. Production returns `PUBLIC_URL` only.
   - Room probing (`/info`, `/events`, `/poll`) gives the same 404 for unknown and closed rooms.
6. **Codes:** `rooms.js:39` `newCode` uses `crypto.randomInt` (rng still injectable for tests). `accounts.js:24` code generation uses rejection sampling, removing the modulo bias.
7. **Rate limiting**
   - New pure `apps/server/src/ratelimit.js`, a token bucket keyed by `(bucket, clientIp)`, with an in-memory backend now and Redis in M2.
   - `clientIp(req)` reads `X-Forwarded-For` only when `TRUST_PROXY=<hops>` is set.
   - Buckets:
     - room join and probe: 20/min per IP
     - class join and parent link: 10/min per user and 30/min per IP
     - dev sign-in: 10/min
     - everything else: 600/min per IP
   - Answers 429 problem+json with `Retry-After`. Fully unit-tested.
8. **Event-stream limits:** at most 200 streams per room and 20 per IP.
9. **Health and shutdown**
   - Three endpoints, one per Kubernetes probe (no auth, `Cache-Control: no-store`, tiny JSON bodies, no LAN URLs, excluded from request logs and rate limits):
     - `GET /health/startup`: 503 until startup is done (config loaded, store opened and migrated, and after M2 Redis connected and Lua scripts loaded), then 200. Covers slow migrations without a long liveness delay.
     - `GET /health/live`: 200 while the event loop answers; 503 only if the process is wedged (e.g. event-loop lag above 5 s measured by a timer). Never checks MongoDB or Redis, so an outage there doesn't restart every pod.
     - `GET /health/ready`: 200 when it can serve: store reachable (after M2: Mongo `ping` and Redis `PING`, cached 2 s); 503 while draining or when a dependency fails.
   - Keep `GET /api/health` for existing clients, answering like `/health/ready` without the LAN URLs in production.
   - `SIGTERM`/`SIGINT`:
     1. mark draining
     2. stop scheduled-opener timers
     3. send `event: reconnect` to every stream and end it
     4. answer held polls
     5. `server.close()`
     6. `store.close()`
     7. exit; force exit after 20 s
   - Clients already reconnect. Until M2 the room is gone, so they see "lost". Document deploying outside class hours until then.
10. **Structured logging**
    - New `apps/server/src/log.js`: JSON lines with OTel field names, following the structured-logging skill:
      - `timestamp`, `severity_text`, `event.name`, `http.request.method`, `http.route`, `http.response.status_code`, `duration_ms`
      - `service.name=blockout`, `service.version`
    - One request log per request (`http.route`, never raw paths with codes).
    - Errors carry `exception.type` and `exception.stacktrace`.
    - Redact: never log tokens, codes, keys or names.
    - Audit events for account actions: `class.created`, `student.removed`, `homework.created/deleted`, `parent.linked/unlinked`, `schedule.created/deleted`. Later `role.changed`, `invite.created/redeemed`, `user.deleted`. Each carries actor id, target id and role.
11. **Fewer DB writes:** `upsertUser` writes `last_seen` at most once a minute per user (cache by sub with a short TTL). Today every request writes.
12. **Token refresh** (`packages/auth/src/client.js`)
    - Use the stored refresh token: refresh when expiry is less than 60 s away, and once on a 401 before signing out.
    - Then `realm-blockout.json`: `accessTokenLifespan` 900 (15 min). The SSO session stays 8–10 h. Dev tokens drop from 30 days to 12 h.
13. **Docs:** update `docs/concepts/security.md` (gaps closed, CSP, rate limits), `docs/reference/CONFIGURATION.md` (`NODE_ENV`, `TRUST_PROXY`, `/health/startup`, `/health/live`, `/health/ready`) and `HTTP-API.md` (429).

---

### M2. MongoDB for accounts, Redis for live rooms (horizontal scaling)

**ADR-0006** "MongoDB and Redis" supersedes ADR-0003. **ADR-0007** "Live classes are kept in Redis for up to 4 hours" is a privacy change: guest names leave process memory. Update `privacy.md` and CLAUDE.md (runtime dependencies: `qrcode-generator` in the browser; `mongodb` and `redis` on the server).

Two blockers come first:
- **Room state isn't serializable.** `room.bag` and `m.bag` hold dice closures from `Core.createDice`.
- **The classroom client gives up on transient errors.** It reports `lost` on any non-200, so every rollout would boot classes (`packages/classroom/src/client.js`).

### Layers

- **Pure logic, unchanged:** `rooms.js` and `tournament.js`. Changes are limited to dice state and codes.
- **New `apps/server/src/live.js`, the room runtime:**
  - `withRoom` and the mutation queue
  - owner leases and timers
  - local listeners (streams and polls) and the views sent to them
  - presence overlay, live moves, drain
- **Storage and messaging behind one interface:** `apps/server/src/roombackend/{memory,redis}.js`. Two runtimes sharing one memory backend act as two replicas in one test process.
- **Accounts store:** `apps/server/src/store/{index,memory,mongo,migrations}.js`. Both implementations are async. `openStore()` picks one from `BLOCKOUT_STORE`, defaulting to `mongo` when `BLOCKOUT_MONGO_URL` is set and `memory` otherwise. Production requires Mongo (M1 guard).

### Room runtime design

- **Keys** (hash-tagged so they're cluster-safe):
  - `room:{C}`: a hash with `v` (version) and `s` (snapshot JSON)
  - `room:{C}:presence`, `room:{C}:live`, `room:{C}:owner`
  - `closed:{C}` (30 min TTL)
  - `rooms:active` (a ZSET by last touch)
  - channel `room:{C}`
  - Room keys expire after `ROOM_IDLE_MS` (4 h), refreshed on every write. This replaces the idle sweep.
- **`withRoom(code, fn)`:**
  1. read `v` and `s`, apply the presence overlay
  2. run `fn(room)` (synchronous; anything async such as moderation runs before it)
  3. bump the version and strip the overlay
  4. a **Lua compare-and-set** on `v` writes the snapshot, refreshes the TTL, `ZADD`s `rooms:active`, and `PUBLISH`es `{t:'v', v}`

  It retries up to 8 times with jitter, then answers 503 `busy`. A promise chain per code serializes mutations within one process. Lua is used instead of WATCH/MULTI because WATCH is per connection and node-redis multiplexes requests over one.
- **Owner lease:** `SET room:{C}:owner <replicaId> NX PX 15000`, renewed every 5 s with Lua.
  - Only the owner runs timers.
  - `reconcile(room)` reuses the existing `scheduleCpu`/`scheduleRound`/`maybeAutoNext`. They're keyed by code and match, and each callback re-checks the lease and a state guard (`round`, `turn`, `roundReady`, `autoNext`) inside `withRoom`, so a duplicate fire is a no-op.
  - The owner runs `reconcile` on every update message. Route-level `maybeAutoNext`/`cancelAutoNext` calls go away.
  - **Takeover:** every replica sweeps `rooms:active` every 5 s and claims rooms that have no owner. A request for an unowned room also claims it. Timers restart with their full delay, at most about 5 s late.
- **Presence:** `p.connections` and `p.seenAt` are no longer saved. They become an overlay from `room:{C}:presence`:
  - each replica sets `player|replica` fields with a 30 s expiry, refreshed every 10 s
  - polls set `player|poll`
  - so `connected()`, `allDone` and `isHere` stay as they are
  - the owner's presence sweep writes `presenceSig` through `withRoom` when it changes, which wakes everyone as today
- **Fan-out:** messages carry only the version.
  - A replica subscribes to a room's channel while it has local listeners (the owner always does).
  - On a message it waits 60 ms to coalesce, reads the snapshot once (or reuses a cached one with the same version), and pushes `teacherView`/`studentView` with the existing `pushView`/`answerPoll`.
  - `openPoll` compares `?v` against `HGET v`.
- **Live moves** (`broadcastMatch`, about 12 a second per pair): no compare-and-set and no version bump.
  - `Rooms.setLive` validates the move on the cached snapshot.
  - `HSET room:{C}:live`, then `PUBLISH {t:'live', match, ids, live}`.
  - Receivers push only to the match's players, with the 80 ms throttle.
- **Close:** one Lua script deletes the room keys, sets `closed:{C}`, removes it from `rooms:active` and publishes `closed`. The `closedRooms` map goes away.
- **Codes:** `newCode` uses `crypto.randomInt`. Creating a room is a create-if-absent in Lua that fails when `room:{C}` or `closed:{C}` exists, retrying with a new code.
- **Scheduled tournaments:**
  - A `lease:scheduler` leader runs `accounts.openDue`, now async.
  - `store.markOpened` is conditional on `openedAt: null` and returns whether it succeeded. A loser closes its orphan room.
  - Because rooms now persist, scheduled room codes stay valid across restarts. That fixes today's dead codes.
- **SIGTERM drain:**
  1. `/health/ready` returns 503, then `server.close()`
  2. clear timers and release leases; publish `owner-gone` so takeover is immediate
  3. each stream gets `retry: <1000–4000 random>` and then `end()`, so EventSource reconnects through the gateway to another pod
  4. answer polls
  5. delete this replica's presence fields, close Redis and Mongo
- **Client** (`packages/classroom/src/client.js`):
  - When the stream closes, check `roomInfo(code)` and report `lost` only on a 404; otherwise fall back to polling.
  - A poll that gets a non-404 error retries after `RETRY_MS`.

### Accounts store design

- **Interface:** every method async. Groups:
  - lifecycle: `migrate`, `close`, `exportAll`
  - meta, schools
  - users, including `signIn(identity)` (inserts as student and never overwrites the role), `setRole`, `touchUser`, `listUsers`, `deleteUser` (full cascade)
  - progress (with batched `progressOfMany`/`usersByIds` to avoid N+1 in `classDetail`)
  - classes and members
  - parent links, homework
  - schedules (with conditional `markOpened`)
  - invites: `redeemInvite` is an atomic `findOneAndUpdate` on `{codeHash, usedAt: null, expiresAt > now}`
- **Mongo collections and indexes:**

  | Collection | Indexes |
  |---|---|
  | `users` | `sub` unique; `{role, firstName}`; `schoolId` |
  | `schools` | `domain` unique |
  | `progress` | `_id` = user id |
  | `classes` | `code` unique; `teacherId` |
  | `classMembers` | `{classId, userId}` unique; `userId` |
  | `parentLinks` | `{parentId, childId}` unique; `childId` |
  | `assignments` | `classId`; `studentId`; `createdBy` |
  | `schedules` | `{openedAt, startsAt}`; `teacherId` |
  | `invites` | `codeHash` unique; TTL on `expiresAt` (+7 d) |
  | `meta` | `_id` is the key |

  Ids stay 16-character hex strings in `_id`. `deleteUser` uses a transaction, which is why MongoDB runs as a replica set even with one member.
- **Migrations** (`store/migrations.js`): ordered `{version, up(db)}` steps. A lock on the `meta` `schema` document (`findOneAndUpdate` with `lockedUntil`) ensures one replica migrates while others wait. Migration 1 creates the indexes and the default schools.
- **Auth:**
  - `Auth.identity` stays sync, with a schools cache (60 s) passed in.
  - `Auth.fromEnv` becomes async.
  - `index.js` uses top-level `await openStore(); await store.migrate();`.
- **Migrating existing data:** `apps/server/scripts/sqlite-to-mongo.js` is the only `node:sqlite` code left, documented as one-off. It maps snake_case to camelCase, parses the JSON columns, upserts by `_id` (re-runnable), compares counts, and supports `--dry-run`.

### Dev loop

- **By default:** `npm run dev`, `npm start` and the Playwright pattern in CLAUDE.md use the memory store and memory room backend, with no services needed. The server logs a warning that data isn't kept.
- **For real services:** the M5 `deploy/data/` install also works in a `blockout-dev` namespace. `npm run services` port-forwards MongoDB (27017) and Redis (6379), like `npm run keycloak`, and you set `BLOCKOUT_MONGO_URL` and `BLOCKOUT_REDIS_URL`.
- **Multi-replica testing:** a scratch script runs two servers on 8135 and 8136 behind a small round-robin proxy.

### Ordered commits (green at each)

1. `refactor(engine): serializable dice state`
   - `createDice`/`createPairDice` return plain state.
   - `Core.dice(state, rng)` wraps it with `roll`/`rollPair`.
   - `rooms.js` wraps at the use sites.
   - Test: JSON round-trip a room mid-game and keep playing.
2. `refactor(server): crypto room codes, injectable taken predicate`.
3. `refactor(server): async store interface`, still on sqlite.
   - `accounts.js`, `auth.js` and `index.js` await it.
   - `accounts.test.js` gets awaits.
   - No behaviour change.
4. `feat(server): memory store + store contract suite`.
   - `test/store.contract.js` exports `runStoreContract(name, open)`.
   - The privacy test uses `exportAll()`.
5. `feat(server): mongo store + migration runner`.
   - Adds the `mongodb` dependency.
   - CI gets `mongo:8` and `redis:8` service containers.
   - The Mongo contract test is skipped when `BLOCKOUT_MONGO_URL` is unset.
6. `feat(server): sqlite→mongo script`, then remove sqlite from the runtime.
   - ADR-0006.
   - Update CLAUDE.md, `CONFIGURATION.md`, and the backup guide stub.
7. `fix(classroom): don't report lost on transient errors`.
8. `refactor(server): room runtime over a memory backend`. `live.js` and `roombackend/memory.js`; the memory backend JSON round-trips every snapshot.
9. `feat(server): redis room backend`.
   - The Lua scripts.
   - The `redis` dependency.
   - A backend contract suite run on both backends.
   - Rate-limit buckets move to Redis.
10. `feat(server): leases, takeover sweep, scheduler leader, SIGTERM drain`.
11. `docs`: ADR-0007, privacy, architecture diagram, CHANGELOG.

(M3's invites, `listUsers`, `setRole` and `deleteUser` are added to this store interface and its contract suite in M3.)

### Tests for the risks

All use an injected clock and timers in `live.js`, so nothing waits on real time.

- **Lost updates:** 30 concurrent answers through two runtimes on one backend are all counted, and the version rises by 30. Repeat on Redis.
- **Owner death:** runtime A owns the room and stops without releasing. After the lease expires, B claims it, and the CPU turn, auto-next and tournament round still happen.
- **Double fire:** both owners' timer callbacks run; only one advance happens.
- **Cross-replica views:** the teacher acts on A while a student streams or polls on B, and B gets the new view.
- **Live moves:** `v` doesn't change, and only the match's players receive them.
- **Crashed replica's presence:** it expires, and `allDone` stops waiting for that player.
- **Code collision:** a seeded rng forces a collision with a live or closed room; creation retries.
- **Schedules:** two schedulers produce exactly one room.
- **Concurrent migrations:** `migrate()` twice in parallel is safe.
- **Deletion:** after `deleteUser`, `exportAll()` holds no reference to that user.
- **Drain:** streams end with `retry`, the other runtime takes over, and the client keeps playing.
- **Redis down:** rooms answer 503, and clients retry instead of reporting "lost".

---

### M3. Roles, invites and admin

**ADR-0008** "Roles live in Blockout's database". It supersedes the roles part of ADR-0002.

### Rules (pure, in `apps/server/src/accounts.js`, unit-tested)

- **Default role and admin**
  - Every new account is a `student`.
  - `identity()` (`auth.js:143-158`) no longer derives a role. It keeps `sub`, name, initial, domain and school, and adds `isAdmin = claims roles include 'admin'`.
  - The domain fallback (school domain → student, otherwise parent) and the `ROLES` precedence go away.
- **Role comes from the DB:** `store.upsertUser` (`store.js:144-159`) stops writing `role`. It sets `role` only on insert, to `'student'`, or to the dev picker's role with dev sign-in.
- **Migration:** existing rows keep their current role. There's no data change; only the overwrite stops.
- **Admin:** `isAdmin` is computed per request from the token and never stored. Dev sign-in gets an "admin" checkbox (dev only). `need(user, 'admin')` checks `user.isAdmin`.
- **Invites** (the `invites` collection from M2)
  - Fields: `{ id, kind: 'teacher'|'parent', code_hash (sha256), created_by, child_id?, school_id?, expires_at, used_by?, used_at?, created_at }`.
  - Codes are 8 characters from `CODE_LETTERS`, shown once and stored hashed. They are single-use.
  - Expiry: teacher invites last 7 days, parent invites 14 days.
  - Creating an invite for the same child again revokes that creator's older unused invites.
- **Who creates invites**
  - **Admins** create teacher invites (optionally tied to a school) and parent invites for any student.
  - **Teachers** create:
    - teacher invites, to bring a colleague in; tied to the teacher's own school, at most 10 unused at a time and 20 a day
    - parent invites for students in their classes (`canSee`)
  - **Students** create parent invites for themselves (it replaces "For a grown-up").
  - Teachers promote through invites, not by changing someone's role directly. A teacher can't look up arbitrary accounts (ADR-0004), and the person redeeming proves they want the role. Direct role changes stay admin-only.
  - Every redemption records `invitedBy` on the user, so an admin can see who brought each teacher in and revoke a bad chain (demote, delete the invites).
- **Redeeming** (`POST /api/invites/redeem {code}`)
  - Teacher invite: the account must be a student with no class memberships and no parent links. Otherwise 409 with a friendly message ("This account already plays in a class. Sign in with a different account to teach."). The role becomes `teacher`.
  - Parent invite:
    - a student with no classes or links → becomes `parent` and is linked to the child
    - already a parent → just linked
    - a teacher → 409
  - Expired, used or unknown codes all get the same 404, and each attempt counts toward the M1 rate limit.
- **Admin role changes:** an admin can set an account to student, teacher or parent. Demoting a teacher who still has classes or schedules → 409 ("Move or delete their classes first").
- **Retiring parent codes:** remove `users.parent_code` and `ensureParentCode`. The migration nulls them. `POST /api/children {code}` becomes an alias of redeem for a parent invite, so the client changes stay small.
- **Deletion**
  - `DELETE /api/admin/users/:id` removes the user with everything they own: progress, memberships, links, their assignments, schedules and invites.
  - `DELETE /api/me` is for teacher and parent accounts. Teachers must have no classes, which mirrors the demotion rule.
  - A linked parent can delete their child's account, with a confirm dialog.

### Routes (`index.js` accountRoutes, documented in `HTTP-API.md`)

| Route | Who |
|---|---|
| `POST /api/invites/redeem` | signed in |
| `POST /api/me/parent-invites` | student |
| `POST /api/students/:id/parent-invites` | teacher who can see the student, or admin |
| `GET/POST /api/me/teacher-invites`, `DELETE /api/me/teacher-invites/:id` | teacher (own invites, with limits) |
| `GET /api/students/:id/parents`, `DELETE /api/students/:id/parents/:parent` | teacher of the child (who is linked; unlink a wrong parent) |
| `GET/POST /api/admin/invites`, `DELETE /api/admin/invites/:id` | admin |
| `GET /api/admin/users?q=&role=&page=` | admin. Returns first name, initial, role, domain, created and last seen only |
| `PUT /api/admin/users/:id/role` | admin |
| `DELETE /api/admin/users/:id` | admin |
| `GET/POST /api/admin/schools` | admin (uses the existing `store.addSchool`) |
| `DELETE /api/me`, `DELETE /api/students/:id` | as above |

Remove `GET /api/me/parent-code`.

### UI

- **`apps/multiplication/src/accounts.js`**
  - Student account page: "For a grown-up" gets a **Make a grown-up code** button. It shows the code, its expiry, and a QR/link `/#invite=CODE`.
  - Teacher roster (:662): the parent-code column becomes a **Parent code** button per student (with a QR) and a "Grown-ups" list with unlink.
  - Any signed-in student menu gets **I have a code** (redeem), for a new teacher or parent.
  - Teacher "My classes" gets **Invite a teacher**: make a code with a QR/link, see the codes still open, and revoke them.
  - `#invite=CODE` links open redeem after sign-in (like `rosterLink` at :887).
  - The dev sign-in picker keeps roles and adds admin.
  - Wording for 8-year-olds and grown-ups follows CLAUDE.md conventions.
- **New `apps/admin` Vite app** at `/admin/` (a separate bundle, so kids never download it):
  - users table with search and role change
  - teacher invites (create with an optional school, list, revoke)
  - schools
  - delete user, with a typed confirmation
  - It reuses `@blockout/ui` and `@blockout/auth`. Non-admins see "Admins only".
- **Keycloak** (`deploy/keycloak/realm-blockout.json`)
  - Add realm role `admin`.
  - Remove the `student`/`teacher`/`parent` realm roles: they're now ignored.
  - Keep self-registration (anyone can sign in) only together with M5's SMTP and email verification.

### Tests

`accounts.test.js`:
- a new user is a student, and token role claims are ignored
- admin from the realm role
- invite create, redeem, expiry, single-use and revocation
- teacher-made teacher invites: tied to the teacher's school, limits enforced, `invitedBy` recorded
- the 409 cases
- deletion cascades
- the list for an admin returns no extra fields (ADR-0004)

`server.test.js` covers the routes and the 429 on redeem. A Playwright run covers: a student makes a grown-up code; a second context signs in, redeems it and sees the child under My kids; an admin invites a teacher, that teacher invites a second teacher, and the second one creates a class.

### Docs

- New guide `docs/guides/admins.md`.
- Update `teachers.md` and `parents.md` (with screenshots), `HTTP-API.md`, `privacy.md` (invites, admin, deletion) and the role section of `set-up-keycloak.md`.
- ADR-0008.

---

### M4. Container image, CI publish, Helm chart

- **`Dockerfile`** (repo root, per the container-images skill)
  - Build stage: `node:26-trixie-slim@sha256:…`, `npm ci`, `npm run build`.
  - Runtime stage: same base by digest, or `gcr.io/distroless/nodejs26-debian13` if available. Copy only:
    - `apps/server/src`
    - `packages/engine`, `packages/progress`
    - `apps/*/dist`
    - root `package.json`, `package-lock.json`
  - Then `npm ci --omit=dev --workspace @blockout/server` (only the server's dependencies, keeping the workspace symlinks).
  - `USER node` (uid 1000), exec-form `CMD ["node","apps/server/src/index.js"]`, `NODE_ENV=production`, `EXPOSE 8080`, OCI labels (`org.opencontainers.image.source/version/revision`).
  - Add a `.dockerignore`.
  - The image must not contain `data/`, `docs/`, `.devcontainer/` or `node_modules` from the host.
- **`.github/workflows/release.yml`**
  - On tag `v*`: build `linux/amd64` (plus `arm64` if the clusters need it) with `docker/build-push-action` (pinned by SHA).
  - Push `ghcr.io/<owner>/blockout:<semver>` and `:<sha>` with SBOM and provenance attestations.
  - `permissions: contents: read, packages: write, id-token: write, attestations: write`.
  - Create a GitHub Release from the CHANGELOG section.
- **`ci.yml`:** add an image build without push on PRs. Add Trivy (pinned) failing on HIGH/CRITICAL with a fix available.
- **Dependabot:** add `docker` (Dockerfile) and `helm` (`deploy/blockout`). Group them.
- **`deploy/blockout/` Helm chart** (per the helm-charts skill)
  - Templates:
    - `Deployment`: `replicas: 2`, `topologySpreadConstraints`, rolling update `maxUnavailable: 0`, `terminationGracePeriodSeconds: 30`
    - `startupProbe` on `/health/startup` (period 2 s, failureThreshold 60), `livenessProbe` on `/health/live`, `readinessProbe` on `/health/ready`, plus a `preStop` sleep of 5 s
    - `securityContext`: `runAsNonRoot`, `readOnlyRootFilesystem`, drop ALL, seccomp RuntimeDefault
    - `resources`
    - `Service`
    - `HTTPRoute` (Gateway API, the cluster's shared gateway, per WIP) with long request timeouts for SSE; an optional `Ingress`
    - `PodDisruptionBudget` (`minAvailable: 1`)
    - optional `HorizontalPodAutoscaler` (CPU)
    - `NetworkPolicy`: ingress from the gateway only; egress to Mongo, Redis, the Keycloak issuer, DNS, and OpenAI if enabled
    - a ConfigMap for non-secret env, with checksum annotations
  - Secrets referenced by name (`blockout-mongo`, `blockout-redis`, `blockout-openai`), never templated.
  - `values.schema.json`.
  - Per-cluster values: `values-workspace.yaml`, `values-production.yaml`.
  - CI: `helm lint` and `helm template | kubeconform`.
- **`deploy/blockout/install.sh`** mirrors `deploy/keycloak/install.sh`: idempotent `helm upgrade --install --atomic --wait`, using the image tag passed in.

---

### M5. Workspace-cluster deployment (first public version)

- **Data services** (`deploy/data/`, namespace `blockout-data`), workspace cluster: single instances like `deploy/keycloak/postgres.yaml`, with the same pod hardening.
  - **MongoDB 8**: a single-member replica set (needed for transactions and change streams), auth enabled, a 10 Gi PVC.
  - **Redis 8** or **Valkey 8**: AOF on, `requirepass`, no PVC needed (room state is disposable).
  - An install script creates the Secrets (random passwords) and prints nothing secret.
- **Keycloak on a public hostname** (`deploy/keycloak/`)
  - `values.yaml`: `KC_HOSTNAME=https://id.<domain>`, `KC_PROXY_HEADERS=xforwarded`, `KC_HTTP_ENABLED=true` behind the gateway, an HTTPRoute and cert.
  - `realm-blockout.json` gets rendered per environment by `install.sh` (`envsubst` on `${BLOCKOUT_URL}`) for `redirectUris`, `webOrigins` and post-logout URIs. Keep the localhost entries for dev values only.
  - **Self-registration** (the user's "anyone can sign in"):
    - `registrationAllowed: true`, `verifyEmail: true`, `resetPasswordAllowed: true`
    - SMTP configured from a Secret (provider to choose; see open questions)
    - brute-force detection on
    - password policy `length(10)`
  - Google IdP: add the public broker redirect URI in Google Console.
  - Decide whether to set `hostedDomain` (open question).
  - Read the Google secret from 1Password with `op read` when `OP_SERVICE_ACCOUNT_TOKEN` is set, falling back to the prompt (WIP item 2).
  - Realm import runs only once, so existing realms get these changes through a small idempotent `kcadm.sh` step in `install.sh` (redirect URIs, roles, SMTP). Document it.
- **Blockout:** `deploy/blockout/install.sh` with `values-workspace.yaml`:
  - `blockout.<domain>`
  - `BLOCKOUT_AUTH=keycloak`, `KEYCLOAK_ISSUER=https://id.<domain>/realms/blockout`
  - `PUBLIC_URL`, `TRUST_PROXY=1`, `NODE_ENV=production`
- **DNS and TLS:** gateway listener plus a certificate (cert-manager if present). DNS records for `blockout.` and `id.`.
- **Bootstrap the first admin:** in Keycloak, give your own account the `admin` realm role. Documented in `docs/guides/set-up-keycloak.md` and the new `docs/guides/deploy.md`.
- **Smoke test** (scripted Playwright against the public URL):
  - sign in with Google
  - redeem a teacher invite
  - host a class and have two students join
  - **kill one Blockout pod mid-round; the class continues**
  - roll the deployment; the class continues

---

### M6. Operations

- **Backups**
  - MongoDB: a CronJob running nightly `mongodump --archive --gzip`, encrypted with `age` (public key in values, private key in 1Password), uploaded to S3-compatible object storage (Hetzner Object Storage or similar).
    - Keep 30 dailies and 12 monthlies.
    - Same for the Keycloak Postgres (`pg_dump`).
    - Images pinned by digest.
  - Redis isn't backed up: rooms are disposable.
  - A monthly **restore drill** runbook: restore into a scratch namespace and run `mongosh` counts. Rewrite `docs/guides/back-up-the-database.md` around this.
- **Metrics:** `GET /metrics` (Prometheus text, built by hand, cluster-internal only via NetworkPolicy or a separate port):
  - requests by route and status, latency histogram
  - active rooms, streams and polls
  - rate-limit rejections
  - Mongo and Redis errors
  - A ServiceMonitor if the cluster runs Prometheus.
- **Logs:** JSON logs go to the cluster's log stack. Keep labels low-cardinality (`service`, `severity`).
- **Alerts:**
  - readiness failing more than 2 min
  - 5xx rate above 1 %
  - p95 latency above 1 s
  - backup job failed or older than 26 h
  - certificate expiring in under 14 days
  - An external uptime check on `/health/ready` and Keycloak's `/realms/blockout`.
- **Runbooks** in `docs/guides/operate.md`: deploy and roll back (`helm rollback`), restore, rotate secrets, promote an admin, delete a user on request, what to do when Mongo or Redis is down.

---

### M7. Compliance (FERPA, COPPA, SOPIPA, per `docs/privacy.md`)

- **Retention**
  - A daily job (the scheduler leader from M2) deletes accounts not seen for `BLOCKOUT_RETENTION_DAYS` (default 395, about 13 months). It uses the M3 cascade.
  - Unused and expired invites go after 30 days.
  - Rooms in Redis go after 4 h (TTL).
- **Export:** `GET /api/me/export` and `GET /api/students/:id/export` (linked parent) return a JSON download of everything stored.
- **`privacy.md` rewrite**
  - fix the stale paths
  - MongoDB, Redis and Keycloak (where they run, who operates them)
  - retention periods
  - deletion and export, and how a school requests them
  - the OpenAI check only for guest names
  - The `hostedDomain` and self-registration decisions.
- **Before a school goes live, outside the code:** a school data-privacy agreement (many districts use the Student Data Privacy Consortium template), a named contact for data requests, and a short legal review of `privacy.md`.
- **Accessibility pass** (keyboard, contrast, screen-reader labels on the main game and dialogs), worth doing for school procurement.

---

### M8. Production cluster

- **Operators instead of single pods**
  - MongoDB: MongoDB Controllers for Kubernetes (community) or the Percona Operator. A 3-member replica set across zones, with operator-managed backups to object storage.
  - Redis: a 3-node Sentinel setup (Valkey or Redis operator).
  - Keycloak: 2 replicas with a shared cache. Postgres via CloudNativePG (or keep the StatefulSet with nightly dumps; decide at this point).
- **Secrets:** 1Password Operator or External Secrets Operator syncing every Secret. No secret is created by hand.
- **GitOps:** Argo CD or Flux pulling `deploy/blockout` with `values-production.yaml`. Image updates by PR. The workspace cluster stays manual (`install.sh`).
- **Load test** (k6 or a Playwright swarm script): 30 classes × 30 students on SSE with 2 replicas. Check p95 latency and Redis CPU. Size requests and limits and the HPA from it.
- **Cutover:** migrate MongoDB from the workspace cluster (`mongodump`/`mongorestore`) during a quiet window, switch DNS, keep the old deployment read-only for a week.
- Tag **1.0.0**.

---

### Open questions (needed before the milestone named)

- **SMTP provider** for Keycloak email verification and password reset. Needed for M5.
- **Google `hostedDomain`.** Should Google sign-in be limited to school domains (e.g. `iusd.org`), or open to any account? Needed for M5.
- **Domain names** for Blockout and Keycloak. Needed for M5.
- **Object storage for backups.** Needed for M6.
- **The production cluster's provider and region.** Needed for M8.

### Verification

- **Every milestone:**
  - `npm test && npm run lint`
  - `.venv/bin/mkdocs build --strict`
  - the Playwright scenarios named in that milestone, run against a fresh build on a private port (CLAUDE.md pattern), collecting `pageerror` and CSP violations
- **M1:** curl `/%E0` and the server stays up; 429 after the limit; `kill -TERM` drains in under 20 s; zero CSP violations across all 11 apps.
- **M2:** the two-replica tests in one process (see M2). Locally, `docker`/`kubectl` Mongo and Redis plus two `node` processes on 8135/8136 behind a tiny round-robin proxy script. A class survives killing either process.
- **M4:** `docker build`, `docker run` with `NODE_ENV=production` and missing config fails fast; Trivy clean; `helm lint`; `kubeconform`.
- **M5:** the scripted public smoke test above, including pod kill and rollout mid-class.
- **M6:** a restore drill into a scratch namespace succeeds, and an alert fires on a forced backup failure.
