// Blockout progress: the shared points wallet, shop unlocks, achievements,
// daily check-ins, answer bonuses and lifetime multiplication-fact stats.
// Pure functions over a plain state object; the page saves it to localStorage.
// An ES module (@blockout/progress), used by the games and the server.

import * as Core from '@blockout/engine';

function createProgress() {
  return {
    version: 1,
    wallet: 0, // points available to spend
    earned: 0, // all points ever earned
    unlocks: [], // shop item ids
    achievements: {}, // id -> time earned
    checkIn: { last: null, streak: 0 },
    daily: { day: null, task: null, done: false, streak: 0, lastDone: null }, // today's practice (daily.js)
    facts: {}, // player key -> { name, facts: { '3 × 4': FactStats } }; 3 × 4 and 4 × 3 are separate
    factsOrdered: true,
    counters: { games: 0, classGames: 0, pairGames: 0, pairWins: 0, tournaments: 0, tournamentWins: 0 },
    boardsV2: true, // saves from before 6×6 became the free board don't have this
    practiceV2: true, // …or from before practice lengths and times tables were unlocked separately
    practiceTimersV1: true, // …or from before Expert practice had its own timers
    placeAutoV1: true, // …or from before Auto placing was a separate unlock
    gameExpertV1: true, // …or from before single player had Learn / Expert
    stickers: {}, // sticker id -> how many
    boardWins: {}, // board size -> wins against the CPU on it
    helpedFacts: {}, // '6 × 7' -> true after "Help me count" on it, until it's answered right first time
    activity: [], // recent games and practice rounds (see noteActivity)
  };
}

// Fill in anything missing from an older or partial saved state.
// ---------------------------------------------------------------- cheat codes
// Switched on from the ~ menu and off again from its list. state.cheats keeps
// what each one changed, so turning it off undoes exactly that.
const CHEAT_CODES = {
  iddqd: { name: 'Everything unlocked (shop and Wardrobe)' },
  fivemoreminutesmom: { name: 'Every timer is 5 minutes', timerSecs: 300 },
};

function cheatOn(state, code) {
  if (!CHEAT_CODES[code] || (state.cheats && state.cheats[code])) return false;
  state.cheats = state.cheats || {};
  if (code === 'iddqd') {
    const granted = SHOP.map((item) => item.id).filter((id) => !state.unlocks.includes(id));
    state.unlocks.push(...granted);
    state.cheats.iddqd = { granted };
  } else {
    state.cheats[code] = {}; // just a switch, read where it applies (see timerLength)
  }
  return true;
}

// Takes back only what the cheat gave: anything bought before stays.
function cheatOff(state, code) {
  const on = state.cheats && state.cheats[code];
  if (!on) return false;
  if (code === 'iddqd') {
    const granted = new Set(on.granted);
    state.unlocks = state.unlocks.filter((id) => !granted.has(id));
  }
  delete state.cheats[code];
  return true;
}

const activeCheats = (state) => Object.keys(state.cheats || {}).filter((code) => CHEAT_CODES[code]);

// How long an answer timer really runs: its own length, or 5 minutes with
// FIVEMOREMINUTESMOM on. No timer stays no timer.
const timerLength = (state, secs) => (secs && state.cheats && state.cheats.fivemoreminutesmom ? CHEAT_CODES.fivemoreminutesmom.timerSecs : secs);

function normalize(saved) {
  const fresh = createProgress();
  if (!saved || typeof saved !== 'object') return fresh;
  const state = {
    ...fresh,
    ...saved,
    checkIn: { ...fresh.checkIn, ...saved.checkIn },
    daily: { ...fresh.daily, ...saved.daily },
    counters: { ...fresh.counters, ...saved.counters },
    unlocks: Array.isArray(saved.unlocks) ? saved.unlocks : [],
    achievements: saved.achievements || {},
    facts: saved.facts || {},
    stickers: saved.stickers || {},
    boardWins: saved.boardWins || {},
    helpedFacts: saved.helpedFacts || {},
    cheats: saved.cheats || {},
    activity: Array.isArray(saved.activity) ? saved.activity : [],
    seen: { wardrobe: [], stickers: [], ...(saved.seen || {}) }, // for "new" badges
    factsOrdered: true,
  };
  if (!saved.factsOrdered) splitOldFacts(state.facts);
  // Practice used to come with 10 and 20 questions and every times table:
  // players who already bought it keep all of that.
  if (!saved.practiceV2) {
    if (state.unlocks.includes('practice')) {
      for (const id of ['practice10', 'practice20', ...Array.from({ length: 12 }, (_, i) => `table${i + 1}`)]) if (!state.unlocks.includes(id)) state.unlocks.push(id);
    }
    state.practiceV2 = true;
  }
  // Game timers moved from Settings to single player's Expert level: whoever
  // owned them keeps the same lengths there (on Easy), with Expert.
  if (!saved.gameExpertV1) {
    const owned = [30, 10, 5].filter((secs) => state.unlocks.includes(`answerTime${secs}`));
    if (owned.length) {
      for (const id of ['gameExpert', ...owned.map((secs) => `gameTimer${secs}`)]) if (!state.unlocks.includes(id)) state.unlocks.push(id);
    }
    state.gameExpertV1 = true;
  }
  // "placeMode" used to unlock both Click and Auto: owners keep Auto too.
  if (!saved.placeAutoV1) {
    if (state.unlocks.includes('placeMode') && !state.unlocks.includes('placeAuto')) state.unlocks.push('placeAuto');
    state.placeAutoV1 = true;
  }
  // Expert practice used the game's answer timer; it has its own timers now.
  // Anyone who had both keeps the same lengths.
  if (!saved.practiceTimersV1) {
    if (state.unlocks.includes('practiceExpert')) {
      for (const secs of [30, 10, 5]) {
        if (state.unlocks.includes(`answerTime${secs}`) && !state.unlocks.includes(`practiceTimer${secs}`)) state.unlocks.push(`practiceTimer${secs}`);
      }
    }
    state.practiceTimersV1 = true;
  }
  // 12×12 used to be the free board. Anyone who played before it moved to the
  // shop keeps it (a one-time change for older saves).
  if (!saved.boardsV2) {
    const played = (state.counters.games || 0) > 0 || Object.keys(state.facts).length > 0;
    if (played && !state.unlocks.includes('board12')) state.unlocks.push('board12');
    state.boardsV2 = true;
  }
  // The old all-in-one timer unlock (10/20/30 s) becomes the 30 s and 10 s unlocks.
  if (state.unlocks.includes('answerTime')) {
    state.unlocks = state.unlocks.filter((id) => id !== 'answerTime');
    for (const id of ['answerTime30', 'answerTime10']) if (!state.unlocks.includes(id)) state.unlocks.push(id);
  }
  return state;
}

// Older saves merged 3 × 4 with 4 × 3 (stored as the smaller number first).
// We can't tell which order was asked, so each old fact starts both orders.
function splitOldFacts(facts) {
  for (const player of Object.values(facts)) {
    for (const [key, f] of Object.entries(player.facts || {})) {
      const [a, b] = key.split('×').map((n) => Number(n.trim()));
      const flipped = factKey(b, a);
      if (a !== b && !player.facts[flipped]) player.facts[flipped] = { ...f, said: [...(f.said || [])] };
    }
  }
}

