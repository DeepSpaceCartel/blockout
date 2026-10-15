<title>HTTP API</title>

# HTTP API

Everything under `/api` on the server. Requests and responses are JSON. The games use these through `@blockout/classroom` and `@blockout/auth`.

## Conventions

- **Sign-in:** endpoints marked with a role need `Authorization: Bearer <token>` from someone with that role. Without a valid token they answer `401`; with the wrong role, `403`.
- **Errors** are [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) problem details (`Content-Type: application/problem+json`):

    ```json
    {
      "type": "about:blank",
      "title": "Unauthorized",
      "status": 401,
      "detail": "Please sign in first.",
      "error": "signin",
      "message": "Please sign in first."
    }
    ```

    `error` is a short machine-readable code, and `message` (the same as `detail`) is written for the player; the games show it as is.
- **Rate limits** answer `429` (`rate`) with a `Retry-After` header in seconds:
    - every request, per address: 6000 a minute (a whole school often shares one address)
    - wrong class, room or parent codes, per address: 30, then 30 a minute. While they're used up, code lookups (joining, room info and actions, `POST /api/me/classes`, `POST /api/children`) get `429` too
    - joining a class or linking a child, per account: 10 a minute
    - dev sign-in, per address: 60 a minute

    Live updates (`/events`, `/poll`) answer `404` for a wrong teacher or player key, the same as for a class that doesn't exist. A class takes at most 200 open event streams, and an address at most 500; past that `/events` answers `429`.
- **Busy classes:** when a class changes too often from several places at once to save a change, the request gets `503` (`busy`); try it again.
- **Bad requests:** an address with a broken `%` escape gets `400` (`bad-request`). A request body that's cut off gets `400` (`aborted`), and one that takes longer than 10 seconds to arrive gets `408` (`timeout`).

## Health

For Kubernetes probes and uptime checks. No sign-in, not rate-limited, `Cache-Control: no-store`.

| Method and path | Answer |
|---|---|
| `GET /health/startup` | `200 { status: 'started' }` once the server is set up; `503` before |
| `GET /health/live` | `200 { status: 'live' }` while the server keeps up; `503` if it has been stuck for 5 seconds or more. It doesn't check the database, so a database outage doesn't restart the server |
| `GET /health/ready` | `200 { status: 'ready' }` when it can take requests; `503` (`starting`, `draining` or `database`) while it starts, shuts down, or can't reach the database |
| `GET /api/health` | `{ ok, lan }`: the addresses students can use (only the public one on a production server) |

On `SIGTERM` or `SIGINT` the server stops taking connections, reports `draining`, ends live-update streams (browsers reconnect) and answers held polls, then exits within 20 seconds.

## Sign-in

| Method and path | Who | Body | Answer |
|---|---|---|---|
| `GET /api/auth/config` | anyone | | `{ provider, issuer?, clientId?, schools: [{ id, name, domain }] }` |
| `POST /api/auth/dev` | anyone, dev sign-in only | `{ role, firstName, lastInitial, email?, schoolId? }` | `{ token, user }` |
| `GET /api/me` | signed in | | `{ user: { id, role, name, firstName, lastInitial, school } }` |

## A student's own data

| Method and path | Who | Body | Answer |
|---|---|---|---|
| `GET /api/me/progress` | signed in | | `{ progress }` (the game's save, or `null`) |
| `PUT /api/me/progress` | signed in | `{ progress }` | `{ ok, updatedAt }`. Cheats and what they unlocked are dropped. |
| `GET /api/me/homework` | student | | `{ homework: [{ id, goal, label, due, status: open\|late\|done, have, need, from, fromName }] }` |
| `GET /api/me/classes` | student | | `{ classes: [{ id, name }] }` |
| `POST /api/me/classes` | student | `{ code }` | `{ class }`. School classes only take that school's email domain. |
| `GET /api/me/parent-code` | student | | `{ code }` for a parent to link |
| `GET /api/me/live` | anyone | | `{ live: [{ id, title, code }] }` tournaments open now for this student |

## Teachers

| Method and path | Body | Answer |
|---|---|---|
| `GET /api/classes` | | `{ classes: [{ id, name, code, school, students }] }` |
| `POST /api/classes` | `{ name }` | the new class |
| `GET /api/classes/:id` | | `{ class, students: [stats], assignments, options }`: `options` is what every student has unlocked |
| `DELETE /api/classes/:id/students/:student` | | `{ ok }` |
| `GET /api/schedules` | | `{ schedules }` |
| `POST /api/schedules` | `{ classId, scope: class\|school, title, startsAt, settings: { format, size, difficulty } }` | `{ schedule }` |
| `DELETE /api/schedules/:id` | | `{ ok }` |
| `GET /api/schedules/:id/host` | | `{ code, teacherKey }` of the opened lobby |

## Parents

| Method and path | Body | Answer |
|---|---|---|
| `GET /api/children` | | `{ children: [stats] }` |
| `POST /api/children` | `{ code }` | `{ child }` |
| `DELETE /api/children/:id` | | `{ ok }` |

## Teachers and parents

| Method and path | Body | Answer |
|---|---|---|
| `GET /api/students/:id` | | the student's stats, homework, recent activity, `facts` and `options` (linked parents, and teachers of their classes) |
| `POST /api/homework` | `{ classId \| studentId, goal, due? }` | `{ assignment }` |
| `DELETE /api/homework/:id` | | `{ ok }` (only whoever set it) |

A `goal` is one of `{ type: 'master', table }`, `{ type: 'practice', rounds, difficulty }`, `{ type: 'win', size, difficulty }` or `{ type: 'games', games }`; `difficulty` may be `any`.

## Live classes

| Method and path | Who | Body | Answer |
|---|---|---|---|
| `GET /api/health` | anyone | | `{ ok, lan: [addresses] }` |
| `POST /api/rooms` | teacher | `{ settings }` | `{ code, teacherKey, lan }` |
| `GET /api/rooms/:code/info` | anyone | | `{ code, type, state }` |
| `POST /api/rooms/:code/join` | anyone | `{ name }` (signed-in students use their account name), or `{ teacher: key }` / `{ play: key }` | `{ id, key, name, teacher }` |
| `POST /api/rooms/:code/result` | player | `{ id, key, … }` | `{ ok, score }` |
| `POST /api/rooms/:code/roll` | player (pairs) | `{ id, key }` | the roll |
| `POST /api/rooms/:code/leave` | player | `{ id, key }` | `{ ok }` |
| `POST /api/rooms/:code/teacher` | teacher key | `{ key, action, … }`: `settings`, `pairOptions`, `swap`, `start`, `next`, `autoNext`, `end`, `lobby`, `remove`, `close` | `{ ok }` |
| `GET /api/rooms/:code/events` | teacher or player | query `teacher=KEY` or `id=ID&key=KEY` | Server-Sent Events: the room as that person sees it |
| `GET /api/rooms/:code/poll` | teacher or player | the same, plus `v=VERSION` | the next view (long poll, for proxies that buffer event streams) |
