<title>ADR-0011</title>

# ADR-0011: Practice is free, and its times tables are Practice Journey levels

Status: accepted
Date: 2026-10-17

## Context

[ADR-0010](0010-journey-progression.md) put single player's boards and difficulties on a Journey. Practice kept its own shop path:
- Practice mode cost 100 points.
- Each times table (×1 to ×12) was bought one at a time.
- Picking tables, a difficulty and a length was up to the child.

Children still had to plan what to practice next, and a child without points couldn't practice at all.

## Decision

Practice has its own Journey (`PRACTICE_LEVELS` in `packages/progress/src/levels.js`):
- **Levels:** Practice level *n* is the ×*n* table (*n*×1 to *n*×12, both ways round). About one question in five reviews the tables before it (`journeyQueue`).
- **Moving up:** a round with at least 80 % of its questions right first try moves you up (`recordPracticeLevel`) and unlocks the next table.
- **Free practice:** picking tables and a difficulty, as before, opens at Practice level 2 and offers only the tables reached.
- **Practice is free.** `practice` and `table1` come with every save, and `practice` and `table1`–`table12` are Practice Journey items in `SHOP` (`practiceJourney`), never sold.
- **Expert, timers and lengths:** Expert, its timers and 10 or 20 questions are still bought, per difficulty. On the Journey they follow the table's difficulty (Easy up to ×6, Medium for ×7 and ×8, Hard from ×9) once the game's Journey has opened it, and Easy until then.

Old saves get the `practiceJourneyV1` migration: they start on the highest table they own, and nothing is taken away.

## Consequences

- **Menu:** Practice is a card and one button ("Practice ×7"), the same as single player.
- **Everyone can practice:** homework and today's practice can always offer a practice task. The daily game task now comes only once every table is mastered.
- **Two separate paths:** Practice and the game's Journey move independently. A child can be on ×9 in practice and Level 5 in the game.
