// Talking to the classroom server (apps/server): JSON requests, live updates
// over Server-Sent Events, and remembering which class this tab is in so a
// reload or a Chromebook that went to sleep can rejoin. Kept per tab
// (sessionStorage), so several tabs can be different students when testing.
// The screens themselves live in the games.

import * as Auth from '@blockout/auth';

const SESSION_KEY = 'blockout.class'; // { code, id, key, name } for a student
const HOST_KEY = 'blockout.classHost'; // { code, teacherKey } for the teacher

class ClassError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// The classroom needs the page to come from the classroom server.
const served = () => location.protocol === 'http:' || location.protocol === 'https:';

async function request(method, path, body) {
  let res;
  try {
    // Signed in (js/auth.js): the server knows who's hosting or joining
    const token = Auth.token();
    res = await fetch(path, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new ClassError('offline', 'Can’t reach the classroom server.');
  }
  let data;
  try {
    data = await res.json();
  } catch (e) {
    throw new ClassError('offline', 'The classroom server isn’t running here.');
  }
  if (!res.ok) throw new ClassError(data.error || 'server', data.message || 'Something went wrong.');
  return data;
}

// null when the server is there, otherwise why not
async function check() {
  if (!served()) return 'file';
  try {
    const h = await request('GET', '/api/health');
    return h.ok ? null : 'offline';
  } catch (e) {
    return 'offline';
  }
}

const health = () => request('GET', '/api/health');
const roomInfo = (code) => request('GET', `/api/rooms/${encodeURIComponent(code)}/info`);
const createRoom = (settings) => request('POST', '/api/rooms', { settings });
// look: { avatar, title } Wardrobe ids, so classmates see your avatar and title
const join = (code, name, look) => request('POST', `/api/rooms/${encodeURIComponent(code)}/join`, { name, look });
// The teacher as a player (pairs: playing the odd one out), from the projector
// screen (with the teacher key) or another device (with the play key from its link).
const joinAsTeacher = (h, look) => request('POST', `/api/rooms/${h.code}/join`, { teacher: h.teacherKey, look });
const joinWithPlayKey = (code, play, look) => request('POST', `/api/rooms/${encodeURIComponent(code)}/join`, { play, look });
// Pairs: what you're doing on your turn, for your partner to watch ({ phase, rect })
const live = (s, payload) => request('POST', `/api/rooms/${s.code}/live`, { id: s.id, key: s.key, live: payload });
const roll = (s) => request('POST', `/api/rooms/${s.code}/roll`, { id: s.id, key: s.key });
const leave = (s) => request('POST', `/api/rooms/${s.code}/leave`, { id: s.id, key: s.key });
const sendResult = (s, result) => request('POST', `/api/rooms/${s.code}/result`, { id: s.id, key: s.key, ...result });
const teacher = (h, action, extra = {}) => request('POST', `/api/rooms/${h.code}/teacher`, { key: h.teacherKey, action, ...extra });

// Reloading or closing the page drops the connection too; that isn't the class going away.
let unloading = false;
window.addEventListener('pagehide', () => (unloading = true));
window.addEventListener('beforeunload', () => (unloading = true));

// Live updates. handlers: { view(v), gone(reason) }. Returns a close() function.
// First an event stream (EventSource reconnects by itself after a blip). Some
// proxies hold streams back (Cloudflare quick tunnels, some school filters), so if
// nothing arrives in a few seconds we switch to long polling, which gets through
// anything. If the class or the player no longer exists we stop and say why.
const STREAM_WAIT_MS = 4000;
const RETRY_MS = 2000;

function listen(base, query, handlers) {
  let closed = false;
  let got = false;
  const stop = (reason) => {
    if (closed) return;
    closed = true;
    if (src) src.close();
    handlers.gone(reason);
  };
  const deliver = (view) => {
    got = true;
    handlers.view(view);
  };

  let src = new EventSource(`${base}/events?${query}`);
  src.addEventListener('view', (e) => deliver(JSON.parse(e.data)));
  src.addEventListener('closed', () => stop('closed'));
  src.addEventListener('removed', () => stop('removed'));
  src.addEventListener('error', () => {
    if (closed || unloading || !src) return;
    // A 404 closes the stream for good (readyState CLOSED): the class is gone.
    if (src.readyState === EventSource.CLOSED) stop('lost');
  });
  setTimeout(() => {
    if (closed || got) return;
    src.close();
    src = null;
    poll();
  }, STREAM_WAIT_MS);

  async function poll() {
    let version = -1;
    while (!closed) {
      let data;
      try {
        const res = await fetch(`${base}/poll?${query}&v=${version}`, { cache: 'no-store' });
        if (res.status === 404) return stop('lost');
        data = await res.json();
      } catch (e) {
        if (closed || unloading) return;
        await new Promise((r) => setTimeout(r, RETRY_MS)); // offline for a moment: try again
        continue;
      }
      if (closed) return;
      if (data.closed) return stop('closed');
      if (data.removed) return stop('removed');
      if (data.v !== version) {
        version = data.v;
        deliver(data.view);
      }
    }
  }

  return () => {
    closed = true;
    if (src) src.close();
  };
}

const listenStudent = (s, handlers) => listen(`/api/rooms/${s.code}`, `id=${encodeURIComponent(s.id)}&key=${encodeURIComponent(s.key)}`, handlers);
const listenTeacher = (h, handlers) => listen(`/api/rooms/${h.code}`, `teacher=${encodeURIComponent(h.teacherKey)}`, handlers);

function load(key) {
  try {
    return JSON.parse(sessionStorage.getItem(key));
  } catch (e) {
    return null;
  }
}
function store(key, value) {
  try {
    if (value) sessionStorage.setItem(key, JSON.stringify(value));
    else sessionStorage.removeItem(key);
  } catch (e) {}
}

// Join links look like https://host/#class=ABCD; the teacher's other device
// gets #class=ABCD&play=KEY.
function linkFromHash(hash = location.hash) {
  const m = /^#class=([A-Za-z]{4})(?:&play=([0-9a-f]+))?$/.exec(hash || '');
  return m ? { code: m[1].toUpperCase(), play: m[2] || null } : null;
}

export const session = () => load(SESSION_KEY);
export const saveSession = (s) => store(SESSION_KEY, s);
export const host = () => load(HOST_KEY);
export const saveHost = (h) => store(HOST_KEY, h);

export {
  ClassError,
  served,
  check,
  health,
  roomInfo,
  createRoom,
  join,
  joinAsTeacher,
  joinWithPlayKey,
  live,
  roll,
  leave,
  sendResult,
  teacher,
  listenStudent,
  listenTeacher,
  linkFromHash,
};
