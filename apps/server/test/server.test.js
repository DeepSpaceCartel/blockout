// The HTTP API end to end: a real server on a spare port with an in-memory database.
process.env.BLOCKOUT_STORE = 'memory';
process.env.BLOCKOUT_ROOMS = 'memory'; // (hermetic: no shared rate limits or rooms)
process.env.LOG_LEVEL = 'silent';
process.env.BLOCKOUT_AUTH_SECRET = 'test-secret';
import test from 'node:test';
import assert from 'node:assert';
import * as P from '@blockout/progress';

const { server, store } = await import('../src/index.js'); // (after the environment is set)

let base;
test.before(() => new Promise((resolve) => server.listen(0, () => ((base = `http://localhost:${server.address().port}`), resolve()))));
test.after(async () => {
  server.close();
  await store.close(); // (a database connection would keep the test running)
});

async function call(method, path, body, token) {
  const res = await fetch(base + path, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json() };
}
const signIn = async (person) => (await call('POST', '/api/auth/dev', person)).data.token;

test('HTTP: sign in, class roster, hosting needs a teacher, signed-in students join under their account name', async () => {
  const config = await call('GET', '/api/auth/config');
  assert.equal(config.data.provider, 'dev');
  assert.deepEqual(config.data.schools.map((s) => s.name), ['Cadence Park']);

  const teacher = await signIn({ firstName: 'Ms', lastInitial: 'R', role: 'teacher', schoolId: 'cadence-park' });
  const kid = await signIn({ firstName: 'Maya', lastInitial: 'K', role: 'student', email: 'maya@iusd.org' });
  assert.equal((await call('GET', '/api/me', null, kid)).data.user.name, 'Maya K.');
  assert.equal((await call('GET', '/api/me')).status, 401);
  assert.equal((await call('GET', '/api/me', null, 'nonsense')).status, 401);

  const c = (await call('POST', '/api/classes', { name: 'Room 12' }, teacher)).data;
  assert.equal((await call('POST', '/api/me/classes', { code: c.code }, kid)).status, 200);
  assert.equal((await call('POST', '/api/classes', { name: 'Nope' }, kid)).status, 403);
  const detail = (await call('GET', `/api/classes/${c.id}`, null, teacher)).data;
  assert.deepEqual(detail.students.map((s) => s.name), ['Maya K.']);

  // guests and students can't host; teachers can
  assert.equal((await call('POST', '/api/rooms', { settings: {} })).status, 401);
  assert.equal((await call('POST', '/api/rooms', { settings: {} }, kid)).status, 401);
  const room = (await call('POST', '/api/rooms', { settings: {} }, teacher)).data;
  assert.match(room.code, /^[A-Z]+$/);
  // a signed-in student joins as their account's first name, whatever they type
  const joined = (await call('POST', `/api/rooms/${room.code}/join`, { name: 'Whatever' }, kid)).data;
  assert.equal(joined.name, 'Maya');
  // guests still join with a name
  assert.equal((await call('POST', `/api/rooms/${room.code}/join`, { name: 'Leo' })).data.name, 'Leo');

  // progress sync
  const save = P.createProgress();
  save.wallet = 42;
  assert.equal((await call('PUT', '/api/me/progress', { progress: save }, kid)).status, 200);
  assert.equal((await call('GET', '/api/me/progress', null, kid)).data.progress.wallet, 42);
});

test('HTTP: errors are RFC 9457 problem details (and keep error/message for the games)', async () => {
  const res = await fetch(`${base}/api/me`);
  assert.equal(res.status, 401);
  assert.match(res.headers.get('content-type'), /^application\/problem\+json/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('permissions-policy'), 'camera=(), microphone=(), geolocation=()');
  assert.equal(res.headers.get('strict-transport-security'), null); // (only over https)
  assert.match(res.headers.get('content-security-policy'), /script-src 'self';.*frame-ancestors 'none'/);
  const body = await res.json();
  assert.deepEqual(body, { type: 'about:blank', title: 'Unauthorized', status: 401, detail: 'Please sign in first.', error: 'signin', message: 'Please sign in first.' });
  const missing = await fetch(`${base}/api/nope`);
  assert.equal((await missing.json()).status, 404);
});

test('HTTP: malformed addresses and cut-off bodies get an answer, and the server keeps going', async () => {
  for (const path of ['/%E0', '/addition/%E0%A4%A', '/api/classes/%E0']) {
    const res = await fetch(base + path);
    assert.equal(res.status, 400, path);
    assert.equal((await res.json()).error, 'bad-request');
  }

  // A body that stops halfway: the client goes away before sending it all
  const net = await import('node:net');
  await new Promise((resolve) => {
    const sock = net.connect(server.address().port, 'localhost', () => {
      sock.write('POST /api/rooms HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n{"ty');
      setTimeout(() => (sock.destroy(), resolve()), 50);
    });
  });
  assert.equal((await call('GET', '/api/health')).status, 200);
});

test('HTTP: a class holds at most 200 live streams', async () => {
  const http = await import('node:http');
  const teacher = await signIn({ firstName: 'Mx', lastInitial: 'S', role: 'teacher', schoolId: 'cadence-park' });
  const room = (await call('POST', '/api/rooms', { type: 'class' }, teacher)).data;
  const agent = new http.Agent({ maxSockets: Infinity });
  const open = () =>
    new Promise((resolve) => http.get(`${base}/api/rooms/${room.code}/events?teacher=${room.teacherKey}`, { agent }, (res) => resolve(res)));
  const streams = await Promise.all(Array.from({ length: 200 }, open));
  assert.ok(streams.every((res) => res.statusCode === 200));
  const extra = await open();
  assert.equal(extra.statusCode, 429);
  extra.resume();
  for (const res of streams) res.destroy();
  agent.destroy();
});

test('HTTP: one health endpoint per Kubernetes probe', async () => {
  for (const [path, status] of [['/health/startup', 'started'], ['/health/live', 'live'], ['/health/ready', 'ready']]) {
    const res = await fetch(base + path);
    assert.equal(res.status, 200, path);
    assert.equal((await res.json()).status, status);
    assert.equal(res.headers.get('cache-control'), 'no-store');
  }
});

// (last: it uses up this address's wrong-code allowance)
test('HTTP: guessing codes gets 429 after a run of wrong ones; streams with a wrong key look like no class', async () => {
  const teacher = await signIn({ firstName: 'Mr', lastInitial: 'G', role: 'teacher', schoolId: 'cadence-park' });
  const room = (await call('POST', '/api/rooms', { type: 'class' }, teacher)).data;
  assert.equal((await call('GET', `/api/rooms/${room.code}/poll?teacher=nope`)).status, 404);
  assert.equal((await call('GET', `/api/rooms/${room.code}/poll?id=x&key=y`)).data.removed, true);

  let status;
  let tries = 0;
  do {
    const res = await fetch(`${base}/api/rooms/QQQ${String.fromCharCode(65 + (tries % 26))}/info`);
    status = res.status;
    tries++;
    if (status === 429) assert.ok(Number(res.headers.get('retry-after')) >= 1);
  } while (status === 404 && tries < 100);
  assert.equal(status, 429);
  assert.ok(tries > 20 && tries < 40, `blocked after ${tries} tries`);
  // a real class can't be looked up from here either until the minute is up
  assert.equal((await call('GET', `/api/rooms/${room.code}/info`)).status, 429);
});
