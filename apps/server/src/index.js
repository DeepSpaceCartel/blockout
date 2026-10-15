#!/usr/bin/env node
// Blockout server: the games (the apps' built files), classrooms and accounts. No dependencies: Node's http module serves the
// game itself plus a small JSON API, and pushes live updates with Server-Sent Events.
// Where a proxy holds event streams back (Cloudflare quick tunnels, some school
// filters) pages fall back to long polling: /poll answers as soon as anything changes.
//
//   npm run build, then: node apps/server/src/index.js [port] [--public-url https://example.com]
//
// Then open http://localhost:8080 on the teacher's computer. Chromebooks on the
// same network join at the address printed below (the teacher's screen shows it too).
// Behind a tunnel or proxy (e.g. cloudflared tunnel --url http://localhost:8080),
// pass its address as --public-url (or PUBLIC_URL=...) so the join code and QR use it.
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import * as Rooms from './rooms.js';
import * as Moderation from './moderation.js';
import * as Auth from './auth.js';
import { openStore } from './store/index.js';
import { createAccounts, AccountError } from './accounts.js';
import { loadConfig, ConfigError } from './config.js';
import { createLimiter, clientIp } from './ratelimit.js';
import { createLogger, exception } from './log.js';
import crypto from 'crypto';

const IS_MAIN = Boolean(process.argv[1]) && path.resolve(process.argv[1]) === import.meta.filename;
let config;
try {
  config = loadConfig(process.env, process.argv.slice(2));
} catch (e) {
  if (!(e instanceof ConfigError) || !IS_MAIN) throw e;
  console.error(e.message);
  process.exit(1);
}
const VERSION = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const log = createLogger({ ...config.log, version: VERSION });
const PORT = config.port;
const OPENAI_API_KEY = config.openaiKey;
const PUBLIC_URL = config.publicUrl;
// The built games: apps/<name>/dist. The multiplication game is at /, the
// others at /<name>/ (each app is built with that base path).
const APPS = path.resolve(import.meta.dirname, '..', '..');
const HOME_APP = 'multiplication';
const ROOM_IDLE_MS = 4 * 60 * 60 * 1000; // forget a class after 4 hours without activity
const AUTO_NEXT_MS = 2500; // pause after everyone is done, so the class sees the last answers land
const CPU_ROLL_MS = 1500; // pairs: the CPU's turn, slow enough to watch
const CPU_PLACE_MS = 2200;
const CPU_SPEED = { slow: 1.6, normal: 1, fast: 0.4 }; // the teacher's "CPU speed" setting
const ROUND_PAUSE_MS = 5000; // tournaments: time to see your result before the next round
const HEARTBEAT_MS = 25000;
const POLL_HOLD_MS = 25000; // a long poll waits this long for a change before answering anyway
const CLOSED_MEMORY_MS = 30 * 60 * 1000; // pollers of a closed class are told so for this long
const MAX_BODY = 16 * 1024;
const MAX_PROGRESS_BODY = 600 * 1024; // a signed-in student's whole save
const BODY_TIMEOUT_MS = 10 * 1000;
const SCHEDULE_TICK_MS = 10 * 1000; // how often due tournaments are opened

const rooms = new Map(); // code -> room
const streams = new Map(); // code -> Set of { res, role: 'teacher' | 'student', id }
const pollers = new Map(); // code -> Set of { res, role, id, timer } waiting for a change
const closedRooms = new Map(); // code -> when it was closed

// ---------------------------------------------------------------- static files

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

// /addition/x.js -> apps/addition/dist/x.js; anything else -> the home app's dist
function staticFile(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  const [first, ...rest] = parts;
  const isApp = first && first !== HOME_APP && /^[a-z-]+$/.test(first) && fs.existsSync(path.join(APPS, first, 'dist', 'index.html'));
  const dist = path.join(APPS, isApp ? first : HOME_APP, 'dist');
  let rel = (isApp ? rest : parts).join('/');
  if (rel === '' || pathname.endsWith('/')) rel = rel ? `${rel}/index.html` : 'index.html';
  const file = path.resolve(dist, rel);
  return file.startsWith(dist + path.sep) ? file : null;
}

