<title>ADR-0001</title>

# ADR-0001: A Turborepo of plain-JavaScript Vite apps and shared packages

Status: accepted
Date: 2026-09-23

## Context

Blockout started as one page with no build step: `index.html`, one stylesheet and a 6,300-line `js/game.js`, with seven more games as prototypes that loaded the same stylesheet. Those games are meant to get the main game's features (wallet, shop, achievements, classroom), and code shared between pages travelled through `window.BlockoutX` globals and a fixed script order. Every new game would have copied more of `game.js`.

## Decision

We will organise the code as an npm-workspaces monorepo run by Turborepo:
- **Apps:** one app per game, a More games hub, and the server.
- **Packages:** shared ones for the engine, progress, UI, game kit, classroom client and sign-in client.
- **Language and build:** the code stays plain JavaScript ES modules with no framework. Each app is built with Vite; the server serves the built apps (multiplication at `/`, the others at `/<name>/`).

### Alternatives considered
- **Keep the single page and add more script tags:** no way to share code without globals and load order, and nothing to stop the prototypes diverging.
- **TypeScript or a UI framework:** a much bigger rewrite than moving files, for code that's working and tested. It can still come later, one package at a time.

## Consequences

- **There's now a build step.** Opening `index.html` from disk no longer works; `npm start` builds and serves.
- **Shared code is imported explicitly** and each package has its own tests; `npm test`, `npm run lint` and `npm run build` run everything through Turborepo.
- **More moving parts:** a lockfile, Vite and Turborepo versions to keep up to date, and URLs that changed from `prototypes/*.html` to `/<name>/`.
