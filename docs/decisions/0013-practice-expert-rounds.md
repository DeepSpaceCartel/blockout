<title>ADR-0013</title>

# ADR-0013: Practice's Journey has Expert rounds, and Expert practice and its timers are reached, not bought

Status: accepted
Date: 2026-10-17
Supersedes: the Practice rounds in [ADR-0012](0012-journey-stages.md)

## Context

[ADR-0012](0012-journey-stages.md) gave each times table three rounds of 5, 10 and 20 questions, all in Learn. Expert practice (no picture, no "Help me count", double bonus points) and its answer timers were still Shop items. A child who never bought them never answered without help or against the clock.

## Decision

Each table has five rounds:

| Round | Questions | Mode |
|---|---|---|
| 1 | 5 | Learn |
| 2 | 10 | Learn |
| 3 | 20 | Learn |
| 4 | 10 | Expert |
| 5 | 10 | Expert with a timer |

That makes 60 Practice levels. Each round needs 4 out of 5 right first try, and a timeout counts as missed.

**The timer** gets shorter along each difficulty's tables (`TIMERS` in `levels.js`):

| Difficulty | Tables and timers |
|---|---|
| Easy | ×1–×2: 30 s · ×3–×4: 10 s · ×5–×6: 5 s |
| Medium | ×7: 10 s · ×8: 5 s |
| Hard | ×9: 30 s · ×10: 10 s · ×11–×12: 5 s |

**On the Journey,** the round decides Learn or Expert and the timer, so the menu hides those choices.

**For Free practice,** each item is unlocked by the first round that brings it, for its difficulty:
- **Expert** comes on round 4 of a difficulty's first table: ×1 for Easy, ×7 for Medium, ×9 for Hard, ×12 for the difficulties after Hard.
- **Each timer** comes on round 5 of the first table that uses it, together with the longer timers if they haven't come yet. The difficulties after Hard get all three on ×12.
- **None of these are sold** any more.

Saves from 0.8 keep their table and round (`practiceJourneyV3`). Anything already bought is kept.

## Consequences

- **Everyone practices without help and against the clock,** a little at a time, as their tables grow.
- **Practice's Journey is longer:** 60 levels.
- **The Shop is smaller:** it sells nothing for Practice. Left are multiplayer, single player's Expert and timers, settings and looks.
