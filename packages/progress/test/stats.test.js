import test from 'node:test';
import assert from 'node:assert';
import * as Progress from '../src/progress.js';
import * as Stats from '../src/stats.js';

const player = (name, score, result, extra = {}) => ({ name, cpu: name === 'CPU', score, bonus: 0, result, answered: 4, firstTry: 3, timeouts: 0, times: [2000, 4000], missed: [], ...extra });
const game = (at, size, difficulty, you, cpu, extra = {}) => ({ at, size, duration: 120000, turns: 8, difficulty, vsComputer: true, players: [player('You', you, you > cpu ? 'win' : you < cpu ? 'loss' : 'tie'), player('CPU', cpu, cpu > you ? 'win' : cpu < you ? 'loss' : 'tie')], ...extra });

test('words: ordinals, durations, short times', () => {
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map(Stats.ordinal), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '101st']);
  assert.equal(Stats.formatDuration(20000), '20 s');
  assert.equal(Stats.formatDuration(40000), '1 min'); // (rounded to minutes from 30 s)
  assert.equal(Stats.formatDuration(12 * 60000), '12 min');
  assert.equal(Stats.formatDuration(125 * 60000), '2 h 5 min');
  assert.equal(Stats.shortTime(2140), '2.1s');
  assert.equal(Stats.shortTime(12400), '12s');
});

test('a finished game becomes a history entry; the history keeps the last 200', () => {
  const g = { size: 6, difficulty: 'easy', mode: 'single', startedAt: 1000, turns: 9, players: [{ name: 'You', cpu: false, score: 30, bonus: 4, answered: 5, firstTry: 4, stats: { timeouts: 0, times: [1234.5], missed: [] } }, { name: 'CPU', cpu: true, score: 6, bonus: 0, answered: 2, firstTry: 2, stats: { timeouts: 0, times: [], missed: [] } }] };
  const rec = Stats.gameRecord(g, new Set([0]), 61000);
  assert.equal(rec.duration, 60000);
  assert.equal(rec.vsComputer, true);
  assert.deepEqual(rec.players.map((p) => p.result), ['win', 'loss']);
  assert.deepEqual(rec.players[0].times, [1235]);
  let history = [];
  for (let i = 0; i < 205; i++) history = Stats.addToHistory(history, { at: i });
  assert.equal(history.length, 200);
  assert.equal(history[0].at, 5);
});

test('nothing played: the report says so', () => {
  assert.equal(Stats.statsReport([], Progress.createProgress()).empty, true);
});

test('the report: tiles, a row per game type, recent games newest first', () => {
  const state = Progress.createProgress();
  Progress.recordAnswer(state, 'You', { a: 3, b: 4, firstTry: true, correct: true, ms: 2000 });
  const history = [game(1, 6, 'easy', 30, 10), game(2, 6, 'easy', 8, 20), game(3, 8, undefined, 12, 12), { kind: 'practice', at: 4, duration: 60000, name: 'You', size: 6, level: 'learn', tables: [], count: 10, firstTry: 8, times: [3000], points: 20 }];
  const report = Stats.statsReport(history, state);
  assert.deepEqual(report.tiles.map((t) => t.value), ['3 + 1', '7 min', '1–1–1']);
  const gamesTable = report.tables.find((x) => x.heading === 'Games');
  assert.deepEqual(gamesTable.rows.map((r) => r.sub), ['6×6 · Easy', '8×8 · Easy'], 'older games without a difficulty count as Easy');
  assert.deepEqual(gamesTable.rows[0].values, [2, 1, 30, '75%', '3.0 s']);
  assert.deepEqual(report.tables.find((x) => x.heading === 'Practice').rows[0].values, [1, '8/10', '80%', '3.0 s']);
  assert.deepEqual(report.players, [{ name: 'You', label: '' }]);
  assert.equal(report.recent.length, 3);
  assert.equal(report.recent[0].winner, 'Tie');
  assert.equal(report.recent[2].winner, '🏆 You');
});

test("a player's Times Table: marks, mastered lines, details, and what to practice", () => {
  const state = Progress.createProgress();
  for (let i = 0; i < 3; i++) Progress.recordAnswer(state, 'You', { a: 2, b: 3, firstTry: true, correct: true, ms: 1500 });
  Progress.recordAnswer(state, 'You', { a: 4, b: 5, firstTry: false, correct: true, wrongAnswers: [21], ms: 6000 });
  Progress.recordAnswer(state, 'You', { a: 4, b: 5, firstTry: false, correct: true, wrongAnswers: [25], ms: 6000 });
  const facts = Stats.playerFacts(state, 'You');
  const grid = Stats.factGrid(facts);
  assert.equal(grid.max, 6);
  assert.equal(grid.cells[1][2].status, 'mastered');
  assert.equal(grid.cells[1][2].mark, '✓');
  assert.match(grid.cells[1][2].detail, /^2 × 3 = 6: Mastered\. 3 of 3 right first time, best 1\.5 s/);
  assert.equal(grid.cells[3][4].status, 'practice');
  assert.equal(grid.cells[0][0].status, 'unseen');
  assert.equal(Stats.factGrid(facts, { showTime: (s) => s === 'mastered' }).cells[1][2].mark, '1.5s');
  assert.equal(Stats.factGrid(facts, { unlocked: 12 }).max, 12);
  const practice = Stats.factsToPractice(facts);
  assert.equal(practice[0].fact, '4 × 5');
  assert.equal(practice[0].count, 2);
});
