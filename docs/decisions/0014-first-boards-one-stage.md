<title>ADR-0014</title>

# ADR-0014: The first boards have one stage, and stage 3 asks for every answer right first try

Status: accepted
Date: 2026-10-17
Supersedes: the stages in [ADR-0012](0012-journey-stages.md): those of 1×1 to 3×3, and stage 3's goal

## Context

[ADR-0012](0012-journey-stages.md) gave every board from 1×1 to 12×12 three stages, the third being "claim more than half the board". In play that didn't work:
- **1×1** is one square, played three times over.
- **More than half the board was mostly luck.** One CPU rectangle can be half of 2×2. On bigger boards, the squares you end up with depend on the dice and on whether the board fills.
- **A win wasn't enough.** Points include bonuses, so players won and still fell short. They got stuck on "So close! Now claim more than half the board" (reported on 4×4, Level 12 in 0.9.0).

## Decision

- **First boards:** 1×1, 2×2 and 3×3 have one stage each: beat the CPU with 4 out of 5 answers right first try. The three stages start on 4×4 (`STAGES_FROM` in `levels.js`), so the game's Journey has 36 levels.
- **Stage 3:** beat the CPU with **every answer right first try**. That's skill, not the dice. A helped answer isn't first try, so it also covers stage 2's rule.

Saves from 0.8–0.9 keep their board and stage (`journeyV3`). On 1×1 to 3×3, any stage becomes that board's one stage.

## Consequences

- **A quicker start:** a new player reaches 4×4 in three games.
- **Level numbers move:** 6×6 now starts at Level 10, and 12×12 at Level 28.
- **Stage 3 is strict:** one slip means playing again. On big boards that's many answers, and the stage is meant to be the hard one.