function addPoints(state, points) {
  state.wallet += points;
  state.earned += points;
}

// ---------------------------------------------------------------- answer bonuses

const BONUS = { firstTry: 2, quick: 3, quickMs: 5000, streakFrom: 3, streakMax: 5 };

// Finishing a game against the CPU on a bigger board earns extra, growing
// faster than the board (bigger boards take longer). Custom sizes get the
// bonus of the biggest standard board they reach.
const BOARD_FINISH_BONUS = { 6: 0, 8: 5, 10: 10, 12: 20, 16: 40, 20: 70, 24: 100 };
function boardFinishBonus(size) {
  let bonus = 0;
  for (const [n, b] of Object.entries(BOARD_FINISH_BONUS)) if (size >= Number(n)) bonus = b;
  return bonus;
}

// Finishing a longer practice round earns extra, more than in proportion.
const PRACTICE_FINISH_BONUS = { 5: 0, 10: 15, 20: 40 };
const practiceFinishBonus = (count, expert = false) => (PRACTICE_FINISH_BONUS[count] || 0) * (expert ? 2 : 1);

// Answering with a timer on: the shorter the timer, the bigger the top bonus.
// You get it all for an instant answer and nothing when time runs out, on a
// square-root curve (√ of the share of time left), so a quick answer on a
// short timer pays best and a slower one still earns something.
const TIMER_BONUS_MAX = { 30: 2, 10: 4, 5: 6 };
function timerBonus(secs, left) {
  const top = TIMER_BONUS_MAX[secs] || 0;
  if (!top || !(left > 0)) return 0;
  return Math.round(top * Math.sqrt(Math.min(1, left)));
}

// Extra points for a correct answer, on top of the rectangle's squares.
// Only first-try answers earn bonuses; a streak counts first-try answers in a row.
// timer: { secs, left } when a timer was on (left = share of the time left, 0–1).
function answerBonus({ firstTry, ms, streak, timer = null }) {
  const parts = [];
  if (firstTry) {
    parts.push({ label: 'first try', points: BONUS.firstTry });
    if (ms <= BONUS.quickMs) parts.push({ label: 'speedy', points: BONUS.quick });
    if (streak >= BONUS.streakFrom) {
      parts.push({ label: `streak ${streak}`, points: Math.min(streak - BONUS.streakFrom + 1, BONUS.streakMax) });
    }
    const beat = timer ? timerBonus(timer.secs, timer.left) : 0;
    if (beat) parts.push({ label: `timer ${timer.secs} s`, points: beat });
  }
  return { total: parts.reduce((sum, p) => sum + p.points, 0), parts };
}

// ---------------------------------------------------------------- shop

const DIFFICULTIES = Core.DIFFICULTIES; // easy, medium, hard, tricky, master, legend
const TIMER_DIFFICULTY_NAMES = { easy: 'Easy', medium: 'Medium', hard: 'Hard', tricky: 'Tricky', master: 'Master', legend: 'Legend' };
// Prices for per-difficulty chains: Easy, Medium and Hard as before, then a
// step up for each difficulty after that.
const stepPrice = (list, di, step) => (di < list.length ? list[di] : list[list.length - 1] + step * (di - list.length + 1));
// Expert practice, per difficulty (Easy keeps the original id)
const practiceExpertId = (difficulty = 'easy') => (difficulty === 'easy' ? 'practiceExpert' : `practiceExpert.${difficulty}`);

// Single player, like Practice: Expert (no "Help me count", ×2 bonus points)
// and its answer timers are unlocked for each difficulty.
const gameExpertId = (difficulty = 'easy') => (difficulty === 'easy' ? 'gameExpert' : `gameExpert.${difficulty}`);
const gameTimerId = (secs, difficulty = 'easy') => (difficulty === 'easy' ? `gameTimer${secs}` : `gameTimer${secs}.${difficulty}`);
const GAME_CHAINS = DIFFICULTIES.flatMap((d, di) => [
  {
    id: gameExpertId(d),
    group: 'Single player',
    name: `Expert games (${TIMER_DIFFICULTY_NAMES[d]}): no help counting, ×2 bonus points`,
    price: stepPrice([150, 200, 250], di, 50),
    ...(d === 'easy' ? {} : { requires: `difficulty.${d}` }),
    perk: 'Bonus points are doubled, and you can race an answer timer.',
  },
  ...[30, 10, 5].map((secs, i) => ({
    id: gameTimerId(secs, d),
    group: 'Single player',
    name: `Expert game timer: ${secs} seconds (${TIMER_DIFFICULTY_NAMES[d]})`,
    price: stepPrice([[30, 50, 80], [50, 80, 110], [70, 100, 140]].map((row) => row[i]), di, 30),
    requires: i ? gameTimerId([30, 10, 5][i - 1], d) : gameExpertId(d),
    perk: `${secs === 5 ? 'Only for the quickest' : 'Race the clock'} on ${TIMER_DIFFICULTY_NAMES[d]}: a timer bonus of up to +${TIMER_BONUS_MAX[secs] * 2} each (Expert doubles it).`,
  })),
]);

// Practice round lengths: 5 comes with Practice mode on every difficulty; 10
// and 20 are unlocked separately for each one. Easy keeps the original ids.
const practiceCountId = (count, difficulty = 'easy') => (count === 5 ? null : difficulty === 'easy' ? `practice${count}` : `practice${count}.${difficulty}`);
const COUNT_PRICES = { easy: [40, 80], medium: [60, 110], hard: [80, 140] };
const PRACTICE_COUNT_CHAINS = DIFFICULTIES.flatMap((d, di) =>
  [10, 20].map((count, i) => ({
    id: practiceCountId(count, d),
    group: 'Practice',
    name: `Practice: ${count} questions (${TIMER_DIFFICULTY_NAMES[d]})`,
    price: stepPrice(['easy', 'medium', 'hard'].map((x) => COUNT_PRICES[x][i]), di, 30),
    requires: i ? practiceCountId(10, d) : d === 'easy' ? 'practice' : `difficulty.${d}`,
    perk: `Finish all ${count} for +${practiceFinishBonus(count)} bonus points (+${practiceFinishBonus(count, true)} on Expert).`,
  }))
);

// Expert practice timer unlocks, one chain per difficulty. Easy keeps the
// original ids (practiceTimer30, …); the others add the difficulty.
const practiceTimerId = (secs, difficulty = 'easy') => (difficulty === 'easy' ? `practiceTimer${secs}` : `practiceTimer${secs}.${difficulty}`);
const TIMER_PRICES = { easy: [40, 70, 100], medium: [60, 100, 140], hard: [80, 130, 180] };
const PRACTICE_TIMER_CHAINS = DIFFICULTIES.flatMap((d, di) =>
  [30, 10, 5].map((secs, i) => ({
    id: practiceTimerId(secs, d),
    group: 'Practice',
    name: `Expert practice timer: ${secs} seconds (${TIMER_DIFFICULTY_NAMES[d]})`,
    price: stepPrice(['easy', 'medium', 'hard'].map((x) => TIMER_PRICES[x][i]), di, 30),
    // the chain starts with Expert practice (and, above Easy, that difficulty)
    requires: i ? practiceTimerId([30, 10, 5][i - 1], d) : practiceExpertId(d), // starts with that difficulty's Expert
    perk: `${secs === 5 ? 'Only for the quickest' : 'Race the clock'} on ${TIMER_DIFFICULTY_NAMES[d]}: a timer bonus of up to +${TIMER_BONUS_MAX[secs] * 2} each (Expert doubles it).`,
  }))
);

