import test from 'node:test';
import assert from 'node:assert';
import * as Progress from '../src/progress.js';
import * as Journey from '../src/journey.js';

test('the ladder: level n is an n×n board with an n-sided die up to 12, then challenges', () => {
  for (let n = 1; n <= 12; n++) assert.deepEqual(Journey.levelSetup(n), { size: n, difficulty: n <= 6 ? 'easy' : n <= 8 ? 'medium' : 'hard', sides: n });
  assert.deepEqual(Journey.levelSetup(14), { size: 12, difficulty: 'tricky' });
  assert.equal(Journey.LEVELS.length + 1, Journey.DONE);
  // every grant is a Shop item that says which level unlocks it
  for (const l of Journey.LEVELS) for (const id of l.grants) assert.equal(Progress.shopItem(id).journey, l.level, id);
  // a level's Expert uses a difficulty it has unlocked by then
  for (const l of Journey.LEVELS) {
    if (l.difficulty !== 'easy') assert.ok(Journey.LEVELS.some((x) => x.level <= l.level && x.grants.includes(`difficulty.${l.difficulty}`)), `level ${l.level}`);
  }
  assert.equal(Journey.levelLine(1), '1×1 board, 1-sided die');
  assert.equal(Journey.levelLine(7), '7×7 board, 7-sided dice');
  assert.equal(Journey.levelLine(14), '12×12 board, Tricky dice');
});

test('a new player starts on level 1 with no Free play', () => {
  const s = Progress.createProgress();
  assert.equal(Journey.journeyLevel(s), 1);
  assert.equal(Journey.freePlayOpen(s), false);
  assert.deepEqual(Journey.steps(s).slice(0, 2), [{ level: 1, done: false, current: true }, { level: 2, done: false, current: false }]);
});

test('moving up: beat the CPU with 80 % right first try, on your own level', () => {
  const s = Progress.createProgress();
  assert.equal(Journey.recordLevelGame(s, 1, { won: false, answered: 1, firstTry: 1 }).missing, 'win');
  assert.equal(Journey.recordLevelGame(s, 1, { won: true, answered: 5, firstTry: 3 }).missing, 'accuracy');
  assert.equal(Journey.journeyLevel(s), 1);
  const r = Journey.recordLevelGame(s, 1, { won: true, answered: 5, firstTry: 4 });
  assert.deepEqual([r.advanced, r.from, r.to, r.reward], [true, 1, 2, 10]);
  assert.equal(s.wallet, 10);
  assert.equal(Journey.journeyLevel(s), 2);
  // replaying a level you've passed doesn't move you
  const again = Journey.recordLevelGame(s, 1, { won: true, answered: 1, firstTry: 1 });
  assert.deepEqual([again.advanced, again.current], [false, false]);
  assert.equal(Journey.resultMessage(again), null);
  assert.match(Journey.resultMessage(r).title, /Level 2 unlocked/);
});

test('reaching a level unlocks its boards and difficulties, and Free play at 6', () => {
  const s = Progress.createProgress();
  s.journey.level = 6;
  assert.equal(Journey.freePlayOpen(s), true);
  const r = Journey.recordLevelGame(s, 6, { won: true, answered: 4, firstTry: 4 });
  assert.deepEqual(r.grants, ['difficulty.medium']);
  Journey.recordLevelGame(s, 7, { won: true, answered: 4, firstTry: 4 });
  assert.ok(Progress.isUnlocked(s, 'board8'));
  s.journey.level = 18;
  const done = Journey.recordLevelGame(s, 18, { won: true, answered: 10, firstTry: 10 });
  assert.equal(done.to, Journey.DONE);
  assert.ok(Progress.isUnlocked(s, 'boardCustom'));
  assert.ok(done.earned.some((a) => a.id === 'journey_done'));
  assert.equal(Journey.recordLevelGame(s, Journey.DONE, { won: true, answered: 1, firstTry: 1 }).current, false);
});

test('older saves start on the level they had reached, keeping everything', () => {
  const level = (saved) => Journey.journeyLevel(Progress.normalize(saved));
  assert.equal(level({ wallet: 5 }), 1);
  assert.equal(level({ counters: { games: 2 }, boardsV2: true }), 6);
  assert.equal(level({ boardsV2: true, unlocks: ['board8'], counters: { games: 2 } }), 8);
  assert.equal(level({ boardsV2: true, boardWins: { 8: 1 }, counters: { games: 2 } }), 9);
  assert.equal(level({ boardsV2: true, unlocks: ['board12', 'difficulty.hard'] }), 12);
  assert.equal(level({ boardsV2: true, unlocks: ['difficulty.legend'] }), 17);
  // played before 6×6 was free: had 12×12
  assert.equal(level({ counters: { games: 2 } }), 12);
  const s = Progress.normalize({ boardsV2: true, unlocks: ['board10'] });
  for (const id of ['difficulty.medium', 'board8', 'difficulty.hard', 'board10']) assert.ok(Progress.isUnlocked(s, id), id);
  // only once: a new save isn't moved up by what it owns
  assert.equal(level({ ...Progress.createProgress(), unlocks: ['board12'] }), 1);
});

test('merging two saves keeps the higher level', () => {
  const a = Progress.createProgress();
  const b = Progress.createProgress();
  b.journey.level = 9;
  const m = Progress.mergeProgress(a, b);
  assert.equal(Journey.journeyLevel(m), 9);
  assert.ok(Progress.isUnlocked(m, 'difficulty.hard'));
});
