// Everything a player earns in one of the other games: points, shop unlocks,
// achievements, per-question stats and a little history. Pure functions over a
// plain save object (the page keeps it in localStorage under blockout.game.<id>),
// in the spirit of @blockout/progress but much smaller: these games have three
// levels, practice and Home multiplayer to unlock, not the multiplication game's
// skill trees.
import { factStatus } from '@blockout/progress';

export { factStatus };

export function createMeta() {
  return {
    version: 1,
    wallet: 0, // points to spend
    earned: 0, // points ever earned
    unlocks: [],
    achievements: {}, // id -> when earned
    counters: { games: 0, wins: 0, practiceRounds: 0, perfectRounds: 0, correct: 0, bestStreak: 0, blockouts: 0 },
    facts: {}, // question label -> { asked, firstTry, wrong, timeouts }
    history: [], // recent games and rounds, newest last
  };
}

export function normalizeMeta(saved) {
  const fresh = createMeta();
  if (!saved || typeof saved !== 'object') return fresh;
  return {
    ...fresh,
    ...saved,
    unlocks: Array.isArray(saved.unlocks) ? saved.unlocks : [],
    achievements: saved.achievements || {},
    counters: { ...fresh.counters, ...(saved.counters || {}) },
    facts: saved.facts || {},
    history: Array.isArray(saved.history) ? saved.history : [],
  };
}

export function addPoints(state, n) {
  const pts = Math.max(0, Math.round(n));
  state.wallet += pts;
  state.earned += pts;
  return pts;
}

// ---------------------------------------------------------------- shop

// One chain per kind: Medium, then Hard; practice's 20-question rounds and
// Expert; Home multiplayer. Only the next step of a chain is shown with a price.
export function shopFor(V) {
  return [
    { id: 'level.medium', group: 'Difficulty', name: `Medium: ${V.levels.medium.sub}`, price: 120, perk: 'Bigger numbers, and +20 bonus points for a win.' },
    { id: 'level.hard', group: 'Difficulty', name: `Hard: ${V.levels.hard.sub}`, price: 250, requires: 'level.medium', perk: 'The hardest facts, and +40 bonus points for a win.' },
    { id: 'practice20', group: 'Practice', name: 'Practice: 20-question rounds', price: 60, perk: `Finish all 20 for +${PRACTICE_FINISH[20]} bonus points.` },
    { id: 'practiceExpert', group: 'Practice', name: `Expert practice: ${V.practice.seconds} seconds a question, no help, ×2 points`, price: 150, requires: 'practice20' },
    { id: 'multiplayer', group: 'Modes', name: 'Home multiplayer: 2 players on one screen', price: 150 },
  ];
}

export const shopItem = (items, id) => items.find((i) => i.id === id) || null;
export const isUnlocked = (state, id) => !id || state.unlocks.includes(id);

// Locked further down a chain than the next step: shown as a placeholder.
export function isHidden(state, items, id) {
  const item = shopItem(items, id);
  return Boolean(item && item.requires && !isUnlocked(state, item.requires));
}

export function canBuy(state, items, id) {
  const item = shopItem(items, id);
  if (!item) return { ok: false, reason: 'unknown' };
  if (isUnlocked(state, id)) return { ok: false, reason: 'owned' };
  if (item.requires && !isUnlocked(state, item.requires)) return { ok: false, reason: 'requires', requires: item.requires };
  if (state.wallet < item.price) return { ok: false, reason: 'points', need: item.price - state.wallet };
  return { ok: true };
}

export function buy(state, items, id) {
  const check = canBuy(state, items, id);
  if (!check.ok) return check;
  state.wallet -= shopItem(items, id).price;
  state.unlocks.push(id);
  return { ok: true };
}

// The item that unlocks a choice on the menu (null: free)
export const unlockForLevel = (level) => (level === 'easy' ? null : `level.${level}`);
export const unlockForCount = (count) => (Number(count) === 20 ? 'practice20' : null);

// ---------------------------------------------------------------- points

