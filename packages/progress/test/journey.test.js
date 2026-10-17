import test from 'node:test';
import assert from 'node:assert';
import * as Progress from '../src/progress.js';
import * as Journey from '../src/journey.js';
import { levelOfStep, practiceLevelOfTable } from '../src/levels.js';

const won = { won: true, answered: 5, firstTry: 5, helped: 0 };

test('the ladder: n×n with an n-sided die, one stage on 1×1–3×3, three from 4×4 to 12×12, then six challenges', () => {
  assert.equal(Journey.LEVELS.length, 3 + 9 * 3 + 6);
  assert.equal(Journey.DONE, 37);
  for (let n = 1; n <= 3; n++) assert.deepEqual([Journey.levelSetup(n).size, Journey.levelInfo(n).stages], [n, 1]);
  for (let n = 4; n <= 12; n++) {
    for (let stage = 1; stage <= 3; stage++) {
      const level = 3 + (n - 4) * 3 + stage;
      assert.deepEqual(Journey.levelSetup(level), { size: n, difficulty: n <= 6 ? 'easy' : n <= 8 ? 'medium' : 'hard', sides: n });
      assert.equal(Journey.levelInfo(level).stage, stage);
    }
  }
  assert.deepEqual(Journey.levelSetup(32), { size: 12, difficulty: 'tricky' });
  // a step's grants come with its first stage; each is a Shop item that says so
  for (const l of Journey.LEVELS) for (const id of l.grants) assert.equal(Progress.shopItem(id).journey, l.level, id);
  assert.ok(Journey.LEVELS.every((l) => l.stage === 1 || !l.grants.length));
  // a level's Expert uses a difficulty it has unlocked by then
  for (const l of Journey.LEVELS) {
    if (l.difficulty !== 'easy') assert.ok(Journey.LEVELS.some((x) => x.level <= l.level && x.grants.includes(`difficulty.${l.difficulty}`)), `level ${l.level}`);
  }
  assert.equal(Journey.levelLine(1), '1×1 board, 1-sided die');
  assert.equal(Journey.levelLine(14), '7×7 board, 7-sided dice · stage 2 of 3');
  assert.equal(Journey.levelLine(32), '12×12 board, Tricky dice');
  assert.doesNotMatch(Journey.goalLine(2), /Help me count/, '2×2: one stage, no extra goals');
  assert.match(Journey.goalLine(5), /without “Help me count”/);
  assert.equal(Journey.goalLine(6), 'Beat the CPU with every answer right first try');
});

test('a new player starts on level 1 with no Free play', () => {
  const s = Progress.createProgress();
  assert.equal(Journey.journeyLevel(s), 1);
  assert.equal(Journey.freePlayOpen(s), false);
  const steps = Journey.steps(s);
  assert.equal(steps.length, 18);
  assert.deepEqual(steps[0], { level: 1, label: '1', done: false, current: true });
  assert.deepEqual(steps.slice(13, 17).map((x) => x.label), ['T', '20', 'M', 'L']);
});

test('the stages: win with good answers, then without help, then with every answer right first try', () => {
  const s = Progress.createProgress();
  s.journey.level = levelOfStep(6); // 6×6, stage 1
  assert.equal(Journey.recordLevelGame(s, 10, { ...won, won: false }).missing, 'win');
  assert.equal(Journey.recordLevelGame(s, 10, { ...won, firstTry: 3 }).missing, 'accuracy');
  const r = Journey.recordLevelGame(s, 10, { ...won, helped: 2 });
  assert.deepEqual([r.advanced, r.to, r.reward], [true, 11, 60], 'stage 1 allows help; 10 points × the board');
  assert.equal(Journey.recordLevelGame(s, 11, { ...won, helped: 1 }).missing, 'help');
  Journey.recordLevelGame(s, 11, won);
  assert.equal(Journey.recordLevelGame(s, 12, { ...won, answered: 6 }).missing, 'perfect', '5 of 6 isn’t every one');
  assert.equal(Journey.recordLevelGame(s, 12, { ...won, answered: 4, firstTry: 3 }).missing, 'perfect', 'stage 3 says its own goal, even under 80 %');
  assert.match(Journey.resultMessage(Journey.recordLevelGame(s, 12, { ...won, answered: 6 })).text, /every answer right first try/);
  assert.equal(Journey.recordLevelGame(s, 12, won).advanced, true);
  assert.equal(Journey.journeyLevel(s), levelOfStep(7));
  // replaying a level you've passed doesn't move you
  const again = Journey.recordLevelGame(s, 1, won);
  assert.deepEqual([again.advanced, again.current], [false, false]);
  assert.equal(Journey.resultMessage(again), null);
  assert.match(Journey.resultMessage(Journey.recordLevelGame(s, 13, { ...won, won: false })).text, /Beat the CPU/);
});

