// Today's practice, for every client (the web game, the phone app): three
// small tasks a day to choose from, like the cards of a level-up, picked from
// the player's own Times Table and Journey, with a reward that grows with a
// streak of days. Doing any one of them does today's practice. Another three
// cost points (REROLL_COST, doubling each time that day). It's worked out on
// the device (guests get it too) and kept in the save (state.daily), so it
// stays the same all day.
//
// The tasks it can deal (candidates), the first the most useful:
//   - facts that need practice, on unlocked tables: practise their tables
//   - the lowest unlocked tables not mastered yet: practise one
//   - a taste of the next table, not unlocked yet (it stays locked)
//   - your Journey's level: win it
//   - from 6×6 on (Free play): the smallest board not won on yet, or the
//     hardest open difficulty
// The first deal always has the first of those; the other two are dealt at
// random. New cards are three others, as far as there are enough.
// Homework is separate: both show.
import * as Core from '@blockout/engine';
import * as Progress from './progress.js';
import * as Journey from './journey.js';

export const DAILY_COUNT = 5; // questions: a few minutes
const TABLE_UPTO = 10; // a table is mastered when n × 1…10 and 1…10 × n are
const BOARDS = [6, 8, 10, 12, 16, 20, 24];

// The tables unlocked so far (×1, ×2, … one at a time, after practice)
export function unlockedTables(state) {
  if (!Progress.isUnlocked(state, 'practice')) return [];
  const out = [];
  for (let n = 1; n <= 12 && Progress.isUnlocked(state, `table${n}`); n++) out.push(n);
  return out;
}

const tableFacts = (n) => {
  const keys = new Set();
  for (let m = 1; m <= TABLE_UPTO; m++) keys.add(Progress.factKey(n, m)).add(Progress.factKey(m, n));
  return [...keys];
};

// A practice round's questions come from a difficulty's dice: the easiest one
// whose practice has all these tables (a taste of ×9 needs Hard's, unlocked or not)
export function practiceDifficulty(tables) {
  return Progress.DIFFICULTIES.find((d) => tables.every((n) => Progress.practiceSet(d).tables.includes(n))) || 'hard';
}

// Every task today's practice could deal, the most useful first. Pure:
// [{ kind: 'practice' | 'journey' | 'game', tables?, count?, difficulty?, size?, level?, why }]
export function candidates(state) {
  const facts = Progress.ownFacts(state);
  const status = (k) => Progress.factStatus(facts[k]);
  const tables = unlockedTables(state);
  const practise = (list, why) => ({ kind: 'practice', tables: list, count: DAILY_COUNT, difficulty: practiceDifficulty(list), why });
  const out = [];
  // facts that need practice: the tables with the most such facts first (the top two together)
  const weak = tables.map((n) => [n, tableFacts(n).filter((k) => status(k) === 'practice').length]).filter(([, c]) => c).sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  if (weak.length > 1) out.push(practise(weak.slice(0, 2).map(([n]) => n).sort((a, b) => a - b), 'needs'));
  for (const [n] of weak) out.push(practise([n], 'needs'));
  // tables not mastered yet, lowest first
  for (const n of tables) if (!weak.some(([w]) => w === n) && !tableFacts(n).every((k) => status(k) === 'mastered')) out.push(practise([n], 'learn'));
  // a taste of the next table
  const next = (tables[tables.length - 1] || 0) + 1;
  if (tables.length && next <= 12) out.push(practise([next], 'next'));
  // your Journey's level
  if (!Journey.isDone(state)) out.push({ kind: 'journey', level: Journey.journeyLevel(state), why: 'journey' });
  // a game in Free play: the smallest open board not won on yet, the hardest open difficulty
  if (Journey.freePlayOpen(state)) {
    const boards = BOARDS.filter((n) => n === 6 || Progress.isUnlocked(state, `board${n}`));
    // (Legend needs a board of 12 or more)
    const open = (d) => (d === 'easy' || Progress.isUnlocked(state, `difficulty.${d}`)) && (d !== 'legend' || boards.some((n) => n >= 12));
    const difficulties = Core.DIFFICULTIES.filter(open);
    const wins = state.boardWins || {};
    const board = boards.find((n) => !wins[n]);
    if (board) out.push({ kind: 'game', size: board, difficulty: board >= 12 && difficulties.includes('medium') ? 'medium' : 'easy', why: 'board' });
    const hardest = difficulties[difficulties.length - 1];
    if (hardest !== 'easy' || !board) out.push({ kind: 'game', size: hardest === 'legend' ? 12 : boards.includes(8) ? 8 : 6, difficulty: hardest, why: 'difficulty' });
  }
  return out;
}

