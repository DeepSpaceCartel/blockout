// Homework for every client (the web game, the phone app): how a student's
// list reads (its order, each one's state and who set it), and the menu
// choice that plays one. The goals and how far along they are live in
// progress.js; the server sends each with its { have, need, status }.
import * as Progress from './progress.js';
import { tableChoices } from './practice.js';
import { difficultyOpen } from './setup.js';

// 'YYYY-MM-DD' as "Tue, Oct 14" (midday, so no time zone moves the day)
export const niceDay = (s) => new Date(`${s}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

const ORDER = { late: 0, open: 1, done: 2 };

// One homework's words: { h, label, state, from, have, need, playable }
export const homeworkRow = (h) => ({
  h,
  label: h.label || Progress.describeGoal(h.goal),
  state: h.status === 'done' ? '✅ Done' : h.status === 'late' ? `⏰ Was due ${niceDay(h.due)}` : h.due ? `Due ${niceDay(h.due)}` : 'Any time',
  from: h.from === 'parent' ? `from ${h.fromName || 'a grown-up'} 👪` : `from ${h.fromName || 'your teacher'} 🍎`,
  have: h.have,
  need: h.need,
  playable: h.status !== 'done',
});

// A student's own list: late first, then open, then done
export const sortHomework = (items) => [...items].sort((a, b) => ORDER[a.status] - ORDER[b.status]);
export const homeworkRows = (items) => sortHomework(items).map(homeworkRow);

// The line above a student's list
export function homeworkIntro(items) {
  const open = items.filter((h) => h.status !== 'done');
  return open.length ? 'Play and practice as usual: homework ticks itself off.' : items.length ? 'All done. Great work! 🎉' : 'No homework right now.';
}

// How many are still to do (the menu's badge)
export const openCount = (items) => items.filter((h) => h.status !== 'done').length;

// What to set on the menu to play a homework: { mode, difficulty?, size?, tables? }.
// Homework only asks for what the student can play; anything locked is left
// as it is. A times table to master is practised on its own, at the first
// open difficulty whose practice has that table.
export function homeworkChoice(state, goal) {
  const open = (d) => d && d !== 'any' && difficultyOpen(state, d);
  if (goal.type === 'master') {
    const difficulty = Progress.DIFFICULTIES.find((d) => difficultyOpen(state, d) && tableChoices(d).includes(goal.table));
    return { mode: 'practice', ...(difficulty ? { difficulty } : {}), tables: [goal.table] };
  }
  if (goal.type === 'practice') return { mode: 'practice', ...(open(goal.difficulty) ? { difficulty: goal.difficulty } : {}) };
  const choice = { mode: 'single', ...(open(goal.difficulty) ? { difficulty: goal.difficulty } : {}) };
  if (goal.type === 'win' && (goal.size === 6 || Progress.isUnlocked(state, `board${goal.size}`))) choice.size = goal.size;
  return choice;
}
