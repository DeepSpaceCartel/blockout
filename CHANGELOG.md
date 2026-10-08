# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Work towards 0.3.0 on the `v0.3.0` branch. Details and decisions: [the v0.3.0 work log](https://github.com/alexanderilyin/blockout/blob/v0.3.0/docs/v0.3.0-log.md).

### Added
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
- In the other games, Medium, Hard, 20-question practice, Expert practice and Home multiplayer are now unlocked with points.
- Hosting a class now needs a teacher sign-in.
- Legend deals teens (like 14 × 7) for half of its rolls and Tricky facts for the rest; Tricky, Master and Legend games now last about as long as Hard ones.
- The project is now a Turborepo of Vite apps and shared packages. `npm start` builds and serves everything; the other games moved from `prototypes/*.html` to `/<name>/`.

### Security
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
