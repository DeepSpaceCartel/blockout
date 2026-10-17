import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Progress from '../src/progress.js';
import * as Daily from '../src/daily.js';

const flags = { boardsV2: true, practiceV2: true, placeAutoV1: true, gameExpertV1: true, practiceTimersV1: true, journeyV1: true, practiceJourneyV1: true, boardWinsFromHistory: true };
const save = (unlocks = []) => Progress.normalize({ ...Progress.createProgress(), ...flags, unlocks });
const tables = (n) => ['practice', ...Array.from({ length: n }, (_, i) => `table${i + 1}`)];
// answer a fact enough times to reach a status
function answer(state, a, b, { right = true, times = 1 } = {}) {
  for (let i = 0; i < times; i++) Progress.recordAnswer(state, 'You', { a, b, firstTry: right, correct: true, wrongAnswers: right ? [] : [a * b + 1], ms: 2000 });
}
function master(state, n) {
  for (let m = 1; m <= 10; m++) {
    answer(state, n, m, { times: 6 });
    answer(state, m, n, { times: 6 });
  }
}
const day = (d) => new Date(2026, 9, d, 9);
const seeded = (x = 5) => () => ((x = (x * 16807) % 2147483647) - 1) / 2147483646;

test('facts that need practice come first, two tables at most', () => {
  const s = save(tables(8));
  answer(s, 7, 8, { right: false, times: 3 });
  answer(s, 6, 7, { right: false, times: 3 });
  answer(s, 3, 4, { right: false, times: 3 });
  const t = Daily.pickTask(s);
  assert.equal(t.kind, 'practice');
  assert.equal(t.why, 'needs');
  assert.ok(t.tables.includes(7), '×7 has the most');
  assert.equal(t.tables.length, 2);
  assert.match(Daily.taskText(t), /^Practise ×\d+ and ×\d+: 5 questions$/);
});

test('then the lowest table not mastered, then a taste of the next one', () => {
  const s = save(tables(3));
  assert.deepEqual(Daily.pickTask(s), { kind: 'practice', tables: [1], count: 5, difficulty: 'easy', why: 'learn' });
  for (const n of [1, 2, 3]) master(s, n);
  const t = Daily.pickTask(s);
  assert.deepEqual([t.tables, t.why], [[4], 'next']);
  assert.equal(Daily.taskText(t), 'Try the ×4 table: 5 questions');
  assert.equal(Daily.shortText(t), 'Try ×4');
  const nine = Daily.pickTask((() => { const x = save(tables(8)); for (let n = 1; n <= 8; n++) master(x, n); return x; })());
  assert.deepEqual([nine.tables, nine.difficulty], [[9], 'hard'], 'a taste of ×9 comes from Hard’s dice');
});

test('the cards it can deal: needs practice first, then tables to learn, a taste of the next, the Journey, games from 6×6', () => {
  const s = save(tables(3));
  answer(s, 2, 3, { right: false, times: 3 });
  const c = Daily.candidates(s);
  assert.deepEqual(c[0], { kind: 'practice', tables: [2, 3], count: 5, difficulty: 'easy', why: 'needs' }, 'the most useful first: 2 × 3 is in both tables');
  assert.deepEqual(c.map((t) => t.why), ['needs', 'needs', 'needs', 'learn', 'next', 'journey'], 'together, then each, then ×1 to learn, ×4 to taste');
  assert.equal(c.some((t) => t.kind === 'game'), false, 'no games before Free play (6×6)');
  assert.equal(Daily.taskText(c.find((t) => t.kind === 'journey')), 'Win Level 1 of your Journey');
  // every table mastered, Free play open: a board not won yet, a challenge
  const m = save([...tables(12), 'board8']);
  m.journey.level = 10;
  for (let n = 1; n <= 12; n++) for (let k = 1; k <= 12; k++) answer(m, n, k, { times: 6 });
  const games = () => Daily.candidates(m).filter((t) => t.kind === 'game');
  assert.deepEqual(games()[0], { kind: 'game', size: 6, difficulty: 'easy', why: 'board' });
  m.boardWins = { 6: 1, 8: 1 };
  assert.deepEqual(games()[0], { kind: 'game', size: 8, difficulty: 'easy', why: 'difficulty' });
  assert.equal(Daily.taskText(games()[0]), 'Beat the CPU on Easy, 8×8');
  assert.equal(Daily.shortText(games()[0]), 'Win 8×8 on Easy');
});