function serveStatic(req, res) {
  let pathname;
  try {
    pathname = decodePath(new URL(req.url, 'http://x').pathname);
  } catch (e) {
    return sendProblem(res, e.status, e.code, e.message);
  }
  // "/addition" without the slash: go to "/addition/" so relative paths work
  if (/^\/[a-z-]+$/.test(pathname) && fs.existsSync(path.join(APPS, pathname.slice(1), 'dist', 'index.html'))) {
    res.writeHead(301, { Location: `${pathname}/`, ...SECURITY_HEADERS });
    return res.end();
  }
  const file = staticFile(pathname);
  if (!file) return send(res, 404, 'Not found', 'text/plain');
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, err.code === 'ENOENT' && !fs.existsSync(path.join(APPS, HOME_APP, 'dist')) ? 'Not built yet: run npm run build' : 'Not found', 'text/plain');
    // Vite's hashed assets never change; everything else is checked each time
    const cache = /\/assets\/.+-[\w-]{8,}\.\w+$/.test(file) ? 'public, max-age=31536000, immutable' : 'no-cache';
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': cache, ...SECURITY_HEADERS });
    res.end(data);
  });
}

// Only this server's own scripts, styles and images (plus the QR code's data:
// image), and only this server and the sign-in provider (it hands out tokens)
// to talk to. No inline scripts or style attributes: the pages don't need them.
function contentSecurityPolicy() {
  const signIn = config.auth.kind === 'keycloak' ? ` ${new URL(config.auth.issuer).origin}` : '';
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self'${signIn}`,
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    `form-action 'self'${signIn}`,
  ].join('; ');
}

// Sent with every response: no sniffing content types, no framing by other
// sites, no full URLs (with class codes) leaked to other sites.
// No camera, microphone or location for any page. Over HTTPS, browsers are told
// to stay on HTTPS for a year.
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': contentSecurityPolicy(),
  ...(config.https ? { 'Strict-Transport-Security': 'max-age=31536000' } : {}),
};

// An error as RFC 9457 problem details. `type` stays about:blank (the status
// says what kind of problem it is); `error` (a short code) and `message` (for
// the player) are extension members the games read.
const STATUS_TITLES = { 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 408: 'Request Timeout', 409: 'Conflict', 429: 'Too Many Requests', 500: 'Internal Server Error' };

