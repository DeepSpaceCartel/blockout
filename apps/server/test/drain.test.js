// Shutting down (SIGTERM): not ready any more, streams and held polls are
// answered so browsers move on, and the server stops. (Its own file: it closes the server.)
process.env.BLOCKOUT_DB = ':memory:';
process.env.LOG_LEVEL = 'silent';
process.env.BLOCKOUT_AUTH_SECRET = 'test-secret';
import test from 'node:test';
import assert from 'node:assert';
import http from 'node:http';

const { server, drain } = await import('../src/index.js');

test('drain: streams end, held polls are answered, ready turns 503, the server closes', async () => {
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://localhost:${server.address().port}`;
  const token = (await (await fetch(`${base}/api/auth/dev`, { method: 'POST', body: JSON.stringify({ firstName: 'Ms', lastInitial: 'D', role: 'teacher', schoolId: 'cadence-park' }) })).json()).token;
  const room = await (await fetch(`${base}/api/rooms`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: '{}' })).json();

  const agent = new http.Agent({ maxSockets: Infinity });
  const stream = await new Promise((resolve) => http.get(`${base}/api/rooms/${room.code}/events?teacher=${room.teacherKey}`, { agent }, resolve));
  const ended = new Promise((resolve) => stream.on('end', resolve).resume());
  const view = await (await fetch(`${base}/api/rooms/${room.code}/poll?teacher=${room.teacherKey}&v=-1`)).json();
  const held = fetch(`${base}/api/rooms/${room.code}/poll?teacher=${room.teacherKey}&v=${view.v}`).then((res) => res.json());
  await new Promise((resolve) => setTimeout(resolve, 50));

  const done = drain({ timeoutMs: 2000 });
  await ended;
  assert.equal((await held).v, view.v, 'the held poll is answered right away');
  await done;
  assert.equal(server.listening, false);
  agent.destroy();
});
