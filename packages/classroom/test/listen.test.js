// Live updates in the browser, with a stand-in EventSource and fetch: a class
// is only "lost" when the server says it's gone (404), not when the server is
// restarting or busy for a moment.
import test from 'node:test';
import assert from 'node:assert';

// Just enough of a browser for the client
const noop = () => {};
const memoryStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};
Object.assign(globalThis, { window: { addEventListener: noop }, location: { protocol: 'http:' }, localStorage: memoryStorage(), sessionStorage: memoryStorage() });

class FakeEventSource {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;
  static last = null;
  constructor(url) {
    this.url = url;
    this.readyState = FakeEventSource.CONNECTING;
    this.listeners = {};
    FakeEventSource.last = this;
  }
  addEventListener(name, fn) {
    (this.listeners[name] ||= []).push(fn);
  }
  emit(name, data) {
    for (const fn of this.listeners[name] || []) fn({ data: JSON.stringify(data) });
  }
  fail() {
    this.readyState = FakeEventSource.CLOSED; // what a browser does on an error answer
    this.emit('error');
  }
  close() {
    this.readyState = FakeEventSource.CLOSED;
  }
}
globalThis.EventSource = FakeEventSource;

// fetch answers from a queue of [status, body]; then holds (a long poll)
let answers = [];
let polls = 0;
globalThis.fetch = async () => {
  polls++;
  const next = answers.shift();
  if (!next) return new Promise(noop);
  const [status, body] = next;
  return { status, ok: status < 300, json: async () => body };
};

const { listenStudent } = await import('../src/client.js');
const settle = (ms = 30) => new Promise((r) => setTimeout(r, ms));

test('a stream that fails with 503 falls back to polling and keeps the class', async () => {
  answers = [
    [503, { error: 'server' }],
    [200, { v: 3, view: { round: 3 } }],
  ];
  polls = 0;
  const views = [];
  const gone = [];
  const close = listenStudent({ code: 'ABCD', id: 'p1', key: 'k' }, { view: (v) => views.push(v), gone: (r) => gone.push(r) });
  FakeEventSource.last.emit('view', { round: 2 });
  FakeEventSource.last.fail(); // the server answered 503 (restarting)
  await settle(2100); // one retry after RETRY_MS
  assert.deepEqual(gone, []);
  assert.deepEqual(views, [{ round: 2 }, { round: 3 }]);
  assert.ok(polls >= 2);
  close();
});

test('a 404 means the class is gone', async () => {
  answers = [[404, { error: 'room' }]];
  const gone = [];
  const close = listenStudent({ code: 'WXYZ', id: 'p1', key: 'k' }, { view: noop, gone: (r) => gone.push(r) });
  FakeEventSource.last.fail();
  await settle();
  assert.deepEqual(gone, ['lost']);
  close();
});

test('an answer to a busy class is sent again, and lands', async () => {
  const { sendResult } = await import('../src/client.js');
  answers = [
    [503, { error: 'busy', message: 'The class is busy. Try again.' }],
    [503, { error: 'busy', message: 'The class is busy. Try again.' }],
    [200, { ok: true, score: 12 }],
  ];
  polls = 0;
  const r = await sendResult({ code: 'ABCD', id: 'p1', key: 'k' }, { round: 1, kind: 'timeout' });
  assert.deepEqual(r, { ok: true, score: 12 });
  assert.equal(polls, 3, 'three tries');
});

test('other errors are not retried', async () => {
  const { sendResult } = await import('../src/client.js');
  answers = [[409, { error: 'done', message: 'You already answered.' }]];
  polls = 0;
  await assert.rejects(sendResult({ code: 'ABCD', id: 'p1', key: 'k' }, { round: 1, kind: 'timeout' }), /already answered/);
  assert.equal(polls, 1);
});