// A problem with the request itself (bad URL, slow body), answered with its own status
class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// A malformed escape like %E0 makes decodeURIComponent throw; that's the client's mistake, not ours
function decodePath(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    throw new HttpError(400, 'bad-request', 'Bad address.');
  }
}
function sendProblem(res, status, code, message) {
  const body = { type: 'about:blank', title: STATUS_TITLES[status] || 'Error', status, detail: message, error: code, message };
  send(res, status, body, 'application/problem+json; charset=utf-8');
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', ...SECURITY_HEADERS });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function readJson(req, max = MAX_BODY) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    // A body that never finishes (or a client that goes away) must not hold the request forever
    const timer = setTimeout(() => {
      reject(new HttpError(408, 'timeout', 'The request took too long.'));
      req.destroy();
    }, BODY_TIMEOUT_MS);
    const fail = () => {
      clearTimeout(timer);
      reject(new HttpError(400, 'aborted', 'The request was cut off.'));
    };
    req.on('error', fail);
    req.on('close', () => (req.complete ? clearTimeout(timer) : fail()));
    req.on('data', (c) => {
      size += c.length;
      if (size > max) {
        reject(new Rooms.RoomError('size', 'Too much data.'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      clearTimeout(timer);
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch (e) {
        reject(new Rooms.RoomError('json', 'Bad request.'));
      }
    });
  });
}

// ---------------------------------------------------------------- live updates

// Everyone in the room gets their own view of it. Several changes in a row are
// sent once.
const pending = new Map(); // code -> timeout
function broadcast(room) {
  if (pending.has(room.code)) return;
  pending.set(
    room.code,
    setTimeout(() => {
      pending.delete(room.code);
      room.version = (room.version || 0) + 1;
      for (const s of streams.get(room.code) || []) pushView(room, s);
      for (const w of pollers.get(room.code) || []) answerPoll(room, w);
      scheduleCpu(room);
      scheduleRound(room);
    }, 60)
  );
}

// Pairs: a partner's live move (dragging, answering) goes only to the two players
// in that match, a few times a second at most, without bumping the room's version
// (so nobody else's long poll wakes up for it).
const LIVE_MS = 80;
const livePending = new Map(); // `${code}:${match}` -> timeout
function broadcastMatch(room, m) {
  const key = `${room.code}:${m.id}`;
  if (livePending.has(key)) return;
  livePending.set(
    key,
    setTimeout(() => {
      livePending.delete(key);
      if (!rooms.has(room.code)) return;
      for (const s of streams.get(room.code) || []) if (s.role !== 'teacher' && m.ids.includes(s.id)) pushView(room, s);
      for (const w of pollers.get(room.code) || []) if (w.role !== 'teacher' && m.ids.includes(w.id)) answerPoll(room, w);
    }, LIVE_MS)
  );
}

// Tournaments: when a round is done (or a king-of-the-hill match), start the next
// one after a pause, by itself if the teacher left "auto" on (king of the hill always).
const roundTimers = new Map(); // code -> timeout
function scheduleRound(room) {
  if (room.type !== 'tournament' || !room.roundReady || room.state !== 'playing' || roundTimers.has(room.code)) return;
  if (!room.autoNext && room.tournament.format !== 'koth') return; // waits for "Next round"
  roundTimers.set(
    room.code,
    setTimeout(() => {
      roundTimers.delete(room.code);
      if (!rooms.has(room.code) || !room.roundReady || room.state !== 'playing') return;
      Rooms.advanceTournament(room);
      broadcast(room);
    }, ROUND_PAUSE_MS)
  );
}

// Pairs: the CPU (playing an odd one out) rolls, then places, on its own.
const cpuTimers = new Map(); // `${code}:${match}` -> timeout
function scheduleCpu(room) {
  if (room.type !== 'pairs') return;
  for (const m of room.matches) {
    const key = `${room.code}:${m.id}`;
    if (!Rooms.cpuToMove(room, m) || cpuTimers.has(key)) continue;
    const turn = m.turn;
    cpuTimers.set(
      key,
      setTimeout(
        () => {
          cpuTimers.delete(key);
          if (!rooms.has(room.code) || !Rooms.cpuToMove(room, m) || m.turn !== turn) return;
          if (m.roll) Rooms.cpuPlace(room, m);
          else Rooms.cpuRoll(room, m);
          broadcast(room);
        },
        (m.roll ? CPU_PLACE_MS : CPU_ROLL_MS) * CPU_SPEED[room.settings.cpuSpeed]
      )
    );
  }
}

function pushView(room, s) {
  if (s.role === 'teacher') return event(s.res, 'view', Rooms.teacherView(room));
  const p = room.players.find((x) => x.id === s.id);
  if (p) event(s.res, 'view', Rooms.studentView(room, p));
  else {
    event(s.res, 'removed', {});
    s.res.end();
  }
}

function event(res, name, data) {
  res.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
}

// Open streams are cheap but not free: a class needs ~41 (more with spare tabs),
// and a school shares one address
const MAX_ROOM_STREAMS = 200;
const MAX_IP_STREAMS = 500;
const ipStreams = new Map(); // address -> open streams

function openStream(req, res, room, role, player, ip) {
  if ((streams.get(room.code) || new Set()).size >= MAX_ROOM_STREAMS || (ipStreams.get(ip) || 0) >= MAX_IP_STREAMS) return tooMany(res, 30);
  ipStreams.set(ip, (ipStreams.get(ip) || 0) + 1);
  // no-transform / X-Accel-Buffering: proxies and tunnels must pass events straight through
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-store, no-transform',
    'X-Accel-Buffering': 'no',
    Connection: 'keep-alive',
    ...SECURITY_HEADERS,
  });
  res.write('retry: 2000\n\n');
  const s = { res, role, id: player && player.id };
  if (!streams.has(room.code)) streams.set(room.code, new Set());
  streams.get(room.code).add(s);
  if (player) player.connections++;
  pushView(room, s);
  broadcast(room);
  const beat = setInterval(() => res.write(': ♥\n\n'), HEARTBEAT_MS);
  req.on('close', () => {
    clearInterval(beat);
    const n = ipStreams.get(ip) - 1;
    if (n > 0) ipStreams.set(ip, n);
    else ipStreams.delete(ip);
    streams.get(room.code)?.delete(s);
    if (player) {
      player.connections = Math.max(0, player.connections - 1);
      maybeAutoNext(room); // don't keep the class waiting for someone who left
    }
    broadcast(room);
  });
}

// Long polling: GET /api/rooms/CODE/poll?v=VERSION&teacher=KEY (or &id=ID&key=KEY).
// Answers straight away if the room has moved on from VERSION, otherwise at the
// next change (or after POLL_HOLD_MS). Polling students count as here while they poll.
function openPoll(req, res, room, role, player, version) {
  if (player) player.seenAt = Date.now();
  const w = { res, role, id: player && player.id, timer: null };
  if (version !== (room.version || 0)) return answerPoll(room, w);
  if (!pollers.has(room.code)) pollers.set(room.code, new Set());
  pollers.get(room.code).add(w);
  w.timer = setTimeout(() => answerPoll(room, w), POLL_HOLD_MS);
  req.on('close', () => {
    clearTimeout(w.timer);
    pollers.get(room.code)?.delete(w);
  });
}

