import test from 'node:test';
import assert from 'node:assert';
import * as Progress from '../src/progress.js';
import * as Practice from '../src/practice.js';

const seeded = (s = 5) => () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
const withTables = (...n) => {
  const s = Progress.createProgress();
  s.unlocks.push(...n.map(Practice.tableItem));
  return s;
};

test('setup: Expert, its timer and longer rounds need their own unlocks on each difficulty', () => {
  const s = Progress.createProgress();
  assert.deepEqual(Practice.practiceChoice(s, 'easy', { level: 'expert', timer: 10, count: 20 }), { level: 'learn', timer: 0, count: 5 });
  s.unlocks.push(Progress.practiceExpertId('easy'), Progress.practiceTimerId(10, 'easy'), Progress.practiceCountId(20, 'easy'));
  assert.deepEqual(Practice.practiceChoice(s, 'easy', { level: 'expert', timer: 10, count: 20 }), { level: 'expert', timer: 10, count: 20 });
  assert.deepEqual(Practice.practiceChoice(s, 'hard', { level: 'expert', timer: 10, count: 20 }), { level: 'learn', timer: 0, count: 5 });
  assert.match(Practice.countHelp(10, true), /Finish all 10 for \+30 bonus points \(doubled on Expert\)/);
  assert.match(Practice.timerHelp(5), /it counts as missed/);
});

test('the tables: chosen ones that are unlocked, or else every unlocked one; the preview counts the facts', () => {
  const s = withTables(1, 2, 3);
  assert.deepEqual(Practice.tableChoices('easy'), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(Practice.roundTables(s, 'easy'), [1, 2, 3]);
  assert.deepEqual(Practice.roundTables(s, 'easy', [3, 5]), [3], '×5 is still locked');
  assert.equal(Practice.preview({ ...Progress.createProgress(), unlocks: [] }, 'easy'), null, 'nothing unlocked: no round');
  assert.match(Practice.preview(s, 'easy', [3]), /^×3 up to 6 \(11 facts\): 0 need practice, 0 learning, 11 not seen yet, 0 mastered\.$/);
  assert.match(Practice.preview(s, 'easy'), /^All your unlocked tables \(×1, ×2 and ×3\), up to 6/);
});

test('a round: points per right answer, a miss comes back once, help after two misses', () => {
  const s = withTables(1, 2, 3, 4, 5, 6);
  const r = Practice.createRound(s, { count: 5, rng: seeded() });
  assert.equal(r.queue.length, 5);
  assert.equal(Practice.counter(r), 'Question 1 of 5');
  const q = r.current;
  assert.deepEqual(Practice.answer(s, r, q.area + 1), { correct: false, attempts: 1, helpNow: false });
  assert.equal(r.queue.length, 6, 'the miss comes back at the end');
  assert.equal(Practice.answer(s, r, q.area + 2).helpNow, true);
  assert.equal(r.queue.length, 6, 'only once');
  const h = Practice.help(s, r);
  assert.deepEqual(h.totals, Array.from({ length: q.a }, (_, i) => (i + 1) * q.b));
  assert.equal(Practice.help(s, r), null, 'once a question');
  const right = Practice.answer(s, r, q.area, { ms: 2000 });
  assert.equal(right.correct, true);
  assert.equal(right.firstTry, false);
  assert.equal(right.points, 1);
  assert.match(right.text, /^You got it! \+1 point$/);
  assert.equal(s.wallet >= 1, true);
});

test('a whole round to the end: the finishing bonus, the record, and what changed', () => {
  const s = withTables(1, 2, 3, 4, 5, 6);
  s.unlocks.push(Progress.practiceCountId(10, 'easy'));
  const r = Practice.createRound(s, { count: 10, rng: seeded(9), now: () => 1000 });
  let missedOne = false;
  while (r.current) {
    if (!missedOne) {
      Practice.answer(s, r, r.current.area + 1);
      missedOne = true;
    }
    Practice.answer(s, r, r.current.area, { ms: 1500 });
    Practice.next(r);
  }
  assert.equal(r.done, true);
  assert.equal(r.queue.length, 11, 'one retry');
  const end = Practice.finish(s, r, () => 61000);
  assert.equal(end.finish, 15);
  assert.deepEqual(end.finishToast, ['🏁 Finished all 10 questions!', '+15 bonus points']);
  assert.match(end.sub, /^9 of 10 right first time · 1 fact retried/);
  assert.equal(end.record.kind, 'practice');
  assert.equal(end.record.duration, 60000);
  assert.ok(end.changes.length > 0, 'facts moved');
  assert.equal(s.counters.practiceRounds, 1);
});

test('Expert: no help, double bonuses; a timeout counts as missed and comes back', () => {
  const s = withTables(1, 2, 3, 4, 5, 6);
  const r = Practice.createRound(s, { level: 'expert', timer: 10, rng: seeded(3) });
  assert.equal(r.expert, true);
  const q = r.current;
  Practice.answer(s, r, q.area + 1);
  assert.equal(Practice.answer(s, r, q.area + 2).helpNow, false);
  assert.equal(Practice.help(s, r), null);
  const right = Practice.answer(s, r, q.area, { ms: 1000, timer: { secs: 10, left: 0.9 } });
  assert.equal(right.bonus.multiplier, 2);
  Practice.next(r);
  const before = r.queue.length;
  assert.match(Practice.timeout(s, r).text, /^⏰ Time's up! .* It'll come back later\.$/);
  assert.equal(r.queue.length, before + 1);
});

test('practice: a helped question earns its point but no bonus', () => {
  const state = Progress.createProgress();
  const round = Practice.createRound(state, { difficulty: 'easy', count: 1, tables: [3], rng: () => 0.1 });
  assert.ok(Practice.help(state, round));
  const res = Practice.answer(state, round, round.current.area, { ms: 500 });
  assert.equal(res.firstTry, false);
  assert.equal(res.bonus.total, 0);
  assert.equal(round.streak, 0);
});

test('a Practice Journey round: the ×n table with a little review, and a good round moves you up', () => {
  const s = Progress.createProgress();
  s.practiceJourney.level = 7;
  const r = Practice.createRound(s, { count: 10, journeyLevel: 7, rng: seeded(3) });
  assert.deepEqual(r.tables, [7]);
  const sevens = r.queue.filter(([a, b]) => a === 7 || b === 7);
  assert.equal(sevens.length, 8, 'two in ten review the tables before');
  assert.ok(r.queue.every(([a, b]) => a <= 12 && b <= 12));
  assert.ok(r.queue[0][0] === 7 || r.queue[0][1] === 7, 'the round starts on the new table');
  while (r.current) {
    Practice.answer(s, r, r.current.area);
    Practice.next(r);
  }
  const end = Practice.finish(s, r);
  assert.deepEqual([end.journey.advanced, end.journey.to], [true, 8]);
  assert.ok(Progress.isUnlocked(s, 'table8'));
  assert.equal(end.record.journeyLevel, 7);
  assert.equal(Practice.journeyQueue({}, 1, 5, seeded()).length, 5, '×1 has nothing to review');
});
