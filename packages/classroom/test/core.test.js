// The client anywhere (core.js), as the phone app makes it: the server's
// address, an async token, no event streams (long polling from the start),
// and its own storage.
import test from 'node:test';
import assert from 'node:assert';
import { createClient } from '../src/core.js';

const noop = () => {};

test('without event streams it polls the server’s address, and sends the token', async () => {
  const calls = [];
  let answers = [
    [200, { v: 1, view: { round: 1 } }],
    [200, { v: 2, view: { round: 2 } }],
    [200, { closed: true }],
  ];
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url, auth: opts.headers && opts.headers.Authorization });
    if (url.endsWith('/join')) return { status: 200, ok: true, json: async () => ({ id: 'p1', key: 'k' }) };
    const next = answers.shift();
    if (!next) return new Promise(noop);
    return { status: next[0], ok: true, json: async () => next[1] };
  };
  const kept = new Map();
  const client = createClient({
    base: 'https://blockout.example',
    token: async () => 'tok',
    EventSource: null,
    storage: { get: (k) => kept.get(k) ?? null, set: (k, v) => (v === null ? kept.delete(k) : kept.set(k, v)) },
  });
  const joined = await client.join('ABCD', 'Sam', {});
  assert.deepEqual(joined, { id: 'p1', key: 'k' });
  assert.equal(calls[0].url, 'https://blockout.example/api/rooms/ABCD/join');
  assert.equal(calls[0].auth, 'Bearer tok');
  client.saveSession({ code: 'ABCD', id: 'p1', key: 'k', name: 'Sam' });
  assert.equal(client.session().name, 'Sam');
  const views = [];
  const gone = [];
  client.listenStudent({ code: 'ABCD', id: 'p1', key: 'k' }, { view: (v) => views.push(v), gone: (r) => gone.push(r) });
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(views, [{ round: 1 }, { round: 2 }]);
  assert.deepEqual(gone, ['closed']);
  assert.match(calls[1].url, /^https:\/\/blockout\.example\/api\/rooms\/ABCD\/poll\?id=p1&key=k&v=-1$/);
  client.saveSession(null);
  assert.equal(client.session(), null);
});