function answerPoll(room, w) {
  clearTimeout(w.timer);
  pollers.get(room.code)?.delete(w);
  if (w.res.writableEnded) return;
  if (w.role === 'teacher') return send(w.res, 200, { v: room.version || 0, view: Rooms.teacherView(room) });
  const p = room.players.find((x) => x.id === w.id);
  if (!p) return send(w.res, 200, { removed: true });
  p.seenAt = Date.now();
  send(w.res, 200, { v: room.version || 0, view: Rooms.studentView(room, p) });
}

// Polling students who stop polling drop off after a while; keep "who's here"
// and "everyone's done" up to date for them.
const presence = new Map(); // code -> last "who's here" signature
setInterval(() => {
  for (const room of rooms.values()) {
    const sig = room.players.map((p) => Rooms.isHere(p)).join();
    if (presence.get(room.code) === sig) continue;
    presence.set(room.code, sig);
    broadcast(room);
    maybeAutoNext(room);
  }
  const now = Date.now();
  for (const [code, at] of closedRooms) if (now - at > CLOSED_MEMORY_MS) closedRooms.delete(code);
}, 5000).unref();

// ---------------------------------------------------------------- pacing

const autoTimers = new Map(); // code -> timeout

function cancelAutoNext(room) {
  clearTimeout(autoTimers.get(room.code));
  autoTimers.delete(room.code);
}

function maybeAutoNext(room) {
  if (room.type !== 'class' || !room.autoNext || !Rooms.allDone(room) || autoTimers.has(room.code)) return;
  const round = room.round;
  autoTimers.set(
    room.code,
    setTimeout(() => {
      autoTimers.delete(room.code);
      if (room.state === 'playing' && room.round === round && Rooms.allDone(room)) {
        Rooms.nextRound(room);
        broadcast(room);
        maybeAutoNext(room); // e.g. everyone had to pass
      }
    }, AUTO_NEXT_MS)
  );
}

// ---------------------------------------------------------------- API

function getRoom(code) {
  const room = rooms.get(String(code || '').toUpperCase());
  if (!room) throw new Rooms.RoomError('room', 'No class with that code. Check the code on the board.');
  room.touchedAt = Date.now();
  return room;
}

function teacherOnly(room, key) {
  if (key !== room.teacherKey) throw new Rooms.RoomError('teacher', 'Only the teacher can do that.');
}

// Addresses students can use to reach this server: the public one first, then
// this computer's addresses on the local network.
function lanUrls() {
  const out = PUBLIC_URL ? [PUBLIC_URL] : [];
  if (config.production) return out; // a public server's own addresses are nobody's business
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(`http://${a.address}:${PORT}/`);
  }
  return out;
}

// ---------------------------------------------------------------- accounts
// Teachers, students and parents (server/accounts.js), stored in sqlite
// (server/store.js). Sign-in is swappable (server/auth.js): dev sign-in for now,
// Keycloak later. Guests keep playing without any of this.

const store = await openStore(config.store);
await store.migrate();
const auth = await Auth.fromEnv(process.env, store);
const accounts = createAccounts({ store, auth, log });

// The signed-in user for a request, or null (a guest)
const signedIn = (req) => accounts.authenticate(Auth.bearer(req));

function openRoom(settings) {
  const room = Rooms.createRoom(settings, { taken: new Set(rooms.keys()) });
  rooms.set(room.code, room);
  return room;
}

