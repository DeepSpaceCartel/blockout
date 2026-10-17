import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Progress from '../src/progress.js';
import { homeworkChoice, homeworkIntro, homeworkRows, openCount } from '../src/homework.js';

const save = (unlocks = []) => ({ ...Progress.createProgress(), unlocks });

test('the list reads late, open, then done, with who set each', () => {
  const items = [
    { goal: { type: 'games', games: 2 }, status: 'done', have: 2, need: 2, from: 'teacher', fromName: 'Ms. K' },
    { goal: { type: 'master', table: 3 }, status: 'open', have: 4, need: 19, from: 'parent', due: '2026-10-20' },
    { goal: { type: 'win', size: 8, difficulty: 'any' }, status: 'late', have: 0, need: 1, from: 'teacher', due: '2026-10-01' },
  ];
  const rows = homeworkRows(items);
  assert.deepEqual(rows.map((r) => r.h.status), ['late', 'open', 'done']);
  assert.match(rows[0].state, /^⏰ Was due /);
  assert.match(rows[1].state, /^Due /);
  assert.equal(rows[2].state, '✅ Done');
  assert.equal(rows[1].from, 'from a grown-up 👪');
  assert.equal(rows[2].from, 'from Ms. K 🍎');
  assert.equal(rows[1].label, 'Master the ×3 table');
  assert.deepEqual(rows.map((r) => r.playable), [true, true, false]);
  assert.equal(openCount(items), 2);
  assert.match(homeworkIntro(items), /ticks itself off/);
  assert.match(homeworkIntro([items[0]]), /All done/);
  assert.equal(homeworkIntro([]), 'No homework right now.');
});

test('a homework sets the menu up for what it asks', () => {
  const s = save(['practice', 'difficulty.medium', 'board8', 'table1', 'table2', 'table3']);
  assert.deepEqual(homeworkChoice(s, { type: 'win', size: 8, difficulty: 'medium' }), { mode: 'single', difficulty: 'medium', size: 8 });
  assert.deepEqual(homeworkChoice(s, { type: 'win', size: 12, difficulty: 'any' }), { mode: 'single' }, 'a locked board stays as it is');
  assert.deepEqual(homeworkChoice(s, { type: 'practice', rounds: 2, difficulty: 'hard' }), { mode: 'practice' }, 'a locked difficulty too');
  assert.deepEqual(homeworkChoice(s, { type: 'games', games: 3 }), { mode: 'single' });
  const master = homeworkChoice(s, { type: 'master', table: 3 });
  assert.equal(master.mode, 'practice');
  assert.deepEqual(master.tables, [3]);
  assert.ok(['easy', 'medium'].includes(master.difficulty));
});
