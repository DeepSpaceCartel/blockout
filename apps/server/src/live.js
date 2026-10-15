// Live classes across several servers. The rooms themselves (rooms.js) stay
// pure; this runtime keeps them in a shared backend (Redis, or memory for one
// server and tests) and runs everything around them:
//
//   withRoom(code, fn)  every change: read, change, write back only if nobody
//                       else wrote in between (else try again), then everyone hears
//   owner               one server per room runs its timers (the CPU's moves,
//                       "next round" by itself); if it goes away another takes over
//   presence            who has a stream open (on any server) or polled lately,
//                       laid over the room when it's read, never saved in it
//   listeners           the streams and long polls connected to *this* server,
//                       sent their own view when the room changes
//   live moves          a partner's drag or answer in pairs: straight to the
//                       two players, without a write
//
// Timers are passed in (now, setTimeout…) so tests can run hours in milliseconds.
import crypto from 'crypto';
import * as Rooms from './rooms.js';
import { silentLogger, exception } from './log.js';

const DEFAULTS = {
  roomTtlMs: 4 * 60 * 60 * 1000, // forget a class after 4 hours without a change
  closedTtlMs: 30 * 60 * 1000, // pollers of a closed class are told so for this long
  leaseMs: 15000, // a room's owner must renew this often…
  renewMs: 5000, // …and does, this often
  sweepMs: 5000, // look for rooms without an owner, and check who's here
  presenceMs: 30000, // a stream on a server counts this long after its last heartbeat
  heartbeatMs: 10000,
  pollHoldMs: 25000, // a long poll waits this long for a change before answering anyway
  sseBeatMs: 25000, // a comment line on idle streams, so proxies keep them open
  coalesceMs: 60, // several changes in a row are sent once
  liveMs: 80, // live moves at most this often
  autoNextMs: 2500, // pause after everyone is done, so the class sees the last answers land
  roundPauseMs: 5000, // tournaments: time to see your result before the next round
  cpuRollMs: 1500, // pairs: the CPU's turn, slow enough to watch
  cpuPlaceMs: 2200,
  maxTries: 8,
};
const CPU_SPEED = { slow: 1.6, normal: 1, fast: 0.4 }; // the teacher's "CPU speed" setting

const noRoom = () => new Rooms.RoomError('room', 'No class with that code. Check the code on the board.');