// [method, path pattern, handler(user, params, req)]; :names in the pattern become params
const accountRoutes = [
  ['GET', '/api/auth/config', () => accounts.config()],
  ['POST', '/api/auth/dev', async (user, p, req) => accounts.devSignIn(await readJson(req))],
  ['GET', '/api/me', (user) => accounts.me(user)],
  ['GET', '/api/me/progress', (user) => accounts.getProgress(user)],
  ['PUT', '/api/me/progress', async (user, p, req) => accounts.putProgress(user, (await readJson(req, MAX_PROGRESS_BODY)).progress)],
  ['GET', '/api/me/homework', (user) => accounts.myHomework(user)],
  ['GET', '/api/me/classes', (user) => accounts.myClasses(user)],
  ['POST', '/api/me/classes', async (user, p, req) => accounts.joinClass(user, await readJson(req))],
  ['GET', '/api/me/parent-code', (user) => accounts.parentCode(user)],
  ['GET', '/api/me/live', (user) => accounts.live(user)],
  ['GET', '/api/classes', (user) => accounts.listClasses(user)],
  ['POST', '/api/classes', async (user, p, req) => accounts.createClass(user, await readJson(req))],
  ['GET', '/api/classes/:id', (user, p) => accounts.classDetail(user, p.id)],
  ['DELETE', '/api/classes/:id/students/:student', (user, p) => accounts.removeStudent(user, p.id, p.student)],
  ['GET', '/api/students/:id', (user, p) => accounts.childDetail(user, p.id)],
  ['POST', '/api/homework', async (user, p, req) => accounts.createAssignment(user, await readJson(req))],
  ['DELETE', '/api/homework/:id', (user, p) => accounts.deleteAssignment(user, p.id)],
  ['GET', '/api/children', (user) => accounts.children(user)],
  ['POST', '/api/children', async (user, p, req) => accounts.linkChild(user, await readJson(req))],
  ['DELETE', '/api/children/:id', (user, p) => accounts.unlinkChild(user, p.id)],
  ['GET', '/api/schedules', (user) => accounts.listSchedules(user)],
  ['POST', '/api/schedules', async (user, p, req) => accounts.createSchedule(user, await readJson(req))],
  ['DELETE', '/api/schedules/:id', (user, p) => accounts.deleteSchedule(user, p.id)],
  ['GET', '/api/schedules/:id/host', (user, p) => accounts.hostSchedule(user, p.id)],
];

function matchAccountRoute(method, pathname) {
  const parts = pathname.split('/').filter(Boolean);
  for (const [m, pattern, handler] of accountRoutes) {
    if (m !== method) continue;
    const want = pattern.split('/').filter(Boolean);
    if (want.length !== parts.length) continue;
    const params = {};
    if (want.every((w, i) => (w.startsWith(':') ? (params[w.slice(1)] = decodePath(parts[i])) : w === parts[i]))) return { handler, params, pattern };
  }
  return null;
}

// Scheduled tournaments: open each one's lobby when it's due
const scheduleTimer = setInterval(() => {
  accounts.openDue(openRoom).catch((e) => log.error('schedule.error', exception(e)));
}, SCHEDULE_TICK_MS).unref();

