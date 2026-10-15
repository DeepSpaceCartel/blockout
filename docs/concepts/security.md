<title>Security</title>

# Security

What protects Blockout, and what doesn't yet, organised by the chapters of the [OWASP ASVS 5.0](https://owasp.org/www-project-application-security-verification-standard/). The target is the first level (L1): a school game with children's first names and progress in it, not a bank.

## In place

| Area (ASVS chapter) | How |
|---|---|
| Authentication | Sign-in is delegated to a provider ([ADR-0002](../decisions/0002-swappable-sign-in.md)). With Keycloak, passwords and Google sign-in never touch Blockout. |
| Tokens | Every API request's bearer token is verified: an HMAC signature (dev) or RS256 against the realm's keys, plus issuer, client and expiry (Keycloak). Tampered, expired or foreign tokens get `401`. |
| Authorization | Checked on the server for every request: roles (only teachers make classes or host; only students join rosters), ownership (a teacher sees only their classes; homework is removed only by whoever set it), and relationship (a student's page is visible only to linked parents and teachers of their classes). School classes only take students from that school's email domain. |
| Validation | Names, codes, goals, dates and settings are checked and cleaned on the server; request bodies have size limits. |
| Data protection | Only first name, last initial, role and email domain are stored ([ADR-0004](../decisions/0004-store-minimum-child-data.md), [Privacy](../privacy.md)). No third-party analytics or ads. |
| Errors | Errors are RFC 9457 problem details with a message for the player, never a stack trace or internal detail. |
| Browser | Responses carry `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`, a `Permissions-Policy` (no camera, microphone or location) and, over HTTPS, `Strict-Transport-Security`. A Content Security Policy allows only Blockout's own scripts, styles and images and no inline scripts or style attributes, and lets pages talk only to Blockout and the sign-in provider. |
| Live classes | The teacher's controls need the room's secret teacher key; a student's actions need their own player key. |

## Known gaps

| Gap | Why it matters | Plan |
|---|---|---|
| Dev sign-in lets anyone pick any role | Must never be the sign-in on a public server | Keycloak before the first real deployment ([guide](../guides/set-up-keycloak.md)) |
| No rate limiting | Codes (class 6 characters, parent 8, from 31 letters and digits) could be guessed at scale; live class codes are 4 letters but only last a lesson | Rate-limit joins and sign-in per address |
| Tokens are kept in `localStorage` | A cross-site scripting bug could read them | Keep the pages free of injected HTML (the game builds text with `textContent`); the Content Security Policy blocks injected scripts |
| No token refresh or revocation | Dev tokens last 30 days | Short-lived Keycloak tokens with refresh |
| Plain HTTP by default | Tokens could be read on the network | Serve over HTTPS (a tunnel already does) |
| No audit log | Hard to answer "who changed this homework?" | Structured logs for account actions |
