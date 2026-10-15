<title>Configuration</title>

# Configuration

The server (`node apps/server/src/index.js`, or `npm start`) is configured with arguments and environment variables. They're all read and checked at start-up (`apps/server/src/config.js`): a bad value stops the server with a message instead of running with a default.

## Arguments

| Argument | Default | Meaning |
|---|---|---|
| `<port>` (a bare number) | `8080` (or `PORT`) | Port to listen on |
| `--public-url <url>` | none (or `PUBLIC_URL`) | The address students use when it isn't this computer's own, for example a tunnel. Class join links and QR codes use it. |

## Environment variables

| Variable | Default | Meaning |
|---|---|---|
| `NODE_ENV` | none | `production` for a public server: Blockout then refuses to start unless `BLOCKOUT_AUTH=keycloak` and `PUBLIC_URL` is an `https://` address, listing everything that's missing |
| `PORT` | `8080` | Port, when no port argument is given |
| `PUBLIC_URL` | none | Same as `--public-url` |
| `TRUST_PROXY` | `0` | How many proxies (a gateway, a tunnel) sit in front of the server. Rate limits then use the client address the nearest proxy saw in `X-Forwarded-For`; with `0` that header is ignored, because anyone can send it |
| `BLOCKOUT_DB` | `data/blockout.db` (repo root) | The sqlite file for accounts; `:memory:` keeps nothing (tests) |
| `BLOCKOUT_AUTH` | `dev` | Sign-in provider: `dev` or `keycloak` |
| `BLOCKOUT_AUTH_SECRET` | generated, kept in the database | Dev sign-in's token secret |
| `KEYCLOAK_ISSUER` | none | With `BLOCKOUT_AUTH=keycloak`: the realm URL, for example `https://id.example.org/realms/blockout` |
| `KEYCLOAK_CLIENT_ID` | none | With `BLOCKOUT_AUTH=keycloak`: the public client's ID |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` or `silent` |
| `LOG_FORMAT` | `json` in production, otherwise `text` | `json`: one JSON object per line with OpenTelemetry field names (`timestamp`, `severity_text`, `event.name`, `http.route`, …) for a log stack. `text`: short lines for a terminal; request lines only at `LOG_LEVEL=debug` |
| `OPENAI_API_KEY` | none | Adds OpenAI's free moderation model to the name check for guests joining live classes. Without it only the built-in word list runs, and no names leave the server. |

## Schools

Schools are rows in the database with an email domain. The first, **Cadence Park** (`iusd.org`), is created automatically.
