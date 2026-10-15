<title>Privacy</title>

# Blockout and children's privacy

Blockout is used by 3rd graders, mostly under 13, starting at Cadence Park (Irvine Unified School District, California). That brings in FERPA (student education records), COPPA (children under 13 online) and California's SOPIPA (student data held by K–12 services). This page says what we keep and why.

## Guests keep everything on their device
- Playing as a guest (the default) stores nothing on our server. Progress, stats and settings stay in the browser's local storage.
- A live class game keeps only the first name typed in. On a server with Redis (Valkey) it's kept there, with the class's results, until 4 hours after the class's last change or until the teacher closes it, so the class survives a server restart ([ADR-0007](decisions/0007-live-classes-in-redis.md)); otherwise it's in the server's memory. Either way it's gone soon after the class ends.

## Signed-in accounts
When a student, teacher or parent signs in, the server (`apps/server/src/store/`) keeps:

| What | Why |
|---|---|
| First name and **last initial** only | To show names to the teacher and parents ("Maya K.") |
| Role (student, teacher or parent) | To decide who can see what |
| The **email domain** only, e.g. `iusd.org` | To match a school; the address itself is never stored |
| An opaque ID from the sign-in provider | To recognise the same account next time |
| The game save: points, unlocks, which multiplication facts are mastered, recent games | Progress, class stats and homework |
| Class memberships, homework, parent links, scheduled tournaments | The features themselves |
| One-time codes (only a scrambled copy), who made them and who used them; for teachers and grown-ups, who invited them | Making teachers and linking grown-ups, and being able to trace who let whom in |

We don't collect: full names, email addresses, birthdays, photos, location, contacts, device IDs or anything for advertising.

## Who sees a student's data
- **The student.**
- **Teachers of a class the student joined**, through the roster and student pages.
- **Grown-ups linked with a one-time code** the student made on their account page, or their teacher made for them. A teacher can see who is linked and take off a grown-up who shouldn't be.
- **Blockout's admins** (named people with the admin role), who look after accounts and delete them on request. They see names, roles, email domains and dates, not progress.

Nobody else sees it: not other students, other parents or other teachers.

## No third parties
- There's no advertising and no analytics, and no student data is sold or shared.
- Signed-in students' names are not checked with OpenAI.
- The optional OpenAI name check (only when the server has `OPENAI_API_KEY`) only ever sees the first name a *guest* types to join a live class game.
- Sign-in will go through the school's own identity provider: Keycloak, brokering Google sign-in for `@iusd.org`. Only that provider sees email addresses.

## Deleting data
- **A grown-up can delete their child's account,** with everything in it, from the child's page under **👪 My kids**. Teachers and grown-ups can delete their own accounts from their account page.
- **On request from a school or a family,** an admin deletes any account the same way ([Admins](guides/admins.md)).
- Deleting removes the account's progress, class memberships, links, homework, codes, and the classes it teaches (with their rosters, homework and tournaments). It can't be undone.
- Guests can clear their data from Stats → Reset stats, or by clearing the browser's site data.

## Security
- Tokens are signed: HMAC in dev sign-in, RS256 from Keycloak.
- The database is MongoDB in the same cluster as Blockout, with a password (on a single computer without MongoDB, a local sqlite file in `data/`, not in git).
- Deployments must use HTTPS.