test('reaching a board unlocks its board and difficulty, and Free play on 6×6', () => {
  const s = Progress.createProgress();
  s.journey.level = levelOfStep(6) - 1;
  assert.equal(Journey.freePlayOpen(s), false);
  const r = Journey.recordLevelGame(s, levelOfStep(6) - 1, won);
  assert.equal(Journey.freePlayOpen(s), true);
  assert.ok(r.earned.some((a) => a.id === 'journey_6'));
  s.journey.level = levelOfStep(7) - 1;
  assert.deepEqual(Journey.recordLevelGame(s, levelOfStep(7) - 1, won).grants, ['difficulty.medium']);
  s.journey.level = 36;
  const done = Journey.recordLevelGame(s, 36, won);
  assert.equal(done.to, Journey.DONE);
  assert.ok(Progress.isUnlocked(s, 'boardCustom'));
  assert.ok(done.earned.some((a) => a.id === 'journey_done'));
  assert.equal(Journey.recordLevelGame(s, Journey.DONE, won).current, false);
  assert.ok(Journey.steps(s).every((x) => x.done && !x.current));
});

test('older saves start on the first stage of the board they had reached, keeping everything', () => {
  const level = (saved) => Journey.journeyLevel(Progress.normalize(saved));
  assert.equal(level({ wallet: 5 }), 1);
  assert.equal(level({ counters: { games: 2 }, boardsV2: true }), levelOfStep(6));
  assert.equal(level({ boardsV2: true, unlocks: ['board8'], counters: { games: 2 } }), levelOfStep(8));
  assert.equal(level({ boardsV2: true, boardWins: { 8: 1 }, counters: { games: 2 } }), levelOfStep(9));
  assert.equal(level({ boardsV2: true, unlocks: ['board12', 'difficulty.hard'] }), levelOfStep(12));
  assert.equal(level({ boardsV2: true, unlocks: ['difficulty.legend'] }), levelOfStep(17));
  // played before 6×6 was free: had 12×12
  assert.equal(level({ counters: { games: 2 } }), levelOfStep(12));
  // from 0.6–0.7, a level a board: to that board's first stage
  assert.equal(level({ boardsV2: true, journeyV1: true, journey: { level: 7 } }), levelOfStep(7));
  assert.equal(level({ boardsV2: true, journeyV1: true, journey: { level: 14 } }), 32);
  // from 0.8–0.9 (three stages on every board): the same board and stage
  const v2 = { boardsV2: true, journeyV1: true, journeyV2: true };
  assert.equal(level({ ...v2, journey: { level: 6 } }), 2, '2×2, stage 3: its one stage');
  assert.equal(level({ ...v2, journey: { level: 20 } }), 14, '7×7, stage 2');
  assert.equal(level({ ...v2, journey: { level: 38 } }), 32, 'Tricky');
  assert.equal(level({ ...v2, journey: { level: 43 } }), Journey.DONE);
  assert.equal(level({ boardsV2: true, journeyV1: true, journey: { level: 19 } }), Journey.DONE);
  const s = Progress.normalize({ boardsV2: true, unlocks: ['board10'] });
  for (const id of ['difficulty.medium', 'board8', 'difficulty.hard', 'board10']) assert.ok(Progress.isUnlocked(s, id), id);
  // only once: a new save isn't moved up by what it owns
  assert.equal(level({ ...Progress.createProgress(), unlocks: ['board12'] }), 1);
});

test('merging two saves keeps the higher levels', () => {
  const a = Progress.createProgress();
  const b = Progress.createProgress();
  b.journey.level = levelOfStep(9);
  b.practiceJourney.level = practiceLevelOfTable(5);
  const m = Progress.mergeProgress(a, b);
  assert.equal(Journey.journeyLevel(m), levelOfStep(9));
  assert.ok(Progress.isUnlocked(m, 'difficulty.hard'));
  assert.equal(Journey.practiceLevel(m), practiceLevelOfTable(5));
  assert.ok(Progress.isUnlocked(m, 'table5'));
});

