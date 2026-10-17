import test from 'node:test';
import assert from 'node:assert';
import * as Progress from '../src/progress.js';
import * as Cosmetics from '../src/cosmetics.js';
import * as Views from '../src/views.js';

const seeded = (s = 3) => () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;

test('the table size follows the unlocked difficulty', () => {
  const s = Progress.createProgress();
  assert.equal(Views.tableSize(s), 6);
  s.unlocks.push('difficulty.medium');
  assert.equal(Views.tableSize(s), 8);
  s.unlocks.push('difficulty.hard');
  assert.equal(Views.tableSize(s), 12);
});

test('achievements in groups, fact speed apart, secrets as ??? until earned', () => {
  const s = Progress.createProgress();
  const list = Views.achievementGroups(s);
  assert.equal(list.earned, 0);
  assert.equal(list.total, Progress.ACHIEVEMENTS.length);
  assert.ok(!list.groups.some((g) => g.name === 'Fact speed'));
  const rows = list.groups.flatMap((g) => g.rows);
  const secret = Progress.ACHIEVEMENTS.find((a) => a.hidden);
  const row = rows.find((r) => r.id === secret.id);
  assert.equal(row.name, '???');
  assert.equal(row.icon, null);
  assert.equal(row.right, `+${secret.reward}`);
  s.achievements[secret.id] = Date.UTC(2026, 2, 4);
  const now = Views.achievementGroups(s).groups.flatMap((g) => g.rows).find((r) => r.id === secret.id);
  assert.equal(now.name, secret.name);
  assert.equal(now.icon, secret.icon);
  assert.equal(Views.achievementGroups(s).earned, 1);
  assert.ok(Views.achievementGroups(s).groups.find((g) => g.name === 'Times tables').note.includes('6 × 6'));
});

test('fact speed: a size × size grid of the best tier', () => {
  const s = Progress.createProgress();
  s.achievements.fact_3x4_10 = 1;
  s.achievements.fact_3x4_5 = 2;
  const grid = Views.factSpeed(s);
  assert.equal(grid.size, 6);
  assert.equal(grid.cells.length, 6);
  assert.equal(grid.cells[2][3].best, 5);
  assert.equal(grid.cells[0][0].best, null);
});

test('a big achievement drops a sticker; minor ones do not', () => {
  const s = Progress.createProgress();
  const big = Progress.ACHIEVEMENTS.find((a) => !a.minor);
  const minor = Progress.ACHIEVEMENTS.find((a) => a.minor);
  const drops = Views.grantStickers(s, [big, minor], seeded());
  assert.equal(drops.length, 1);
  assert.match(drops[0].toast[0], /^🎁 New sticker: /);
  assert.equal(Object.values(s.stickers).reduce((a, b) => a + b, 0), 1);
});

test('the album: rarities, missing slots, spares to swap for points', () => {
  const s = Progress.createProgress();
  const first = Cosmetics.STICKERS[0];
  s.stickers = { [first.id]: 3 };
  const album = Views.stickerAlbum(s);
  assert.equal(album.got, 1);
  assert.equal(album.total, Cosmetics.STICKERS.length);
  const slot = album.sections.flatMap((x) => x.slots).find((x) => x.id === first.id);
  assert.equal(slot.count, 3);
  assert.ok(album.sections.flatMap((x) => x.slots).some((x) => x.emoji === null), 'missing ones show no emoji');
  assert.ok(album.spareValue > 0);
  assert.ok(Views.newOrSpareStickers(s).has(first.id));
  const before = s.wallet;
  const swap = Views.swapSpares(s);
  assert.equal(s.wallet, before + swap.points);
  assert.equal(s.stickers[first.id], 1);
  assert.equal(Views.swapSpares(s).points, 0);
});

test('the daily check-in pays once a day, more for days in a row', () => {
  const s = Progress.createProgress();
  const day1 = Views.dailyCheckIn(s, new Date(2026, 9, 16, 9));
  assert.equal(day1.bonus, 20);
  assert.deepEqual(day1.toast, ['☀️ Daily check-in: +20 points', 'Welcome back!']);
  assert.equal(Views.dailyCheckIn(s, new Date(2026, 9, 16, 18)), null, 'once a day');
  const day2 = Views.dailyCheckIn(s, new Date(2026, 9, 17, 8));
  assert.equal(day2.streak, 2);
  assert.equal(day2.toast[1], 'Welcome back! · 2 days in a row 🔥');
  assert.equal(s.wallet >= 45, true);
});