const SHOP = [
  { id: 'multiplayer', group: 'Modes', name: 'Multiplayer (2 players)', price: 150 },
  { id: 'players3', group: 'Modes', name: 'Multiplayer: 3 players', price: 100, requires: 'multiplayer' },
  { id: 'players4', group: 'Modes', name: 'Multiplayer: 4 players', price: 100, requires: 'players3' },
  { id: 'practice', group: 'Modes', name: 'Practice mode (5 questions)', price: 100 },
  // Skill-tree chains: each one needs the one before it (`requires`); the UI only
  // shows the next step, the rest are locked placeholders.
  // Boards: you also have to win a game on the board before (`winOn`) to see the next one.
  { id: 'board8', group: 'Boards', name: 'Board 8×8', price: 50, winOn: 6, perk: `Finish a game against the CPU on it for +${boardFinishBonus(8)} bonus points.` },
  { id: 'board10', group: 'Boards', name: 'Board 10×10', price: 80, requires: 'board8', winOn: 8, perk: `Finish a game against the CPU on it for +${boardFinishBonus(10)} bonus points.` },
  { id: 'board12', group: 'Boards', name: 'Board 12×12', price: 120, requires: 'board10', winOn: 10, perk: `Finish a game against the CPU on it for +${boardFinishBonus(12)} bonus points.` },
  { id: 'board16', group: 'Boards', name: 'Medium board (16×16)', price: 150, requires: 'board12', winOn: 12, perk: `Finish a game against the CPU on it for +${boardFinishBonus(16)} bonus points.` },
  { id: 'board20', group: 'Boards', name: 'Large board (20×20)', price: 300, requires: 'board16', winOn: 16, perk: `Finish a game against the CPU on it for +${boardFinishBonus(20)} bonus points.` },
  { id: 'board24', group: 'Boards', name: 'Huge board (24×24)', price: 450, requires: 'board20', winOn: 20, perk: `Finish a game against the CPU on it for +${boardFinishBonus(24)} bonus points.` },
  { id: 'boardCustom', group: 'Boards', name: 'Custom board size', price: 400, requires: 'board24', winOn: 24, perk: `Any size from 6 to 30. Its finishing bonus matches the biggest standard board it reaches (+${boardFinishBonus(24)} from 24×24 up).` },
  // Difficulties: you also have to master most of the times table the one before
  // asks (`masterUpTo`, see tableReady) to see the next one.
  { id: 'difficulty.medium', group: 'Difficulty', name: 'Medium: 8-sided dice', price: 250, masterUpTo: 6 },
  { id: 'difficulty.hard', group: 'Difficulty', name: 'Hard: 12-sided dice', price: 500, requires: 'difficulty.medium', masterUpTo: 8 },
  // After Hard: harder facts rather than bigger numbers (see Core.diceFaces)
  { id: 'difficulty.tricky', group: 'Difficulty', name: 'Tricky: no easy facts (no ×1, ×2, ×5, ×10, ×11)', price: 700, requires: 'difficulty.hard', mastery: { size: 12, share: 0.75 } },
  { id: 'difficulty.master', group: 'Difficulty', name: 'Master: the dice go after your weakest facts', price: 900, requires: 'difficulty.tricky', mastery: { faces: Core.TRICKY_FACES, share: 0.75 } },
  { id: 'difficulty.legend', group: 'Difficulty', name: 'Legend: two-digit × one-digit (like 14 × 7) mixed with Tricky facts', price: 1200, requires: 'difficulty.master', mastery: { size: 12, share: 0.9 } },
  // Placing rectangles: Click first, then Auto (drawing is free)
  { id: 'placeMode', group: 'Settings', name: 'Placing: click to place', price: 40 },
  { id: 'placeAuto', group: 'Settings', name: 'Placing: auto (placed for you)', price: 60, requires: 'placeMode' },
  { id: 'diceMode', group: 'Settings', name: 'Real dice', price: 60 },
  { id: 'autoRoll', group: 'Settings', name: 'Auto roll', price: 40 },
  { id: 'fitRolls', group: 'Settings', name: '"No room" options: Always fit & Original rules', price: 40 },
  // (Home multiplayer; single player has its own timers under Expert)
  { id: 'answerTime30', group: 'Settings', name: 'Home multiplayer answer timer: 30 seconds', price: 30, perk: `Answer quickly for a timer bonus of up to +${TIMER_BONUS_MAX[30]} each.` },
  { id: 'answerTime10', group: 'Settings', name: 'Home multiplayer answer timer: 10 seconds', price: 50, requires: 'answerTime30', perk: `Answer quickly for a timer bonus of up to +${TIMER_BONUS_MAX[10]} each.` },
  { id: 'answerTime5', group: 'Settings', name: 'Home multiplayer answer timer: 5 seconds', price: 80, requires: 'answerTime10', perk: `Answer quickly for a timer bonus of up to +${TIMER_BONUS_MAX[5]} each.` },
  { id: 'cpuSpeed', group: 'Settings', name: 'Slow & fast CPU explanations', price: 40 },
  { id: 'cpuEnd', group: 'Settings', name: 'Press a button after CPU turns', price: 40 },
  { id: 'cpuInstant', group: 'Settings', name: 'Instant CPU turns', price: 80 },
  { id: 'showProgress', group: 'Settings', name: 'Board progress bar', price: 30 },
  { id: 'firstInCorner', group: 'Settings', name: 'Corner rule', price: 30 },
  // perk: what the unlock gives you, shown when you buy it
  ...GAME_CHAINS,
  // Longer practice rounds: a chain per difficulty (10, then 20). See practiceCountId.
  ...PRACTICE_COUNT_CHAINS,
  // Expert practice, unlocked for each difficulty. See practiceExpertId.
  ...DIFFICULTIES.map((d, i) => ({
    id: practiceExpertId(d),
    group: 'Practice',
    name: `Expert practice (${TIMER_DIFFICULTY_NAMES[d]}): no picture, no help, ×2 bonus points`,
    price: stepPrice([200, 250, 300], i, 50),
    requires: d === 'easy' ? 'practice' : `difficulty.${d}`,
    perk: 'Bonus points are doubled, including the bonus for finishing 10 or 20 questions.',
  })),
  // Expert practice timers: a chain per difficulty (30 s, then 10 s, then 5 s),
  // since being quick on ×6 facts isn't being quick on ×12 ones. See practiceTimerId.
  ...PRACTICE_TIMER_CHAINS,
  // Times tables to practice, one at a time: ×1 first, then ×2, …
  ...Array.from({ length: 12 }, (_, i) => ({
    id: `table${i + 1}`,
    group: 'Times tables',
    name: `Practice the ×${i + 1} table`,
    price: 10 + 5 * i,
    requires: i ? `table${i}` : 'practice',
  })),
  { id: 'timesMastered', group: 'Stats', name: 'Best times on Mastered cells', price: 50 },
  { id: 'timesLearning', group: 'Stats', name: 'Best times on Learning cells', price: 50 },
  { id: 'timesPractice', group: 'Stats', name: 'Best times on Needs practice cells', price: 50 },
  { id: 'goldenDice', group: 'Extras', name: 'Golden dice ✨', price: 10000 },
];

