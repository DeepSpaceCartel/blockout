# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Blockout for phones and tablets (`apps/mobile`): a React Native app, built with Expo, that runs in Expo Go. You against the CPU or two players on one phone, Easy to Hard, drawing by dragging, a keypad, "Help me count", points and achievements, and signing in with Google, with the save synced with the web game.
- The Wardrobe in the phone app (menu › Looks): every look from the web game, worn in its games and practice, from dice, keypads and boards to the CPU's character and the win celebration.
- Accounts in the phone app: homework (with Play ›), joining a class with its code, a code for a grown-up with its QR code, using a teacher's or a grown-up's code, and deleting a teacher's or grown-up's account.
- Live classes in the phone app: join with the class code (or its link) and play the whole class's games, pairs and tournaments, with the same rewards as on the web.
- The rules of a game, turn by turn, without a screen (`@blockout/engine/match`), shared by the phone app and ready for the web game.
- A Keycloak client for the app, `blockout-mobile` (`keycloak.mobile.redirectUrls`), whose tokens the server accepts like the web game's.
- Keycloak's admin console can be public (`keycloak.httpRoute.adminConsole`; on in the workspace cluster, at `https://id.deepspacecartel.com/admin`). Its `master` realm gets brute-force protection either way.

## [0.5.0] - 2026-10-17

