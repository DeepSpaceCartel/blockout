// The Journeys' levels: plain data, so progress.js (its migrations) and
// journey.js (the rules the menus use) can both read it.
//
// The game's Journey climbs from a 1×1 board with a 1-sided die to 12×12 with
// a 12-sided one, each board in three stages that ask a little more, then a
// few challenges (the harder difficulties and the big boards). Practice's
// Journey goes ×1 to ×12, each table in three rounds: 5, 10, then 20 questions.

// The difficulty whose Expert, timer and practice unlocks a level uses: the
// dice of Easy (6), Medium (8) or Hard (12) that cover its die.
const tierFor = (sides) => (sides <= 6 ? 'easy' : sides <= 8 ? 'medium' : 'hard');

// What each stage of a board asks, on top of the stage before:
//   1 beat the CPU with 80 % of your answers right first try
//   2 …without "Help me count"
//   3 …and claim more than half the board
const STAGES = 3;

// The steps of the game's Journey: n×n with an n-sided die (1–12), then the
// challenges. grants: the Shop ids (boards, difficulties) reaching a step
// unlocks for Free play and everything keyed on them (Expert per difficulty,
// homework, practice).
const GRANTS = { 7: ['difficulty.medium'], 8: ['board8'], 9: ['difficulty.hard'], 10: ['board10'], 12: ['board12'] };
const STEPS = [
  ...Array.from({ length: 12 }, (_, i) => ({ step: i + 1, size: i + 1, sides: i + 1, difficulty: tierFor(i + 1), stages: STAGES, grants: GRANTS[i + 1] || [] })),
  { step: 13, size: 16, sides: 12, difficulty: 'hard', stages: 1, grants: ['board16'] },
  { step: 14, size: 12, difficulty: 'tricky', stages: 1, grants: ['difficulty.tricky'] },
  { step: 15, size: 20, sides: 12, difficulty: 'hard', stages: 1, grants: ['board20'] },
  { step: 16, size: 12, difficulty: 'master', stages: 1, grants: ['difficulty.master'] },
  { step: 17, size: 16, difficulty: 'legend', stages: 1, grants: ['difficulty.legend'] },
  { step: 18, size: 24, sides: 12, difficulty: 'hard', stages: 1, grants: ['board24'] },
];
// Every level: a step's stage. A step's grants come with its first stage.
const LEVELS = [];
for (const s of STEPS) {
  for (let stage = 1; stage <= s.stages; stage++) LEVELS.push({ ...s, level: LEVELS.length + 1, stage, grants: stage === 1 ? s.grants : [] });
}
// Past the last level: the Journey is done (and Custom boards open)
const DONE = LEVELS.length + 1;
const DONE_GRANTS = ['boardCustom'];

// The first level of a step (or DONE past the last one)
const levelOfStep = (step) => (LEVELS.find((l) => l.step === step && l.stage === 1) || { level: DONE }).level;

// The level that unlocks a Shop id (null: not a Journey unlock)
function levelGranting(id) {
  if (DONE_GRANTS.includes(id)) return DONE;
  const l = LEVELS.find((x) => x.grants.includes(id));
  return l ? l.level : null;
}

// Every Shop id unlocked by the time a player reaches `level`
const grantsUpTo = (level) => [...LEVELS.filter((l) => l.level <= level).flatMap((l) => l.grants), ...(level >= DONE ? DONE_GRANTS : [])];

// Practice's Journey: each ×n table (with a little review of the tables before
// it) up to the dice of its difficulty, as Practice always asked (upTo: 6 for
// ×1–×6, 8 for ×7–×8, 12 from ×9), in rounds of 5, then 10, then 20 questions.
// Reaching a table unlocks it for Free practice (level 1 is where Practice
// itself starts), and reaching its longer rounds unlocks them for that
// difficulty (×1 for Easy, ×7 Medium, ×9 Hard, ×12 the ones after Hard).
const UP_TO = { easy: 6, medium: 8, hard: 12 };
const COUNTS = [5, 10, 20];
const countId = (count, d) => (d === 'easy' ? `practice${count}` : `practice${count}.${d}`);
const COUNT_TABLES = { 1: ['easy'], 7: ['medium'], 9: ['hard'], 12: ['tricky', 'master', 'legend'] };
const PRACTICE_LEVELS = [];
for (let table = 1; table <= 12; table++) {
  COUNTS.forEach((count, i) => {
    const grants = [];
    if (table === 1 && i === 0) grants.push('practice');
    if (i === 0) grants.push(`table${table}`);
    if (i > 0) grants.push(...(COUNT_TABLES[table] || []).map((d) => countId(count, d)));
    PRACTICE_LEVELS.push({ level: PRACTICE_LEVELS.length + 1, table, stage: i + 1, count, difficulty: tierFor(table), upTo: UP_TO[tierFor(table)], grants });
  });
}
const PRACTICE_DONE = PRACTICE_LEVELS.length + 1;

// The first Practice level of the ×n table (or PRACTICE_DONE past ×12)
const practiceLevelOfTable = (table) => (table > 12 ? PRACTICE_DONE : (table - 1) * COUNTS.length + 1);

// The Practice level that unlocks a Shop id (null: not a Practice Journey unlock)
function practiceLevelGranting(id) {
  const l = PRACTICE_LEVELS.find((x) => x.grants.includes(id));
  return l ? l.level : null;
}

const practiceGrantsUpTo = (level) => PRACTICE_LEVELS.filter((l) => l.level <= level).flatMap((l) => l.grants);

export { LEVELS, STEPS, STAGES, DONE, DONE_GRANTS, tierFor, levelOfStep, levelGranting, grantsUpTo, PRACTICE_LEVELS, PRACTICE_DONE, practiceLevelOfTable, practiceLevelGranting, practiceGrantsUpTo };