// Two tasks are the same card: same kind, tables, board and level
const taskKey = (t) => [t.kind, (t.tables || []).join('+'), t.size || '', t.difficulty || '', t.level || ''].join(':');

// Three cards: the most useful task, and two more at random (avoid: tasks to
// leave out if there are enough others, like the cards a re-roll replaces)
export const CHOICES = 3;
export function pickChoices(state, rng = Math.random, avoid = []) {
  const all = candidates(state);
  const skip = new Set(avoid.map(taskKey));
  const fresh = all.filter((t) => !skip.has(taskKey(t)));
  const pool = fresh.length >= CHOICES ? fresh : all;
  const [first, ...rest] = pool;
  for (let i = rest.length - 1; i > 0; i--) {
    const k = Math.floor(rng() * (i + 1));
    [rest[i], rest[k]] = [rest[k], rest[i]];
  }
  return [first, ...rest].filter(Boolean).slice(0, CHOICES);
}

// (one task: the most useful, as today's practice used to be)
export const pickTask = (state) => candidates(state)[0];

// Today's practice (dealt once a day, then kept): { day, choices, done, streak,
// lastDone, rerolls }. Changes the save on a new day (or a save from when there
// was one task: it stays one of the three); the client saves it.
export function today(state, now = new Date(), rng = Math.random) {
  const day = Progress.dayKey(now);
  const d = state.daily || (state.daily = { day: null, choices: [], done: false, streak: 0, lastDone: null, rerolls: 0 });
  if (d.day !== day) Object.assign(d, { day, choices: pickChoices(state, rng), task: null, done: false, rerolls: 0 });
  if (!d.choices || !d.choices.length) d.choices = d.task ? [d.task, ...pickChoices(state, rng, [d.task])].slice(0, CHOICES) : pickChoices(state, rng);
  d.rerolls = d.rerolls || 0;
  return d;
}

// Three new cards cost points: 10, then 20, 40… on the same day
export const REROLL_COST = 10;
export const rerollCost = (state, now = new Date()) => REROLL_COST * 2 ** today(state, now).rerolls;

// Deal three new cards (not today's, if there are enough others), for points.
// Returns { ok, cost } or { ok: false, reason: 'done' | 'points', missing }.
export function reroll(state, now = new Date(), rng = Math.random) {
  const d = today(state, now, rng);
  if (d.done) return { ok: false, reason: 'done' };
  const cost = rerollCost(state, now);
  if (state.wallet < cost) return { ok: false, reason: 'points', missing: cost - state.wallet };
  state.wallet -= cost;
  d.choices = pickChoices(state, rng, d.choices);
  d.rerolls++;
  return { ok: true, cost };
}

// Does this finished round or game do a task? A round on exactly its tables
// (from the card, a Journey round, or homework: Auto, from every table, may
// never ask about them), a win on its Journey level, or a win on its board (or
// bigger) at its difficulty.
// result: { kind: 'practice', tables, count } or { kind: 'game', size, difficulty, won, level? }
export function matches(task, result) {
  if (!task) return false;
  if (task.kind === 'journey') return result.kind === 'game' && Boolean(result.won) && result.level === task.level;
  if (result.kind !== task.kind) return false;
  if (task.kind === 'practice') {
    const tables = new Set(result.tables || []);
    return result.count >= task.count && tables.size === task.tables.length && task.tables.every((n) => tables.has(n));
  }
  return Boolean(result.won) && result.size >= task.size && result.difficulty === task.difficulty;
}