function shopItem(id) {
  return SHOP.find((item) => item.id === id) || null;
}

// Free things (no id) are always unlocked.
function isUnlocked(state, id) {
  return !id || state.unlocks.includes(id);
}

function canBuy(state, id, now = new Date()) {
  const item = shopItem(id);
  if (!item) return { ok: false, reason: 'unknown' };
  if (isUnlocked(state, id)) return { ok: false, reason: 'owned' };
  if (item.available && !item.available(now)) return { ok: false, reason: 'season', when: item.seasonLabel };
  if (item.requires && !isUnlocked(state, item.requires)) return { ok: false, reason: 'requires', requires: item.requires };
  if (item.winOn && !hasWonOn(state, item.winOn)) return { ok: false, reason: 'win', size: item.winOn };
  if (item.masterUpTo || item.mastery) {
    const ready = tableReady(state, item.mastery || item.masterUpTo);
    if (!ready.ok) return { ok: false, reason: 'master', ...ready };
  }
  if (state.wallet < item.price) return { ok: false, reason: 'points', missing: item.price - state.wallet };
  return { ok: true };
}

// The first thing to unlock on the way to `id`: itself if its requirement is
// met, otherwise the earliest locked step before it.
function nextInChain(state, id) {
  let item = shopItem(id);
  while (item && item.requires && !isUnlocked(state, item.requires)) item = shopItem(item.requires);
  return item ? item.id : id;
}

// Wins against the CPU, per board size: winning on a board reveals the next one.
const hasWonOn = (state, size) => (state.boardWins[size] || 0) > 0;
function recordBoardWin(state, size) {
  state.boardWins[size] = (state.boardWins[size] || 0) + 1;
}

// Knowing a set of facts (the ones a difficulty's dice ask): at least a share
// of them Mastered and none "Needs practice". `spec` is a size (every fact up to
// size × size, MASTER_SHARE of them) or { size | faces, share }. Counts the
// player who plays on this device ("You").
const MASTER_SHARE = 0.75;
function tableReady(state, spec, name = 'You') {
  const { size = null, faces = null, share = MASTER_SHARE } = typeof spec === 'number' ? { size: spec } : spec;
  const list = faces || Array.from({ length: size }, (_, i) => i + 1);
  const facts = (state.facts[playerKey(name)] || { facts: {} }).facts;
  let mastered = 0;
  let practice = 0;
  for (const a of list) {
    for (const b of list) {
      const status = factStatus(facts[factKey(a, b)]);
      if (status === 'mastered') mastered++;
      if (status === 'practice') practice++;
    }
  }
  const total = list.length * list.length;
  const need = Math.ceil(total * share);
  return { ok: mastered >= need && practice === 0, size: size || Math.max(...list), ...(faces ? { faces } : {}), mastered, need, total, practice };
}

// Locked and not next in line (or not earned yet, by a win or by knowing the
// times table): shown as a locked placeholder with no name or price.
function isHidden(state, id) {
  if (!id || isUnlocked(state, id)) return false;
  if (nextInChain(state, id) !== id) return true;
  const item = shopItem(id);
  if (!item) return false;
  if (item.winOn && !hasWonOn(state, item.winOn)) return true;
  return Boolean((item.masterUpTo || item.mastery) && !tableReady(state, item.mastery || item.masterUpTo).ok);
}

function buy(state, id, now = new Date()) {
  const check = canBuy(state, id, now);
  if (!check.ok) return check;
  state.wallet -= shopItem(id).price;
  state.unlocks.push(id);
  return { ok: true };
}

// ---------------------------------------------------------------- daily check-in

