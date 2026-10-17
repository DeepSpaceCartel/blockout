<title>ADR-0005</title>

# ADR-0005: Game modules declare at import and do their load-time work in `run()`

Status: accepted
Date: 2026-09-23

## Context

The multiplication game was one immediately-invoked function of about 6,300 lines. Its sections shared top-level variables, and a lot of code ran at load in a particular order: element lookups, event listeners, the first render. Splitting it into ES modules could change that order, because a module's body runs when it's first imported, and the sections import each other in cycles.

## Decision

We will split it into one module per section (`apps/multiplication/src/game/*.js`):
- **At import, only declarations:** functions, and constants whose initialisers run nothing.
- **Load-time work goes in `export function run()`,** kept in its original order within the section.
- **`game/index.js` calls every module's `run()`** in the original section order.
- **Variables written from another module get a setter** in their home module (`setGame`, `setGameId`, `setPractice`, `setWardrobeFilter`).

The split was done by a one-off script using a JavaScript parser and scope analysis, so every cross-module reference became an import or export mechanically. It was checked with the same Playwright pass before and after.

## Consequences

- **Behaviour is unchanged,** and circular imports between game modules are safe, because nothing is used before `run()`.
- **A new rule to follow:** no work at import in `src/game/*.js`. It's written down in CLAUDE.md.
- **The modules are still large,** and some are tightly coupled (`play.js` is about 1,100 lines). Splitting them further, and moving shared UI such as toasts, banners and dialogs into `@blockout/ui`, is follow-up work.
