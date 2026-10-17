<title>ADR-0002</title>

# ADR-0002: Sign-in behind one provider interface — dev sign-in now, Keycloak later

Status: accepted
Date: 2026-09-23

## Context

Teachers, parents and students need accounts (class rosters, stats, homework), but real registration is planned with Keycloak, which will also bring in school Google accounts (`@iusd.org` for Cadence Park). The account features need to be built and tried before Keycloak exists, and guests must always be able to play.

## Decision

We will check every request's bearer token through one provider interface on the server (`apps/server/src/auth.js`):
- **Both providers return the same claims:** `sub`, `given_name`, `family_name`, `email`, `roles`. `identity()` turns those claims into what we store.
- **The dev provider** issues and checks HMAC-SHA256 JWTs from a "pick a name and role" form. Its secret is kept in the database.
- **The Keycloak provider** checks RS256 JWTs against the realm's published keys (JWKS), and checks the issuer and client. The browser (`@blockout/auth`) signs in with OpenID Connect and PKCE.
- **Roles** come from the token's realm roles. With no role, a school-domain account is a student and anyone else a parent.

## Consequences

- **Switching to Keycloak is configuration:** `BLOCKOUT_AUTH=keycloak`, `KEYCLOAK_ISSUER` and `KEYCLOAK_CLIENT_ID`. The rest of the server never sees which provider signed a token.
- **Dev sign-in must never be enabled on a public production server,** because anyone can pick any role there (see [Security](../concepts/security.md)).
- **Not built yet:**
  - Keycloak's token refresh: when a token expires, the player signs in again.
  - Testing against a real Keycloak: the RS256 path has only been checked with a generated key in the unit tests.
