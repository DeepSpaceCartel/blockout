import test from 'node:test';
import assert from 'node:assert';
import { createLimiter, clientIp } from '../src/ratelimit.js';

const setup = () => {
  let t = 0;
  const limiter = createLimiter({ now: () => t, rules: { r: { perMinute: 6, burst: 3 } } });
  return { limiter, tick: (ms) => (t += ms) };
};

test('rate limit: a burst, then one token every 60/perMinute seconds', () => {
  const { limiter, tick } = setup();
  for (let i = 0; i < 3; i++) assert.ok(limiter.take('r', 'a').ok);
  const no = limiter.take('r', 'a');
  assert.equal(no.ok, false);
  assert.equal(no.retryAfter, 10);
  assert.ok(limiter.take('r', 'b').ok, 'each key has its own bucket');
  tick(10000);
  assert.ok(limiter.take('r', 'a').ok);
  assert.equal(limiter.take('r', 'a').ok, false);
  tick(10 * 60000);
  for (let i = 0; i < 3; i++) assert.ok(limiter.take('r', 'a').ok, 'refills only up to the burst');
  assert.equal(limiter.take('r', 'a').ok, false);
});

test('rate limit: check looks without taking; full buckets are pruned', () => {
  const { limiter, tick } = setup();
  assert.ok(limiter.check('r', 'a').ok);
  assert.ok(limiter.check('r', 'a').ok);
  for (let i = 0; i < 3; i++) limiter.take('r', 'a');
  assert.equal(limiter.check('r', 'a').ok, false);
  limiter.take('r', 'b');
  tick(60000);
  limiter.prune();
  assert.equal(limiter.size(), 0);
  assert.throws(() => limiter.take('nope', 'a'));
});

test('client address: the socket, or the one the nearest trusted proxy saw', () => {
  const req = (xff) => ({ socket: { remoteAddress: '10.0.0.9' }, headers: xff ? { 'x-forwarded-for': xff } : {} });
  assert.equal(clientIp(req('1.2.3.4')), '10.0.0.9', 'no trusted proxies: X-Forwarded-For is ignored');
  assert.equal(clientIp(req('1.2.3.4'), 1), '1.2.3.4');
  assert.equal(clientIp(req('6.6.6.6, 1.2.3.4'), 1), '1.2.3.4', 'a made-up entry from the client is skipped');
  assert.equal(clientIp(req('6.6.6.6, 1.2.3.4, 10.1.1.1'), 2), '1.2.3.4');
  assert.equal(clientIp(req(''), 1), '10.0.0.9');
});
