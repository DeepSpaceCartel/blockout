import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Progress from '../src/progress.js';
import * as Daily from '../src/daily.js';

const flags = { boardsV2: true, practiceV2: true, placeAutoV1: true, gameExpertV1: true, practiceTimersV1: true, boardWinsFromHistory: true };
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

test('without practice: a game on a board not won yet', () => {
  const s = save(['board8']);
  assert.deepEqual(Daily.pickTask(s), { kind: 'game', size: 6, difficulty: 'easy', why: 'board' });
  s.boardWins = { 6: 1 };
  assert.equal(Daily.pickTask(s).size, 8);
  s.boardWins = { 6: 1, 8: 1 };
  assert.deepEqual(Daily.pickTask(s), { kind: 'game', size: 8, difficulty: 'easy', why: 'difficulty' });
  assert.equal(Daily.taskText(Daily.pickTask(s)), 'Beat the CPU on Easy, 8×8');
  assert.equal(Daily.shortText(Daily.pickTask(s)), 'Win 8×8 on Easy');
});

test('the task stays all day, is done once, and the streak grows the reward', () => {
  const s = save(tables(2));
  const t = Daily.today(s, day(1)).task;
  answer(s, 1, 1, { right: false, times: 3 }); // (the save changes; the task doesn't, today)
  assert.deepEqual(Daily.today(s, day(1)).task, t);
  assert.equal(Daily.complete(s, { kind: 'practice', tables: [2], count: 5 }, day(1)), null, 'another table');
  assert.equal(Daily.complete(s, { kind: 'practice', tables: [1], count: 3 }, day(1)), null, 'too short');
  assert.equal(Daily.complete(s, { kind: 'practice', tables: [1, 2], count: 10 }, day(1)), null, 'every table: maybe never asked ×1');
  const wallet = s.wallet;
  const done = Daily.complete(s, { kind: 'practice', tables: [1], count: 5 }, day(1));
  assert.equal(done.bonus, 30);
  assert.equal(done.streak, 1);
  assert.ok(done.earned.some((a) => a.id === 'daily_first'));
  assert.equal(s.wallet, wallet + 30 + done.earned.reduce((n, a) => n + a.reward, 0));
  assert.equal(Daily.complete(s, { kind: 'practice', tables: [1], count: 5 }, day(1)), null, 'once a day');
  assert.equal(Daily.card(s, day(1)).title, '⭐ Done for today!');
  // the next day: a new task, and a streak
  const next = Daily.today(s, day(2)).task;
  assert.equal(Daily.card(s, day(2)).reward, '+40');
  const r2 = Daily.complete(s, { kind: next.kind, tables: next.tables, count: 5, size: next.size, difficulty: next.difficulty, won: true }, day(2));
  assert.deepEqual([r2.bonus, r2.streak], [40, 2]);
  // a day missed: back to 1
  Daily.today(s, day(4));
  assert.equal(Daily.card(s, day(4)).reward, '+30');
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
  assert.deepEqual(Progress.normalize({ ...flags }).daily, { day: null, task: null, done: false, streak: 0, lastDone: null });
});
