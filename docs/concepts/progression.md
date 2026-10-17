<title>Progression</title>

# Progression: the Journey

An 8-year-old shouldn't have to plan a route through a skill tree. In single player, the game picks the next step: **the Journey**.

## The levels

| Level | Board | Dice |
|---|---|---|
| 1–12 | *n*×*n* | *n*-sided (1 to 12) |
| 13 | 16×16 | 12-sided |
| 14 | 12×12 | Tricky |
| 15 | 20×20 | 12-sided |
| 16 | 12×12 | Master |
| 17 | 16×16 | Legend |
| 18 | 24×24 | 12-sided |

How it plays out:
- **The first levels are short warm-ups.** Level 1 is a single 1×1 square.
- **The times tables grow with the board.** By Level 6 a player is where everyone used to start (6×6, 6-sided dice). By Level 12 they're on the classic 12×12 game.
- **Moving up:** beat the CPU on your level with **4 out of 5 answers right first try** (80 %). A lucky win with lots of wrong answers doesn't count, and the results say what's missing.
- **Each step up** earns 10 points × the level just finished. Reaching Level 6, Level 12 and the end each earn an achievement.

## What a level unlocks

Reaching a level unlocks the boards and difficulties it uses:

| Level | Unlocks |
|---|---|
| 7 | Medium |
| 8 | 8×8 |
| 9 | Hard |
| 10 | 10×10 |
| 12 | 12×12 |
| 13–18 | 16×16, Tricky, 20×20, Master, Legend and 24×24, in that order |

Finishing Level 18 unlocks Custom boards. Everything that depends on a difficulty follows automatically: its Expert games and timers, its practice, and homework.

**Free play** opens at Level 6. It is the old menu, with difficulty and board, offering only what the Journey has reached.

## What's still bought

Points buy what changes *how* you play, not *what* you play next:
- Practice mode and its times tables, and multiplayer
- Expert and its timers (for the difficulty the level uses)
- Settings such as auto roll, and the Wardrobe's looks

## Older saves

A save from before the Journey starts on the highest level its boards, difficulties and wins reach. A save that has played starts on Level 6 at least. Nobody loses anything ([ADR-0010](../decisions/0010-journey-progression.md)).

The rules are in `@blockout/progress`:
- `levels.js`: the ladder
- `recordLevelGame` in `progress.js`
- `journey.js`: the words and what each level plays

The web game and the phone app both use them.
