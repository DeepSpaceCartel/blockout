// Live classes kept in Redis (we run Valkey, which speaks the same protocol),
// shared by every server: the same interface as memory.js, where it's described.
//
// Keys, for a class code C:
//   room:{C}            hash: v (version), s (the room as JSON)
//   room:{C}:presence   hash: who has a stream open on which server, who polled when
//   room:{C}:live       hash: a pair's move in progress, by match
//   closed:{C}          set for a while after the class closes
//   rooms:active        set of the codes in use (for servers looking for rooms without an owner)
//   lease:NAME          the owner of a room, or of a job
// and a channel per class, room:{C}, for "it changed" messages.
//
// Changes that must happen together (write only if still at version v, then
// tell everyone) are Lua scripts, which Redis runs one at a time.
import { createClient } from 'redis';

const CREATE = `
if redis.call('EXISTS', KEYS[1]) == 1 or redis.call('EXISTS', KEYS[2]) == 1 then return 0 end
redis.call('HSET', KEYS[1], 'v', 0, 's', ARGV[1])
redis.call('PEXPIRE', KEYS[1], ARGV[2])
redis.call('SADD', KEYS[3], ARGV[3])
return 1`;

const CAS = `
if redis.call('HGET', KEYS[1], 'v') ~= ARGV[1] then return 0 end
local v = tonumber(ARGV[1]) + 1
redis.call('HSET', KEYS[1], 'v', v, 's', ARGV[2])
for i = 1, 3 do redis.call('PEXPIRE', KEYS[i], ARGV[3]) end
redis.call('SADD', KEYS[4], ARGV[4])
redis.call('PUBLISH', ARGV[5], '{"t":"v","v":' .. v .. '}')
return 1`;

const CLOSE = `
redis.call('DEL', KEYS[1], KEYS[2], KEYS[3])
redis.call('SET', KEYS[4], '1', 'PX', ARGV[1])
redis.call('SREM', KEYS[5], ARGV[2])
redis.call('PUBLISH', ARGV[3], '{"t":"closed"}')
return 1`;

// Taken if free, renewed if it's already this owner's
const ACQUIRE = `
local owner = redis.call('GET', KEYS[1])
if not owner then redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2]) return 1 end
if owner == ARGV[1] then redis.call('PEXPIRE', KEYS[1], ARGV[2]) return 1 end
return 0`;

const RELEASE = `
if redis.call('GET', KEYS[1]) == ARGV[1] then redis.call('DEL', KEYS[1]) end
return 1`;

// prefix: keeps several Blockouts (or test runs) apart in one Redis
async function createRedisBackend(url, { prefix = '', fieldsTtlMs = 4 * 60 * 60 * 1000, log = null } = {}) {
  const ACTIVE = `${prefix}rooms:active`;
  const k = (code) => ({
    room: `${prefix}room:{${code}}`,
    presence: `${prefix}room:{${code}}:presence`,
    live: `${prefix}room:{${code}}:live`,
    closed: `${prefix}closed:{${code}}`,
    channel: `${prefix}room:{${code}}`,
  });
  const client = createClient({ url });
  // Messages need a connection of their own (a subscribed connection does nothing else)
  const sub = client.duplicate();
  for (const c of [client, sub]) c.on('error', (e) => log && log.warn('redis.error', { 'exception.type': e.name, 'exception.message': e.message }));
  await client.connect();
  await sub.connect();
  const run = (script, keys, args) => client.eval(script, { keys, arguments: args.map(String) });

  return {
    kind: 'redis',
    client, // (shared with the rate limits)
    async create(code, json, ttlMs) {
      const key = k(code);
      return (await run(CREATE, [key.room, key.closed, ACTIVE], [json, ttlMs, code])) === 1;
    },
    async read(code) {
      const [v, s] = await client.hmGet(k(code).room, ['v', 's']);
      return s === null || s === undefined ? null : { v: Number(v), s };
    },
    async cas(code, v, json, ttlMs) {
      const key = k(code);
      return (await run(CAS, [key.room, key.presence, key.live, ACTIVE], [v, json, ttlMs, code, key.channel])) === 1;
    },
    async touch(code, ttlMs) {
      const key = k(code);
      await Promise.all([key.room, key.presence, key.live].map((x) => client.pExpire(x, ttlMs)));
    },
    async close(code, closedTtlMs) {
      const key = k(code);
      await run(CLOSE, [key.room, key.presence, key.live, key.closed, ACTIVE], [closedTtlMs, code, key.channel]);
    },
    isClosed: async (code) => (await client.exists(k(code).closed)) === 1,
    active: () => client.sMembers(ACTIVE),
    async forget(code) {
      if (!(await client.exists(k(code).room))) await client.sRem(ACTIVE, code);
    },
    async setField(code, kind, field, value) {
      const key = k(code)[kind];
      await client.hSet(key, field, String(value));
      await client.pExpire(key, fieldsTtlMs);
    },
    async delField(code, kind, field) {
      await client.hDel(k(code)[kind], field);
    },
    fields: (code, kind) => client.hGetAll(k(code)[kind]),
    async publish(code, message) {
      await client.publish(k(code).channel, JSON.stringify(message));
    },
    async subscribe(code, fn) {
      const listener = (text) => {
        try {
          fn(JSON.parse(text));
        } catch (e) {
          log && log.warn('redis.bad_message', { 'exception.message': e.message });
        }
      };
      await sub.subscribe(k(code).channel, listener);
      return () => sub.unsubscribe(k(code).channel, listener);
    },
    acquire: async (name, owner, ttlMs) => (await run(ACQUIRE, [`${prefix}lease:${name}`], [owner, ttlMs])) === 1,
    async release(name, owner) {
      await run(RELEASE, [`${prefix}lease:${name}`], [owner]);
    },
    ping: async () => (await client.ping()) === 'PONG',
    async quit() {
      await Promise.allSettled([sub.close(), client.close()]);
    },
  };
}

export { createRedisBackend };
