# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Work towards 0.3.0 on the `v0.3.0` branch. Details and decisions: [the v0.3.0 work log](https://github.com/alexanderilyin/blockout/blob/v0.3.0/docs/v0.3.0-log.md).

### Added
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
- Only a student's first name, last initial, role and email domain are stored; see [Privacy](https://github.com/alexanderilyin/blockout/blob/v0.3.0/docs/privacy.md).

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
[Unreleased]: https://github.com/alexanderilyin/blockout/compare/4921120...v0.3.0
[0.2.0]: https://github.com/alexanderilyin/blockout/compare/382b38c...4921120
[0.1.0]: https://github.com/alexanderilyin/blockout/tree/382b38c
