import test from 'node:test';
import assert from 'node:assert';
import * as M from '../src/moderation.js';

const blocked = (name) => M.listedWord(name) !== null;

test('rude names are caught, even with tricks', () => {
  for (const name of ['Fuck', 'fuuuck', 'F.u.c.k', 'f u c k', 'Sh1t', '$hit', 'Bïtch', 'Poop', 'Big Ass', 'NAZI', 'Dickhead', 'Mr Poopy', 'Hitler', 'buttface', 'Butt', 'sexy lady']) {
    assert.ok(blocked(name), `${name} should be blocked`);
  }
});

test('real names pass, including ones with a rude word inside', () => {
  for (const name of ['Maya', 'Cassandra', 'Cassidy', 'Assunta', 'Dickens', 'Hancock', 'Scunthorpe', 'Nazim', 'Nazia', 'Manus', 'Janus', 'Marsel', 'Hellen', 'Titus', 'Hassan', 'Shital', 'José María', 'Zoë', 'Anne-Marie', "O'Neil", 'Grape', 'Analise', 'Bassam', 'Matthew', 'Kaito']) {
    assert.ok(!blocked(name), `${name} should pass (matched ${M.listedWord(name)})`);
  }
});

test('an allowed name doesn’t hide a rude word next to it', () => {
  assert.ok(blocked('Hancock Fuck'));
});

test('OpenAI is only asked when there is a key, and a flag blocks the name', async () => {
  let calls = 0;
  const fakeFetch = (flagged) => async (url, opts) => {
    calls++;
    assert.equal(url, M.OPENAI_URL);
    assert.equal(JSON.parse(opts.body).model, M.OPENAI_MODEL);
    assert.match(opts.headers.Authorization, /^Bearer sk-test$/);
    return { ok: true, json: async () => ({ results: [{ flagged }] }) };
  };
  assert.deepEqual(await M.checkName('Maya', { fetch: fakeFetch(true) }), { ok: true }); // no key: not asked
  assert.equal(calls, 0);
  assert.deepEqual(await M.checkName('Maya', { apiKey: 'sk-test', fetch: fakeFetch(false) }), { ok: true });
  assert.deepEqual(await M.checkName('Sneaky', { apiKey: 'sk-test', fetch: fakeFetch(true) }), { ok: false, reason: 'openai' });
  assert.equal(calls, 2);
  // the word list answers first, without asking OpenAI
  assert.deepEqual(await M.checkName('Poop', { apiKey: 'sk-test', fetch: fakeFetch(false) }), { ok: false, reason: 'words' });
  assert.equal(calls, 2);
});

test('if OpenAI can’t answer, the name is allowed (a class never gets stuck)', async () => {
  const warn = console.warn;
  console.warn = () => {};
  try {
    const down = async () => {
      throw new Error('network down');
    };
    assert.deepEqual(await M.checkName('Maya', { apiKey: 'sk-test', fetch: down }), { ok: true });
    const error = async () => ({ ok: false, status: 500, json: async () => ({}) });
    assert.deepEqual(await M.checkName('Maya', { apiKey: 'sk-test', fetch: error }), { ok: true });
    const slow = (url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
    assert.deepEqual(await M.checkName('Maya', { apiKey: 'sk-test', fetch: slow, timeoutMs: 50 }), { ok: true });
  } finally {
    console.warn = warn;
  }
});