const routes = {
  'GET /api/health': () => ({ ok: true, lan: lanUrls() }),

  // Hosting a class needs a teacher account
  'POST /api/rooms': async (req) => {
    const user = await signedIn(req);
    if (!user || user.role !== 'teacher') throw new AccountError('teacher', 'Teachers: please sign in to host a class.', 401);
    const body = await readJson(req);
    const room = openRoom(body.settings);
    return { code: room.code, teacherKey: room.teacherKey, lan: lanUrls() };
  },

  // Students send { name }. The teacher can join as a player (pairs: to play the
  // odd one out) with { teacher: KEY } from the projector screen or { play: KEY }
  // from another device.
  'POST /api/rooms/:code/join': async (req, code) => {
    const room = getRoom(code);
    const body = await readJson(req);
    let p;
    if (body.teacher || body.play) {
      if (body.teacher !== room.teacherKey && body.play !== room.playKey) throw new Rooms.RoomError('teacher', 'That teacher link isn’t right.');
      p = Rooms.joinTeacher(room, body.look);
    } else {
      // Signed-in students play under their account's name (their school
      // already knows it): no name check, nothing sent to OpenAI.
      const user = await signedIn(req);
      if (user && user.role === 'student') p = Rooms.join(room, user.firstName, body.look);
      else {
        const check = await Moderation.checkName(body.name, { apiKey: OPENAI_API_KEY, log });
        if (!check.ok) throw new Rooms.RoomError('name', 'Please use your real first name.');
        p = Rooms.join(room, body.name, body.look);
      }
    }
    broadcast(room);
    return { id: p.id, key: p.key, name: p.name, teacher: Boolean(p.isTeacher) };
  },

  // Does this class exist? (A join link checks before asking for a name.)
  'GET /api/rooms/:code/info': async (req, code) => {
    const room = getRoom(code);
    return { code: room.code, type: room.type, state: room.state };
  },

  // Pairs: roll for your turn.
  'POST /api/rooms/:code/roll': async (req, code) => {
    const room = getRoom(code);
    const body = await readJson(req);
    const p = Rooms.findPlayer(room, body.id, body.key);
    const result = Rooms.pairRoll(room, p);
    broadcast(room);
    return result;
  },

  // Pairs: what the player on turn is doing (dragging, answering), for their partner
  'POST /api/rooms/:code/live': async (req, code) => {
    const room = getRoom(code);
    const body = await readJson(req);
    const p = Rooms.findPlayer(room, body.id, body.key);
    const m = Rooms.setLive(room, p, body.live);
    broadcastMatch(room, m);
    return { ok: true };
  },

  'POST /api/rooms/:code/leave': async (req, code) => {
    const room = getRoom(code);
    const body = await readJson(req);
    const p = Rooms.findPlayer(room, body.id, body.key);
    Rooms.removePlayer(room, p.id);
    broadcast(room);
    maybeAutoNext(room);
    return { ok: true };
  },

  'POST /api/rooms/:code/result': async (req, code) => {
    const room = getRoom(code);
    const body = await readJson(req);
    const p = Rooms.findPlayer(room, body.id, body.key);
    Rooms.submit(room, p, body);
    broadcast(room);
    maybeAutoNext(room);
    return { ok: true, score: p.score };
  },

  'POST /api/rooms/:code/teacher': async (req, code) => {
    const room = getRoom(code);
    const body = await readJson(req);
    teacherOnly(room, body.key);
    switch (body.action) {
      case 'settings':
        Rooms.setSettings(room, body.settings || {});
        break;
      case 'pairOptions':
        Rooms.setPairOptions(room, body.options || {});
        break;
      case 'swap':
        Rooms.swapOrder(room, body.a, body.b);
        break;
      case 'start':
        cancelAutoNext(room);
        Rooms.start(room);
        break;
      case 'next':
        cancelAutoNext(room);
        if (room.type === 'tournament') {
          clearTimeout(roundTimers.get(room.code));
          roundTimers.delete(room.code);
          if (room.roundReady) Rooms.advanceTournament(room);
        } else Rooms.nextRound(room);
        break;
      case 'autoNext':
        room.autoNext = Boolean(body.on);
        if (!room.autoNext) cancelAutoNext(room);
        break;
      case 'end':
        cancelAutoNext(room);
        Rooms.end(room);
        break;
      case 'lobby':
        cancelAutoNext(room);
        Rooms.backToLobby(room);
        break;
      case 'remove':
        Rooms.removePlayer(room, body.id);
        break;
      case 'close':
        cancelAutoNext(room);
        for (const s of streams.get(room.code) || []) {
          event(s.res, 'closed', {});
          s.res.end();
        }
        for (const w of pollers.get(room.code) || []) {
          clearTimeout(w.timer);
          send(w.res, 200, { closed: true });
        }
        rooms.delete(room.code);
        streams.delete(room.code);
        pollers.delete(room.code);
        closedRooms.set(room.code, Date.now());
        clearTimeout(roundTimers.get(room.code));
        roundTimers.delete(room.code);
        for (const [key, t] of cpuTimers) {
          if (!key.startsWith(`${room.code}:`)) continue;
          clearTimeout(t);
          cpuTimers.delete(key);
        }
        return { ok: true };
      default:
        throw new Rooms.RoomError('action', 'Unknown action.');
    }
    broadcast(room);
    maybeAutoNext(room);
    return { ok: true };
  },
};

// ---------------------------------------------------------------- rate limits

const limiter = createLimiter();
setInterval(() => limiter.prune(), 60 * 1000).unref();

// Where a code is looked up: a run of wrong codes from one address is someone guessing
const CODE_ROUTES = new Set(['POST /api/me/classes', 'POST /api/children']);
const isCodeLookup = (req, r) => (r.code && !r.live) || CODE_ROUTES.has(`${req.method} ${r.url.pathname}`);
const isMiss = (e) => (e instanceof Rooms.RoomError && e.code === 'room') || (e instanceof AccountError && e.status === 404 && e.code === 'code');
const tokenKey = (req) => crypto.createHash('sha256').update(Auth.bearer(req) || '').digest('hex').slice(0, 16);

function tooMany(res, retryAfter) {
  res.setHeader('Retry-After', String(retryAfter));
  sendProblem(res, 429, 'rate', 'Too many tries. Wait a minute and try again.');
}

// ---------------------------------------------------------------- health and shutdown

