// Live classes kept in this process: the same interface as the Redis backend,
// for tests and for a single server without Redis. Several runtimes (live.js)
// sharing one memory backend behave like several servers sharing one Redis.
//
// Rooms are kept as JSON text, as Redis keeps them, so anything that wouldn't
// survive being saved (a function, a Map) shows up in tests.
//
// The interface (every method async):
//   create(code, json, ttlMs)        a new room; false if the code is in use or was just closed
//   read(code)                       { v, s } (version, JSON) or null
//   cas(code, v, json, ttlMs)        replace if still at version v (then v + 1, and tell everyone); false if not
//   touch(code, ttlMs)               keep an idle room a while longer
//   close(code, closedTtlMs)         remove it, remember it was closed, tell everyone
//   isClosed(code), active(), forget(code)
//   setField(code, kind, field, value), delField(code, kind, field), fields(code, kind)
//                                    small per-room maps: 'presence' (who's connected where) and 'live' (moves in progress)
//   publish(code, message), subscribe(code, fn) -> unsubscribe
//   acquire(name, owner, ttlMs), release(name, owner)   leases: one owner at a time
//   ping(), quit()

function createMemoryBackend({ now = () => Date.now() } = {}) {
  const rooms = new Map(); // code -> { v, s, expiresAt }
  const closed = new Map(); // code -> expiresAt
  const maps = new Map(); // `${code}|${kind}` -> Map
  const leases = new Map(); // name -> { owner, expiresAt }
  const subscribers = new Map(); // code -> Set of fn

  const alive = (code) => {
    const r = rooms.get(code);
    if (r && r.expiresAt <= now()) {
      rooms.delete(code);
      for (const kind of ['presence', 'live']) maps.delete(`${code}|${kind}`);
      return null;
    }
    return r || null;
  };
  // Messages arrive later, as they would over the network
  const publish = (code, message) => {
    const text = JSON.stringify(message);
    for (const fn of subscribers.get(code) || []) setImmediate(() => fn(JSON.parse(text)));
  };
  const map = (code, kind) => {
    const key = `${code}|${kind}`;
    if (!maps.has(key)) maps.set(key, new Map());
    return maps.get(key);
  };

  return {
    kind: 'memory',
    async create(code, json, ttlMs) {
      if (alive(code) || (closed.has(code) && closed.get(code) > now())) return false;
      rooms.set(code, { v: 0, s: json, expiresAt: now() + ttlMs });
      return true;
    },
    async read(code) {
      const r = alive(code);
      return r ? { v: r.v, s: r.s } : null;
    },
    async cas(code, v, json, ttlMs) {
      const r = alive(code);
      if (!r || r.v !== v) return false;
      Object.assign(r, { v: v + 1, s: json, expiresAt: now() + ttlMs });
      publish(code, { t: 'v', v: v + 1 });
      return true;
    },
    async touch(code, ttlMs) {
      const r = alive(code);
      if (r) r.expiresAt = now() + ttlMs;
    },
    async close(code, closedTtlMs) {
      rooms.delete(code);
      for (const kind of ['presence', 'live']) maps.delete(`${code}|${kind}`);
      closed.set(code, now() + closedTtlMs);
      publish(code, { t: 'closed' });
    },
    async isClosed(code) {
      return closed.has(code) && closed.get(code) > now();
    },
    async active() {
      return [...rooms.keys()].filter((code) => alive(code));
    },
    async forget(code) {
      if (!alive(code)) rooms.delete(code);
    },
    async setField(code, kind, field, value) {
      map(code, kind).set(field, String(value));
    },
    async delField(code, kind, field) {
      map(code, kind).delete(field);
    },
    async fields(code, kind) {
      return Object.fromEntries(map(code, kind));
    },
    async publish(code, message) {
      publish(code, message);
    },
    async subscribe(code, fn) {
      if (!subscribers.has(code)) subscribers.set(code, new Set());
      subscribers.get(code).add(fn);
      return async () => {
        subscribers.get(code)?.delete(fn);
        if (!subscribers.get(code)?.size) subscribers.delete(code);
      };
    },
    // Taken if free (or expired), or renewed if it's already this owner's
    async acquire(name, owner, ttlMs) {
      const l = leases.get(name);
      if (l && l.owner !== owner && l.expiresAt > now()) return false;
      leases.set(name, { owner, expiresAt: now() + ttlMs });
      return true;
    },
    async release(name, owner) {
      if (leases.get(name)?.owner === owner) leases.delete(name);
    },
    async ping() {
      return true;
    },
    async quit() {},
  };
}

export { createMemoryBackend };