test('Practice Journey: each table in five rounds (5, 10, 20, Expert, Expert with a timer); Free practice from ×2', () => {
  assert.equal(Journey.PRACTICE_LEVELS.length, 60);
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(Journey.practiceSetup), [
    { table: 1, count: 5, expert: false, timer: 0 },
    { table: 1, count: 10, expert: false, timer: 0 },
    { table: 1, count: 20, expert: false, timer: 0 },
    { table: 1, count: 10, expert: true, timer: 0 },
    { table: 1, count: 10, expert: true, timer: 30 },
    { table: 2, count: 5, expert: false, timer: 0 },
  ]);
  // the timer gets shorter along each difficulty's tables
  assert.deepEqual([1, 3, 5, 7, 8, 9, 10, 11, 12].map((t) => Journey.practiceSetup(practiceLevelOfTable(t) + 4).timer), [30, 10, 5, 10, 5, 30, 10, 5, 5]);
  const s = Progress.createProgress();
  assert.equal(Journey.freePracticeOpen(s), false);
  assert.equal(Journey.onPracticeJourney(s, 'free'), true, 'nothing to pick yet');
  assert.equal(Journey.recordPracticeLevel(s, 1, { count: 5, firstTry: 3 }).missing, 'accuracy');
  const r = Journey.recordPracticeLevel(s, 1, { count: 5, firstTry: 4 });
  assert.deepEqual([r.advanced, r.to, r.grants, r.reward], [true, 2, ['practice10'], 5]);
  assert.match(Journey.practiceResultMessage(r).title, /Round 2 of ×1/);
  Journey.recordPracticeLevel(s, 2, { count: 10, firstTry: 8 });
  Journey.recordPracticeLevel(s, 3, { count: 20, firstTry: 16 });
  const e = Journey.recordPracticeLevel(s, 4, { count: 10, firstTry: 8 });
  assert.deepEqual(e.grants, ['practiceTimer30']);
  assert.equal(Journey.practiceResultMessage(e).text, 'Next: 10 questions, Expert, 30 s timer. +5 points');
  assert.deepEqual([2, 4, 5, 6].map(Journey.practiceNextLabel), ['10 questions ›', 'Expert ›', 'Expert + timer ›', '×2 ›']);
  const t = Journey.recordPracticeLevel(s, 5, { count: 10, firstTry: 8 });
  assert.deepEqual(t.grants, ['table2']);
  assert.match(Journey.practiceResultMessage(t).title, /×2 unlocked/);
  assert.equal(Journey.freePracticeOpen(s), true);
  assert.equal(Journey.practiceTier(practiceLevelOfTable(7)), 'medium');
  assert.equal(Journey.practiceLine(14), 'The ×3 table up to 3 × 6 · round 4 of 5: 10 questions, Expert');
  assert.deepEqual(Journey.practiceSteps(s).slice(0, 2).map((x) => [x.label, x.done, x.current]), [['×1', true, false], ['×2', false, true]]);
  for (const l of Journey.PRACTICE_LEVELS) for (const id of l.grants) assert.equal(Progress.shopItem(id).practiceJourney, l.level, id);
});

test('older saves: Practice starts on the first round of the highest table owned, and is free', () => {
  const lvl = (saved) => Journey.practiceLevel(Progress.normalize(saved));
  assert.equal(lvl({ practiceV2: true, unlocks: [] }), 1);
  assert.equal(lvl({ practiceV2: true, unlocks: ['practice', 'table1', 'table2', 'table3', 'practice20'] }), practiceLevelOfTable(3), 'a bought 20 doesn’t move you');
  assert.ok(Progress.isUnlocked(Progress.normalize({ practiceV2: true }), 'practice'));
  // from 0.7, a level a table: to that table's first round
  assert.equal(lvl({ practiceV2: true, practiceJourneyV1: true, practiceJourney: { level: 6 } }), practiceLevelOfTable(6));
  assert.equal(lvl({ practiceV2: true, practiceJourneyV1: true, practiceJourney: { level: 13 } }), Journey.PRACTICE_DONE);
  // from 0.8, three rounds a table: the same table and round
  const v2 = { practiceV2: true, practiceJourneyV1: true, practiceJourneyV2: true };
  assert.equal(lvl({ ...v2, practiceJourney: { level: 17 } }), practiceLevelOfTable(6) + 1, '×6, round 2');
  assert.equal(lvl({ ...v2, practiceJourney: { level: 37 } }), Journey.PRACTICE_DONE);
});
