import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kindOf, stack, words } from '../src/notes.js';

test('repeats stack: counted, points added up', () => {
  let list = [];
  list = stack(list, '⚡ Speedy', '+3 bonus points');
  list = stack(list, '✨ First try', '+2 bonus points');
  list = stack(list, '⚡ Speedy', '+3 bonus points');
  list = stack(list, '⚡ Speedy', '+4 bonus points');
  assert.equal(list.length, 2);
  assert.deepEqual(words(list[0]), ['⚡ Speedy ×3', '+10 bonus points']);
  assert.deepEqual(words(list[1]), ['✨ First try', '+2 bonus points']);
});

test('a streak is one kind whatever its number; achievements stay apart', () => {
  assert.equal(kindOf('🔥 Streak 4'), kindOf('🔥 Streak 5'));
  let list = stack([], '🔥 Streak 3', '+1 bonus points');
  list = stack(list, '🔥 Streak 4', '+2 bonus points');
  list = stack(list, '🏫 Class act', 'Achievement! +15 points');
  list = stack(list, '⭐ Daily star', 'Achievement! +15 points');
  assert.deepEqual(words(list[0]), ['🔥 Streak ×2', '+3 bonus points']);
  assert.equal(list.length, 3);
});

test('stickers go on one line', () => {
  let list = stack([], '🎁 New sticker: 🐧', 'rare · added to your album');
  assert.deepEqual(words(list[0]), ['🎁 Sticker: 🐧', 'rare · added to your album']);
  list = stack(list, '🎁 Sticker: 🐝', 'a spare you can swap for points');
  assert.deepEqual(words(list[0]), ['🎁 Stickers: 🐧 🐝', 'in your album']);
});
