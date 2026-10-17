// Today's practice, for every client (the web game, the phone app): one small
// task a day, picked from the player's own Times Table, with a reward that
// grows with a streak of days. It's worked out on the device (guests get it
// too) and kept in the save (state.daily), so it stays the same all day.
//
// The task, in order:
//   1. facts that need practice, on unlocked tables: practise their tables
//   2. else the lowest unlocked table not mastered yet: practise it
//   3. else a taste of the next table, not unlocked yet (it stays locked)
//   4. else (no practice yet, or every table mastered): a game that stretches
//      a little, on the smallest unlocked board not won on yet, or the
//      hardest open difficulty
// Homework is separate: both show.
import * as Core from '@blockout/engine';
import * as Progress from './progress.js';

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

// Pick today's task from the save. Pure: { kind, tables?, count?, difficulty, size?, why }
export function pickTask(state) {
  const facts = Progress.ownFacts(state);
  const status = (k) => Progress.factStatus(facts[k]);
  const tables = unlockedTables(state);
  if (tables.length) {
    // 1. needs practice: the (up to two) tables with the most such facts
    const weak = new Map();
    for (const n of tables) {
      const count = tableFacts(n).filter((k) => status(k) === 'practice').length;
      if (count) weak.set(n, count);
    }
    if (weak.size) {
      const pick = [...weak.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 2).map(([n]) => n).sort((a, b) => a - b);
      return { kind: 'practice', tables: pick, count: DAILY_COUNT, difficulty: practiceDifficulty(pick), why: 'needs' };
    }
    // 2. the lowest table not mastered yet
    const learning = tables.find((n) => !tableFacts(n).every((k) => status(k) === 'mastered'));
    if (learning) return { kind: 'practice', tables: [learning], count: DAILY_COUNT, difficulty: practiceDifficulty([learning]), why: 'learn' };
    // 3. a taste of the next table
    const next = tables[tables.length - 1] + 1;
    if (next <= 12) return { kind: 'practice', tables: [next], count: DAILY_COUNT, difficulty: practiceDifficulty([next]), why: 'next' };
  }
  // 4. a game: the smallest open board not won on yet, else the hardest open difficulty
  const boards = BOARDS.filter((n) => n === 6 || Progress.isUnlocked(state, `board${n}`));
  // (Legend needs a board of 12 or more)
  const open = (d) => (d === 'easy' || Progress.isUnlocked(state, `difficulty.${d}`)) && (d !== 'legend' || boards.some((n) => n >= 12));
  const difficulties = Core.DIFFICULTIES.filter(open);
  const wins = state.boardWins || {};
  const board = boards.find((n) => !wins[n]);
  if (board) return { kind: 'game', size: board, difficulty: board >= 12 && difficulties.includes('medium') ? 'medium' : 'easy', why: 'board' };
  const hardest = difficulties[difficulties.length - 1];
  return { kind: 'game', size: hardest === 'legend' ? 12 : boards.includes(8) ? 8 : 6, difficulty: hardest, why: 'difficulty' };
}

// Today's task (picked once a day, then kept): { day, task, done, streak, lastDone }.
// Changes the save on a new day; the client saves it.
export function today(state, now = new Date()) {
  const day = Progress.dayKey(now);
  const d = state.daily || (state.daily = { day: null, task: null, done: false, streak: 0, lastDone: null });
  if (d.day !== day || !d.task) Object.assign(d, { day, task: pickTask(state), done: false });
  return d;
}

// Does this finished round or game do today's task?
// result: { kind: 'practice', tables, count } or { kind: 'game', size, difficulty, won }
export function matches(task, result) {
  if (!task || result.kind !== task.kind) return false;
  if (task.kind === 'practice') return result.count >= task.count && task.tables.every((n) => (result.tables || []).includes(n));
  return Boolean(result.won) && result.size >= task.size && result.difficulty === task.difficulty;
}

// The reward: 30 points, 10 more for each day in a row (up to 70)
export const dailyBonus = (streak) => 30 + 10 * Math.min(streak - 1, 4);

// A round or game just finished: if it did today's task (for the first time
// today), the reward. Returns null, or { bonus, streak, earned, toast }.
export function complete(state, result, now = new Date()) {
  const d = today(state, now);
  if (d.done || !matches(d.task, result)) return null;
  const yesterday = Progress.dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const streak = d.lastDone === yesterday ? d.streak + 1 : 1;
  const bonus = dailyBonus(streak);
  Object.assign(d, { done: true, streak, lastDone: d.day });
  Progress.addPoints(state, bonus);
  const earned = Progress.awardAchievements(state, { event: 'daily', streak });
  return { bonus, streak, earned, toast: [`⭐ Today’s practice done! +${bonus} points`, streak > 1 ? `${streak} days in a row 🔥` : 'See you tomorrow!'] };
}

// ---- words

const tablesText = (tables) => tables.map((n) => `×${n}`).join(' and ');

// What the task is, in a line
export function taskText(task) {
  if (task.kind === 'practice') {
    if (task.why === 'next') return `Try the ${tablesText(task.tables)} table: ${task.count} questions`;
    return `Practise ${tablesText(task.tables)}: ${task.count} questions`;
  }
  const level = Progress.DIFFICULTY_NAMES[task.difficulty] || task.difficulty;
  return `Beat the CPU on ${level}, ${task.size}×${task.size}`;
}

// The same, short (a phone's menu): "Practise ×2 and ×3", "Try ×9", "Win 8×8 on Easy"
export function shortText(task) {
  if (task.kind === 'practice') return task.why === 'next' ? `Try ${tablesText(task.tables)}` : `Practise ${tablesText(task.tables)}`;
  return `Win ${task.size}×${task.size} on ${Progress.DIFFICULTY_NAMES[task.difficulty] || task.difficulty}`;
}

// Why this one, in a few words
export function whyText(task) {
  return { needs: 'These need practice.', learn: 'Next to master.', next: 'A sneak peek at the next table!', board: 'A board to win.', difficulty: 'A real challenge.' }[task.why] || '';
}

// The menu's card: { title, text, short, why, reward, done, streak }
export function card(state, now = new Date()) {
  const d = today(state, now);
  const continuing = d.lastDone === Progress.dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const streak = d.done ? d.streak : continuing ? d.streak : 0;
  return {
    title: d.done ? '⭐ Done for today!' : '⭐ Today',
    text: taskText(d.task),
    short: shortText(d.task),
    why: whyText(d.task),
    reward: d.done ? '' : `+${dailyBonus((continuing ? d.streak : 0) + 1)}`,
    done: d.done,
    streak: streak > 1 ? `🔥 ${streak} days in a row` : '',
  };
}

// What to start for it: a practice round's options, or the menu choice for a game
export function playFor(task) {
  if (task.kind === 'practice') return { practice: { difficulty: task.difficulty, count: task.count, tables: task.tables, level: 'learn', timer: 0 } };
  return { game: { mode: 'single', difficulty: task.difficulty, size: task.size } };
}
