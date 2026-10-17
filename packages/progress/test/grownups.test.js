import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../src/grownups.js';

test('how long ago, and what a child played', () => {
  const now = 10 * 86400000;
  assert.equal(G.ago(null, now), 'not yet');
  assert.equal(G.ago(now - 60000, now), 'just now');
  assert.equal(G.ago(now - 5 * 60000, now), '5 min ago');
  assert.equal(G.ago(now - 3 * 3600000, now), '3 h ago');
  assert.equal(G.ago(now - 86400000, now), 'yesterday');
  assert.equal(G.ago(now - 4 * 86400000, now), '4 days ago');
  assert.equal(G.activityText({ kind: 'practice', difficulty: 'medium', count: 10, expert: true }), '📝 Medium practice, 10 questions (Expert)');
  assert.equal(G.activityText({ kind: 'class', type: 'class', rank: 2 }), '🏫 Class game (2nd)');
  assert.equal(G.activityText({ kind: 'game', difficulty: 'easy', size: 8, won: true }), '🎲 Easy 8×8 game, beat the CPU');
  assert.equal(G.homeworkCount({ done: 1, total: 3, late: 1 }), '1 of 3 · 1 late');
  assert.equal(G.homeworkCount({ done: 0, total: 0 }), '—');
  assert.equal(G.needsPracticeShort(['7×8', '6×7', '8×9', '4×7', '6×8']), '7×8, 6×7, 8×9, 4×7…');
});

test('homework only offers what the child can play, and makes the goal', () => {
  const none = { practice: false, difficulties: ['easy'], boards: [6], tables: [] };
  assert.deepEqual(G.homeworkKinds(none).map((k) => k[0]), ['win', 'games']);
  const some = { practice: true, difficulties: ['easy', 'medium'], boards: [6, 8, 10], tables: [1, 2, 3, 4, 5, 6, 7] };
  const c = G.homeworkChoices(some);
  assert.deepEqual(c.kinds.map((k) => k[0]), ['master', 'practice', 'win', 'games']);
  assert.deepEqual([c.start.type, c.start.table, c.start.size], ['master', 7, 8]);
  assert.deepEqual(c.difficulties[0], ['any', 'Any difficulty']);
  assert.deepEqual(G.homeworkFields('win'), { table: false, rounds: false, games: false, size: true, difficulty: true });
  assert.deepEqual(G.goalFrom({ type: 'win', size: '10', difficulty: 'medium' }), { type: 'win', size: 10, difficulty: 'medium' });
  assert.deepEqual(G.goalFrom({ type: 'master', table: '7' }), { type: 'master', table: 7 });
  assert.deepEqual(G.homeworkSet({ type: 'games', games: 3 }), ['📚 Homework set', 'Finish 3 games']);
});

test('whose homework comes off, and how codes and tournaments read', () => {
  const teacher = { name: 'Ms. R', role: 'teacher' };
  assert.equal(G.canRemove({ fromName: 'Ms. R', from: 'teacher' }, teacher), true);
  assert.equal(G.canRemove({ fromName: 'Ms. R', from: 'teacher', classId: 'c1' }, teacher), false, 'a class’s comes off the class');
  assert.equal(G.canRemove({ fromName: 'Mom', from: 'parent' }, teacher), false);
  assert.equal(G.inviteState({ usedAt: 1, usedBy: 'Mr. B' }), 'used by Mr. B');
  assert.equal(G.inviteState({ expired: true }), 'expired');
  assert.equal(G.adminCodeState({ usedBy: 'Mr. B', usedAt: 5 }, () => 'Oct 1'), 'Mr. B (Oct 1)');
  assert.equal(G.adminCodeState({}, () => ''), 'not yet');
  const list = [{ scope: 'school' }, { scope: 'class', classId: 'a' }, { scope: 'class', classId: 'b' }];
  assert.equal(G.schedulesFor(list, 'a').length, 2);
  assert.match(G.scheduleLine({ startsAt: Date.now(), settings: { format: 'swiss', size: 8 }, scope: 'school' }), /· Swiss · 8×8 · whole school$/);
});
