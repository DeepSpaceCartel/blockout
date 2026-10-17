# Blockout

A multiplication game for 3rd graders, based on "Blockout" from [Math for Love](https://mathforlove.com/). Roll two dice, draw that rectangle on the grid, say how many squares it is, and claim the most of the board. It runs in the browser, mostly on classroom Chromebooks.

It has:
- **Single player** against the CPU, **Practice**, and **Home** multiplayer on one screen.
- **Classroom:** whole class on the same rolls, pairs, and tournaments.
- **Optional accounts:** teachers see class stats and set homework; parents follow their child. Guests can always play.
- **More games** for other operations: addition, subtraction, division and fractions.

## Getting started

```sh
npm install
npm start          # build everything and serve it on http://localhost:8080
npm run dev        # Vite dev server (http://localhost:5173) + the API server with reload
npm test           # unit tests for every app and package
npm run lint       # ESLint
```

- **Node:** needs Node 26 or newer. The server uses the built-in `node:sqlite`.
- **Sharing through a tunnel:** run `cloudflared tunnel --url http://localhost:8080`, then `npm start -- --public-url https://<name>.trycloudflare.com` so the class join links and QR codes use the tunnel's address.

## Layout

A [Turborepo](https://turbo.build/) of plain JavaScript (ES modules, no framework), built with [Vite](https://vite.dev/).

| Path | What |
|---|---|
| `apps/multiplication` | The main game, served at `/` |
| `apps/addition`, `apps/subtraction`, `apps/division`, `apps/fraction-*` | The other games, at `/<name>/` |
| `apps/more-games` | The More games page (`/more-games/`) |
| `apps/server` | Serves the built games; runs classrooms (live updates over SSE, with long polling as a fallback) and accounts (sqlite) |
| `packages/engine` | Board, dice, placement and CPU; the other operations' rules |
| `packages/progress` | Wallet, shop (skill-tree unlocks), achievements, fact stats, bonuses, homework goals, Wardrobe |
| `packages/ui` | Shared look: colour tokens, CSS, icon sprite, a Vite plugin for every page |
| `packages/game-kit` | The shared page engine for the other games |
| `packages/classroom` | Browser client for the classroom server |
| `packages/auth` | Browser sign-in (dev sign-in now; Keycloak with PKCE later) and progress sync |

## Documentation

The docs site is in `docs/` ([MkDocs Material](https://squidfunk.github.io/mkdocs-material/)); build it with `mkdocs serve` (see [Installing](docs/project/installing.md#the-docs-site)). Good places to start:
- [Welcome](docs/home/index.md) and [Quickstart](docs/home/quickstart.md)
- the guides for [teachers](docs/guides/teachers.md) and [parents](docs/guides/parents.md)
- [Architecture](docs/concepts/architecture.md), [Privacy](docs/privacy.md) and the [decision log](docs/decisions/index.md)
- [CHANGELOG.md](CHANGELOG.md)

`CLAUDE.md` has the conventions for working on the code.

## Accounts and sign-in

- **For now, dev sign-in:** pick a name and a role (student, teacher or parent).
- **Keycloak later:** set `BLOCKOUT_AUTH=keycloak`, `KEYCLOAK_ISSUER` and `KEYCLOAK_CLIENT_ID`. It can bring in Google sign-in, limited to a school's domain (the first school is Cadence Park, `@iusd.org`).
- **Stored:** first name, last initial, role and email domain. See [Privacy](docs/privacy.md).
