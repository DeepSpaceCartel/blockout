// Talking to the classroom server (apps/server) from anywhere: JSON requests,
// live updates (Server-Sent Events, or long polling where there are none, like
// a phone), and the class session. The browser's client (client.js) and the
// phone app each make one with what their platform has.
//
//   createClient({ base, token, storage, EventSource, unloading, served })
//     base: the server's address ('' for the page's own); token(): the bearer
//     token or null (may be async); storage: { get(key), set(key, value) }
//     kept synchronously (strings); EventSource: the class, or null to poll;
//     unloading(): the page is going away (a dropped connection isn't the
//     class going away); served(): can this page reach a server at all

const SESSION_KEY = 'blockout.class'; // { code, id, key, name } for a student
const HOST_KEY = 'blockout.classHost'; // { code, teacherKey } for the teacher

class ClassError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function createClient({ base = '', token = () => null, storage = null, EventSource = globalThis.EventSource || null, unloading = () => false, served = () => true } = {}) {
  const BUSY_TRIES = 4;

  // A busy class (503 busy: the change wasn't saved, others were writing at that
  // instant) is tried again a few times before giving up
  async function request(method, path, body, tries = BUSY_TRIES) {
    let res;
    try {
      // Signed in: the server knows who's hosting or joining
      const bearer = await token();
      res = await fetch(base + path, {
        method,
        headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
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
    if (res.status === 503 && data.error === 'busy' && tries > 1) {
      await new Promise((r) => setTimeout(r, 100 + Math.random() * 200 * (BUSY_TRIES - tries + 1)));
      return request(method, path, body, tries - 1);
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

  // Live updates. handlers: { view(v), gone(reason) }. Returns a close() function.
  // First an event stream (EventSource reconnects by itself after a blip). Some
  // proxies hold streams back (Cloudflare quick tunnels, some school filters), so if
  // nothing arrives in a few seconds we switch to long polling, which gets through
  // anything. If the class or the player no longer exists we stop and say why.
  const STREAM_WAIT_MS = 4000;
  const RETRY_MS = 2000;

  function listen(path, query, handlers) {
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

    let src = EventSource ? new EventSource(`${base + path}/events?${query}`) : null;
    if (src) {
      src.addEventListener('view', (e) => deliver(JSON.parse(e.data)));
      src.addEventListener('closed', () => stop('closed'));
      src.addEventListener('removed', () => stop('removed'));
      src.addEventListener('error', () => {
        if (closed || unloading() || !src) return;
        // Any error answer (a 404, but also a server that's restarting, or too
        // busy) closes the stream for good (readyState CLOSED). Polling finds out
        // which: it stops on a 404 and keeps trying otherwise.
        if (src.readyState === EventSource.CLOSED) poll();
      });
      setTimeout(() => {
        if (closed || got) return;
        poll();
      }, STREAM_WAIT_MS);
    }

    let polling = false;
    async function poll() {
      if (polling) return;
      polling = true;
      if (src) src.close();
      src = null;
      let version = -1;
      while (!closed) {
        let data;
        try {
          const res = await fetch(`${base + path}/poll?${query}&v=${version}`, { cache: 'no-store' });
          if (res.status === 404) return stop('lost');
          if (!res.ok) throw new Error(`HTTP ${res.status}`); // (restarting, busy: try again shortly)
          data = await res.json();
        } catch (e) {
          if (closed || unloading()) return;
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

    if (!src) poll(); // (no event streams here, like a phone: long polling from the start)

    return () => {
      closed = true;
      if (src) src.close();
    };
  }

  const listenStudent = (s, handlers) => listen(`/api/rooms/${s.code}`, `id=${encodeURIComponent(s.id)}&key=${encodeURIComponent(s.key)}`, handlers);
  const listenTeacher = (h, handlers) => listen(`/api/rooms/${h.code}`, `teacher=${encodeURIComponent(h.teacherKey)}`, handlers);

  const load = (key) => {
    try {
      return storage ? JSON.parse(storage.get(key)) : null;
    } catch (e) {
      return null;
    }
  };
  const store = (key, value) => {
    try {
      if (storage) storage.set(key, value ? JSON.stringify(value) : null);
    } catch (e) {}
  };

  return {
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
    session: () => load(SESSION_KEY),
    saveSession: (s) => store(SESSION_KEY, s),
    host: () => load(HOST_KEY),
    saveHost: (h) => store(HOST_KEY, h),
  };
}

export { ClassError };
