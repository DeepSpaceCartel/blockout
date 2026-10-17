// The Journey's levels: the path every player climbs, from a 1×1 board with
// a 1-sided die to 12×12 with a 12-sided one, then a few challenges (the
// harder difficulties and the big boards). Plain data, so progress.js (its
// migration) and journey.js (the rules the menus use) can both read it.

// The difficulty whose Expert, timer and practice unlocks a level uses: the
// dice of Easy (6), Medium (8) or Hard (12) that cover its die.
const tierFor = (sides) => (sides <= 6 ? 'easy' : sides <= 8 ? 'medium' : 'hard');

// Level n (1–12): an n×n board and an n-sided die. grants: the Shop ids
// (boards, difficulties) reaching the level unlocks for Free play and
// everything keyed on them (Expert per difficulty, homework, practice).
const GRANTS = { 7: ['difficulty.medium'], 8: ['board8'], 9: ['difficulty.hard'], 10: ['board10'], 12: ['board12'] };
const LEVELS = [
  ...Array.from({ length: 12 }, (_, i) => ({ level: i + 1, size: i + 1, sides: i + 1, difficulty: tierFor(i + 1), grants: GRANTS[i + 1] || [] })),
  { level: 13, size: 16, sides: 12, difficulty: 'hard', grants: ['board16'] },
  { level: 14, size: 12, difficulty: 'tricky', grants: ['difficulty.tricky'] },
  { level: 15, size: 20, sides: 12, difficulty: 'hard', grants: ['board20'] },
  { level: 16, size: 12, difficulty: 'master', grants: ['difficulty.master'] },
  { level: 17, size: 16, difficulty: 'legend', grants: ['difficulty.legend'] },
  { level: 18, size: 24, sides: 12, difficulty: 'hard', grants: ['board24'] },
];
// Past the last level: the Journey is done (and Custom boards open)
const DONE = LEVELS.length + 1;
const DONE_GRANTS = ['boardCustom'];

// The level that unlocks a Shop id (null: not a Journey unlock)
function levelGranting(id) {
  if (DONE_GRANTS.includes(id)) return DONE;
  const l = LEVELS.find((x) => x.grants.includes(id));
  return l ? l.level : null;
}

// Every Shop id unlocked by the time a player reaches `level`
const grantsUpTo = (level) => [...LEVELS.filter((l) => l.level <= level).flatMap((l) => l.grants), ...(level >= DONE ? DONE_GRANTS : [])];

// Practice's Journey: level n is the ×n times table (with a little review of
// the tables before it). Reaching a level unlocks its table for Free practice;
// level 1 is where Practice itself starts.
const PRACTICE_LEVELS = Array.from({ length: 12 }, (_, i) => ({ level: i + 1, table: i + 1, difficulty: tierFor(i + 1), grants: [...(i ? [] : ['practice']), `table${i + 1}`] }));
const PRACTICE_DONE = PRACTICE_LEVELS.length + 1;

// The Practice level that unlocks a Shop id (null: not a Practice Journey unlock)
function practiceLevelGranting(id) {
  const l = PRACTICE_LEVELS.find((x) => x.grants.includes(id));
  return l ? l.level : null;
}

const practiceGrantsUpTo = (level) => PRACTICE_LEVELS.filter((l) => l.level <= level).flatMap((l) => l.grants);

export { LEVELS, DONE, DONE_GRANTS, tierFor, levelGranting, grantsUpTo, PRACTICE_LEVELS, PRACTICE_DONE, practiceLevelGranting, practiceGrantsUpTo };
