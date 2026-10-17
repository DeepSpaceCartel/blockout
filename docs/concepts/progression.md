<title>Progression</title>

# Progression: the Journeys

An 8-year-old shouldn't have to plan a route through a skill tree. The game picks the next step instead: one **Journey** for single player and one for **Practice**. Each moves in small steps.

## The game's Journey

From 4×4 on, each board has three stages, and each stage asks a little more than the one before. The first boards, 1×1 to 3×3, are a game or two each, so they have one stage ([ADR-0014](../decisions/0014-first-boards-one-stage.md)):

| Stage | To move up |
|---|---|
| 1 | Beat the CPU with **4 out of 5 answers right first try** |
| 2 | …without "Help me count" |
| 3 | Beat the CPU with **every answer right first try** |

The boards, in order:

| Levels | Board | Dice |
|---|---|---|
| 1–3 | 1×1, 2×2, 3×3, one stage each | 1-, 2-, 3-sided |
| 4–30 | *n*×*n* from 4×4 to 12×12, three stages each (6×6 is 10–12, 12×12 is 28–30) | *n*-sided (4 to 12) |
| 31 | 16×16 | 12-sided |
| 32 | 12×12 | Tricky |
| 33 | 20×20 | 12-sided |
| 34 | 12×12 | Master |
| 35 | 16×16 | Legend |
| 36 | 24×24 | 12-sided |

How it plays out:
- **Warm-ups first.** The first boards are short: 1×1 is a single square.
- **The board grows with the times tables.** The 6×6 board (Level 10) is where everyone used to start, and 12×12 (Level 28) is the classic game.
- **Rewards.** Each stage passed earns 10 points × the board's size. Reaching 6×6, 12×12 and the end each earn an achievement.
- **The results say what's missing:** the win, the answers, "Help me count", or a slip on stage 3.

## What a board unlocks

Reaching a board's first stage unlocks the board and difficulty it uses:

| Board | Unlocks |
|---|---|
| 7×7 | Medium |
| 8×8 | 8×8 |
| 9×9 | Hard |
| 10×10 | 10×10 |
| 12×12 | 12×12 |
| Levels 31–36 | 16×16, Tricky, 20×20, Master, Legend and 24×24, in that order |

- **Custom boards** unlock after Level 36.
- **Everything that depends on a difficulty follows automatically:** its Expert games and timers, its practice, and homework.
- **Free play** opens on 6×6. It's the old menu with difficulty and board, offering only what the Journey has reached.

## Practice's Journey

Practice is free, and goes one times table at a time, each in five rounds:

| Round | Questions | Mode |
|---|---|---|
| 1 | 5 | Learn |
| 2 | 10 | Learn |
| 3 | 20 | Learn |
| 4 | 10 | Expert: no picture, no "Help me count" |
| 5 | 10 | Expert with a timer |

That makes 60 levels: ×1 is Levels 1–5, ×6 is 26–30, ×12 is 56–60.

**The timer** gets shorter along each difficulty's tables:

| Difficulty | Tables and timers |
|---|---|
| Easy | ×1–×2: 30 s · ×3–×4: 10 s · ×5–×6: 5 s |
| Medium | ×7: 10 s · ×8: 5 s |
| Hard | ×9: 30 s · ×10: 10 s · ×11–×12: 5 s |

- **Moving up:** each round needs 4 out of 5 right first try; a timeout counts as missed. Each round passed earns 5 points × the table.
- **Facts go up to the table's dice,** as Practice always did: 6 for ×1–×6 (6 × 1 to 6 × 6), 8 for ×7 and ×8, 12 from ×9.
- **Review:** about one question in five reviews the tables before, with the same limit.
- **On the Journey, the round decides everything:** its length, Learn or Expert, and the timer.
- **Unlocks for Auto** come with the first round that brings them, for its difficulty:
  - 10 and 20 questions, and Expert, on a difficulty's first table: ×1 for Easy, ×7 for Medium, ×9 for Hard, ×12 for the ones after Hard.
  - Each timer on the first table that uses it.
- **Auto** opens on ×2: the game picks the questions from every table you've reached, in this order until the round is full:
  1. Your *facts to practice*: missed before, and not mastered since (the list Stats shows).
  2. Facts that *need practice* on your Times Table.
  3. *Learning* and *not seen yet* facts, mixed.

  Short of those, it asks them again rather than mastered facts: a mastered fact only comes up once everything you've reached is mastered. The round asks them shuffled. You pick the length, Learn or Expert and the timer from what you've unlocked; there's no table or difficulty to pick.
- **Separate from the game:** the two Journeys move on their own.

## What's still bought

Points buy what changes *how* you play, not *what* you play next:
- Multiplayer
- Single player's Expert and its timers (for the difficulty the level uses)
- Settings such as auto roll, and the Wardrobe's looks

## Older saves

Nobody loses anything:
- **From before the Journey:** a save starts on the highest board its boards, difficulties and wins reach, and on 6×6 at least once it has played. In Practice it starts on the highest table it owns.
- **From 0.6–0.7:** a save starts on the first stage of the board or table it was on.
- **From 0.8–0.9:** a save keeps its board and stage, and its table and round.

The decisions are [ADR-0010](../decisions/0010-journey-progression.md), [ADR-0011](../decisions/0011-practice-journey.md), [ADR-0012](../decisions/0012-journey-stages.md), [ADR-0013](../decisions/0013-practice-expert-rounds.md) and [ADR-0014](../decisions/0014-first-boards-one-stage.md).

The rules are in `@blockout/progress`:
- `levels.js`: the ladders
- `recordLevelGame` and `recordPracticeLevel` in `progress.js`
- `journey.js`: the words and what each level plays

The web game and the phone app both use them.
