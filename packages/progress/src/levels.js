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
//   3 …with every answer right first try
// (skill, not the dice: how much of the board you get is mostly luck)
// The first boards (1×1 to 3×3) are a game or two each: one stage.
const STAGES = 3;
const STAGES_FROM = 4;

// The steps of the game's Journey: n×n with an n-sided die (1–12), then the
// challenges. grants: the Shop ids (boards, difficulties) reaching a step
// unlocks for Free play and everything keyed on them (Expert per difficulty,
// homework, practice), and the speed-ups: once the mechanics are learned
// (rolling, drawing, watching the CPU), the game gets out of the way so the
// player mostly answers. switches: the settings reaching the step turns on
// (the player can turn them back in Settings).
const GRANTS = { 4: ['cpuSpeed'], 5: ['autoRoll'], 6: ['placeAuto'], 7: ['difficulty.medium', 'cpuInstant', 'cpuEnd'], 8: ['board8'], 9: ['difficulty.hard'], 10: ['board10'], 12: ['board12'] };
const SWITCHES = { 4: [['cpuSpeed', 'fast']], 5: [['autoRoll', 'auto']], 6: [['placeMode', 'auto']], 7: [['cpuSteps', 'instant']] };
const STEPS = [
  ...Array.from({ length: 12 }, (_, i) => ({ step: i + 1, size: i + 1, sides: i + 1, difficulty: tierFor(i + 1), stages: i + 1 >= STAGES_FROM ? STAGES : 1, grants: GRANTS[i + 1] || [], switches: SWITCHES[i + 1] || [] })),
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
  for (let stage = 1; stage <= s.stages; stage++) LEVELS.push({ ...s, level: LEVELS.length + 1, stage, grants: stage === 1 ? s.grants : [], switches: (stage === 1 && s.switches) || [] });
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
// ×1–×6, 8 for ×7–×8, 12 from ×9), in five rounds: 5, 10 and 20 questions in
// Learn, then 10 in Expert, then 10 in Expert against a timer. The timer gets
// shorter as the tables of a difficulty go on (TIMERS).
// Reaching a table unlocks it for Free practice (level 1 is where Practice
// itself starts); reaching a round unlocks what it brings, for its difficulty,
// the first time: the longer rounds and Expert on a difficulty's first table
// (×1 Easy, ×7 Medium, ×9 Hard, ×12 the ones after Hard), each timer on the
// first table that uses it (with the longer ones, if they haven't come yet).
const UP_TO = { easy: 6, medium: 8, hard: 12 };
const ROUNDS = [{ count: 5 }, { count: 10 }, { count: 20 }, { count: 10, expert: true }, { count: 10, expert: true, timed: true }];
const TIMERS = { 1: 30, 2: 30, 3: 10, 4: 10, 5: 5, 6: 5, 7: 10, 8: 5, 9: 30, 10: 10, 11: 5, 12: 5 };
const AFTER_HARD = ['tricky', 'master', 'legend'];
const FIRST_TABLES = { 1: ['easy'], 7: ['medium'], 9: ['hard'], 12: AFTER_HARD };
const suffix = (d) => (d === 'easy' ? '' : `.${d}`);
const countId = (count, d) => `practice${count}${suffix(d)}`;
const expertId = (d) => `practiceExpert${suffix(d)}`;
const timerId = (secs, d) => `practiceTimer${secs}${suffix(d)}`;
const PRACTICE_LEVELS = [];
const given = new Set(); // (each id comes with the first round that brings it)
for (let table = 1; table <= 12; table++) {
  const tier = tierFor(table);
  const firsts = FIRST_TABLES[table] || [];
  ROUNDS.forEach((round, i) => {
    let ids = [];
    if (i === 0) ids = [...(table === 1 ? ['practice'] : []), `table${table}`];
    if (i === 1 || i === 2) ids = firsts.map((d) => countId(round.count, d));
    if (i === 3) ids = firsts.map(expertId);
    if (i === 4) {
      ids = [30, 10, 5].filter((secs) => secs >= TIMERS[table]).map((secs) => timerId(secs, tier));
      if (table === 12) ids.push(...AFTER_HARD.flatMap((d) => [30, 10, 5].map((secs) => timerId(secs, d))));
    }
    const grants = ids.filter((id) => !given.has(id));
    grants.forEach((id) => given.add(id));
    PRACTICE_LEVELS.push({
      level: PRACTICE_LEVELS.length + 1,
      table,
      stage: i + 1,
      count: round.count,
      expert: Boolean(round.expert),
      timer: round.timed ? TIMERS[table] : 0,
      difficulty: tier,
      upTo: UP_TO[tier],
      grants,
    });
  });
}
const PRACTICE_DONE = PRACTICE_LEVELS.length + 1;
const PRACTICE_ROUNDS = ROUNDS.length;

// The first Practice level of the ×n table (or PRACTICE_DONE past ×12)
const practiceLevelOfTable = (table) => (table > 12 ? PRACTICE_DONE : (table - 1) * ROUNDS.length + 1);

// The Practice level that unlocks a Shop id (null: not a Practice Journey unlock)
function practiceLevelGranting(id) {
  const l = PRACTICE_LEVELS.find((x) => x.grants.includes(id));
  return l ? l.level : null;
}

const practiceGrantsUpTo = (level) => PRACTICE_LEVELS.filter((l) => l.level <= level).flatMap((l) => l.grants);

export { LEVELS, STEPS, STAGES, DONE, DONE_GRANTS, tierFor, levelOfStep, levelGranting, grantsUpTo, PRACTICE_LEVELS, PRACTICE_DONE, PRACTICE_ROUNDS, practiceLevelOfTable, practiceLevelGranting, practiceGrantsUpTo };
