import test from 'node:test';
import assert from 'node:assert';
import * as Progress from '../src/progress.js';
import * as Setup from '../src/setup.js';

test('Expert and its timers need their own unlock on each difficulty', () => {
  const s = Progress.createProgress();
  assert.deepEqual(Setup.gameLevel(s, 'easy', { level: 'expert', timer: 10 }), { level: 'learn', timer: 0 });
  s.unlocks.push(Progress.gameExpertId('easy'));
  assert.deepEqual(Setup.gameLevel(s, 'easy', { level: 'expert', timer: 10 }), { level: 'expert', timer: 0 }, 'the timer is its own unlock');
  s.unlocks.push(Progress.gameTimerId(10, 'easy'));
  assert.deepEqual(Setup.gameLevel(s, 'easy', { level: 'expert', timer: 10 }), { level: 'expert', timer: 10 });
  assert.deepEqual(Setup.gameLevel(s, 'medium', { level: 'expert', timer: 10 }), { level: 'learn', timer: 0 }, 'per difficulty');
  assert.equal(Setup.levelItem('hard', 'expert'), Progress.gameExpertId('hard'));
  assert.equal(Setup.timerItem('hard', 0), null);
  for (const d of Progress.DIFFICULTIES) for (const secs of [30, 10, 5]) assert.ok(Progress.shopItem(Setup.timerItem(d, secs)), `${d} ${secs}s is a Shop item`);
});

test('the timer says its bonus (doubled on Expert)', () => {
  assert.match(Setup.timerHelp(10), new RegExp(`up to \\+${Progress.TIMER_BONUS_MAX[10] * 2} a question`));
  assert.match(Setup.timerHelp(0), /A timer earns a bonus/);
});

test('Legend needs a board of 12×12 or bigger', () => {
  assert.match(Setup.boardWarning('legend', 8), /needs a board of 12×12 or bigger/);
  assert.equal(Setup.boardWarning('legend', 12), null);
  assert.equal(Setup.boardWarning('easy', 6), null);
});

test("Master's dice go after the weak facts", () => {
  const s = Progress.createProgress();
  for (let i = 0; i < 3; i++) Progress.recordAnswer(s, 'You', { a: 3, b: 4, firstTry: true, correct: true, ms: 1000 });
  Progress.recordAnswer(s, 'You', { a: 6, b: 7, firstTry: false, correct: true, wrongAnswers: [40], ms: 9000 });
  Progress.recordAnswer(s, 'You', { a: 6, b: 7, firstTry: false, correct: true, wrongAnswers: [41], ms: 9000 });
  const w = Setup.masterWeight(s);
  assert.ok(w(6, 7) > w(3, 4) * 10, 'a fact that needs practice comes up far more than a mastered one');
  assert.ok(w(1, 5) < w(5, 5), 'easy ×1 facts count half');
});
