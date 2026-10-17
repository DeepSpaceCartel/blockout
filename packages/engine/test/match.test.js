import test from 'node:test';
import assert from 'node:assert';
import * as Match from '../src/match.js';

// A repeatable "random" for dice and the CPU
function seeded(seed = 1) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

const solo = (opts = {}) => Match.createMatch({ players: [{ name: 'Ann' }, { name: 'CPU', cpu: true }], rng: seeded(), ...opts });

// Places the rolled rectangle at the first spot it fits
function placeAnywhere(m) {
  const [a, b] = m.dice;
  for (let y = 0; y < m.size; y++)
    for (let x = 0; x < m.size; x++)
      for (const [w, h] of [[a, b], [b, a]]) {
        if (Match.judge(m, { x, y, w, h }).ok) return Match.place(m, { x, y, w, h });
      }
  throw new Error('nothing fits');
}

test('a human turn: roll, place, answer right, points', () => {
  const m = solo({ answerBonus: ({ firstTry }) => ({ total: firstTry ? 2 : 0, parts: [] }) });
  assert.equal(m.phase, 'roll');
  const [a, b] = Match.roll(m);
  assert.equal(m.phase, 'place');
  const { ok, rect } = placeAnywhere(m);
  assert.ok(ok);
  assert.equal(m.phase, 'answer');
  const r = Match.answer(m, a * b, { ms: 1500 });
  assert.equal(r.correct, true);
  assert.equal(r.firstTry, true);
  assert.equal(m.players[0].score, rect.area + 2);
  assert.equal(m.players[0].streak, 1);
  assert.equal(m.phase, 'scored');
  assert.equal(Match.endTurn(m), null);
  assert.equal(m.phase, 'cpu');
});

test('a wrong size, a clash or a missed corner is turned down with the reason', () => {
  const m = solo({ firstInCorner: true });
  const [a, b] = Match.roll(m, [2, 3]);
  assert.deepEqual([a, b], [2, 3]);
  assert.equal(Match.place(m, { x: 0, y: 0, w: 3, h: 3 }).verdict.rightSize, false);
  assert.equal(Match.place(m, { x: 1, y: 1, w: 2, h: 3 }).verdict.corner, false);
  assert.equal(Match.place(m, { x: 0, y: 0, w: 3, h: 2 }).ok, true); // either way round
});

test('two misses: help, once a turn, and the miss is remembered with its answers', () => {
  const m = solo();
  Match.roll(m, [3, 4]);
  placeAnywhere(m);
  assert.deepEqual(Match.answer(m, 11), { correct: false, attempts: 1, helpNow: false });
  assert.equal(Match.answer(m, 13).helpNow, true);
  const h = Match.help(m);
  assert.deepEqual(h.count.totals, [4, 8, 12]);
  assert.equal(Match.help(m), null, 'only once');
  const r = Match.answer(m, 12);
  assert.equal(r.firstTry, false);
  assert.deepEqual(r.wrongAnswers, [11, 13]);
  assert.deepEqual(m.players[0].stats.missed, [{ fact: '3 × 4', answers: [11, 13], timeout: false }]);
  assert.equal(m.players[0].streak, 0);
});

test('Expert: no help, and bonus points count double', () => {
  const m = solo({ expert: true, bonusMultiplier: 2, answerBonus: () => ({ total: 3, parts: [] }) });
  Match.roll(m, [2, 2]);
  placeAnywhere(m);
  Match.answer(m, 5);
  assert.equal(Match.answer(m, 6).helpNow, false);
  assert.equal(Match.help(m), null);
  assert.equal(Match.answer(m, 4).bonus.total, 6);
});

test('out of time: the rectangle comes off, no points, not a pass', () => {
  const m = solo();
  Match.roll(m, [2, 3]);
  placeAnywhere(m);
  Match.timeout(m);
  assert.equal(m.board.rects.length, 0);
  assert.equal(m.players[0].score, 0);
  assert.equal(m.players[0].stats.timeouts, 1);
  assert.equal(m.passes, 0);
});

test('the keypad checks by itself once more typing can no longer change the outcome', () => {
  assert.equal(Match.answerDecided('', 12), false);
  assert.equal(Match.answerDecided('1', 12), false);
  assert.equal(Match.answerDecided('12', 12), true);
  assert.equal(Match.answerDecided('9', 8), true); // overshoots
  assert.equal(Match.answerDecided('7', 8), true); // as many digits as the answer
});

