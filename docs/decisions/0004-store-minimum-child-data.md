<title>ADR-0004</title>

# ADR-0004: Keep only a first name, last initial, role and email domain for each person

Status: accepted
Date: 2026-09-23

## Context

Most players are under 13 and in California schools, which brings in FERPA, COPPA and SOPIPA. Keycloak and Google sign-in will hand us full names and email addresses. The features only need to tell children apart within a class and know which school they belong to.

## Decision

We will store, for each person:
- the first name and last initial ("Maya K."), and the role
- the email **domain** only (to match a school)
- the sign-in provider's opaque subject ID

Nothing else about identity: no full names, email addresses or birthdays. Signed-in students' names are not sent to OpenAI's name check. `identity()` in `apps/server/src/auth.js` is where this is enforced, and a unit test checks that the full name and address never reach the database.

## Consequences

- **Less to protect and less to leak.** [Privacy](../privacy.md) can promise it plainly.
- **We can't email anyone,** or tell apart two classmates with the same first name and last initial (they'd need to be told apart some other way).
- **Adding any personal field later needs a new ADR** and a privacy review.
