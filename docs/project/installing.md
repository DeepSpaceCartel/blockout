<title>Installing</title>

# Installing

## What you need

- **Node 26 or newer** (the server uses the built-in `node:sqlite`); CI and the dev container use Node 26.
- **npm** (it comes with Node).

The dev container (`.devcontainer/`, Node 26) has all of this, plus Playwright's Chromium, `cloudflared`, the GitHub CLI, `kubectl` and `helm`, the `coder` CLI, the 1Password CLI (`op`), the docs site's Python venv (`.venv`) and the DeepSpaceCartel Agent Skills for Claude Code. Dev Container Features install the system tools (the local ones are in `.devcontainer/features/`); `postCreateCommand.sh` installs the npm packages and the docs venv. A CI workflow builds the container whenever `.devcontainer/` changes.

## Build and run

```console
$ npm install
$ npm start          # build every app, then serve them on http://localhost:8080
```

| Script | What it does |
|---|---|
| `npm start` | Build, then run the server on port 8080. Extra arguments go to the server: `npm start -- --public-url https://…` |
| `npm run dev` | Vite dev servers with hot reload (the multiplication game on http://localhost:5173, proxying `/api`) and the server with `--watch` |
| `npm run build` | Vite builds every app into `apps/*/dist` |
| `npm test` | Every package's unit tests |
| `npm run lint` | ESLint |

All of them run through Turborepo, which caches results and runs packages in dependency order.

## The docs site

This site is [MkDocs](https://www.mkdocs.org/) with [Material](https://squidfunk.github.io/mkdocs-material/):

```console
$ python3 -m venv .venv && .venv/bin/pip install -r docs/requirements.txt
$ .venv/bin/mkdocs serve          # http://localhost:8000
$ .venv/bin/mkdocs build --strict # what CI would check: broken links fail the build
```

Screenshots in `docs/assets/screenshots/` are taken from the real game with Playwright.
