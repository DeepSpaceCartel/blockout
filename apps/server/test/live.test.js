// Live classes across servers (live.js): two runtimes sharing one backend act
// like two servers sharing one Redis. Timings are shrunk to milliseconds. The
// whole suite runs on the memory backend, and on Redis (Valkey) when
// BLOCKOUT_REDIS_URL is set, each server with connections of its own.
import test from 'node:test';
import assert from 'node:assert';
import { EventEmitter } from 'node:events';
import * as Core from '@blockout/engine';
import * as Rooms from '../src/rooms.js';
import { createLive } from '../src/live.js';
import { createMemoryBackend } from '../src/roombackend/memory.js';
import { createRedisBackend } from '../src/roombackend/redis.js';

const FAST = { leaseMs: 120, renewMs: 40, sweepMs: 40, presenceMs: 150, heartbeatMs: 40, pollHoldMs: 300, coalesceMs: 5, liveMs: 5, autoNextMs: 30, roundPauseMs: 30, cpuRollMs: 10, cpuPlaceMs: 10 };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(check, ms = 2000) {
  for (let t = 0; t < ms; t += 10) {
    if (await check()) return true;
    await wait(10);
  }
  return false;
}

// Timers that stop firing when the "server" crashes (no clean hand-over)
function crashable() {
  let dead = false;
  const made = new Set();
  const track = (t) => (made.add(t), t);
  const guard = (fn) => (...a) => !dead && fn(...a);
  return {
    timers: {
      setTimeout: (fn, ms) => track(setTimeout(guard(fn), ms)),
      clearTimeout,
      setInterval: (fn, ms) => track(setInterval(guard(fn), ms)),
      clearInterval,
    },
    crash: () => {
      dead = true;
      for (const t of made) clearTimeout(t);
    },
  };
}

// An HTTP response as an event stream sees it
function fakeRes() {
  const res = new EventEmitter();
  res.chunks = [];
  res.ended = false;
  res.write = (c) => res.chunks.push(c);
  res.end = () => (res.ended = true);
  res.events = () =>
    res.chunks
      .filter((c) => c.startsWith('event:'))
      .map((c) => ({ name: c.split('\n')[0].slice(7), data: JSON.parse(c.split('\n')[1].slice(6)) }));
  res.views = () => res.events().filter((e) => e.name === 'view').map((e) => e.data);
  return res;
}

// Every server a test starts is stopped after it, even when the test fails
const running = [];
test.afterEach(() => Promise.all(running.splice(0).map((stop) => stop())));

// Waits until the room stops changing (who's-here updates settle)
async function settled(live, code) {
  let v = -1;
  for (let i = 0; i < 100; i++) {
    const now = (await live.getRoom(code)).version;
    if (now === v) return v;
    v = now;
    await wait(40);
  }
  return v;
}

// n backends for n servers: one shared memory backend, or n Redis connections
// under a prefix of the test's own
async function serversWith(makeBackends, n = 2) {
  const backends = await makeBackends(n);
  const all = backends.map((backend, i) => {
    const c = crashable();
    const live = createLive({ backend, replicaId: `s${i}`, timers: c.timers, ...FAST });
    live.start();
    return Object.assign(live, { crash: c.crash });
  });
  const stop = () => {
    all.forEach((l) => l.crash());
    return Promise.all(backends.map((b) => b.quit()));
  };
  running.push(stop);
  return { backend: backends[0], all, stop };
}

const placeFor = (room, p) => {
  const [move] = Core.validPlacements(p.board, ...room.roll);
  return move ? { round: room.round, kind: 'placed', rect: { x: move.x, y: move.y, w: move.w, h: move.h }, firstTry: true, ms: 3000 } : { round: room.round, kind: 'timeout' };
};

// (small helpers over rooms.js)
const rJoin = (r, name) => {
  const p = Rooms.join(r, name);
  return { id: p.id, key: p.key };
};
const rStart = (r) => Rooms.start(r);
const rSubmit = (r, who) => {
  const p = Rooms.findPlayer(r, who.id, who.key);
  Rooms.submit(r, p, placeFor(r, p));
};