// One endpoint per Kubernetes probe. None of them sign anyone in, and none
// count towards rate limits.
//   startup: everything is set up (later: databases connected and migrated)
//   live:    the event loop still turns; never checks other services, so an
//            outage there doesn't get every server restarted
//   ready:   send traffic here (not while shutting down, not without a database)
const LAG_LIMIT_MS = 5000;
let started = false;
let draining = false;
let lag = 0;
let lastTick = performance.now();
setInterval(() => {
  const t = performance.now();
  lag = Math.max(0, t - lastTick - 1000);
  lastTick = t;
}, 1000).unref();

async function storeOk() {
  try {
    return Boolean(await store.ping());
  } catch {
    return false;
  }
}

const HEALTH = {
  '/health/startup': () => (started ? [200, { status: 'started' }] : [503, { status: 'starting' }]),
  '/health/live': () => (lag < LAG_LIMIT_MS ? [200, { status: 'live' }] : [503, { status: 'stuck', lagMs: Math.round(lag) }]),
  '/health/ready': async () => {
    if (!started) return [503, { status: 'starting' }];
    if (draining) return [503, { status: 'draining' }];
    if (!(await storeOk())) return [503, { status: 'database' }];
    return [200, { status: 'ready' }];
  },
};

// Stop taking new work, let everyone's browser know, and finish. Live classes
// are in this process's memory (for now), so they end here; streams are
// closed so browsers reconnect to the next server.
async function drain({ timeoutMs = 20000 } = {}) {
  if (draining) return;
  draining = true;
  clearInterval(scheduleTimer);
  const closed = new Promise((resolve) => server.close(resolve));
  for (const set of streams.values()) {
    for (const s of set) {
      s.res.write('retry: 2000\n\n');
      s.res.end();
    }
  }
  for (const [code, set] of pollers) {
    const room = rooms.get(code);
    for (const w of set) room ? answerPoll(room, w) : send(w.res, 200, { closed: true });
  }
  server.closeIdleConnections();
  const timeout = new Promise((resolve) => setTimeout(resolve, timeoutMs).unref());
  await Promise.race([closed, timeout]);
  server.closeAllConnections();
  await store.close();
}

function route(req) {
  const url = new URL(req.url, 'http://x');
  const parts = url.pathname.split('/').filter(Boolean); // api, rooms, CODE, action
  if (parts[0] !== 'api') return null;
  const account = matchAccountRoute(req.method, url.pathname);
  if (account) return { handler: async (r) => account.handler(await signedIn(r), account.params, r), url, name: account.pattern };
  if (parts.length === 4 && parts[1] === 'rooms') {
    const handler = routes[`${req.method} /api/rooms/:code/${parts[3]}`];
    const live = req.method === 'GET' && /^(events|poll)$/.test(parts[3]);
    // (the route's name for logs never includes the code, and only known actions)
    return { handler, code: parts[2], url, name: handler || live ? `/api/rooms/:code/${parts[3]}` : '/api/rooms/:code/:action' };
  }
  const handler = routes[`${req.method} ${url.pathname}`];
  return { handler, url, name: handler ? url.pathname : '/api/:unknown' };
}