// A right answer: 1, +2 when right first time, +5 on every 5th in a row;
// doubled in Expert practice. (Only called for right answers.)
export function answerPoints({ firstTry, streak, expert = false }) {
  let pts = 1;
  const bonus = [];
  if (firstTry) {
    pts += 2;
    bonus.push('first');
    if (streak > 0 && streak % 5 === 0) {
      pts += 5;
      bonus.push('streak');
    }
  }
  return { points: expert ? pts * 2 : pts, bonus };
}

export const WIN_BONUS = { easy: 10, medium: 20, hard: 40 };
export const PRACTICE_FINISH = { 10: 10, 20: 30 };
export const practiceFinishBonus = (count, expert) => (PRACTICE_FINISH[count] || 0) * (expert ? 2 : 1);

// ---------------------------------------------------------------- per-question stats

export function noteFact(state, label, { firstTry, wrong = 0, timeout = false }) {
  const f = (state.facts[label] = state.facts[label] || { asked: 0, firstTry: 0, wrong: 0, timeouts: 0 });
  f.asked++;
  if (firstTry) f.firstTry++;
  f.wrong += wrong;
  if (timeout) f.timeouts++;
  return f;
}

export function noteHistory(state, entry, now = Date.now()) {
  state.history.push({ t: now, ...entry });
  if (state.history.length > 50) state.history.splice(0, state.history.length - 50);
}

// ---------------------------------------------------------------- achievements

// check(ctx): ctx.event is 'answer', 'game' or 'practice'.
export function achievementsFor(V) {
  return [
    { id: 'first_game', icon: '🎲', name: 'First game', desc: `Finish a game of ${V.name.toLowerCase()}.`, reward: 10, check: (c) => c.event === 'game' },
    { id: 'first_win', icon: '🏆', name: 'Winner!', desc: 'Beat the CPU.', reward: 20, check: (c) => c.event === 'game' && c.won },
    { id: 'win_medium', icon: '🥈', name: 'Medium champion', desc: 'Beat the CPU on Medium.', reward: 30, check: (c) => c.event === 'game' && c.won && c.level === 'medium' },
    { id: 'win_hard', icon: '🥇', name: 'Hard champion', desc: 'Beat the CPU on Hard.', reward: 60, check: (c) => c.event === 'game' && c.won && c.level === 'hard' },
    { id: 'wins_10', icon: '👑', name: 'Ten wins', desc: 'Beat the CPU 10 times.', reward: 50, check: (c) => c.event === 'game' && c.counters.wins >= 10 },
    { id: 'streak_5', icon: '🔥', name: 'On fire', desc: '5 right first time in a row.', reward: 10, check: (c) => c.event === 'answer' && c.streak >= 5 },
    { id: 'streak_10', icon: '☄️', name: 'Unstoppable', desc: '10 right first time in a row.', reward: 25, check: (c) => c.event === 'answer' && c.streak >= 10 },
    { id: 'correct_100', icon: '💯', name: 'A hundred right', desc: '100 right answers.', reward: 40, check: (c) => c.event === 'answer' && c.counters.correct >= 100 },
    { id: 'first_practice', icon: '🎯', name: 'Practice makes progress', desc: 'Finish a practice round.', reward: 10, check: (c) => c.event === 'practice' },
    { id: 'perfect_practice', icon: '✨', name: 'Perfect practice', desc: 'Every question right first time in a practice round.', reward: 25, check: (c) => c.event === 'practice' && c.perfect },
    { id: 'expert_practice', icon: '🧠', name: 'Expert', desc: 'Finish an Expert practice round.', reward: 30, check: (c) => c.event === 'practice' && c.expert },
    ...(V.newBoard('easy').kind === 'bars'
      ? [{ id: 'blockout', icon: '🧱', name: 'Blockout!', desc: 'Fill or empty a bar exactly.', reward: 15, check: (c) => c.event === 'answer' && c.blockout }]
      : []),
  ];
}

// Award every achievement this event completes; returns the new ones.
export function awardAchievements(state, list, ctx, now = Date.now()) {
  const earned = [];
  for (const a of list) {
    if (state.achievements[a.id] || !a.check({ ...ctx, counters: state.counters })) continue;
    state.achievements[a.id] = now;
    addPoints(state, a.reward);
    earned.push(a);
  }
  return earned;
}
