<title>ADR-0007</title>

# ADR-0007: Keep live classes in Redis (Valkey) for up to 4 hours, with one server running each class's timers

Status: accepted
Date: 2026-10-15

## Context

A live class used to live in one server's memory for the length of a lesson. [ADR-0006](0006-mongodb-and-redis.md) puts it in Redis so several servers can run and a restart doesn't end the class. That means:

- **A guest's typed first name now leaves the server's memory.** It sits in Redis for as long as the class runs.
- **Some things a class does on its own** (the CPU's moves in pairs, "roll again when everyone's done", the next tournament round) must still happen exactly once.
- **Changes from different servers can arrive at once.**

## Decision

- **Every room is one JSON document in Redis**, with a version. A change reads it, changes it, and writes it back only if the version hasn't moved; otherwise it tries again. A message on the class's channel tells every server, and each sends its own streams and polls their new view.
- **One server owns each class** through a lease it renews every 5 seconds. Only the owner runs the class's timers. Each timer re-checks the class when it fires, so a timer that fires twice changes nothing the second time. When the owner stops renewing (a crash) or lets go (a shutdown), another server takes the class over within seconds.
- **Who's connected is kept beside the room,** per server and with an expiry, never inside it, so a crashed server's connections drop off by themselves.
- **A pair's move in progress** (dragging a rectangle) goes straight to the two players without a write.
- **A class is deleted 4 hours after its last change,** or as soon as the teacher closes it. Its code then stays unusable for 30 minutes.
- **Code lives in `apps/server/src/live.js`,** over a backend interface implemented for Redis (`roombackend/redis.js`, Lua scripts for the changes that must happen together) and for memory (`roombackend/memory.js`: one server, and tests where several runtimes share it).

## Consequences

- **Privacy:** a guest's first name, and the class's results, are in Redis (in the same cluster, with a password and no disk copy) for at most 4 hours after the class's last change. [Privacy](../privacy.md) says so.
- **A class survives a server restart, a crash and a rolling update.** Browsers reconnect to another server.
- **Timers can be up to ~5 seconds late** after a takeover, and start again from their full length.
- **Redis is needed in production.** Without `BLOCKOUT_REDIS_URL` a server keeps classes in its own memory, which only works for one server.
