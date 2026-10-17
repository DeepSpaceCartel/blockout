import test from 'node:test';
import assert from 'node:assert';
import * as M from '../src/meta.js';
import * as Variants from '@blockout/engine/variants';

const V = Variants.byId('addition');
const items = M.shopFor(V);

test('shop: chains, points, owned once; later steps hidden until the one before', () => {
  const s = M.createMeta();
  assert.equal(M.isHidden(s, items, 'level.hard'), true);
  assert.equal(M.isHidden(s, items, 'level.medium'), false);
  assert.deepEqual(M.canBuy(s, items, 'level.medium'), { ok: false, reason: 'points', need: 120 });
  M.addPoints(s, 400);
  assert.deepEqual(M.canBuy(s, items, 'level.hard'), { ok: false, reason: 'requires', requires: 'level.medium' });
  assert.equal(M.buy(s, items, 'level.medium').ok, true);
  assert.equal(M.buy(s, items, 'level.medium').reason, 'owned');
  assert.equal(M.isHidden(s, items, 'level.hard'), false);
  assert.equal(M.buy(s, items, 'level.hard').ok, true);
  assert.equal(s.wallet, 30);
  assert.equal(s.earned, 400);
  assert.equal(M.unlockForLevel('easy'), null);
  assert.equal(M.unlockForCount(10), null);
  assert.equal(M.unlockForCount(20), 'practice20');
});

test('points: first try and streaks earn more, Expert doubles', () => {
  assert.deepEqual(M.answerPoints({ firstTry: false, streak: 0 }), { points: 1, bonus: [] });
  assert.deepEqual(M.answerPoints({ firstTry: true, streak: 1 }), { points: 3, bonus: ['first'] });
  assert.deepEqual(M.answerPoints({ firstTry: true, streak: 5 }), { points: 8, bonus: ['first', 'streak'] });
  assert.equal(M.answerPoints({ firstTry: true, streak: 2, expert: true }).points, 6);
  assert.equal(M.practiceFinishBonus(20, true), 60);
  assert.equal(M.practiceFinishBonus(10, false), 10);
});

test('achievements: awarded once, with their points; bar games get Blockout!', () => {
  const s = M.createMeta();
  const list = M.achievementsFor(V);
  assert.ok(!list.some((a) => a.id === 'blockout'));
  assert.ok(M.achievementsFor(Variants.byId('fraction-add')).some((a) => a.id === 'blockout'));
  s.counters.wins = 1;
  const got = M.awardAchievements(s, list, { event: 'game', won: true, level: 'medium' });
  assert.deepEqual(got.map((a) => a.id), ['first_game', 'first_win', 'win_medium']);
  assert.equal(s.wallet, 60);
  assert.deepEqual(M.awardAchievements(s, list, { event: 'game', won: true, level: 'medium' }), []);
});

test('saves: old or partial saves are filled in; question stats and history', () => {
  const s = M.normalizeMeta({ wallet: 5, counters: { games: 2 } });
  assert.equal(s.counters.wins, 0);
  assert.equal(s.counters.games, 2);
  M.noteFact(s, '8 + 5', { firstTry: true });
  M.noteFact(s, '8 + 5', { firstTry: false, wrong: 1 });
  assert.deepEqual(s.facts['8 + 5'], { asked: 2, firstTry: 1, wrong: 1, timeouts: 0 });
  assert.equal(M.factStatus(s.facts['8 + 5']), 'practice'); // 1 of 2, with a mistake
  for (let i = 0; i < 60; i++) M.noteHistory(s, { kind: 'game' }, i);
  assert.equal(s.history.length, 50);
});
