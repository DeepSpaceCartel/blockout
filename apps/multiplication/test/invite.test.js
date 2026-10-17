import test from 'node:test';
import assert from 'node:assert';
import * as I from '../src/invite.js';

const sample = {
  v: 1,
  m: 'multi',
  b: 16,
  p: [{ n: 'Maya', c: false }, { n: '', c: true }],
  s: { difficulty: 'hard', answerTime: '20', placeMode: 'auto' },
  t: 'Practise your 7s! Élan ✓',
  r: 12345,
};

test('encode and decode round-trip, including non-ASCII notes', () => {
  const token = I.encode(sample);
  assert.match(token, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(I.decode(token), sample);
});

test('codes can be pasted as a link, a fragment or on their own', () => {
  const token = I.encode(sample);
  assert.equal(I.tokenFrom(`https://x.trycloudflare.com/index.html#invite=${token}`), token);
  assert.equal(I.tokenFrom(`#invite=${token}`), token);
  assert.equal(I.tokenFrom(`  ${token}  `), token);
  assert.equal(I.tokenFrom('not a code!'), null);
});

test('invalid or tampered invites are rejected', () => {
  const bad = (patch) => I.validate({ ...sample, ...patch });
  assert.equal(bad({ v: 2 }), null);
  assert.equal(bad({ b: 99 }), null);
  assert.equal(bad({ m: 'single' }), null); // single needs exactly one player
  assert.equal(bad({ p: [{ n: 'A' }] }), null); // multi needs 2-4
  assert.equal(bad({ s: { difficulty: 'impossible' } }), null);
  assert.equal(bad({ s: { unknownSetting: 1 } }), null);
  assert.equal(bad({ r: -1 }), null);
  assert.equal(bad({ s: { autoRoll: 'sometimes' } }), null);
  assert.ok(bad({ s: { autoRoll: 'auto' } }));
  assert.equal(I.decode('%%%'), null);
  assert.equal(I.decode(I.encode({ hello: 'world' })), null);
});

test('names and notes are trimmed to size; single player cannot add CPUs', () => {
  const v = I.validate({ v: 1, m: 'single', b: 12, p: [{ n: '  A very very long name here  ', c: true }], s: {}, t: 'x'.repeat(500) });
  assert.equal(v.p[0].n, 'A very very lo');
  assert.equal(v.p[0].c, false);
  assert.equal(v.t.length, 140);
});

test('seeded random repeats exactly for the same seed', () => {
  const a = I.seededRandom(42);
  const b = I.seededRandom(42);
  const c = I.seededRandom(43);
  const seqA = Array.from({ length: 5 }, a);
  assert.deepEqual(seqA, Array.from({ length: 5 }, b));
  assert.notDeepEqual(seqA, Array.from({ length: 5 }, c));
  for (const x of seqA) assert.ok(x >= 0 && x < 1);
});

test('invites: difficulties after Hard, and Legend only on a board it fits', () => {
  for (const difficulty of ['tricky', 'master', 'legend']) {
    assert.ok(I.validate({ ...sample, b: 12, s: { ...sample.s, difficulty } }), difficulty);
  }
  assert.equal(I.validate({ ...sample, b: 8, s: { ...sample.s, difficulty: 'legend' } }), null);
});

test('old invites with settings the game no longer has still open', () => {
  const old = I.validate({ ...sample, s: { difficulty: 'easy', firstInCorner: true, diceMode: 'real', fitRolls: 'never', placeMode: 'click' } });
  assert.deepEqual(old.s, { difficulty: 'easy', placeMode: 'draw' });
});
