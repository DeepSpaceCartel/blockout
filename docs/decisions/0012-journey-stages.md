<title>ADR-0012</title>

# ADR-0012: Each Journey level has three stages; Practice's longer rounds are stages too

Status: accepted
Date: 2026-10-17
Supersedes: the level shapes in [ADR-0010](0010-journey-progression.md) and [ADR-0011](0011-practice-journey.md)

## Context

With one level per board (18) and one per table (12), each step up was a big jump. A child could pass 7×7 on one lucky game and be on 8×8 next. Practice's 10- and 20-question rounds were still Shop items, one more choice on the menu.

ADR-0011 also had Practice levels ask every table up to × 12, so ×6 asked 3 × 12. Practice had always gone up to its difficulty's dice.

## Decision

**The game's Journey: 42 levels.** Each board from 1×1 to 12×12 has three stages, and each stage asks a little more than the one before:
1. Beat the CPU with 4 out of 5 answers right first try.
2. The same, without "Help me count".
3. The same, and claim more than half the board.

The six challenges (16×16, Tricky, 20×20, Master, Legend, 24×24) are one level each. A board's unlocks come with its first stage, and each stage passed pays 10 points × the board's size.

**Practice's Journey: 36 levels.** Each table ×1 to ×12 has three rounds: 5, then 10, then 20 questions. Each needs 4 out of 5 right first try.
- **Facts:** they go up to the table's dice: 6 for ×1–×6, 8 for ×7–×8, 12 from ×9. Review questions follow the same limit.
- **Longer rounds:** reaching a table's second and third rounds unlocks 10- and 20-question rounds for Free practice. Easy's come on ×1, Medium's on ×7, Hard's on ×9, and the later difficulties' on ×12. These items leave the Shop.

**Migrations.** Saves from 0.6–0.7 move to the first stage of the board or table they were on (`journeyV2`, `practiceJourneyV2`), and nothing is taken away. The goals live in `levelResult` and the shapes in `levels.js` (`STEPS`, `LEVELS`, `PRACTICE_LEVELS`).

## Consequences

- **Smaller steps:** more of them, each with a goal a child can see ("now without Help me count").
- **The early boards are short:** 1×1 and 2×2 have three stages too, a few seconds each.
- **Shop:** it no longer sells round lengths, only Expert and its timers among the Practice items.
