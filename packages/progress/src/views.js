// What the progress screens show, for every client (the web game, the phone
// app): the achievements list, the fact speed grid, the sticker album, and the
// sticker an achievement drops. Pure functions of the save; the clients only
// draw them, with the same words.
import * as Progress from './progress.js';
import * as Cosmetics from './cosmetics.js';

// The biggest times table unlocked: lines and grids go up to it
export function tableSize(state) {
  if (Progress.isUnlocked(state, 'difficulty.hard')) return 12;
  if (Progress.isUnlocked(state, 'difficulty.medium')) return 8;
  return 6;
}

// ---- achievements

const FACT_SPEED = 'Fact speed';

// "Mar 4", in the device's language
const shortDate = (when) => new Date(when).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

// { earned, total, groups: [{ name, earned, total, note, rows }] }. A row:
// { id, icon (null until earned: show a lock), name, desc, right (the date
// earned, or "+reward") , earned }. Secret ones say "???" until earned. Fact
// speed is a grid of its own (factSpeed).
export function achievementGroups(state) {
  const all = Progress.ACHIEVEMENTS;
  const groups = [];
  for (const a of all) {
    if (a.group === FACT_SPEED) continue;
    let g = groups[groups.length - 1];
    if (!g || g.name !== a.group) {
      const inGroup = all.filter((x) => x.group === a.group);
      const size = tableSize(state);
      g = {
        name: a.group,
        earned: inGroup.filter((x) => state.achievements[x.id]).length,
        total: inGroup.length,
        note: a.group === 'Times tables' ? `📗 Learner: every fact in the line is Learning or better. 🏅 Master: every fact is Mastered. Lines go up to your table size (${size} × ${size} now).` : null,
        rows: [],
      };
      groups.push(g);
    }
    const when = state.achievements[a.id];
    const secret = a.hidden && !when;
    g.rows.push({
      id: a.id,
      earned: Boolean(when),
      icon: when ? a.icon : null,
      name: secret ? '???' : a.name,
      desc: secret ? 'A secret achievement. Keep exploring!' : a.desc,
      right: when ? shortDate(when) : `+${a.reward}`,
    });
  }
  return { earned: all.filter((a) => state.achievements[a.id]).length, total: all.length, groups };
}

// Fact speed: for each fact up to the table size, the best tier earned (10, 5
// or 1 seconds, or null). { size, earned, total, note, tiers: [{ secs, count }],
// cells: [[{ a, b, best }]] }
export function factSpeed(state) {
  const size = tableSize(state);
  const all = Progress.ACHIEVEMENTS.filter((a) => a.group === FACT_SPEED);
  const earned = all.filter((a) => state.achievements[a.id]);
  const best = (r, c) => {
    const tier = Progress.FACT_SPEED_TIERS.slice().reverse().find((t) => state.achievements[`fact_${r}x${c}_${t.secs}`]);
    return tier ? tier.secs : null;
  };
  return {
    size,
    earned: earned.length,
    total: all.length,
    note: `Master a fact and answer it fast. Each fact has three tiers: under 10, 5 and 1 seconds. Showing up to ${size} × ${size}.`,
    tiers: Progress.FACT_SPEED_TIERS.map((t) => ({ secs: t.secs, count: earned.filter((a) => a.tier === t.secs).length })),
    cells: Array.from({ length: size }, (_, r) => Array.from({ length: size }, (_, c) => ({ a: r + 1, b: c + 1, best: best(r + 1, c + 1) }))),
  };
}

// ---- the daily check-in

// The first visit of the day pays points (more for days in a row) and checks
// the streak achievements. Returns null when it's not the first visit today,
// else { bonus, streak, earned, toast: [title, text] }.
export function dailyCheckIn(state, now = new Date()) {
  const visit = Progress.checkIn(state, now);
  if (!visit) return null;
  const streak = visit.streak > 1 ? ` · ${visit.streak} days in a row 🔥` : '';
  return { ...visit, earned: Progress.awardAchievements(state, { event: 'checkin', streak: visit.streak }), toast: [`☀️ Daily check-in: +${visit.bonus} points`, `Welcome back!${streak}`] };
}

// ---- stickers

export const RARITY_NAMES = { common: 'Common', rare: 'Rare', epic: 'Epic' };

// Every achievement but the minor ones (like fact speed) drops a sticker.
// Returns the drops with what to announce: [{ sticker, isNew, toast: [title, text] }]
export function grantStickers(state, earned, rng = Math.random) {
  return earned
    .filter((a) => !a.minor)
    .map(() => {
      const drop = Cosmetics.dropSticker(state, rng);
      const { sticker, isNew } = drop;
      return { ...drop, toast: [`🎁 ${isNew ? 'New sticker' : 'Sticker'}: ${sticker.emoji}`, isNew ? `${sticker.rarity} · added to your album` : 'a spare you can swap for points'] };
    });
}

// Which stickers are new or have spares (the results screens' "Stickers" button shows only these)
export function newOrSpareStickers(state) {
  const have = state.stickers || {};
  const seen = (state.seen && state.seen.stickers) || [];
  return new Set(Object.keys(have).filter((id) => !seen.includes(id) || have[id] > 1));
}

// The album: { got, total, sections: [{ rarity, name, slots: [{ id, emoji (null:
// not found yet), count }] }], spareValue }. only: a Set of ids, or null for all.
export function stickerAlbum(state, only = null) {
  const have = state.stickers || {};
  const sections = [];
  for (const rarity of ['common', 'rare', 'epic']) {
    const list = Cosmetics.STICKERS.filter((x) => x.rarity === rarity && (!only || only.has(x.id)));
    if (!list.length) continue;
    sections.push({ rarity, name: RARITY_NAMES[rarity], slots: list.map((st) => ({ id: st.id, emoji: have[st.id] ? st.emoji : null, count: have[st.id] || 0 })) });
  }
  return { got: Cosmetics.STICKERS.filter((st) => have[st.id]).length, total: Cosmetics.STICKERS.length, sections, spareValue: Cosmetics.duplicateValue(state) };
}

// Swap every spare for points. Returns the points (0: nothing to swap) and what to announce.
export function swapSpares(state, formatPoints = (n) => Number(n).toLocaleString()) {
  const points = Cosmetics.tradeDuplicates(state);
  return { points, toast: points ? ['🔁 Spares swapped', `+${formatPoints(points)} points`] : null };
}
