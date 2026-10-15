// Rate limits: token buckets, one per (rule, key), where the key is a client
// address or an account. A bucket holds up to `burst` tokens and refills at
// `perMinute`; each counted request takes one. Pure apart from the clock, which
// is injected. The buckets live in memory (one server); several servers will
// share them in Redis.
//
// A whole school usually reaches us from one address, so limits on addresses
// are generous, and code guessing is limited by counting misses (wrong codes),
// not tries.

const RULES = {
  // any request, per address: far above a class of 40 polling at once
  request: { perMinute: 6000, burst: 6000 },
  // wrong class, room or parent codes, per address: a class of mistypers is fine, guessing 300,000+ codes isn't
  miss: { perMinute: 30, burst: 30 },
  // joining a class or linking a child, per account
  codeTry: { perMinute: 10, burst: 10 },
  // the practice dev sign-in, per address (a whole class signs in at once)
  devSignIn: { perMinute: 60, burst: 60 },
};

function createLimiter({ now = () => Date.now(), rules = RULES, maxBuckets = 100000 } = {}) {
  const buckets = new Map(); // `${rule}|${key}` -> { tokens, at }

  function bucket(rule, key) {
    const spec = rules[rule];
    if (!spec) throw new Error(`no rate rule ${rule}`);
    const id = `${rule}|${key}`;
    const t = now();
    let b = buckets.get(id);
    if (!b) {
      if (buckets.size >= maxBuckets) prune(t);
      b = { tokens: spec.burst, at: t };
      buckets.set(id, b);
    }
    b.tokens = Math.min(spec.burst, b.tokens + ((t - b.at) / 60000) * spec.perMinute);
    b.at = t;
    return { b, spec };
  }

  // Seconds until one token is back
  const wait = (b, spec) => Math.max(1, Math.ceil(((1 - b.tokens) / spec.perMinute) * 60));

  // Is there a token left? (doesn't take it)
  function check(rule, key) {
    const { b, spec } = bucket(rule, key);
    return b.tokens >= 1 ? { ok: true } : { ok: false, retryAfter: wait(b, spec) };
  }

  // Take a token if there is one
  function take(rule, key) {
    const { b, spec } = bucket(rule, key);
    if (b.tokens < 1) return { ok: false, retryAfter: wait(b, spec) };
    b.tokens -= 1;
    return { ok: true };
  }

  // Forget full buckets (they're the same as no bucket)
  function prune(t = now()) {
    for (const [id, b] of buckets) {
      const spec = rules[id.slice(0, id.indexOf('|'))];
      if (b.tokens + ((t - b.at) / 60000) * spec.perMinute >= spec.burst) buckets.delete(id);
    }
  }

  return { check, take, prune, size: () => buckets.size };
}

// The client's address. Behind `trustProxy` proxies (a gateway, a tunnel), it's the
// address the nearest of them saw: that many entries from the end of
// X-Forwarded-For. Anything further left could be made up by the client.
function clientIp(req, trustProxy = 0) {
  const socket = (req.socket && req.socket.remoteAddress) || '';
  if (!trustProxy) return socket;
  const hops = String(req.headers['x-forwarded-for'] || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!hops.length) return socket;
  return hops[Math.max(0, hops.length - trustProxy)];
}

export { RULES, createLimiter, clientIp };