// The reward: 30 points, 10 more for each day in a row (up to 70)
export const dailyBonus = (streak) => 30 + 10 * Math.min(streak - 1, 4);

// A round or game just finished: if it did one of today's cards (for the first
// time today), the reward. Returns null, or { bonus, streak, earned, toast }.
export function complete(state, result, now = new Date()) {
  const d = today(state, now);
  const task = !d.done && d.choices.find((t) => matches(t, result));
  if (!task) return null;
  const yesterday = Progress.dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const streak = d.lastDone === yesterday ? d.streak + 1 : 1;
  const bonus = dailyBonus(streak);
  Object.assign(d, { done: true, task, streak, lastDone: d.day });
  Progress.addPoints(state, bonus);
  const earned = Progress.awardAchievements(state, { event: 'daily', streak });
  return { bonus, streak, earned, toast: [`⭐ Today’s practice done! +${bonus} points`, streak > 1 ? `${streak} days in a row 🔥` : 'See you tomorrow!'] };
}

// ---- words

const tablesText = (tables) => tables.map((n) => `×${n}`).join(' and ');

// What the task is, in a line
export function taskText(task) {
  if (task.kind === 'journey') return `Win Level ${task.level} of your Journey`;
  if (task.kind === 'practice') {
    if (task.why === 'next') return `Try the ${tablesText(task.tables)} table: ${task.count} questions`;
    return `Practise ${tablesText(task.tables)}: ${task.count} questions`;
  }
  const level = Progress.DIFFICULTY_NAMES[task.difficulty] || task.difficulty;
  return `Beat the CPU on ${level}, ${task.size}×${task.size}`;
}

// The same, short (a phone's menu): "Practise ×2 and ×3", "Try ×9", "Win 8×8 on Easy"
export function shortText(task) {
  if (task.kind === 'journey') return `Journey Level ${task.level}`;
  if (task.kind === 'practice') return task.why === 'next' ? `Try ${tablesText(task.tables)}` : `Practise ${tablesText(task.tables)}`;
  return `Win ${task.size}×${task.size} on ${Progress.DIFFICULTY_NAMES[task.difficulty] || task.difficulty}`;
}

// Why this one, in a few words
export function whyText(task) {
  return { needs: 'These need practice.', learn: 'Next to master.', next: 'A sneak peek at the next table!', journey: 'One step up your Journey.', board: 'A board to win.', difficulty: 'A real challenge.' }[task.why] || '';
}

// A card's picture, by why it's dealt
export const taskIcon = (task) => ({ needs: '🎯', learn: '📘', next: '🔭', journey: '🧗', board: '🧩', difficulty: '💪' })[task.why] || '⭐';

// Homework's top: { title, reward, done, streak, doneText, cards: [{ text,
// short, why, icon }], reroll: { cost, label, can } } (no cards once done)
export function card(state, now = new Date()) {
  const d = today(state, now);
  const continuing = d.lastDone === Progress.dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const streak = d.done ? d.streak : continuing ? d.streak : 0;
  const cost = REROLL_COST * 2 ** d.rerolls;
  return {
    title: d.done ? '⭐ Done for today!' : 'Pick one',
    reward: d.done ? '' : `+${dailyBonus((continuing ? d.streak : 0) + 1)}`,
    done: d.done,
    doneText: d.done && d.task ? taskText(d.task) : '',
    streak: streak > 1 ? `🔥 ${streak} days in a row` : '',
    cards: d.done ? [] : d.choices.map((t) => ({ text: taskText(t), short: shortText(t), why: whyText(t), icon: taskIcon(t) })),
    reroll: { cost, label: `🎲 New cards · ${cost} points`, can: !d.done && state.wallet >= cost },
  };
}

// What to start for a card: a practice round's options, or the menu choice
// for a game (journey: the single-player Journey, at its level)
export function playFor(task) {
  if (task.kind === 'journey') return { game: { mode: 'single', journey: true } };
  if (task.kind === 'practice') return { practice: { difficulty: task.difficulty, count: task.count, tables: task.tables, level: 'learn', timer: 0 } };
  return { game: { mode: 'single', difficulty: task.difficulty, size: task.size } };
}
