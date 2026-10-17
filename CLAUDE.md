# Blockout

A multiplication-as-area game for 3rd graders, based on "Blockout" from Math for Love. Two dice are rolled, you draw an a × b rectangle on a grid and answer a × b to claim it. It runs mainly on classroom Chromebooks.

**A Turborepo of plain JavaScript** (ES modules, no framework), built with Vite. npm workspaces: `apps/*` and `packages/*`. The browser's only runtime dependency is `qrcode-generator`. The server's are the official `mongodb` and `redis` clients ([ADR-0006](docs/decisions/0006-mongodb-and-redis.md)); everything else is Node built-ins.

## Layout

| Path | What |
|---|---|
| `apps/multiplication` | The main game, at `/`. `index.html` has every screen and dialog (`.overlay > .dialog`). `src/main.js` loads the styles, `src/game/index.js`, then `src/accounts.js`. |
| `apps/multiplication/src/game/*.js` | The game UI, one module per area: `base` (constants, `el`), `wallet`, `settings`, `wardrobe`, `play` (game state and turns), `stats`, `shop`, `achievements`, `practice`, `invites`, `classroom`, `cheats`, `checkin`, `input`, `render`. See "How the game modules load" below. |
| `apps/multiplication/src/accounts.js` | Account screens: sign in, student homework (Play › starts the game), teacher My classes (roster, grown-ups, Invite a teacher), parent My kids, one-time codes (`#code=` links, `codeCard` with a QR code), deleting accounts, live tournament banner. Imports what it needs from `src/game/api.js`. |
| `apps/admin` | The admin page (`/admin/`, its own bundle): accounts (search, role, delete), teacher codes, schools. Only for accounts with the Keycloak realm role `admin`; the server checks every request. |
| `apps/multiplication/src/invite.js` | Invite links (`validate` whitelists every setting). |
| `apps/demos` | Demos (`/demos/`): 26 classic mechanics as quick math games. `src/catalog.js` lists them; each is `src/games/<id>.js` exporting `mount(stage, ctx)`, where `ctx` (from `src/kit.js`) gives facts, the status bar, keypad, canvas, and timers and listeners that clean themselves up. `window.Demo.state()` for automated checks. |
| `apps/snake` | Number Snake (`/snake/`): a snake game that eats numbers. Rules in `src/rules.js` (pure, tested), the page in `src/main.js`; `window.SnakeGame` for automated checks. |
| `apps/mobile` | Blockout for phones and tablets: React Native with Expo (SDK 57: the newest the App Store's Expo Go runs; plain JS with JSX). `src/Game.js` plays turns from `@blockout/engine/match`; `src/Board.js` (SVG, drag by `PanResponder`); `src/account.js` (`expo-auth-session` PKCE as Keycloak client `blockout-mobile`, tokens in `expo-secure-store`, save sync like `@blockout/auth`); the Wardrobe's looks in a React context (`src/looks.js`: how each is drawn; `src/effects.js`: the moving ones); pure, tested: `sync.js`, `rewards.js`, `boardMath.js`, `celebration.js`. `npm run tunnel --workspace @blockout/mobile` for Expo Go; in the web build `window.BLOCKOUT_FAST` and `window.BlockoutMobile` for automated checks. Guide: `docs/guides/run-the-phone-app.md`. |
| `apps/<operation>` (7), `apps/more-games` | The other games (`/addition/`, …), each a tiny app running `@blockout/game-kit`, plus the More games hub (`/more-games/`). |
| `apps/server/src/index.js` | Node server: the built apps (`apps/<name>/dist`; multiplication at `/`), JSON API, SSE plus `/poll` for classrooms, accounts routes. |
| `apps/server/src/live.js`, `roombackend/` | Live classes across servers: rooms kept in a backend (`redis.js` with Lua scripts, `memory.js` for one server and tests); every change goes through `withRoom` (read, change, write if unchanged, else retry); one server owns each room's timers by lease, others take over; presence beside the room, not in it. Tests run two runtimes on one backend (`test/live.test.js`). |
| `apps/server/src/metrics.js`, `log.js` | Prometheus metrics by hand (served on `METRICS_PORT`, never the public port) and structured JSON logs with OpenTelemetry field names; audit records for account changes, by id only. |
| `apps/server/src/rooms.js`, `tournament.js` | Pure room logic: whole class, pairs, tournaments (knockout, double elimination, round robin, Swiss, king of the hill). |
| `apps/server/src/moderation.js` | Username checks: `blocklist.txt`, plus OpenAI moderation only when `OPENAI_API_KEY` is set (fails open). |
| `apps/server/src/store/`, `auth.js`, `accounts.js` | Accounts: stores behind one async interface (`mongo.js` for servers, `memory.js` for tests, `sqlite.js` only reads old `data/blockout.db` files for `scripts/sqlite-to-mongo.js`; `index.js` picks one from `BLOCKOUT_STORE`/`BLOCKOUT_MONGO_URL`; every store passes `test/store.contract.js`; MongoDB schema steps in `migrations.js`); sign-in providers behind one interface (dev HMAC JWT, Keycloak RS256 via JWKS; `identity()` keeps only first name, last initial, role, email domain); the rules (classes, rosters, homework, parent links, scheduled tournaments, roles and one-time invites, admins, deleting accounts). |
| `packages/engine` | `@blockout/engine`: board, placement, dice, `rollForBoard`, difficulties (`DIFFICULTIES`, `diceFaces`, `createPairDice`, `fitsDifficulty`), CPU. `@blockout/engine/match`: one game turn by turn (roll, place, answer, help, CPU turn, end), no screen or timers. `@blockout/engine/{fraction,boards,variants}`: the other operations' rules. Pure. |
| `packages/progress` | `@blockout/progress`: wallet, `SHOP` (unlocks), achievements, fact stats, bonuses, practice picking, homework goals and options, cheat codes, `normalize` (save migrations). `@blockout/progress/cosmetics`: the Wardrobe's looks (registers its items into `SHOP`: import it before reading `SHOP` for every unlock); `/wardrobe`: what's worn and the Wardrobe's rows. `@blockout/progress/shop`: the Shop's rules and words for every client (rows and why lines, `unlockOffer`, `purchase`, what's new, `activation`). Pure. |
| `packages/ui` | `@blockout/ui`: CSS in `src/css/*` (tokens, base, menu, game, dice skins, results, panels, rewards, wardrobe, players), the Lucide icon sprite (`icons.svg`), DOM helpers, `@blockout/ui/rewards` (toasts, achievement banners, confetti), and `@blockout/ui/vite` (`blockoutPage()`: adds the theme script and the sprite to every page). |
| `packages/game-kit` | `@blockout/game-kit`: `startGame(variantId)`, the shared page engine of the other games, and their `style.css`. `@blockout/game-kit/meta`: each game's save (`blockout.game.<id>`): points, shop chains, achievements, question stats. Pure, tested. |
| `packages/classroom`, `packages/auth` | Browser clients: classroom server (SSE with long-poll fallback, session in sessionStorage); sign-in (dev or Keycloak PKCE), bearer token, per-account progress key and sync. |
| `Dockerfile`, `deploy/blockout` | The image (build, then only the server's production dependencies and the built apps; runs as `node`) and the one Helm chart for a deployment ([ADR-0009](docs/decisions/0009-one-chart.md)): the servers (Deployment with the three health probes, HTTPRoute on the shared Gateway with no timeout for event streams, PDB, optional HPA, CiliumNetworkPolicy), MongoDB (replica set of one, started by a `replica-set` container), Valkey, Keycloak (the `codecentric/keycloakx` dependency, `Chart.lock`) with its Postgres, its HTTPRoute and a post-install/upgrade realm Job, nightly encrypted backups and the monthly restore check (rclone's crypt remote). Passwords are made once by the chart (`lookup`) and kept; secrets only a person has are values (`-f secrets.yaml`, gitignored). `files/realm-blockout.json` is the realm (imported only when it doesn't exist). `values-workspace.yaml`, `values-production.yaml`, `values-dev.yaml` (only MongoDB and Valkey: `npm run services` forwards them), `values.schema.json`; `install.sh` (`helm upgrade --install --atomic`). Nothing is created by hand. `.github/workflows/release.yml` publishes the image and chart on a `v*` tag. Guides: `docs/guides/deploy.md`, `set-up-keycloak.md`, `operate.md`. |
| `docs/` | The MkDocs Material site (`mkdocs.yml`): `home/`, `guides/`, `concepts/`, `reference/`, `project/`, `decisions/` (ADRs), `privacy.md`, screenshots in `assets/screenshots/`. The v0.3.0 plan and log are kept out of the nav. |
| `.github/` | CI (`workflows/ci.yml`: lint, test and build on Node 26, strict docs build; `workflows/devcontainer.yml`: builds the dev container; actions pinned to commit SHAs) and Dependabot (npm, actions, dev container features). |

Tests live next to their code (`packages/*/test`, `apps/*/test`, `node:test`).

### How the game modules load
Every module in `src/game/` only declares things when it's imported. What used to run at load (event listeners, the initial render, `const el = {…}`) is in each module's `export function run()`, and `src/game/index.js` calls every `run()` in a fixed order. Keep it that way:
- **No load-time work outside `run()`,** except declarations that run nothing.
- **Cross-module writes go through a setter:** `setGame`, `setGameId`, `setPractice` and `setWardrobeFilter`; the imported binding is read-only.
- **Imports between modules are circular.** That's fine as long as nothing is used before `run()`.

## Commands

```sh
npm test            # every package's tests through Turborepo (must stay green)
npm run lint        # ESLint (eslint.config.js)
npm run build       # Vite builds every app into apps/*/dist
npm start           # build, then serve everything on http://localhost:8080
npm start -- --public-url https://<name>.trycloudflare.com   # behind a Cloudflare tunnel
npm run dev         # Vite dev servers (multiplication on :5173, proxying /api) + the server with --watch
cloudflared tunnel --url http://localhost:8080
op run --env-file=deploy/blockout/.env.1password -- deploy/blockout/install.sh 0.5.0   # install or update everything (values-workspace.yaml); secrets from 1Password
npm run services    # forward the development MongoDB and Valkey (release blockout-dev) to localhost; prints the URLs
# Keycloak admin console: https://id.deepspacecartel.com/admin (user admin; password in Secret blockout-keycloak-admin)
BLOCKOUT_AUTH=keycloak KEYCLOAK_ISSUER=https://id.deepspacecartel.com/realms/blockout KEYCLOAK_CLIENT_ID=blockout npm start
```

- **The dev server:** the user usually keeps one running on 8080 behind a Cloudflare quick tunnel. The tunnel URL changes, so ask for it or reuse the last one given.
- **Memory:** the workspace container has 4 GiB (`free` shows the whole node), shared with the editor; a full parallel `npm test` + `npm run build` next to Metro or Playwright got it OOM-killed once. Use `npx turbo run <task> --concurrency=2`, run builds one at a time, and Playwright only when nothing else heavy is running. `devcontainer.json` caps each Node process's heap at 1.5 GiB (`NODE_OPTIONS`).
- **After client changes:** rebuild (`npm run build`). Built assets are hashed and `index.html` is served `no-cache`, so a page reload picks them up.
- **After server changes:** restart the server.
- **Setup:** Dev Container Features install the GitHub CLI, kubectl and helm (the official features), and, from `.devcontainer/features/`, cloudflared, Playwright's Chromium with its libraries (in `/ms-playwright`), python3-venv, the DeepSpaceCartel Agent Skills (user-level, `~/.claude/skills`), the `coder` CLI from coder.deepspacecartel.com, and the 1Password CLI (`op`, from 1Password's signed apt repository); `.devcontainer/postCreateCommand.sh` installs the npm packages and the docs venv (`.venv`). Feature versions are pinned in `devcontainer.json`: when Playwright moves on in `package-lock.json`, bump `playwright-chromium` to match (`node .devcontainer/check.mjs` checks, and CI runs it). `.github/workflows/devcontainer.yml` builds the container and smoke-tests it.

## Browser testing (Playwright)

Write throwaway scripts in the session scratchpad, not the repo. Build first (`npm run build`), require Playwright from `/workspaces/blockout/node_modules/playwright`, and spawn a private server on a spare port (8134+) that you kill at the end. The pattern:

```js
const { chromium } = require('/workspaces/blockout/node_modules/playwright');
const srv = spawn('node', ['/workspaces/blockout/apps/server/src/index.js', '8135'], { stdio: 'ignore', env: { ...process.env, BLOCKOUT_STORE: 'memory' } });
// seed a save before the page loads (once per tab):
await page.addInitScript((pr) => { if (!sessionStorage.getItem('s')) { sessionStorage.setItem('s', 1);
  localStorage.setItem('blockout.progress', JSON.stringify(pr)); } }, progress);
```

- **Seed the migration flags.** A seeded progress must include `boardsV2, practiceV2, placeAutoV1, gameExpertV1, practiceTimersV1, boardWinsFromHistory: true`, or the old-save migrations in `Progress.normalize` grant extra unlocks and skew the test. Add `checkIn: { last: <today>, streak: 1 }` to skip the daily check-in popup.
- **To unlock everything,** seed `unlocks: Progress.SHOP.map(i => i.id)`, or type the IDDQD cheat (~ key).
- **Useful ids:**
  - `#start-btn`, `#roll-btn`, `#unlock-yes` (the quick-unlock confirm), `#cheats-input`
  - `[data-mode="single|multi|practice"]`, `[data-setting="difficulty"] [data-value=…]`, `#board-size [data-size=…]`
- **Check for errors:** collect `pageerror` events and check there are none. Screenshot and look at the result.
- **Classroom flows:** use several browser contexts (a teacher plus students). Hosting needs a teacher sign-in: POST `/api/auth/dev` with `{ role: 'teacher', firstName, schoolId: 'cadence-park' }` and store `{ token, user }` in `localStorage['blockout.auth']`, or use the sign-in dialog.
- **Accounts:** start the test server with `BLOCKOUT_STORE=memory` so runs don't share data.
- **Other games:** they're at `/<id>/`. `window.PROTO_FAST = true` (an init script) makes the CPU quick, and `window.ProtoGame` exposes `state()`, `piece()` and `boards`.

## Storage

- **localStorage:**
  - `blockout.auth`: `{ token, user }` when signed in; `blockout.progress.<userId>` is that account's save (cache), `blockout.mergedInto` the accounts this device's guest save went into
  - `blockout.progress`: wallet, unlocks, achievements, facts per player key, counters, boardWins, helpedFacts, cheats, migration flags
  - `blockout.settings`, `blockout.history`, `blockout.className`, `blockout.classHost`
- **sessionStorage** (per tab): `blockout.class`, the classroom session.
- **Save changes need a migration.** Anything that changes what a save means gets a one-time flag in `Progress.normalize`, so existing players never lose what they had.

## Game design conventions

- **Unlocks are skill-tree chains** (`SHOP` items with `requires`):
  - Only the next step shows its name and price. Later steps are blurred "skeleton" placeholders with a lock (`Progress.isHidden`, `setLockBadge`).
  - Reveal gates: `winOn` (win on the previous board), `masterUpTo` / `mastery` (Times Table mastery, via `tableReady`).
  - `perk` text appears in the unlock dialog and the shop.
  - Buying from a menu control activates it (`activation` in `@blockout/progress/shop` says what; each client applies it).
- **Per-difficulty unlocks:** each difficulty has its own Expert level, timers and practice question counts (`gameExpertId`, `gameTimerId`, `practiceCountId`, `practiceTimerId`, `practiceExpertId`).
- **Difficulties:**

  | Difficulty | Dice |
  |---|---|
  | Easy | d6 |
  | Medium | d8 |
  | Hard | d12 |
  | Tricky | faces 3, 4, 6, 7, 8, 9, 12 |
  | Master | d12 weighted to the player's weak facts |
  | Legend | half teen × 2–9 (11–19), half Tricky facts; needs a board ≥ 12 and uses split explanations |

  Tricky, Master and Legend use pair dice (`createPairDice`) and virtual dice only. Pair dice make big rectangles rarer on smaller boards (`PAIR_ROOM`), and near the end they fall back to small facts that fit, so games last about as long as on Hard (a test checks this). Classroom stays on Easy, Medium and Hard.
- **Classroom games are unlock-free:** every lobby setting is free and cheats are off.
- **Bonuses** are in `@blockout/progress` (`answerBonus`, `timerBonus`, `boardFinishBonus`, `practiceFinishBonus`). Tell the player about them in the menu hints and the unlock dialogs.
- **Achievements:**
  - They show one at a time as a WoW-style banner (`celebrate`, then a queue).
  - Results screens stay minimal: no points line, stickers row or achievement list. Actions go on one row of equal buttons.
  - Secret achievements (`hidden: true`, group "Secrets") show as "???" until earned.
- **Cheat codes:** press ~.
  - They're in `Progress.CHEAT_CODES`, with `cheatOn`/`cheatOff` storing what each changed so it can be undone.
  - The menu lists active cheats by description, never by code.
  - Each code gets its own secret achievement `cheat_<code>` (a test enforces this).
- **Dialogs** have a bottom `.dialog-actions` button panel, like the Shop.
- **Accounts are optional:** guests must always be able to play everything except hosting a class. Store as little about children as possible (see docs/privacy.md).
- **Roles are Blockout's** ([ADR-0008](docs/decisions/0008-roles-in-blockout.md)): every new account is a student; one-time invites (hashed, expiring) make teachers and grown-ups; only `admin` comes from the token. An account in use keeps its role.
- **Homework** only asks for what the child can already play (`Progress.availableOptions`, `sharedOptions` for a class). Tapping it sets up the menu and starts the game.
- **The audience is 8-year-olds:** use short, friendly, concrete wording ("Help me count", "Needs practice"). Target devices are Chromebooks, and it must work at phone width too.

## Docs, changelog and commits

- **Docs** follow the site's structure:
  - guides for doing things (with screenshots)
  - `concepts/` for why things are the way they are
  - `reference/` for facts to look up (`CONFIGURATION.md`, `HTTP-API.md`)

  Every page starts with a `<title>`. Check with `mkdocs build --strict` (Python venv with `docs/requirements.txt`).
- **Screenshots** in `docs/assets/screenshots/` come from Playwright runs of the real game on a fresh server (1280 px wide). Retake them when a pictured screen changes.
- **CHANGELOG.md** follows Keep a Changelog: user-facing changes under `[Unreleased]`, by category. The version follows SemVer; it's 0.x, so a minor bump for new features.
- **Decisions:** a hard-to-reverse decision gets an ADR in `docs/decisions/`. Never edit an accepted ADR; supersede it with a new one.
- **Commits** follow Conventional Commits (`feat(accounts): …`, `fix(server): …`, `docs: …`, `refactor: …`, `build: …`, `ci: …`).
- **Server errors** are RFC 9457 problem details (`sendProblem`), keeping the `error` and `message` members the clients read.

## Code style

- **Match the surrounding code:** modern JavaScript ES modules, 2-space indent, single quotes, `const` arrow helpers, short comments explaining *why*.
- **No frameworks.** Keep runtime dependencies to a minimum: in the server, only the database clients.
- **Keep logic testable:** pure logic belongs in `packages/engine`, `packages/progress` or `apps/server/src/{rooms,tournament,accounts}.js`, with unit tests. The game modules stay the UI.
- **Keep the tests and lint green.** Add tests for new rules, and run `npm test && npm run lint` before finishing.