test('counting goes by the dice: 3 × 4 is 3 rows of 4 when drawn 4 wide', () => {
  assert.deepEqual(Match.countPlan({ a: 3, b: 4, w: 4, h: 3 }), { byRows: true, group: 4, steps: 3, unit: 'row', totals: [4, 8, 12] });
  assert.equal(Match.countPlan({ a: 3, b: 4, w: 3, h: 4 }).unit, 'column');
  assert.deepEqual(Match.legendSplit({ a: 14, b: 7 }, 'legend').split, { teen: 14, other: 7, ones: 4, tens: 70, rest: 28 });
  assert.equal(Match.legendSplit({ a: 4, b: 7 }, 'legend'), null);
});

test('steps out of turn are refused', () => {
  const m = solo();
  assert.throws(() => Match.answer(m, 3), /not now/);
  assert.throws(() => Match.cpuTurn(m), /not now/);
});

test('whole games end, with every square or every player passing, and the scores add up', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const m = Match.createMatch({ size: 6 + (seed % 3) * 2, difficulty: ['easy', 'medium', 'hard'][seed % 3], players: [{ name: 'Ann' }, { name: 'CPU', cpu: true }], rng: seeded(seed) });
    let result = null;
    for (let turn = 0; turn < 500 && !result; turn++) {
      if (m.phase === 'cpu') Match.cpuTurn(m);
      else {
        Match.roll(m);
        if (m.phase === 'stuck') Match.pass(m);
        else {
          const { rect } = placeAnywhere(m);
          Match.answer(m, rect.area);
        }
      }
      result = Match.endTurn(m);
    }
    assert.ok(result, `seed ${seed} ended`);
    assert.equal(m.phase, 'over');
    assert.ok(result.empty === 0 || m.passes >= 2);
    const area = m.board.rects.reduce((sum, r) => sum + r.area, 0);
    assert.equal(m.players.reduce((sum, p) => sum + p.squares, 0), area);
    assert.equal(result.ranked[0].score, Math.max(...m.players.map((p) => p.score)));
  }
});

test('two players on one screen take turns; a CPU first starts with its turn', () => {
  const m = Match.createMatch({ players: [{ name: 'Ann' }, { name: 'Ben' }], mode: 'multi', rng: seeded(3) });
  Match.roll(m);
  if (m.phase === 'stuck') Match.pass(m);
  else Match.answer(m, placeAnywhere(m).rect.area);
  Match.endTurn(m);
  assert.equal(m.current, 1);
  assert.equal(m.phase, 'roll');
  assert.equal(Match.createMatch({ players: [{ name: 'CPU', cpu: true }, { name: 'Ann' }] }).phase, 'cpu');
});

test('a match notes when it started (for the history)', () => {
  assert.equal(Match.createMatch({ players: [{ name: 'Ann' }], now: () => 1234 }).startedAt, 1234);
});

test('tap to place: centred on the tap, kept on the board, the corner first', () => {
  const m = solo({ firstInCorner: true });
  Match.roll(m, [2, 3]);
  assert.deepEqual(Match.previewAt(m, { c: 4, r: 4 }), { x: 0, y: 0, w: 2, h: 3, valid: true }, 'the first one goes in the corner');
  Match.place(m, { x: 0, y: 0, w: 2, h: 3 });
  Match.answer(m, 6);
  Match.endTurn(m); // (the CPU's turn)
  Match.cpuTurn(m);
  Match.endTurn(m);
  Match.roll(m, [3, 1]);
  const p = Match.previewAt(m, { c: 5, r: 2 });
  assert.equal(p.x, 3, 'kept on the board');
  assert.deepEqual([p.w, p.h], [3, 1]);
  assert.deepEqual([Match.previewAt(m, { c: 5, r: 2 }, true).w, Match.previewAt(m, { c: 5, r: 2 }, true).h], [1, 3], 'rotated');
});

test('auto placing picks a spot that fits, and the starting way round is one that fits', () => {
  const m = solo();
  Match.roll(m, [2, 3]);
  const spot = Match.autoSpot(m);
  assert.ok(Match.judge(m, spot).ok);
  assert.equal(Match.startRotated(m), false);
});

test('“Help me count” first: right, but not first time (no bonus, no streak)', () => {
  const m = Match.createMatch({ mode: 'single', difficulty: 'easy', size: 6, players: [{ name: 'You' }, { name: 'CPU', cpu: true }], answerBonus: ({ firstTry }) => (firstTry ? { total: 2, parts: [{ label: 'first try', points: 2 }] } : { total: 0, parts: [] }) });
  Match.roll(m, [2, 3]);
  Match.place(m, { x: 0, y: 0, w: 3, h: 2 });
  assert.ok(Match.help(m));
  const res = Match.answer(m, 6, { ms: 500 });
  assert.equal(res.correct, true);
  assert.equal(res.firstTry, false);
  assert.equal(res.bonus.total, 0);
  assert.equal(m.players[0].score, 6, 'just the squares');
  assert.equal(m.players[0].streak, 0);
});
