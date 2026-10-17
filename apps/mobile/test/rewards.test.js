import test from 'node:test';
import assert from 'node:assert';
import * as Progress from '@blockout/progress';
import * as Match from '@blockout/engine/match';
import { boardOpen, difficultyOpen, onAnswer, onGameOver, onHelp, tableSize } from '../src/rewards.js';

const seeded = (s = 7) => () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;

function playOut(match, progress) {
  let results = null;
  while (!results) {
    if (match.phase === 'cpu') Match.cpuTurn(match);
    else {
      Match.roll(match);
      if (match.phase === 'stuck') Match.pass(match);
      else {
        const [a, b] = match.dice;
        const spot = [...Array(match.size * match.size).keys()].map((i) => ({ x: i % match.size, y: Math.floor(i / match.size) })).flatMap(({ x, y }) => [{ x, y, w: a, h: b }, { x, y, w: b, h: a }]).find((r) => Match.judge(match, r).ok);
        Match.place(match, spot);
        onAnswer(progress, match, Match.answer(match, a * b, { ms: 2000 }), 2000);
      }
    }
    results = Match.endTurn(match);
  }
  return results;
}

test('a single-player game fills the fact record and pays into the wallet', () => {
  const progress = Progress.createProgress();
  const match = Match.createMatch({ players: [{ name: 'You' }, { name: 'CPU', cpu: true }], rng: seeded(), answerBonus: Progress.answerBonus });
  const results = playOut(match, progress);
  const before = progress.wallet;
  const { points, boardBonus, earned } = onGameOver(progress, match, results);
  assert.equal(points, match.players[0].score);
  const rewards = earned.reduce((sum, a) => sum + a.reward, 0); // achievements pay too
  assert.equal(progress.wallet, before + points + boardBonus + rewards);
  assert.equal(progress.counters.games, 1);
  assert.ok(Object.keys(progress.facts[Progress.playerKey('You')].facts).length > 0);
});

test('two players on one phone: points only, nothing permanent', () => {
  const progress = Progress.createProgress();
  const match = Match.createMatch({ players: [{ name: 'Ann' }, { name: 'Ben' }], mode: 'multi', rng: seeded(3) });
  const results = playOut(match, progress);
  const { earned } = onGameOver(progress, match, results);
  assert.deepEqual(earned, []);
  assert.equal(progress.counters.games, 0);
  assert.deepEqual(onHelp(progress, match, { a: 2, b: 3 }), []);
});

test('only unlocked difficulties and boards can be picked', () => {
  const progress = Progress.createProgress();
  assert.equal(difficultyOpen(progress, 'easy'), true);
  assert.equal(difficultyOpen(progress, 'hard'), false);
  assert.equal(boardOpen(progress, 6), true);
  assert.equal(boardOpen(progress, 8), false);
  assert.equal(tableSize(progress), 6);
  progress.unlocks.push('board8', 'difficulty.medium');
  assert.equal(boardOpen(progress, 8), true);
  assert.equal(difficultyOpen(progress, 'medium'), true);
  assert.equal(tableSize(progress), 8);
});
