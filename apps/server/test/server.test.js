// The HTTP API end to end: a real server on a spare port with an in-memory database.
process.env.BLOCKOUT_DB = ':memory:';
process.env.BLOCKOUT_AUTH_SECRET = 'test-secret';
import test from 'node:test';
import assert from 'node:assert';
import * as P from '@blockout/progress';

const { server } = await import('../src/index.js'); // (after the environment is set)

let base;
test.before(() => new Promise((resolve) => server.listen(0, () => ((base = `http://localhost:${server.address().port}`), resolve()))));
test.after(() => server.close());

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