const server = http.createServer(async (req, res) => {
  const health = HEALTH[req.url.split('?')[0]];
  if (health) {
    const [status, body] = await health();
    return send(res, status, body);
  }
  const ip = clientIp(req, config.trustProxy);
  const t0 = performance.now();
  let r;
  // One log record per request: the route's pattern (never a path with codes in it), status and time
  // (at a terminal only with LOG_LEVEL=debug: a class polls several times a second)
  res.on('finish', () =>
    log[config.log.format === 'json' ? 'info' : 'debug']('http.request', {
      'http.request.method': req.method,
      'http.route': r ? r.name : 'static',
      'http.response.status_code': res.statusCode,
      duration_ms: Math.round(performance.now() - t0),
    })
  );
  try {
    const any = limiter.take('request', ip);
    if (!any.ok) return tooMany(res, any.retryAfter);
    r = route(req);
    if (!r) return serveStatic(req, res);
    // Live updates: /api/rooms/CODE/events?teacher=KEY or ?id=ID&key=KEY
    // or, where streams don't get through, /poll with the same keys plus ?v=VERSION
    r.live = req.method === 'GET' && r.code && /\/(events|poll)$/.test(r.url.pathname);
    if (isCodeLookup(req, r)) {
      const misses = limiter.check('miss', ip);
      if (!misses.ok) return tooMany(res, misses.retryAfter);
      if (CODE_ROUTES.has(`${req.method} ${r.url.pathname}`) && Auth.bearer(req)) {
        const tries = limiter.take('codeTry', tokenKey(req));
        if (!tries.ok) return tooMany(res, tries.retryAfter);
      }
    }
    if (r.url.pathname === '/api/auth/dev') {
      const signIns = limiter.take('devSignIn', ip);
      if (!signIns.ok) return tooMany(res, signIns.retryAfter);
    }
    if (r.live) {
      const poll = r.url.pathname.endsWith('/poll');
      const code = String(r.code).toUpperCase();
      if (poll && !rooms.has(code) && closedRooms.has(code)) return send(res, 200, { closed: true });
      const room = getRoom(code);
      const q = r.url.searchParams;
      const version = Number(q.get('v'));
      // A wrong key looks the same as no class, so streams can't be used to find codes
      const noRoom = () => new Rooms.RoomError('room', 'No class with that code. Check the code on the board.');
      if (q.has('teacher')) {
        if (q.get('teacher') !== room.teacherKey) throw noRoom();
        return poll ? openPoll(req, res, room, 'teacher', null, version) : openStream(req, res, room, 'teacher', null, ip);
      }
      const player = room.players.find((x) => x.id === q.get('id'));
      if (poll && !player) return send(res, 200, { removed: true });
      let p;
      try {
        p = Rooms.findPlayer(room, q.get('id'), q.get('key'));
      } catch {
        throw noRoom();
      }
      return poll ? openPoll(req, res, room, 'student', p, version) : openStream(req, res, room, 'student', p, ip);
    }
    if (!r.handler) return sendProblem(res, 404, 'not-found', 'Not found.');
    send(res, 200, await r.handler(req, r.code));
  } catch (e) {
    if (r && isMiss(e) && isCodeLookup(req, r)) limiter.take('miss', ip);
    if (e instanceof HttpError) return sendProblem(res, e.status, e.code, e.message);
    if (e instanceof AccountError) return sendProblem(res, e.status, e.code, e.message);
    if (e instanceof Auth.AuthError) return sendProblem(res, 401, 'auth', e.message);
    if (e instanceof Rooms.RoomError) {
      const status = e.code === 'room' || e.code === 'player' ? 404 : e.code === 'teacher' ? 403 : 409;
      return sendProblem(res, status, e.code, e.message);
    }
    log.error('http.error', { 'http.request.method': req.method, 'http.route': r ? r.name : 'static', ...exception(e) });
    sendProblem(res, 500, 'server', 'Something went wrong.'); // (never the error itself: it stays in the log)
  }
});

// Forget classes nobody has touched for a while.
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.touchedAt > ROOM_IDLE_MS && !(streams.get(code) || new Set()).size) {
      rooms.delete(code);
      streams.delete(code);
      pollers.delete(code);
      presence.delete(code);
    }
  }
}, 10 * 60 * 1000).unref();

if (IS_MAIN) {
  // Anything that slips past the request handlers: log it and exit, so the
  // process manager (Kubernetes, systemd) restarts a clean server
  const fatal = (event) => (e) => {
    log.error(event, exception(e));
    process.exit(1);
  };
  process.on('unhandledRejection', fatal('process.unhandled_rejection'));
  process.on('uncaughtException', fatal('process.uncaught_exception'));
  // Kubernetes sends SIGTERM before stopping a pod; Ctrl+C is SIGINT
  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.once(signal, async () => {
      log.info('server.draining', { signal });
      await drain();
      process.exit(0);
    });
  }
  server.listen(PORT, () => {
    log.info('server.started', { 'server.port': PORT, 'auth.kind': auth.name, 'moderation.openai': Boolean(OPENAI_API_KEY), 'deployment.production': config.production });
    if (config.log.format === 'json') return;
    // a person at a terminal: where to go
    console.log(`Blockout server on http://localhost:${PORT}/`);
    for (const url of lanUrls()) console.log(url === PUBLIC_URL ? `  Students join at: ${url}` : `  Chromebooks on this network: ${url}`);
    console.log(`  Name check: word list${OPENAI_API_KEY ? ' + OpenAI moderation' : ' (set OPENAI_API_KEY to add OpenAI moderation)'}`);
    console.log(`  Sign-in: ${auth.name === 'dev' ? 'dev sign-in (pick any name and role; set BLOCKOUT_AUTH=keycloak for Keycloak)' : `Keycloak at ${auth.config.issuer}`}`);
  });
}

started = true;

export { server, rooms, store, accounts, drain };
