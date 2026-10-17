import test from 'node:test';
import assert from 'node:assert';
import * as P from '../src/progress.js';
import * as C from '../src/cosmetics.js';

test('every category has a free default and unique option ids', () => {
  for (const cat of C.CATEGORIES) {
    assert.equal(cat.options[0].price, 0, `${cat.id} default is free`);
    assert.equal(new Set(cat.options.map((o) => o.id)).size, cat.options.length, `${cat.id} ids unique`);
  }
});

test('paid cosmetics are in the shop; golden dice keeps its old item id', () => {
  const wood = P.shopItem('cos.dice.wood');
  assert.equal(wood.price, 300);
  assert.deepEqual(wood.cosmetic, ['dice', 'wood']);
  assert.equal(C.itemFor('dice', 'golden'), 'goldenDice');
  assert.equal(P.shopItem('goldenDice').group, 'Wardrobe: Dice');
  assert.equal(C.itemFor('dice', 'classic'), null);
  assert.equal(C.itemFor('avatar', 'fox'), null, 'free avatars need no purchase');
  const ids = P.SHOP.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length, 'no duplicate shop items');
});

test('seasonal items can only be bought in season', () => {
  assert.equal(C.seasonActive('halloween', new Date(2026, 9, 15)), true);
  assert.equal(C.seasonActive('halloween', new Date(2026, 8, 23)), false);
  assert.equal(C.seasonActive('winter', new Date(2026, 11, 20)), true);
  assert.equal(C.seasonActive('winter', new Date(2027, 0, 10)), true);
  assert.equal(C.seasonActive('winter', new Date(2027, 1, 1)), false);
  const s = P.createProgress();
  s.wallet = 5000;
  assert.deepEqual(P.buy(s, 'cos.dice.pumpkin', new Date(2026, 8, 23)), { ok: false, reason: 'season', when: 'October' });
  assert.equal(P.buy(s, 'cos.dice.pumpkin', new Date(2026, 9, 31)).ok, true);
  // once owned it stays usable out of season
  assert.equal(C.sanitize({ dice: 'pumpkin' }, (id) => P.isUnlocked(s, id)).dice, 'pumpkin');
});

test('sanitize keeps owned choices and resets the rest', () => {
  const owned = new Set(['cos.board.space']);
  const picked = C.sanitize({ board: 'space', dice: 'galaxy', avatar: 'fox', nonsense: 'x', pips: 'nope' }, (id) => !id || owned.has(id));
  assert.equal(picked.board, 'space');
  assert.equal(picked.dice, 'classic');
  assert.equal(picked.avatar, 'fox');
  assert.equal(picked.pips, 'dots');
  assert.equal(picked.nonsense, undefined);
});

test('titles are earned from achievements and stickers', () => {
  const s = P.createProgress();
  assert.deepEqual(C.TITLES.filter((t) => t.earned(s)).map((t) => t.id), ['none']);
  s.achievements = { score400: 1, table3_learn: 1 };
  for (let i = 0; i < 20; i++) s.achievements[`fact_2x${i}_1`] = 1;
  assert.deepEqual(C.TITLES.filter((t) => t.earned(s)).map((t) => t.id).sort(), ['learner', 'none', 'royalty', 'speed']);
});

test('stickers: weighted drops, duplicates trade for points by rarity', () => {
  const s = P.createProgress();
  const seen = {};
  for (let i = 0; i < 3000; i++) {
    const { rarity } = C.dropSticker(s).sticker;
    seen[rarity] = (seen[rarity] || 0) + 1;
  }
  assert.ok(seen.common > seen.rare && seen.rare > seen.epic, JSON.stringify(seen));
  const t = P.createProgress();
  t.stickers = { apple: 3, owl: 2, unicorn: 1 };
  assert.equal(C.duplicateValue(t), 2 * 5 + 1 * 15);
  assert.equal(C.tradeDuplicates(t), 25);
  assert.deepEqual(t.stickers, { apple: 1, owl: 1, unicorn: 1 });
  assert.equal(t.wallet, 25);
  assert.equal(C.duplicateValue(t), 0);
});

test('wardrobe looks are chains per category: only the next one shows; seasonal ones stand apart', () => {
  const s = P.createProgress();
  s.wallet = 50000;
  assert.equal(P.isHidden(s, 'cos.dice.wood'), false); // first paid dice look
  assert.equal(P.isHidden(s, 'cos.dice.candy'), true);
  assert.equal(P.shopItem('cos.dice.candy').requires, 'cos.dice.wood');
  assert.equal(P.shopItem('goldenDice').requires, 'cos.dice.galaxy');
  assert.equal(P.buy(s, 'cos.dice.candy').reason, 'requires');
  assert.equal(P.buy(s, 'cos.dice.wood').ok, true);
  assert.equal(P.isHidden(s, 'cos.dice.candy'), false);
  // seasonal looks aren't part of a chain
  assert.equal(P.shopItem('cos.dice.pumpkin').requires, undefined);
  // each category has its own chain
  assert.equal(P.isHidden(s, 'cos.keypad.candy'), false);
  assert.equal(P.isHidden(s, 'cos.keypad.retro'), true);
});
