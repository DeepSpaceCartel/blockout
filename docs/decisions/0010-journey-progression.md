<title>ADR-0010</title>

# ADR-0010: Boards and difficulties are Journey levels, not Shop items

Status: accepted
Date: 2026-10-17

## Context

Boards (8×8 up to 24×24, Custom) and difficulties (Medium up to Legend) were Shop chains. Each board also needed a win on the one before (`winOn`), and each difficulty needed most of the Times Table mastered (`masterUpTo`, `mastery`). Every player started on 6×6 with 6-sided dice.

Children had to decide on their own where to go next. The mastery gates were invisible until met, and the menu showed every chain at once: difficulty, board, level and timer, plus locks and skeletons.

## Decision

Single player follows one path, the **Journey** (`packages/progress/src/levels.js`):

- **Levels 1–12.** Level *n* is an *n*×*n* board with an *n*-sided die, so a new player starts on 1×1 with a 1-sided die.
- **Levels 13–18.** Challenges: 16×16, Tricky, 20×20, Master, Legend, 24×24.
- **Moving up.** Beat the CPU on your current level with at least 80 % of your answers right first try (`recordLevelGame`).

Reaching a level grants the board and difficulty ids it stands for (`board8`, `difficulty.medium`, …). These ids stay in `SHOP` with a `journey` level and are never sold. Everything keyed on them keeps working: Free play, per-difficulty Expert and practice chains, homework and the classroom.

**Free play** opens at Level 6 and offers only what the Journey has reached.

Old saves get the `journeyV1` migration. It places a save on the highest level its unlocks or wins reach, and on Level 6 at least once it has played. It never takes anything away.

## Consequences

- **Menu:** single player is one card and one button ("Play Level 7"). The board and difficulty pickers appear only in Free play, and nothing locked is shown there.
- **Shop:** it sells modes, Expert, timers, practice, settings and looks. Points no longer buy boards or difficulties.
- **Removed gates:** `winOn` and `masterUpTo`/`mastery` are gone. `tableReady` stays for Master's dice and stats.
- **Engine:** it plays any die from 1 to 12 sides (`createMatch({ sides })`). Dice of 4 sides or fewer roll every face evenly.
- **Going back would need another migration:** saves now hold `journey.level`, and the granted ids are in `unlocks`.