test('three cards stay all day, any one does it, once, and the streak grows the reward', () => {
  const s = save(tables(2));
  const cards = Daily.today(s, day(1), seeded(1)).choices;
  assert.equal(cards.length, 3);
  assert.equal(new Set(cards.map((t) => JSON.stringify(t))).size, 3, 'three different');
  assert.deepEqual(cards[0], Daily.candidates(s)[0], 'one is the most useful');
  answer(s, 1, 1, { right: false, times: 3 }); // (the save changes; the cards don't, today)
  assert.deepEqual(Daily.today(s, day(1)).choices, cards);
  assert.equal(Daily.complete(s, { kind: 'practice', tables: [1], count: 3 }, day(1)), null, 'too short');
  assert.equal(Daily.complete(s, { kind: 'practice', tables: [1, 2], count: 10 }, day(1)), null, 'every table: maybe never asked ×1');
  const wallet = s.wallet;
  const t = cards[1];
  const done = Daily.complete(s, { kind: t.kind === 'journey' ? 'game' : t.kind, tables: t.tables, count: 5, level: t.level, won: true }, day(1));
  assert.equal(done.bonus, 30, 'any of the three');
  assert.equal(done.streak, 1);
  assert.ok(done.earned.some((a) => a.id === 'daily_first'));
  assert.equal(s.wallet, wallet + 30 + done.earned.reduce((n, a) => n + a.reward, 0));
  assert.equal(Daily.complete(s, { kind: 'practice', tables: cards[0].tables, count: 5 }, day(1)), null, 'once a day');
  const c = Daily.card(s, day(1));
  assert.deepEqual([c.title, c.cards.length, c.reroll.can], ['⭐ Done for today!', 0, false]);
  // the next day: new cards, and a streak
  const next = Daily.today(s, day(2)).choices[0];
  assert.equal(Daily.card(s, day(2)).reward, '+40');
  const r2 = Daily.complete(s, { kind: next.kind === 'journey' ? 'game' : next.kind, tables: next.tables, count: 5, size: next.size, difficulty: next.difficulty, level: next.level, won: true }, day(2));
  assert.deepEqual([r2.bonus, r2.streak], [40, 2]);
  // a day missed: back to 1
  Daily.today(s, day(4));
  assert.equal(Daily.card(s, day(4)).reward, '+30');
});

test('new cards cost points, doubling each time that day; not once it is done', () => {
  const s = save(tables(4));
  s.wallet = 25;
  const first = Daily.today(s, day(1), seeded(2)).choices;
  assert.equal(Daily.card(s, day(1)).reroll.label, '🎲 New cards · 10 points');
  assert.deepEqual(Daily.reroll(s, day(1), seeded(3)), { ok: true, cost: 10 });
  const second = Daily.today(s, day(1)).choices;
  assert.ok(Daily.candidates(s).length >= 6);
  assert.ok(second.every((t) => !first.some((f) => JSON.stringify(f) === JSON.stringify(t))), 'three new ones (when there are enough)');
  assert.equal(s.wallet, 15);
  assert.deepEqual(Daily.reroll(s, day(1)), { ok: false, reason: 'points', missing: 5 }, '20 the second time');
  s.wallet = 100;
  Daily.reroll(s, day(1));
  assert.equal(Daily.rerollCost(s, day(1)), 40);
  assert.equal(Daily.today(s, day(2)).rerolls, 0, 'a new day: back to 10');
  Daily.complete(s, { kind: 'practice', tables: Daily.today(s, day(2)).choices.find((t) => t.tables).tables, count: 5 }, day(2));
  assert.deepEqual(Daily.reroll(s, day(2)), { ok: false, reason: 'done' });
});

test('a save from when there was one task keeps it as one of the three', () => {
  const s = save(tables(3));
  const old = { kind: 'practice', tables: [3], count: 5, difficulty: 'easy', why: 'learn' };
  s.daily = { day: Progress.dayKey(day(1)), task: old, done: false, streak: 0, lastDone: null };
  assert.deepEqual(Daily.today(s, day(1)).choices[0], old);
  assert.equal(Daily.today(s, day(1)).choices.length, 3);
});

test('a game task needs a win on that board (or bigger) and difficulty', () => {
  const task = { kind: 'game', size: 8, difficulty: 'easy' };
  assert.equal(Daily.matches(task, { kind: 'game', size: 10, difficulty: 'easy', won: true }), true);
  assert.equal(Daily.matches(task, { kind: 'game', size: 8, difficulty: 'easy', won: false }), false);
  assert.equal(Daily.matches(task, { kind: 'game', size: 8, difficulty: 'medium', won: true }), false);
});

test('two saves of the same player keep the later day, and a done one', () => {
  const a = save();
  const b = save();
  a.daily = { day: '2026-10-02', task: { kind: 'game' }, done: false, streak: 1, lastDone: '2026-10-01' };
  b.daily = { day: '2026-10-02', task: { kind: 'game' }, done: true, streak: 2, lastDone: '2026-10-02' };
  assert.equal(Progress.mergeProgress(a, b).daily.done, true);
  assert.equal(Progress.mergeProgress(b, a).daily.done, true);
  assert.deepEqual(Progress.normalize({ ...flags }).daily, { day: null, choices: [], done: false, streak: 0, lastDone: null, rerolls: 0 });
});