function suite(name, backends) {
  const servers = (n) => serversWith(backends, n);
  test(`live (${name}): answers sent to two servers at once are all counted`, async () => {
    const { all, stop } = await servers();
    const [a, b] = all;
    const room = await a.createRoom({ type: 'class' });
    const players = [];
    for (let i = 0; i < 30; i++) players.push(await (i % 2 ? b : a).withRoom(room.code, (r) => rJoin(r, `Kid${i}`)));
    await a.withRoom(room.code, (r) => rStart(r));
    const before = (await a.getRoom(room.code)).version;
    await Promise.all(players.map((p, i) => (i % 2 ? b : a).withRoom(room.code, (r) => rSubmit(r, p))));
    const after = await b.getRoom(room.code);
    assert.ok(after.version >= before + 30); // (plus any "who's here" updates)
    assert.ok(after.players.every((p) => p.done), 'every answer landed');
    stop();
  });

  test(`live (${name}): a teacher on one server sees what students do on the other`, async () => {
    const { all, stop } = await servers();
    const [a, b] = all;
    const room = await a.createRoom({ type: 'class' });
    const teacher = fakeRes();
    await a.openStream(room.code, 'teacher', null, teacher);
    await b.withRoom(room.code, (r) => rJoin(r, 'Maya'));
    assert.ok(await until(() => teacher.views().some((v) => JSON.stringify(v).includes('Maya'))));
    // a student's stream on b, and a long poll on a, both hear about the next change
    const who = await b.withRoom(room.code, (r) => rJoin(r, 'Ben'));
    const student = fakeRes();
    await b.openStream(room.code, 'student', who.id, student);
    const v = (await a.getRoom(room.code)).version;
    let polled = null;
    await a.openPoll(room.code, 'student', who.id, v, (body) => (polled = body), () => {});
    await a.withRoom(room.code, (r) => rStart(r));
    assert.ok(await until(() => polled && polled.v > v), 'the held poll was answered');
    assert.ok(await until(() => student.views().some((x) => x.state === 'playing' || JSON.stringify(x).includes('playing'))));
    stop();
  });

  test(`live (${name}): when the owning server dies, another takes over its timers`, async () => {
    const { all, stop } = await servers();
    const [a, b] = all;
    const room = await a.createRoom({ type: 'class' });
    assert.ok(a.owns(room.code));
    const kid = await a.withRoom(room.code, (r) => rJoin(r, 'Ann'));
    await a.withRoom(room.code, (r) => {
      r.autoNext = true;
      rStart(r);
    });
    a.crash(); // no hand-over: its lease just runs out
    await b.openPoll(room.code, 'student', kid.id, -1, () => {}, () => {}); // (Ann is here: she polls)
    await b.withRoom(room.code, (r) => rSubmit(r, kid));
    // everyone is done: the new owner starts round 2 by itself
    assert.ok(await until(async () => (await b.getRoom(room.code)).round === 2), 'round 2 started');
    assert.ok(b.owns(room.code));
    stop();
  });

  test(`live (${name}): a timer that fires on two servers moves the room on only once`, async () => {
    const { all, stop } = await servers(3);
    const room = await all[0].createRoom({ type: 'class' });
    const kid = await all[0].withRoom(room.code, (r) => rJoin(r, 'Ann'));
    await all[0].withRoom(room.code, (r) => {
      r.autoNext = true;
      r.settings.rounds = 10;
      rStart(r);
    });
    await all[1].openPoll(room.code, 'student', kid.id, -1, () => {}, () => {}); // (Ann is here: she polls)
    await all[1].withRoom(room.code, (r) => rSubmit(r, kid));
    await wait(FAST.autoNextMs * 6);
    assert.equal((await all[2].getRoom(room.code)).round, 2, 'not 3 or 4');
    stop();
  });

  test(`live (${name}): pairs against the CPU play on by themselves`, async () => {
    const { all, stop } = await servers();
    const room = await all[0].createRoom({ type: 'pairs' });
    await all[1].withRoom(room.code, (r) => rJoin(r, 'Ann'));
    await all[1].withRoom(room.code, (r) => {
      Rooms.setPairOptions(r, { odd: 'cpu' });
      rStart(r);
    });
    // the CPU (and nobody else) takes turns until the human has to move
    const cpuMoved = await until(async () => {
      const r = await all[1].getRoom(room.code);
      return r.matches[0].turn > 1 || r.matches[0].roll;
    });
    assert.ok(cpuMoved || (await all[1].getRoom(room.code)).matches[0].ids[0] !== 'cpu');
    stop();
  });

  test(`live (${name}): partners see live moves without the room changing version`, async () => {
    const { all, stop } = await servers();
    const [a, b] = all;
    const room = await a.createRoom({ type: 'pairs' });
    const ann = await a.withRoom(room.code, (r) => rJoin(r, 'Ann'));
    const bo = await a.withRoom(room.code, (r) => rJoin(r, 'Bo'));
    const cy = await a.withRoom(room.code, (r) => rJoin(r, 'Cy'));
    const di = await a.withRoom(room.code, (r) => rJoin(r, 'Di'));
    await a.withRoom(room.code, (r) => rStart(r));
    const r0 = await a.getRoom(room.code);
    const m = r0.matches[0];
    const all4 = [ann, bo, cy, di];
    const mover = all4.find((p) => p.id === m.ids[m.current]);
    const partner = all4.find((p) => p.id === m.ids.find((id) => id !== mover.id));
    const other = all4.find((p) => !m.ids.includes(p.id));
    await a.withRoom(room.code, (r) => Rooms.pairRoll(r, Rooms.findPlayer(r, mover.id, mover.key)));
    const partnerRes = fakeRes();
    const otherRes = fakeRes();
    await b.openStream(room.code, 'student', partner.id, partnerRes);
    await b.openStream(room.code, 'student', other.id, otherRes);
    const v = await settled(a, room.code);
    const otherViews = otherRes.views().length;
    await a.setLive(room.code, mover.id, mover.key, { phase: 'place', rect: { x: 0, y: 0, w: 1, h: 1 } });
    assert.ok(await until(() => partnerRes.views().some((x) => JSON.stringify(x).includes('"rect":{"x":0,"y":0,"w":1,"h":1}'))));
    await wait(30);
    assert.equal((await a.getRoom(room.code)).version, v, 'no version bump');
    assert.equal(otherRes.views().length, otherViews, 'only the match hears it');
    stop();
  });

  test(`live (${name}): a student whose server died stops counting as here`, async () => {
    const { all, stop } = await servers();
    const [a, b] = all;
    const room = await b.createRoom({ type: 'class' });
    const kid = await b.withRoom(room.code, (r) => rJoin(r, 'Ann'));
    await a.openStream(room.code, 'student', kid.id, fakeRes());
    assert.ok(await until(async () => (await b.getRoom(room.code)).players[0].connections === 1));
    a.crash();
    assert.ok(await until(async () => (await b.getRoom(room.code)).players[0].connections === 0));
    stop();
  });

  test(`live (${name}): closing tells every server, and a closed code is not handed out again for a while`, async () => {
    const { backend, all, stop } = await servers();
    const [a, b] = all;
    const room = await a.createRoom({ type: 'class' });
    const res = fakeRes();
    await b.openStream(room.code, 'teacher', null, res);
    await a.closeRoom(room.code);
    assert.ok(await until(() => res.ended && res.events().some((e) => e.name === 'closed')));
    assert.equal(await b.isClosed(room.code), true);
    await assert.rejects(b.getRoom(room.code), { code: 'room' });
    assert.equal(await backend.create(room.code, '{}', 1000), false);
    stop();
  });

  test(`live (${name}): one server at a time leads a job`, async () => {
    const { all, stop } = await servers(3);
    const results = await Promise.all(all.map((l) => l.lead('schedules', 1000)));
    assert.deepEqual(results.filter(Boolean).length, 1);
    stop();
  });

  test(`live (${name}): shutting down sends streams on and hands rooms over`, async () => {
    const { all, stop } = await servers();
    const [a, b] = all;
    const room = await a.createRoom({ type: 'class' });
    const res = fakeRes();
    await a.openStream(room.code, 'teacher', null, res);
    await a.drain();
    assert.ok(res.ended);
    assert.ok(res.chunks.some((c) => /^retry: \d+/.test(c)));
    assert.ok(await until(() => b.owns(room.code)), 'b took the room over');
    assert.equal((await b.getRoom(room.code)).code, room.code);
    stop();
  });

  test(`live (${name}): rooms are saved as JSON and survive a JSON round trip (the memory backend checks)`, async () => {
    const { all, stop } = await servers(1);
    const room = await all[0].createRoom({ type: 'tournament' });
    for (const n of ['A', 'B', 'C', 'D']) await all[0].withRoom(room.code, (r) => rJoin(r, n));
    await all[0].withRoom(room.code, (r) => rStart(r));
    const r = await all[0].getRoom(room.code);
    assert.equal(r.state, 'playing');
    assert.ok(r.matches.length >= 1);
    stop();
  });
}

suite('memory', async (n) => Array(n).fill(createMemoryBackend()));
const REDIS_URL = process.env.BLOCKOUT_REDIS_URL;
if (REDIS_URL) {
  suite('redis', async (n) => {
    const prefix = `test:${process.pid}:${Math.random().toString(36).slice(2)}:`;
    return Promise.all(Array.from({ length: n }, () => createRedisBackend(REDIS_URL, { prefix })));
  });
}