function dayKey(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// First visit of the day earns a bonus that grows with the streak of days in a row.
// Returns null if already checked in today.
function checkIn(state, now = new Date()) {
  const today = dayKey(now);
  if (state.checkIn.last === today) return null;
  const yesterday = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const streak = state.checkIn.last === yesterday ? state.checkIn.streak + 1 : 1;
  const bonus = 20 + 5 * Math.min(streak - 1, 6);
  state.checkIn = { last: today, streak };
  addPoints(state, bonus);
  return { bonus, streak };
}

// ---------------------------------------------------------------- lifetime fact stats

// Order matters: knowing 5 × 6 doesn't mean knowing 6 × 5, so they're separate facts.
function factKey(a, b) {
  return `${a} × ${b}`;
}

function playerKey(name) {
  return name.trim().toLowerCase();
}

// One question answered (or timed out) by a human player.
function recordAnswer(state, name, { a, b, firstTry, correct, wrongAnswers = [], timeout = false, ms = null }) {
  const key = playerKey(name);
  const player = state.facts[key] || (state.facts[key] = { name, facts: {} });
  player.name = name;
  const id = factKey(a, b);
  const f =
    player.facts[id] ||
    (player.facts[id] = { asked: 0, firstTry: 0, right: 0, wrong: 0, timeouts: 0, said: [], totalMs: 0, timed: 0 });
  f.asked++;
  if (firstTry) f.firstTry++;
  if (correct) f.right++;
  if (timeout) f.timeouts++;
  f.wrong += wrongAnswers.length;
  f.said = [...f.said, ...wrongAnswers].slice(-10);
  if (correct && ms !== null) {
    f.totalMs += ms;
    f.timed++;
    f.bestMs = f.bestMs === undefined ? ms : Math.min(f.bestMs, ms);
  }
}

// Fastest correct answer for a fact; older saves only have the average.
function factBestMs(f) {
  if (!f || !f.timed) return null;
  return f.bestMs !== undefined ? f.bestMs : f.totalMs / f.timed;
}

// Is every fact in the n line at least `level` ('learning' or 'mastered')?
// The line is both orders: n × 1 … n × size and 1 × n … size × n.
function lineReached(facts, n, size, level) {
  const ok = level === 'mastered' ? ['mastered'] : ['learning', 'mastered'];
  for (let m = 1; m <= size; m++) {
    if (!ok.includes(factStatus(facts[factKey(n, m)]))) return false;
    if (!ok.includes(factStatus(facts[factKey(m, n)]))) return false;
  }
  return true;
}

// 'mastered': mostly right first time over a few tries; 'practice': missed
// more often than not; 'learning': in between.
function factStatus(f) {
  if (!f || !f.asked) return 'unseen';
  const rate = f.firstTry / f.asked;
  if (f.asked >= 3 && rate >= 0.8) return 'mastered';
  if (f.wrong + f.timeouts > 0 && rate < 0.6) return 'practice';
  return 'learning';
}

// ---------------------------------------------------------------- practice mode

// How likely each kind of fact is to be picked for practice.
const PRACTICE_WEIGHTS = { practice: 8, learning: 4, unseen: 3, mastered: 0.5 };

// Pick `count` facts from 1..max for one player, favouring the ones they
// need most. `tables` (e.g. [3, 4]) limits it to those times tables; empty
// means the whole table. 3 × 4 and 4 × 3 are separate facts, each picked on
// its own record. Each fact appears once (unless there are fewer facts than
// questions): [a, b] exactly as it should be asked.
// The facts a difficulty practices, and its table chips. Legend's chips are the
// one-digit side (14 × 7 is in the ×7 table).
function practiceSet(difficulty) {
  const { a: A, b: B } = Core.diceFaces(difficulty);
  const pairs = [];
  for (const a of A) for (const b of B) pairs.push([a, b]);
  return { pairs, tables: difficulty === 'legend' ? B : A, bSideOnly: difficulty === 'legend' };
}

// `max` is a size (every fact up to max × max) or a difficulty's practiceSet.
function pickPracticeFacts(facts, max, count, rng = Math.random, tables = []) {
  const set = typeof max === 'number' ? null : max;
  const allPairs = set ? set.pairs : [];
  if (!set) for (let a = 1; a <= max; a++) for (let b = 1; b <= max; b++) allPairs.push([a, b]);
  const allowed = set ? set.tables : Array.from({ length: max }, (_, i) => i + 1);
  const only = new Set(tables.filter((n) => allowed.includes(n)));
  const pool = [];
  for (const [a, b] of allPairs) {
    if (only.size && !(set && set.bSideOnly ? only.has(b) : only.has(a) || only.has(b))) continue;
    const status = factStatus(facts[factKey(a, b)]);
    let weight = PRACTICE_WEIGHTS[status];
    if ((a === 1 || b === 1) && status !== 'practice') weight /= 2; // ×1 facts are easy wins
    pool.push({ a, b, weight });
  }
  const picked = [];
  while (picked.length < count && pool.length) {
    let r = rng() * pool.reduce((sum, f) => sum + f.weight, 0);
    let i = 0;
    while (i < pool.length - 1 && (r -= pool[i].weight) > 0) i++;
    picked.push(pool.splice(i, 1)[0]);
  }
  for (let i = 0; picked.length < count; i++) picked.push(picked[i]); // tiny tables: repeat
  return picked.map(({ a, b }) => [a, b]);
}

// ---------------------------------------------------------------- achievements

// check(ctx) runs on events: 'answer', 'game', 'checkin', 'buy', 'practice', 'class', 'pair', 'tournament', 'cheat'.
// Answer events also carry the player's facts and their table size (6, 8 or 12).
const GENERAL_ACHIEVEMENTS = [
  { id: 'first_game', icon: '🎲', name: 'First game', desc: 'Finish your first game.', reward: 10, check: (c) => c.event === 'game' },
  { id: 'first_win', icon: '🏆', name: 'Winner!', desc: 'Beat the CPU in single player.', reward: 20, check: (c) => c.event === 'game' && c.wonVsCpu },
  { id: 'full_house', icon: '🧱', name: 'Full house', desc: 'Finish a game with the board completely full.', reward: 15, check: (c) => c.event === 'game' && c.full },
  { id: 'perfect', icon: '⭐', name: 'Perfect game', desc: 'Get every answer right first time in a game (at least 5).', reward: 40, check: (c) => c.event === 'game' && c.perfect },
  { id: 'hard_win', icon: '💪', name: 'Tough cookie', desc: 'Win a game on Hard.', reward: 60, check: (c) => c.event === 'game' && c.humanWon && c.difficulty === 'hard' },
  { id: 'games5', icon: '🌱', name: 'Getting started', desc: 'Finish 5 games.', reward: 15, check: (c) => c.event === 'game' && c.games >= 5 },
  { id: 'games10', icon: '📅', name: 'Regular', desc: 'Finish 10 games.', reward: 30, check: (c) => c.event === 'game' && c.games >= 10 },
  { id: 'games25', icon: '🎯', name: 'Dedicated', desc: 'Finish 25 games.', reward: 60, check: (c) => c.event === 'game' && c.games >= 25 },
  { id: 'games50', icon: '🎖️', name: 'Blockout pro', desc: 'Finish 50 games.', reward: 100, check: (c) => c.event === 'game' && c.games >= 50 },
  { id: 'games100', icon: '💯', name: 'Century', desc: 'Finish 100 games.', reward: 200, check: (c) => c.event === 'game' && c.games >= 100 },
  { id: 'games250', icon: '🏅', name: 'Blockout master', desc: 'Finish 250 games.', reward: 400, check: (c) => c.event === 'game' && c.games >= 250 },
  { id: 'games500', icon: '🌟', name: 'Blockout legend', desc: 'Finish 500 games.', reward: 800, check: (c) => c.event === 'game' && c.games >= 500 },
  { id: 'streak5', icon: '🔥', name: 'Hot streak', desc: 'Get 5 answers in a row right first time.', reward: 20, check: (c) => c.event === 'answer' && c.streak >= 5 },
  { id: 'streak10', icon: '🚀', name: 'On fire', desc: 'Get 10 answers in a row right first time.', reward: 40, check: (c) => c.event === 'answer' && c.streak >= 10 },
  { id: 'speedy', icon: '⚡', name: 'Speedy', desc: 'Answer right first time in under 3 seconds.', reward: 15, check: (c) => c.event === 'answer' && c.correct && c.firstTry && c.ms < 3000 },
  { id: 'big_block', icon: '🟧', name: 'Big block', desc: 'Score a rectangle of 30 squares or more, right first time.', reward: 15, check: (c) => c.event === 'answer' && c.correct && c.firstTry && c.a * c.b >= 30 },
  { id: 'twelve', icon: '🧠', name: 'Twelve times', desc: 'Answer a 12 times fact right first time.', reward: 20, check: (c) => c.event === 'answer' && c.correct && c.firstTry && (c.a === 12 || c.b === 12) },
  { id: 'checkin3', icon: '☀️', name: 'Three days in a row', desc: 'Play three days in a row.', reward: 20, check: (c) => c.event === 'checkin' && c.streak >= 3 },
  { id: 'checkin7', icon: '🗓️', name: 'Week streak', desc: 'Play seven days in a row.', reward: 50, check: (c) => c.event === 'checkin' && c.streak >= 7 },
  { id: 'daily_first', icon: '⭐', name: 'Daily star', desc: 'Finish today’s practice.', reward: 15, check: (c) => c.event === 'daily' },
  { id: 'daily_week', icon: '🌟', name: 'Star week', desc: 'Finish today’s practice seven days in a row.', reward: 60, check: (c) => c.event === 'daily' && c.streak >= 7 },
  { id: 'practice', icon: '🎯', name: 'Practice makes perfect', desc: 'Finish a practice round.', reward: 10, check: (c) => c.event === 'practice' },
  // "Help me count": finding it, learning from it, and managing without it
  { id: 'help_first', icon: '🤝', name: 'Counting buddy', desc: 'Use “Help me count” for the first time.', reward: 5, check: (c) => c.event === 'help' },
  { id: 'help_learned', icon: '💡', name: 'Got it now!', desc: 'Get help counting a fact, then answer it right first time later on.', reward: 20, check: (c) => c.event === 'answer' && c.learned },
  { id: 'help_none', icon: '🦸', name: 'Standing on my own', desc: 'Finish a game with 5 or more answers and no help counting.', reward: 15, check: (c) => c.event === 'game' && c.noHelp },
  { id: 'shopper', icon: '🛍️', name: 'Shopper', desc: 'Buy your first unlock in the shop.', reward: 10, check: (c) => c.event === 'buy' },
].map((a) => ({ ...a, group: 'General' }));

// Classroom games (everyone plays the same rolls on their own board). The end of
// a class game sends { event: 'class', classGames, rank, of, perfect, missed, rolls }.
const BIG_CLASS = 4; // placing only counts against at least this many players
const CLASS_ACHIEVEMENTS = [
  { id: 'class_first', icon: '🏫', name: 'Class act', desc: 'Finish a classroom game.', reward: 15, check: (c) => c.event === 'class' },
  { id: 'class_podium', icon: '🥉', name: 'On the podium', desc: `Finish in the top 3 of a classroom game with at least ${BIG_CLASS} players.`, reward: 30, check: (c) => c.event === 'class' && c.of >= BIG_CLASS && c.rank <= 3 },
  { id: 'class_top', icon: '🥇', name: 'Top of the class', desc: `Come first in a classroom game with at least ${BIG_CLASS} players.`, reward: 60, check: (c) => c.event === 'class' && c.of >= BIG_CLASS && c.rank === 1 },
  { id: 'class_perfect', icon: '🌟', name: 'Gold star', desc: 'Get every answer right first time in a classroom game (at least 5).', reward: 40, check: (c) => c.event === 'class' && c.perfect },
  { id: 'class_every', icon: '✋', name: 'Every roll', desc: 'Keep up with every roll in a classroom game of 10 rolls or more.', reward: 20, check: (c) => c.event === 'class' && c.rolls >= 10 && c.missed === 0 },
  { id: 'class5', icon: '📚', name: 'Class regular', desc: 'Finish 5 classroom games.', reward: 30, check: (c) => c.event === 'class' && c.classGames >= 5 },
  { id: 'class25', icon: '🎓', name: 'Class veteran', desc: 'Finish 25 classroom games.', reward: 100, check: (c) => c.event === 'class' && c.classGames >= 25 },
  // Pairs games send { event: 'pair', won, tie, vsTeacher, vsCpu, pairGames, pairWins, perfect }
  { id: 'pair_first', icon: '🤝', name: 'Partners', desc: 'Finish a pairs game in class.', reward: 15, check: (c) => c.event === 'pair' },
  { id: 'pair_win', icon: '⚔️', name: 'Head to head', desc: 'Win a pairs game in class.', reward: 25, check: (c) => c.event === 'pair' && c.won },
  { id: 'pair_teacher', icon: '🍎', name: 'Beat the teacher!', desc: 'Win a pairs game against your teacher.', reward: 50, check: (c) => c.event === 'pair' && c.won && c.vsTeacher },
  { id: 'pair_perfect', icon: '💫', name: 'Flawless duel', desc: 'Get every answer right first time in a pairs game (at least 5).', reward: 40, check: (c) => c.event === 'pair' && c.perfect },
  { id: 'pair_wins5', icon: '🏅', name: 'Duel champion', desc: 'Win 5 pairs games in class.', reward: 60, check: (c) => c.event === 'pair' && c.pairWins >= 5 },
  // Tournaments send { event: 'tournament', place, of, champion, undefeated, upsets, bestStreak, tournaments, titles }
  { id: 'tour_first', icon: '🎪', name: 'Tournament player', desc: 'Finish a class tournament.', reward: 15, check: (c) => c.event === 'tournament' },
  { id: 'tour_final', icon: '🥈', name: 'Finalist', desc: 'Finish in the top 2 of a tournament with at least 4 players.', reward: 40, check: (c) => c.event === 'tournament' && c.of >= 4 && c.place <= 2 },
  { id: 'tour_champion', icon: '🏆', name: 'Champion', desc: 'Win a class tournament with at least 4 players.', reward: 80, check: (c) => c.event === 'tournament' && c.of >= 4 && c.champion },
  { id: 'tour_undefeated', icon: '🛡️', name: 'Undefeated', desc: 'Win every game you play in a tournament (at least 2).', reward: 60, check: (c) => c.event === 'tournament' && c.undefeated && c.of >= 3 },
  { id: 'tour_giant', icon: '🪨', name: 'Giant slayer', desc: 'In a tournament, beat someone with a better record than you.', reward: 30, check: (c) => c.event === 'tournament' && c.upsets > 0 },
  { id: 'tour_king', icon: '👑', name: 'King of the hill', desc: 'Win 3 tournament games in a row.', reward: 30, check: (c) => c.event === 'tournament' && c.bestStreak >= 3 },
  { id: 'tour_titles3', icon: '🎖️', name: 'Triple crown', desc: 'Win 3 class tournaments.', reward: 150, check: (c) => c.event === 'tournament' && c.titles >= 3 },
].map((a) => ({ ...a, group: 'Classroom' }));

// One pair per times table: every fact in the line at least Learning, then all Mastered.
const TABLE_ACHIEVEMENTS = [];
for (let n = 1; n <= 12; n++) {
  const inReach = (c) => c.event === 'answer' && c.facts && n <= c.size;
  TABLE_ACHIEVEMENTS.push(
    {
      id: `table${n}_learn`,
      icon: '📗',
      name: `×${n} learner`,
      desc: `Every ${n} times fact up to your table size is Learning or better.`,
      reward: 15,
      group: 'Times tables',
      check: (c) => inReach(c) && lineReached(c.facts, n, c.size, 'learning'),
    },
    {
      id: `table${n}_master`,
      icon: '🏅',
      name: `×${n} master`,
      desc: `Every ${n} times fact up to your table size is Mastered.`,
      reward: 30,
      group: 'Times tables',
      check: (c) => inReach(c) && lineReached(c.facts, n, c.size, 'mastered'),
    }
  );
}

// Best score in one game (squares + bonus), by any human player. Several tiers.
const SCORE_TIERS = [
  { score: 50, icon: '🥉', name: 'Bronze score', reward: 10 },
  { score: 100, icon: '🥈', name: 'Silver score', reward: 20 },
  { score: 150, icon: '🥇', name: 'Gold score', reward: 30 },
  { score: 250, icon: '💎', name: 'Diamond score', reward: 50 },
  { score: 400, icon: '👑', name: 'Champion score', reward: 100 },
];
const SCORE_ACHIEVEMENTS = SCORE_TIERS.map((t) => ({
  id: `score${t.score}`,
  icon: t.icon,
  name: t.name,
  desc: `Score ${t.score} points or more in one game.`,
  reward: t.reward,
  group: 'Scores',
  check: (c) => c.event === 'game' && c.bestScore >= t.score,
}));

// Fact speed: for every fact 1 × 1 … 12 × 12 (each order), three tiers once it's
// Mastered: best time under 10 s, 5 s and 1 s. 432 achievements, shown as a grid.
// `minor`: celebrated with a toast only, no full-screen confetti.
const FACT_SPEED_TIERS = [
  { ms: 10000, secs: 10, icon: '🥉', reward: 2 },
  { ms: 5000, secs: 5, icon: '🥈', reward: 5 },
  { ms: 1000, secs: 1, icon: '🥇', reward: 10 },
];
const FACT_SPEED_ACHIEVEMENTS = [];
for (let a = 1; a <= 12; a++) {
  for (let b = 1; b <= 12; b++) {
    for (const t of FACT_SPEED_TIERS) {
      FACT_SPEED_ACHIEVEMENTS.push({
        id: `fact_${a}x${b}_${t.secs}`,
        icon: t.icon,
        name: `${a} × ${b} under ${t.secs} s`,
        desc: `Master ${a} × ${b} with a best time under ${t.secs} seconds.`,
        reward: t.reward,
        group: 'Fact speed',
        minor: true,
        fact: [a, b],
        tier: t.secs,
        check: (c) => {
          if (c.event !== 'answer' || c.a !== a || c.b !== b || !c.facts) return false;
          const f = c.facts[factKey(a, b)];
          return factStatus(f) === 'mastered' && factBestMs(f) !== null && factBestMs(f) < t.ms;
        },
      });
    }
  }
}

// Secret achievements: shown as "???" until earned. One for the first cheat
// code, and one for each code.
const SECRET_ACHIEVEMENTS = [
  { id: 'cheater', icon: '🕹️', name: 'Cheater', desc: 'Found a secret cheat code. Shh!', reward: 1, check: (c) => c.event === 'cheat' },
  { id: 'cheat_iddqd', icon: '😈', name: 'id Software', desc: 'IDDQD: the god mode code from Doom (id Software, 1993).', reward: 1, check: (c) => c.event === 'cheat' && c.code === 'iddqd' },
  { id: 'cheat_fivemoreminutesmom', icon: '🛏️', name: 'ETA 5 MINUTES TO BEDTIME BOYS', desc: 'Every timer is 5 minutes. Just five more minutes, Mom!', reward: 1, check: (c) => c.event === 'cheat' && c.code === 'fivemoreminutesmom' },
].map((a) => ({ ...a, group: 'Secrets', hidden: true }));

const ACHIEVEMENTS = [...GENERAL_ACHIEVEMENTS, ...CLASS_ACHIEVEMENTS, ...SCORE_ACHIEVEMENTS, ...TABLE_ACHIEVEMENTS, ...FACT_SPEED_ACHIEVEMENTS, ...SECRET_ACHIEVEMENTS];

// Award every achievement this event completes; returns the new ones.
function awardAchievements(state, ctx) {
  const earned = [];
  for (const a of ACHIEVEMENTS) {
    if (state.achievements[a.id] || !a.check(ctx)) continue;
    state.achievements[a.id] = Date.now();
    addPoints(state, a.reward);
    earned.push(a);
  }
  return earned;
}

// "Help me count" was used on a × b.
function noteHelp(state, a, b) {
  state.helpedFacts[factKey(a, b)] = true;
}

// Answering a × b: was it helped before, and now right first time? (Clears it.)
function learnedAfterHelp(state, a, b, firstTry) {
  const key = factKey(a, b);
  if (!firstTry || !state.helpedFacts[key]) return false;
  delete state.helpedFacts[key];
  return true;
}

// ---------------------------------------------------------------- accounts
// Shared by the page and the server (server/accounts.js): an activity log,
// merging a device's progress into an account, fact summaries and homework.

// Recent games and practice rounds, newest last (class stats, homework).
//   { t, kind: 'game'|'practice'|'class', difficulty, size?, won?, count?, finished? }
const ACTIVITY_LIMIT = 200;
function noteActivity(state, entry, now = Date.now()) {
  state.activity = state.activity || [];
  state.activity.push({ t: now, ...entry });
  if (state.activity.length > ACTIVITY_LIMIT) state.activity.splice(0, state.activity.length - ACTIVITY_LIMIT);
}

// Two saves of the same person (this device's and the account's) as one: the
// most of every count, every unlock, achievement and sticker, and for each
// fact whichever record has seen it more. Used once per device and account.
// A copy with every cheat's effects taken back (what an account stores:
// cheats belong to the device that typed them).
function withoutCheats(state) {
  const s = normalize(JSON.parse(JSON.stringify(state)));
  for (const code of activeCheats(s)) cheatOff(s, code);
  s.cheats = {};
  return s;
}

function mergeProgress(a, b) {
  const x = withoutCheats(a);
  const y = withoutCheats(b);
  const out = normalize({ ...y, ...x });
  out.wallet = Math.max(x.wallet, y.wallet);
  out.earned = Math.max(x.earned, y.earned);
  out.unlocks = [...new Set([...y.unlocks, ...x.unlocks])];
  out.achievements = { ...y.achievements };
  for (const [id, t] of Object.entries(x.achievements)) out.achievements[id] = out.achievements[id] ? Math.min(out.achievements[id], t) : t;
  const maxOf = (p, q) => {
    const r = { ...q };
    for (const [k, v] of Object.entries(p)) r[k] = typeof v === 'number' ? Math.max(v, Number(r[k]) || 0) : r[k] ?? v;
    return r;
  };
  out.counters = maxOf(x.counters, y.counters);
  out.stickers = maxOf(x.stickers, y.stickers);
  out.boardWins = maxOf(x.boardWins, y.boardWins);
  out.checkIn = (x.checkIn.last || '') >= (y.checkIn.last || '') ? x.checkIn : y.checkIn;
  // today's practice: the later day's, and on the same day the one that's done
  const dx = x.daily || {};
  const dy = y.daily || {};
  out.daily = (dx.day || '') > (dy.day || '') || ((dx.day || '') === (dy.day || '') && (dx.done || !dy.done)) ? dx : dy;
  out.facts = {};
  for (const key of new Set([...Object.keys(x.facts), ...Object.keys(y.facts)])) {
    const fx = (x.facts[key] || { facts: {} }).facts;
    const fy = (y.facts[key] || { facts: {} }).facts;
    const facts = {};
    for (const k of new Set([...Object.keys(fx), ...Object.keys(fy)])) {
      facts[k] = ((fx[k] && fx[k].asked) || 0) >= ((fy[k] && fy[k].asked) || 0) ? fx[k] : fy[k];
    }
    out.facts[key] = { ...(y.facts[key] || {}), ...(x.facts[key] || {}), facts };
  }
  const seen = new Set();
  out.activity = [...(y.activity || []), ...(x.activity || [])]
    .filter((e) => {
      const k = JSON.stringify(e);
      return !seen.has(k) && seen.add(k);
    })
    .sort((p, q) => p.t - q.t)
    .slice(-ACTIVITY_LIMIT);
  return out;
}

// The facts of the player on this device ("You"), for account stats.
const ownFacts = (state) => ((state && state.facts && state.facts[playerKey('You')]) || { facts: {} }).facts;

// Counts by status over 1..size × 1..size, plus the facts that need practice.
function factSummary(state, size = 12) {
  const facts = ownFacts(state);
  const counts = { mastered: 0, learning: 0, practice: 0, unseen: 0 };
  const needsPractice = [];
  for (let a = 1; a <= size; a++) {
    for (let b = 1; b <= size; b++) {
      const status = factStatus(facts[factKey(a, b)]);
      counts[status]++;
      if (status === 'practice') needsPractice.push(factKey(a, b));
    }
  }
  return { ...counts, total: size * size, size, needsPractice };
}

// ---- homework goals
// { type: 'master', table: 7 }                          every 7 × 1…10 and 1…10 × 7 fact mastered
// { type: 'practice', rounds: 3, difficulty: 'medium' }  finish rounds (difficulty 'any' for any)
// { type: 'win', size: 8, difficulty?: 'any' }            beat the CPU on a board this big or bigger
// { type: 'games', games: 5 }                            finish games (any kind)
// Rounds, wins and games count from when the homework was set.
const HOMEWORK_TABLE_UPTO = 10;
const HOMEWORK_TYPES = ['master', 'practice', 'win', 'games'];
const DIFF_NAME = (d) => (d && d !== 'any' ? `${TIMER_DIFFICULTY_NAMES[d] || d} ` : '');

// A clean copy of a goal, or null if it isn't one.
function cleanGoal(goal) {
  if (!goal || !HOMEWORK_TYPES.includes(goal.type)) return null;
  const int = (v, lo, hi) => (Number.isInteger(Number(v)) && Number(v) >= lo && Number(v) <= hi ? Number(v) : null);
  const diff = (d) => (d === undefined || d === 'any' ? 'any' : DIFFICULTIES.includes(d) ? d : null);
  if (goal.type === 'master') {
    const table = int(goal.table, 1, 12);
    return table ? { type: 'master', table } : null;
  }
  if (goal.type === 'practice') {
    const rounds = int(goal.rounds, 1, 50);
    const difficulty = diff(goal.difficulty);
    return rounds && difficulty ? { type: 'practice', rounds, difficulty } : null;
  }
  if (goal.type === 'win') {
    const size = int(goal.size, 6, 30);
    const difficulty = diff(goal.difficulty);
    return size && difficulty ? { type: 'win', size, difficulty } : null;
  }
  const games = int(goal.games, 1, 50);
  return games ? { type: 'games', games } : null;
}

function describeGoal(goal) {
  if (goal.type === 'master') return `Master the ×${goal.table} table`;
  if (goal.type === 'practice') return `Finish ${goal.rounds} ${DIFF_NAME(goal.difficulty)}practice ${goal.rounds === 1 ? 'round' : 'rounds'}`;
  if (goal.type === 'win') return `Beat the CPU on ${DIFF_NAME(goal.difficulty)}${goal.size}×${goal.size} or bigger`;
  return `Finish ${goal.games} ${goal.games === 1 ? 'game' : 'games'}`;
}

// How far along it is: { have, need, done } (from the save and when it was set).
// What a player can already play, so homework only asks for that (and tapping
// it can start it): practice, difficulties, board sizes and practice tables.
const HOMEWORK_BOARDS = [6, 8, 10, 12, 16, 20, 24];
function availableOptions(state) {
  const s = normalize(state || {});
  const has = (id) => isUnlocked(s, id);
  return {
    practice: has('practice'),
    difficulties: DIFFICULTIES.filter((d) => d === 'easy' || has(`difficulty.${d}`)),
    boards: HOMEWORK_BOARDS.filter((n) => n === 6 || has(`board${n}`)),
    tables: Array.from({ length: 12 }, (_, i) => i + 1).filter((n) => has(`table${n}`)),
  };
}

// What every player in a list has (class homework); a fresh save's for nobody.
function sharedOptions(list) {
  if (!list.length) return availableOptions(null);
  return list.reduce((a, b) => ({
    practice: a.practice && b.practice,
    difficulties: a.difficulties.filter((d) => b.difficulties.includes(d)),
    boards: a.boards.filter((n) => b.boards.includes(n)),
    tables: a.tables.filter((n) => b.tables.includes(n)),
  }));
}

function goalProgress(state, goal, since = 0) {
  const after = ((state && state.activity) || []).filter((e) => e.t >= since);
  const diffOk = (e) => goal.difficulty === 'any' || !goal.difficulty || e.difficulty === goal.difficulty;
  let have;
  let need = 1;
  if (goal.type === 'master') {
    const facts = ownFacts(state);
    const keys = new Set();
    for (let n = 1; n <= HOMEWORK_TABLE_UPTO; n++) keys.add(factKey(goal.table, n)).add(factKey(n, goal.table));
    need = keys.size;
    have = [...keys].filter((k) => factStatus(facts[k]) === 'mastered').length;
  } else if (goal.type === 'practice') {
    need = goal.rounds;
    have = after.filter((e) => e.kind === 'practice' && e.finished && diffOk(e)).length;
  } else if (goal.type === 'win') {
    have = after.some((e) => e.kind === 'game' && e.won && e.size >= goal.size && diffOk(e)) ? 1 : 0;
  } else {
    need = goal.games;
    have = after.filter((e) => e.kind === 'game' || e.kind === 'class').length;
  }
  return { have: Math.min(have, need), need, done: have >= need };
}

// Full status for a list: 'done', 'late' (past the due date) or 'open'.
// due is 'YYYY-MM-DD' (the end of that day counts); today likewise.
function homeworkStatus(state, assignment, today) {
  const p = goalProgress(state, assignment.goal, assignment.createdAt || 0);
  const status = p.done ? 'done' : assignment.due && today && today > assignment.due ? 'late' : 'open';
  return { ...p, status, label: describeGoal(assignment.goal) };
}

export {
  createProgress,
  normalize,
  addPoints,
  BONUS,
  answerBonus,
  TIMER_BONUS_MAX,
  timerBonus,
  practiceTimerId,
  practiceCountId,
  practiceExpertId,
  practiceSet,
  noteActivity,
  mergeProgress,
  withoutCheats,
  factSummary,
  ownFacts,
  cleanGoal,
  describeGoal,
  goalProgress,
  homeworkStatus,
  HOMEWORK_TYPES,
  availableOptions,
  sharedOptions,
  HOMEWORK_TABLE_UPTO,
  CHEAT_CODES,
  cheatOn,
  cheatOff,
  activeCheats,
  timerLength,
  DIFFICULTIES,
  TIMER_DIFFICULTY_NAMES as DIFFICULTY_NAMES,
  gameExpertId,
  gameTimerId,
  PRACTICE_FINISH_BONUS,
  BOARD_FINISH_BONUS,
  boardFinishBonus,
  practiceFinishBonus,
  SHOP,
  shopItem,
  isUnlocked,
  canBuy,
  nextInChain,
  isHidden,
  hasWonOn,
  recordBoardWin,
  tableReady,
  noteHelp,
  learnedAfterHelp,
  MASTER_SHARE,
  buy,
  dayKey,
  checkIn,
  factKey,
  playerKey,
  recordAnswer,
  factStatus,
  factBestMs,
  lineReached,
  PRACTICE_WEIGHTS,
  pickPracticeFacts,
  SCORE_TIERS,
  FACT_SPEED_TIERS,
  ACHIEVEMENTS,
  awardAchievements,
};
