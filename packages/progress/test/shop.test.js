import test from 'node:test';
import assert from 'node:assert';
import * as Progress from '../src/progress.js';
import * as Shop from '../src/shop.js';

const fresh = (points = 0) => {
  const s = Progress.createProgress();
  Progress.addPoints(s, points);
  return s;
};
const row = (state, id) => Shop.shopGroups(state).flatMap((g) => g.rows).find((r) => r.item.id === id);

test('the Shop lists items in groups, without the Wardrobe looks', () => {
  const groups = Shop.shopGroups(fresh());
  assert.ok(groups.length > 3);
  assert.ok(groups.every((g) => g.rows.length && g.rows.every((r) => !r.item.cosmetic && r.item.group === g.name)));
});

test('boards and difficulties are Journey unlocks: not in the Shop, tapping one says which level', () => {
  const s = fresh(10000);
  assert.equal(row(s, 'board8'), undefined);
  assert.equal(row(s, 'difficulty.medium'), undefined);
  assert.equal(Shop.availableIds(s).has('board8'), false);
  const offer = Shop.unlockOffer(s, 'board8');
  assert.equal(offer.kind, 'earn');
  assert.match(offer.message, /Reach Level 8 on your Journey/);
  assert.match(Shop.unlockOffer(s, 'difficulty.hard').message, /Level 9/);
});

test('the next step shows its name and price; the one after is blurred', () => {
  const s = fresh();
  const multi = row(s, 'multiplayer');
  assert.equal(multi.hidden, false);
  assert.equal(multi.canBuy, false);
  assert.equal(multi.why, 'Need 150 more');
  assert.equal(row(s, 'players4').hidden, true);
  assert.match(row(s, 'players4').why, /before it/);
});

test('with the points, it can be bought; afterwards it is owned', () => {
  const s = fresh(1000);
  assert.equal(row(s, 'multiplayer').canBuy, true);
  assert.ok(Shop.availableIds(s).has('multiplayer'));
  const r = Shop.purchase(s, 'multiplayer');
  assert.equal(r.ok, true);
  assert.deepEqual(r.toast, ['🔓 Unlocked: Multiplayer (2 players)', '-150 points']);
  assert.equal(row(s, 'multiplayer').owned, true);
  assert.equal(Shop.purchase(s, 'multiplayer').ok, false, 'not twice');
});

test('tapping a locked thing offers it, or what has to come first', () => {
  const rich = fresh(10000);
  const offer = Shop.unlockOffer(rich, 'multiplayer');
  assert.equal(offer.kind, 'offer');
  assert.equal(offer.item.id, 'multiplayer');
  assert.equal(offer.same, true);
  assert.match(offer.title, /^Unlock Multiplayer/);
  // an item whose step before is for sale: offering that one first
  const gated = (i) => i.journey || i.available;
  const pair = Progress.SHOP.find((i) => i.requires && !gated(i) && !gated(Progress.shopItem(i.requires)) && !Progress.shopItem(i.requires).requires && !i.cosmetic);
  assert.ok(pair, 'the catalogue has such a chain');
  const first = Shop.unlockOffer(rich, pair.id);
  assert.equal(first.kind, 'offer');
  assert.equal(first.item.id, pair.requires);
  assert.equal(first.same, false);
  const poor = Shop.unlockOffer(fresh(10), 'multiplayer');
  assert.equal(poor.kind, 'info');
  assert.match(poor.message, /You need 140 more points/);
  const hidden = Shop.unlockOffer(rich, 'players4');
  assert.equal(hidden.kind, 'offer');
  assert.equal(hidden.item.id, 'multiplayer');
});

test('what is new: affordable unlocks and looks, new and spare stickers', () => {
  const s = fresh();
  assert.equal(Shop.affordableCount(s), 0);
  Progress.addPoints(s, 100);
  assert.ok(Shop.affordableCount(s) >= 1);
  s.stickers = { star: 3, moon: 1 };
  assert.equal(Shop.newStickers(s), 2);
  assert.equal(Shop.spareStickers(s), 2);
  Shop.markSeen(s, 'stickers', ['star']);
  assert.equal(Shop.newStickers(s), 1);
  assert.equal(Shop.newWardrobe(fresh()), 0);
});

test('a purchase switches on the obvious choice, for every item that names one', () => {
  assert.deepEqual(Shop.activation('board8'), { size: 8 });
  assert.deepEqual(Shop.activation('difficulty.medium'), { difficulty: 'medium' });
  assert.deepEqual(Shop.activation('players3'), { mode: 'multi', players: 3 });
  assert.deepEqual(Shop.activation(Progress.gameTimerId(10, 'easy')), { mode: 'single', level: 'expert', timer: 10 });
  assert.equal(Shop.activation('cpuSpeed'), null, 'no clear favourite: left alone');
  // every id it knows exists in the Shop
  for (const item of Progress.SHOP) Shop.activation(item.id);
  for (const id of ['multiplayer', 'players3', 'players4', 'practice', 'diceMode', 'autoRoll', 'fitRolls', 'answerTime30', 'cpuInstant', 'cpuEnd', 'showProgress', 'firstInCorner', 'timesMastered']) {
    assert.ok(Progress.shopItem(id), `${id} is a Shop item`);
  }
});

test('words: points with separators, tables listed', () => {
  assert.equal(Shop.formatPoints(1250), (1250).toLocaleString());
  assert.equal(Shop.tablesLabel([6, 3, 4]), '×3, ×4 and ×6');
  assert.equal(Shop.tablesLabel([7]), '×7');
});
