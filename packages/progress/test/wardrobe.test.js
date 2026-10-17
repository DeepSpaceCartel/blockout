import test from 'node:test';
import assert from 'node:assert';
import * as Progress from '../src/progress.js';
import * as Cosmetics from '../src/cosmetics.js';
import * as Wardrobe from '../src/wardrobe.js';

test('only owned looks and earned titles are worn', () => {
  const s = Progress.createProgress();
  const looks = Wardrobe.chosenLooks({ dice: 'wood', avatar: 'fox', title: 'ninja' }, s);
  assert.equal(looks.dice, 'classic', 'not owned: the default');
  assert.equal(looks.avatar, 'fox', 'free');
  assert.equal(looks.title, 'none', 'not earned');
  s.unlocks.push(Cosmetics.itemFor('dice', 'wood'));
  assert.equal(Wardrobe.chosenLooks({ dice: 'wood' }, s).dice, 'wood');
  assert.equal(Wardrobe.look(looks, 'colors').id, 'classic');
});

test('the rows: owned, worn, the next step priced, later steps blurred, seasons apart', () => {
  const s = Progress.createProgress();
  const looks = Wardrobe.chosenLooks({}, s);
  const rows = Wardrobe.wardrobeRows(s, looks, null, new Date(2026, 6, 1));
  const dice = rows.find((r) => r.category.id === 'dice').options;
  assert.equal(dice[0].owned && dice[0].worn, true);
  const wood = dice.find((o) => o.option.id === 'wood');
  assert.equal(wood.owned, false);
  assert.equal(wood.hidden, false, 'the next step shows');
  assert.equal(dice.find((o) => o.option.id === 'candy').hidden, true, 'the one after is blurred');
  assert.ok(dice.find((o) => o.option.id === 'pumpkin').season, 'out of season');
  assert.ok(Wardrobe.titleRow(s, looks).some((t) => t.title.id === 'none' && t.earned && t.worn));
  const only = Wardrobe.wardrobeRows(s, looks, new Set(['dice:wood']));
  assert.deepEqual(only.map((r) => r.options.map((o) => o.key)), [['dice:wood']]);
});

test("a player's look in a game: the CPU's character, the single player's avatar and title", () => {
  const s = Progress.createProgress();
  s.unlocks.push(Cosmetics.itemFor('cpu', 'owl'));
  s.achievements.streak10 = 1;
  const looks = Wardrobe.chosenLooks({ cpu: 'owl', avatar: 'fox', title: 'streaker' }, s);
  assert.deepEqual(Wardrobe.playerLook(looks, { name: 'CPU', cpu: true }, 'single'), { name: 'Professor Owl', avatar: '🦉', hello: 'Hoo-hoo!' });
  assert.equal(Wardrobe.playerLook(looks, { name: 'CPU 2', cpu: true }, 'multi').name, 'Owl 2');
  assert.deepEqual(Wardrobe.playerLook(looks, { name: 'You' }, 'single'), { avatar: '🦊', title: 'Streak Star' });
  assert.deepEqual(Wardrobe.playerLook(looks, { name: 'Player 1' }, 'multi'), {});
  assert.equal(Wardrobe.playerColors(looks).length, 4);
});