function createLive({ backend, log = silentLogger, replicaId = crypto.randomBytes(6).toString('hex'), now = () => Date.now(), timers = globalThis, ...options } = {}) {
  const o = { ...DEFAULTS, ...options };
  const { setTimeout, clearTimeout, setInterval, clearInterval } = timers;
  const local = new Map(); // code -> { streams, polls, unsubscribe, pending, live: Map(match -> timer), presenceTimer }
  const owned = new Map(); // code -> Map(timer key -> { sig, timer })
  const queues = new Map(); // code -> promise: this server's changes to a room, one at a time
  const touched = new Map(); // code -> when this server last kept the room alive
  let stopped = false;
  let ticks = [];

  // ---- reading and writing

  // A room as stored, with who's here (and, for views, live moves) laid over it
  async function load(code, { withLive = false } = {}) {
    const got = await backend.read(code);
    if (!got) return null;
    const room = JSON.parse(got.s);
    room.version = got.v;
    overlay(room, await backend.fields(code, 'presence'), withLive ? await backend.fields(code, 'live') : null);
    return room;
  }

  function overlay(room, presence, live) {
    const t = now();
    for (const p of room.players) {
      if (p.isCpu) continue;
      p.connections = Object.entries(presence).filter(([f, until]) => f.startsWith(`${p.id}|s:`) && Number(until) > t).length;
      p.seenAt = Number(presence[`${p.id}|poll`]) || 0;
    }
    if (!live) return;
    for (const m of room.matches || []) {
      const move = live[m.id] && JSON.parse(live[m.id]);
      if (move && move.turn === m.turn) m.live = move;
    }
  }

  // What gets saved: the room without anything laid over it
  function strip(room) {
    for (const p of room.players) {
      if (p.isCpu) continue;
      p.connections = 0;
      delete p.seenAt;
    }
    return JSON.stringify(room);
  }

  async function getRoom(code) {
    code = String(code || '').toUpperCase();
    const room = await load(code);
    if (!room) throw noRoom();
    // Someone is still using it: keep it (at most once a minute per server)
    if (now() - (touched.get(code) || 0) > 60000) {
      touched.set(code, now());
      backend.touch(code, o.roomTtlMs).catch(() => {});
    }
    return room;
  }

  // Changes a room: fn(room) changes it (synchronously) and returns the answer.
  // Changes from this server queue up; changes from other servers are retried.
  function withRoom(code, fn) {
    code = String(code || '').toUpperCase();
    const run = async () => {
      for (let attempt = 0; attempt < o.maxTries; attempt++) {
        const got = await backend.read(code);
        if (!got) throw noRoom();
        const room = JSON.parse(got.s);
        overlay(room, await backend.fields(code, 'presence'), null);
        const answer = fn(room);
        room.version = got.v + 1;
        if (await backend.cas(code, got.v, strip(room), o.roomTtlMs)) return answer;
        await new Promise((r) => setTimeout(r, 5 + Math.random() * 35 * (attempt + 1)));
      }
      throw new Rooms.RoomError('busy', 'The class is busy. Try again.');
    };
    const next = (queues.get(code) || Promise.resolve()).then(run, run);
    const tail = next.catch(() => {});
    queues.set(code, tail);
    tail.then(() => queues.get(code) === tail && queues.delete(code));
    return next;
  }

  async function createRoom(settings) {
    for (let i = 0; i < 50; i++) {
      const room = Rooms.createRoom(settings);
      room.version = 0;
      if (await backend.create(room.code, strip(room), o.roomTtlMs)) {
        await claim(room.code);
        return room;
      }
    }
    throw new Error('no free class code');
  }

  async function closeRoom(code) {
    await backend.close(String(code).toUpperCase(), o.closedTtlMs);
  }

  const isClosed = (code) => backend.isClosed(String(code || '').toUpperCase());

  // Pairs: what the player on turn is doing, for their partner. Not saved in the room.
  async function setLive(code, id, key, live) {
    const room = await getRoom(code);
    const p = Rooms.findPlayer(room, id, key);
    const m = Rooms.setLive(room, p, live);
    await backend.setField(room.code, 'live', m.id, JSON.stringify(m.live));
    await backend.publish(room.code, { t: 'live', match: m.id });
  }

  // ---- this server's listeners

  // This server's listeners for a room, subscribed to its messages. Await
  // e.ready before reading the room, so no change slips in between.
  function entry(code) {
    if (!local.has(code)) {
      const e = { streams: new Set(), polls: new Set(), unsubscribe: null, ready: null, pending: null, live: new Map(), presenceTimer: null };
      local.set(code, e);
      e.unsubscribe = backend.subscribe(code, (msg) => onMessage(code, msg));
      e.ready = e.unsubscribe.then(() => {});
    }
    return local.get(code);
  }

  async function drop(code) {
    const e = local.get(code);
    if (!e || e.streams.size || e.polls.size || owned.has(code)) return;
    local.delete(code);
    clearTimeout(e.pending);
    for (const t of e.live.values()) clearTimeout(t);
    clearTimeout(e.presenceTimer);
    (await e.unsubscribe)();
  }

  const event = (res, name, data) => res.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);

  function viewFor(room, l) {
    if (l.role === 'teacher') return Rooms.teacherView(room);
    const p = room.players.find((x) => x.id === l.id);
    return p ? Rooms.studentView(room, p) : null;
  }

  function push(room, s) {
    const view = viewFor(room, s);
    if (view) return event(s.res, 'view', view);
    event(s.res, 'removed', {});
    s.res.end();
  }

  // A poll is answered once (by a change, its timer or a shutdown, whichever is first)
  function answer(room, w, body) {
    clearTimeout(w.timer);
    local.get(room.code)?.polls.delete(w);
    if (w.done) return;
    w.done = true;
    if (body) return w.send(body);
    const view = viewFor(room, w);
    w.send(view ? { v: room.version, view } : { removed: true });
  }

  const streamsOf = (code) => (local.get(code) ? local.get(code).streams.size : 0);

  // A stream: the room's view now and after every change. res is set up by the caller.
  async function openStream(code, role, playerId, res, onClose = () => {}) {
    const e = entry(code);
    await e.ready;
    const room = await load(code, { withLive: true });
    if (!room) {
      drop(code);
      throw noRoom();
    }
    const s = { res, role, id: playerId };
    e.streams.add(s);
    if (playerId) {
      await backend.setField(code, 'presence', `${playerId}|s:${replicaId}`, now() + o.presenceMs);
      await backend.publish(code, { t: 'presence' });
    }
    push(room, s);
    const beat = setInterval(() => res.write(': ♥\n\n'), o.sseBeatMs);
    res.on('close', async () => {
      clearInterval(beat);
      e.streams.delete(s);
      onClose();
      if (playerId && ![...e.streams].some((x) => x.id === playerId)) {
        await backend.delField(code, 'presence', `${playerId}|s:${replicaId}`).catch(() => {});
        await backend.publish(code, { t: 'presence' }).catch(() => {});
      }
      drop(code);
    });
  }

  // A long poll: answered at once if the room moved on from `version`, else at the
  // next change (or after pollHoldMs). send(body) writes the answer.
  async function openPoll(code, role, playerId, version, send, onClose) {
    if (playerId) await backend.setField(code, 'presence', `${playerId}|poll`, now());
    const e = entry(code);
    await e.ready;
    const room = await load(code, { withLive: true });
    const w = { role, id: playerId, send, done: false, timer: null };
    if (!room || version !== room.version) {
      drop(code);
      if (!room) throw noRoom();
      return answer(room, w);
    }
    e.polls.add(w);
    w.timer = setTimeout(async () => {
      const latest = await load(code, { withLive: true }).catch(() => null);
      if (latest) answer(latest, w);
      else answer({ code }, w, { closed: true });
      drop(code);
    }, o.pollHoldMs);
    onClose(() => {
      w.done = true;
      clearTimeout(w.timer);
      e.polls.delete(w);
      drop(code);
    });
  }

  // Changes come in as messages, from this server too
  function onMessage(code, msg) {
    const e = local.get(code);
    if (!e) return;
    if (msg.t === 'v') {
      if (e.pending) return;
      e.pending = setTimeout(async () => {
        e.pending = null;
        try {
          const room = await load(code, { withLive: true });
          if (!room) return;
          for (const s of e.streams) push(room, s);
          for (const w of [...e.polls]) answer(room, w);
          if (owned.has(code)) reconcile(room);
        } catch (err) {
          log.error('live.update_failed', exception(err));
        }
      }, o.coalesceMs);
    } else if (msg.t === 'live') {
      if (e.live.has(msg.match)) return;
      e.live.set(
        msg.match,
        setTimeout(async () => {
          e.live.delete(msg.match);
          const room = await load(code, { withLive: true }).catch(() => null);
          const m = room && (room.matches || []).find((x) => x.id === msg.match);
          if (!m) return;
          for (const s of e.streams) if (s.role !== 'teacher' && m.ids.includes(s.id)) push(room, s);
        }, o.liveMs)
      );
    } else if (msg.t === 'presence') {
      if (owned.has(code) && !e.presenceTimer) {
        e.presenceTimer = setTimeout(() => {
          e.presenceTimer = null;
          checkPresence(code);
        }, o.coalesceMs);
      }
    } else if (msg.t === 'closed') {
      for (const s of e.streams) {
        event(s.res, 'closed', {});
        s.res.end();
      }
      for (const w of [...e.polls]) answer({ code }, w, { closed: true });
      e.streams.clear();
      disown(code);
      backend.release(`room:${code}`, replicaId).catch(() => {});
      drop(code);
    } else if (msg.t === 'owner-gone') {
      claim(code);
    }
  }

  // ---- owning rooms: their timers run on one server

  async function claim(code) {
    if (stopped) return false;
    if (!(await backend.acquire(`room:${code}`, replicaId, o.leaseMs))) return false;
    const fresh = !owned.has(code);
    if (fresh) owned.set(code, new Map());
    await entry(code).ready;
    if (fresh) {
      const room = await load(code);
      if (room) reconcile(room);
    }
    return true;
  }

  function disown(code) {
    for (const t of (owned.get(code) || new Map()).values()) clearTimeout(t.timer);
    owned.delete(code);
  }

  // The timers a room needs now, each with a signature of the state it was
  // set for: a timer whose state has moved on is cancelled, and one that fires
  // re-checks against the latest room before doing anything.
  function wanted(room) {
    const out = new Map();
    if (room.state !== 'playing') return out;
    if (room.type === 'pairs') {
      for (const m of room.matches) {
        if (!Rooms.cpuToMove(room, m)) continue;
        const delay = (m.roll ? o.cpuPlaceMs : o.cpuRollMs) * (CPU_SPEED[room.settings.cpuSpeed] || 1);
        out.set(`cpu:${m.id}`, { sig: `${room.game}:${m.turn}:${m.roll ? 'place' : 'roll'}`, delay, act: cpuMove(m.id) });
      }
    }
    if (room.type === 'tournament' && room.roundReady && (room.autoNext || room.tournament.format === 'koth')) {
      out.set('round', { sig: `${room.game}:${room.matches.map((m) => m.id).join()}`, delay: o.roundPauseMs, act: (r) => Rooms.advanceTournament(r) });
    }
    if (room.type === 'class' && room.autoNext && Rooms.allDone(room)) {
      out.set('auto', { sig: `${room.game}:${room.round}`, delay: o.autoNextMs, act: (r) => Rooms.nextRound(r) });
    }
    return out;
  }

  const cpuMove = (matchId) => (r) => {
    const m = r.matches.find((x) => x.id === matchId);
    if (m.roll) Rooms.cpuPlace(r, m);
    else Rooms.cpuRoll(r, m);
  };

  function reconcile(room) {
    const mine = owned.get(room.code);
    if (!mine) return;
    const want = wanted(room);
    for (const [key, t] of mine) {
      if (want.get(key)?.sig !== t.sig) {
        clearTimeout(t.timer);
        mine.delete(key);
      }
    }
    for (const [key, w] of want) {
      if (mine.has(key)) continue;
      const timer = setTimeout(async () => {
        mine.delete(key);
        if (!owned.has(room.code)) return;
        try {
          await withRoom(room.code, (r) => {
            const again = wanted(r).get(key);
            if (again && again.sig === w.sig) again.act(r);
          });
        } catch (err) {
          if (!(err instanceof Rooms.RoomError)) log.error('live.timer_failed', exception(err));
        }
      }, w.delay);
      mine.set(key, { sig: w.sig, timer });
    }
  }

  // Who's here: saved (as a signature) when it changes, so everyone's view
  // updates and "everyone's done" stops waiting for someone who left
  async function checkPresence(code) {
    const sig = (r) => r.players.map((p) => Rooms.isHere(p)).join();
    try {
      const room = await load(code);
      if (!room || room.presenceSig === sig(room)) return;
      await withRoom(code, (r) => {
        r.presenceSig = sig(r);
      });
    } catch (err) {
      if (!(err instanceof Rooms.RoomError)) log.error('live.presence_failed', exception(err));
    }
  }

  // ---- running

  function start() {
    stopped = false;
    // Keep this server's leases and stream presence fresh; take over rooms
    // nobody owns; check who's here in the rooms this server owns.
    ticks = [
      setInterval(async () => {
        for (const code of owned.keys()) {
          if (!(await backend.acquire(`room:${code}`, replicaId, o.leaseMs).catch(() => false))) disown(code);
        }
      }, o.renewMs),
      setInterval(async () => {
        for (const [code, e] of local) {
          const ids = new Set([...e.streams].map((s) => s.id).filter(Boolean));
          for (const id of ids) await backend.setField(code, 'presence', `${id}|s:${replicaId}`, now() + o.presenceMs).catch(() => {});
        }
      }, o.heartbeatMs),
      setInterval(async () => {
        try {
          for (const code of await backend.active()) {
            if (!owned.has(code)) {
              if (!(await backend.read(code))) await backend.forget(code);
              else await claim(code);
            } else checkPresence(code);
          }
        } catch (err) {
          log.warn('live.sweep_failed', exception(err));
        }
      }, o.sweepMs),
    ];
    for (const t of ticks) t.unref?.();
  }

  // Shutting down: hand rooms over and send browsers on to another server
  async function drain() {
    stopped = true;
    for (const t of ticks) clearInterval(t);
    for (const code of [...owned.keys()]) {
      disown(code);
      await backend.release(`room:${code}`, replicaId).catch(() => {});
      await backend.publish(code, { t: 'owner-gone' }).catch(() => {});
    }
    for (const [code, e] of local) {
      const room = await load(code, { withLive: true }).catch(() => null);
      for (const s of e.streams) {
        s.res.write(`retry: ${1000 + Math.floor(Math.random() * 3000)}\n\n`); // (spread the reconnects out)
        s.res.end();
        if (s.id) await backend.delField(code, 'presence', `${s.id}|s:${replicaId}`).catch(() => {});
      }
      for (const w of [...e.polls]) (room ? answer(room, w) : answer({ code }, w, { closed: true }));
    }
  }

  // One server at a time does a job (opening scheduled tournaments): true while it's this one
  const lead = (name, ttlMs) => backend.acquire(`lead:${name}`, replicaId, ttlMs).catch(() => false);

  // What this server is doing, for metrics
  const stats = () => {
    let streams = 0;
    let polls = 0;
    for (const e of local.values()) {
      streams += e.streams.size;
      polls += e.polls.size;
    }
    return { streams, polls, owned: owned.size, rooms: local.size };
  };

  return { replicaId, stats, lead, createRoom, getRoom, withRoom, closeRoom, isClosed, setLive, openStream, openPoll, streamsOf, start, drain, owns: (code) => owned.has(code) };
}

export { createLive, DEFAULTS };