### Changed
- One Helm chart installs everything a deployment needs: the servers, MongoDB, Valkey, Keycloak with its Postgres, nightly backups and a monthly restore check. Passwords are made by the chart and kept; the Google client secret, image credentials, mail and backup storage are values. `deploy/data` and `deploy/keycloak` are gone ([ADR-0009](https://github.com/DeepSpaceCartel/blockout/blob/main/docs/decisions/0009-one-chart.md)).
- The secrets only a person has can come from the environment, for example from 1Password with `op run --env-file=deploy/blockout/.env.1password -- deploy/blockout/install.sh <version>`. They reach Helm on its standard input, never its command line.
- Development signs in with the workspace's Keycloak at `https://id.deepspacecartel.com`, and `npm run services` forwards the chart's development release (`values-dev.yaml`).

### Fixed
- A student's long poll is no longer answered with the version of the class it already has (a late message about an older change answered it): it waits for the next change.
- CI's tests with MongoDB stay on Ubuntu 24.04: MongoDB 8 doesn't start on the kernels of Ubuntu 26's runners (6.19 to 7.0.13).

## [0.4.1] - 2026-10-16

### Added
- The Helm chart can pull a private image (`imagePullSecrets`).
- A load test for live classes (`apps/server/scripts/loadtest.js`): 30 classes of 30 students on two servers get each roll to every student in under a second.

### Fixed
- When a whole class answers in the same instant, no answer is lost: the server tries longer to save each one, and the game sends an answer again if the class was busy.

## [0.4.0] - 2026-10-15

The first release since 0.2.0 (0.3.0 wasn't released on its own): accounts and homework, more games, and everything needed to run Blockout as a public service. Details and decisions: [the v0.3.0 work log](https://github.com/DeepSpaceCartel/blockout/blob/v0.4.0/docs/v0.3.0-log.md) and the [decision records](https://github.com/DeepSpaceCartel/blockout/tree/v0.4.0/docs/decisions).

### Added
- Your data: grown-ups can download everything kept about their child (and teachers and grown-ups their own), and accounts nobody has used for 13 months are deleted by themselves (`BLOCKOUT_RETENTION_DAYS`). The privacy page says where everything is kept and for how long.
- Operations: Prometheus metrics on a port of their own (`METRICS_PORT`), alert rules for the cluster's Prometheus, nightly encrypted backups of MongoDB and Keycloak's Postgres to object storage with a monthly restore drill, and a "Run it day to day" guide.
- A container image (`Dockerfile`) and a Helm chart (`deploy/blockout`) for running Blockout in Kubernetes, published to GitHub's registry on each release with an SBOM and signed provenance. CI builds and scans the image and checks the chart on every push.
- Anyone can sign in as a student; one-time codes do the rest. A **teacher code** (from an admin, or a teacher inviting a colleague under **🏫 My classes**) makes a teacher; a **grown-up's code** (made by the child on their account page, or by their teacher next to the student in the roster) makes a child's grown-up and links them. Codes work once, for 7 or 14 days, with a QR code and a link.
- An admin page at `/admin/` for accounts with the Keycloak `admin` role: find accounts, change roles, delete accounts, make teacher codes and add schools.
- Deleting accounts: a grown-up can delete their child's account, and teachers and grown-ups their own; admins any account. Everything in the account goes with it.
- Teachers see each student's grown-ups and can take off one who shouldn't be there.
- Structured logs: JSON lines in production (one per request, plus an audit record for each account change, by id only), short text lines at a terminal. `LOG_LEVEL` and `LOG_FORMAT` set them.
- Health endpoints for Kubernetes probes: `/health/startup`, `/health/live` and `/health/ready`. On `SIGTERM` the server finishes cleanly: it stops taking connections, ends live-update streams so browsers reconnect, answers waiting polls and exits.
- Accounts for students, teachers and parents, signed in with a practice "dev sign-in" for now and ready for Keycloak (and school Google accounts) later. Guests can still play everything except hosting a class.
- Teachers: classes that students join with a code, a class stats page, homework and scheduled class or school tournaments whose lobby opens by itself.
- Parents: link a child with a code, see their Times Table and homework, and set extra homework.
- Homework only offers what the child can already play, and "Play ›" starts it straight away.
- A signed-in student's progress follows them to any device; the first time on a device, that device's guest progress is added to the account.
- Tricky, Master and Legend difficulties after Hard, and the IDDQD and FIVEMOREMINUTESMOM cheat codes, each with a secret achievement.
- Demos (on the main menu): 26 classic games turned into quick math games to try, from Times Tetris and Fact Invaders to Times Bingo, Fact Racer and Multiplier Bakery.
- Number Snake (on More games): a snake game that eats numbers instead of apples: the answer to a times-table question, every multiple of a number, or (Add it up) any number you like, added to a running total that you then have to give. Movement (Auto, or Manual: one square per press), speed (Slow, Normal, Fast) and walls (Stop, Wrap, Lose a heart, Game over) are chosen on its menu.
- Classroom: in Pairs (and tournament matches), you see your partner's roll, the rectangle they're placing and the one they're answering as it happens. In Whole class, students see the boards of the classmates nearest them on the leaderboard, and the teacher's screen shows every student's board.
- Classroom: everyone's Wardrobe avatar and title show next to their name, on the lobby, leaderboards, match cards and results.
- More games: addition, subtraction, division and four fraction games, reachable from the main menu. Each has Single player, Home (two players on one screen) and Practice, its own points, a shop (Medium, then Hard; 20-question rounds, then Expert practice; Home multiplayer), achievements and stats.

### Changed
- Accessibility: buttons and small orange text use a slightly deeper orange so they're readable (WCAG AA contrast, light and dark), locked menu cards are no longer faded, and the dice and the admin page's fields have names for screen readers. An axe-core pass over the main screens finds nothing.
- Roles are kept by Blockout, not taken from the sign-in provider: Keycloak's `student`, `teacher` and `parent` roles are ignored, and only `admin` counts.
- Live classes can be kept in Redis (Valkey, `BLOCKOUT_REDIS_URL`), so several servers can run them together: a class carries on when a server restarts, crashes or is updated, and its rate limits are shared. A production server requires it.
- Accounts can be kept in MongoDB (`BLOCKOUT_MONGO_URL`), which several servers can share; a production server requires it. Without it, accounts are kept in memory only (`data/blockout.db` is copied into MongoDB with `apps/server/scripts/sqlite-to-mongo.js`). `deploy/data/install.sh` installs MongoDB and Valkey in the cluster, and `npm run services` forwards them for development.
- In the other games, Medium, Hard, 20-question practice, Expert practice and Home multiplayer are now unlocked with points.
- Hosting a class now needs a teacher sign-in.
- Legend deals teens (like 14 × 7) for half of its rolls and Tricky facts for the rest; Tricky, Master and Legend games now last about as long as Hard ones.
- The project is now a Turborepo of Vite apps and shared packages. `npm start` builds and serves everything; the other games moved from `prototypes/*.html` to `/<name>/`.
- Running the server now needs Node 26 or newer (it was 22.12).
- On Chromebooks, laptops and iPads held sideways, the main menu is laid out in two columns (modes and menu on the left, settings on the right), so Start is on screen without scrolling. Phones and portrait screens keep the one column.

### Removed
- Permanent parent codes: grown-ups link a child with a one-time code instead.

### Fixed
- A class no longer shows "lost" when the server is restarting or busy for a moment: the page switches to polling and keeps trying until the class answers, and only gives up when the class is really gone.
- A web address with a broken `%` escape (like `/%E0`) no longer stops the server for everyone; it gets a `400` answer. Request bodies that are cut off or arrive too slowly are answered too, instead of waiting forever.

### Security
- Keycloak access tokens last 15 minutes instead of 8 hours, and the game renews them with the refresh token while the Keycloak session lasts. Dev sign-in tokens last 12 hours instead of 30 days.
- Rate limits: guessing class, room or parent codes is stopped after a run of wrong ones, and dev sign-in and joining are limited per address and account. Behind a proxy, set `TRUST_PROXY`.
- A Content Security Policy: pages run only Blockout's own scripts (the theme script moved out of the page into `theme.js`) and talk only to Blockout and the sign-in provider.
- Every response, redirects and live-class streams included, now carries the security headers, plus a `Permissions-Policy` (no camera, microphone or location) and, over HTTPS, `Strict-Transport-Security`. A production server no longer tells anyone its own network addresses.
- With `NODE_ENV=production` the server refuses to start with the practice dev sign-in or without an `https://` public address, and every setting is checked at start-up.
- API errors no longer carry internal details, and every response has basic browser security headers.
- Only a student's first name, last initial, role and email domain are stored; see [Privacy](https://github.com/DeepSpaceCartel/blockout/blob/v0.4.0/docs/privacy.md).

## [0.2.0] - 2026-09-23

### Added
- Classroom multiplayer: a whole class on the same rolls, pairs on a shared board, and tournaments (knockout, double elimination, round robin, Swiss, king of the hill), run from the teacher's screen with a join code, link and QR code.
- Home multiplayer for 2–4 players on one screen.
- Shop with skill-tree unlocks, Wardrobe, stickers, achievements shown one at a time, stats and the Times Table.
- Practice mode with Learn and Expert levels, timers and finishing bonuses.
- Username checks for classroom names.

## [0.1.0] - 2026-09-23

### Added
- The first playable Blockout: roll two dice, draw the rectangle, answer the multiplication, against the CPU.

<!-- No release tags yet: the links point at the release commits (tag them v0.1.0 and v0.2.0 to switch to compare/v0.1.0...v0.2.0). -->
[Unreleased]: https://github.com/DeepSpaceCartel/blockout/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/DeepSpaceCartel/blockout/compare/v0.4.1...v0.5.0
[0.4.1]: https://github.com/DeepSpaceCartel/blockout/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/DeepSpaceCartel/blockout/compare/4921120...v0.4.0
[0.2.0]: https://github.com/DeepSpaceCartel/blockout/compare/382b38c...4921120
[0.1.0]: https://github.com/DeepSpaceCartel/blockout/tree/382b38c
