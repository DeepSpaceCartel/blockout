// Practice, for every client (the web game, the phone app): the round's setup
// (Learn or Expert, its timer, the question count, the times tables, each
// unlocked per difficulty), and a round played question by question with no
// screen and no timers. Every step changes the save and returns what to show.
//
//   createRound → question → answer (wrong: try again; two misses: help) or
//   timeout → next → … → finish
import * as Core from '@blockout/engine';
import * as Progress from './progress.js';
import { tableSize } from './views.js';

export const PRACTICE_BASE_POINTS = 1; // per correct answer, before bonuses
export const PRACTICE_EXPERT_BONUS = 2;
export const PRACTICE_COUNTS = [5, 10, 20];
export const PRACTICE_TIMERS = [0, 30, 10, 5];

// For "what changed": moving right is progress (so a new fact landing in
// "needs practice" shows as a step down, not an improvement)
const STATUS_ORDER = { practice: 0, unseen: 1, learning: 2, mastered: 3 };

// ---- setup

export const LEVEL_HELP = {
  learn: 'Learn: see each fact as a rectangle and get help counting.',
  expert: 'Expert: no picture and no help. First-try bonus points are doubled!',
};

// The Shop items a choice needs on this difficulty (null: free)
export const levelItem = (difficulty, level) => (level === 'expert' ? Progress.practiceExpertId(difficulty) : null);
export const timerItem = (difficulty, secs) => (Number(secs) ? Progress.practiceTimerId(Number(secs), difficulty) : null);
export const countItem = (difficulty, count) => Progress.practiceCountId(Number(count), difficulty);
export const tableItem = (n) => `table${n}`;

const open = (state, item) => !item || Progress.isUnlocked(state, item);

// The level, timer and count to play with: what's chosen, if it's unlocked here
export function practiceChoice(state, difficulty, { level = 'learn', timer = 0, count = 5 } = {}) {
  const expert = level === 'expert' && open(state, levelItem(difficulty, 'expert'));
  return {
    level: expert ? 'expert' : 'learn',
    timer: expert && open(state, timerItem(difficulty, timer)) ? Number(timer) || 0 : 0,
    count: PRACTICE_COUNTS.includes(Number(count)) && open(state, countItem(difficulty, count)) ? Number(count) : 5,
  };
}

// Facts go up to the difficulty's dice (12 at most; Legend's are a teen × 2–9)
export const practiceMax = (difficulty) => Math.min(Core.DIFFICULTY_SIDES[difficulty] || 6, 12);

// The difficulty's table choices: ×1 … ×max, Tricky's hard tables, Legend's ×2 … ×9
export const tableChoices = (difficulty) => Progress.practiceSet(difficulty).tables.filter((n) => n <= 12);

// Times tables are unlocked one by one (×1, then ×2, …)
export const tableOpen = (state, n) => Progress.isUnlocked(state, tableItem(n));

// The tables a round asks about: the ones picked (and still there and open), or else every unlocked one
export function roundTables(state, difficulty, picked = []) {
  const choices = tableChoices(difficulty);
  const chosen = picked.filter((n) => choices.includes(n) && tableOpen(state, n));
  return chosen.length ? chosen : choices.filter((n) => tableOpen(state, n));
}

const playerFacts = (state, name) => (state.facts[Progress.playerKey(name)] || { facts: {} }).facts;

// What a round would ask: "×3 and ×4 up to 6 (11 facts): 2 need practice, …".
// Null when no table is unlocked yet (and the round can't start).
export function preview(state, difficulty, picked = [], name = 'You') {
  const tables = roundTables(state, difficulty, picked);
  if (!tables.length) return null;
  const facts = playerFacts(state, name);
  const set = Progress.practiceSet(difficulty);
  const upTo = difficulty === 'legend' ? '11–19' : `up to ${practiceMax(difficulty)}`;
  const counts = { practice: 0, learning: 0, unseen: 0, mastered: 0 };
  let total = 0;
  for (const [a, b] of set.pairs) {
    if (!(set.bSideOnly ? tables.includes(b) : tables.includes(a) || tables.includes(b))) continue;
    counts[Progress.factStatus(facts[Progress.factKey(a, b)])]++;
    total++;
  }
  const label = (list) => {
    const s = [...list].sort((x, y) => x - y).map((n) => `×${n}`);
    return s.length > 1 ? `${s.slice(0, -1).join(', ')} and ${s[s.length - 1]}` : s[0];
  };
  const chosen = picked.filter((n) => tables.includes(n));
  const what = chosen.length ? `${label(chosen)} ${upTo} (${total} facts)` : `All your unlocked tables (${label(tables)}), ${upTo}`;
  return `${what}: ${counts.practice} need practice, ${counts.learning} learning, ${counts.unseen} not seen yet, ${counts.mastered} mastered.`;
}

// Under the count: its finishing bonus (doubled on Expert)
export function countHelp(count, expert) {
  const bonus = Progress.practiceFinishBonus(count, expert);
  return bonus
    ? `🏁 Finish all ${count} for +${bonus} bonus points${expert ? ' (doubled on Expert)' : ''}.`
    : `🏁 Longer rounds earn a finishing bonus: +${Progress.practiceFinishBonus(10, expert)} for 10 questions, +${Progress.practiceFinishBonus(20, expert)} for 20.`;
}

// Under the timer (Expert's): its bonus, all of it for an instant answer
export function timerHelp(timer) {
  const top = (secs) => Progress.TIMER_BONUS_MAX[secs] * PRACTICE_EXPERT_BONUS;
  return timer
    ? `⏱️ Answer fast for a timer bonus of up to +${top(timer)} a question: the quicker, the more. If time runs out, it counts as missed.`
    : `⏱️ A timer earns a bonus for quick answers: up to +${top(30)} a question with 30 s, +${top(10)} with 10 s, +${top(5)} with 5 s.`;
}

// ---- a round

// The questions are picked from the player's weakest facts (in the tables
// chosen). Returns the round; round.current is the first question.
// journeyLevel: a Practice Journey round, its table and its length (see journeyQueue).
export function createRound(state, { name = 'You', difficulty = 'easy', count = 5, tables = [], level = 'learn', timer = 0, journeyLevel = null, rng = Math.random, now = Date.now } = {}) {
  const expert = level === 'expert';
  const facts = playerFacts(state, name);
  const journey = journeyLevel ? Progress.PRACTICE_LEVELS[journeyLevel - 1] : null;
  if (journey) {
    tables = [journey.table];
    count = journey.count;
  }
  const queue = journey ? journeyQueue(facts, journey.table, count, rng) : Progress.pickPracticeFacts(facts, Progress.practiceSet(difficulty), count, rng, tables);
  const before = {};
  for (const [a, b] of queue) before[Progress.factKey(a, b)] = Progress.factStatus(facts[Progress.factKey(a, b)]);
  const round = { name, max: journey ? journey.upTo : practiceMax(difficulty), journeyLevel, count, tables, expert, timer: expert ? timer : 0, difficulty, startedAt: now(), times: [], queue, index: 0, requeued: new Set(), before, firstTry: 0, answered: 0, streak: 0, bestStreak: 0, points: 0, current: null, done: false };
  ask(round);
  return round;
}

// A Practice Journey round on the ×n table: its facts up to the level's dice
// (n × 1…6 for ×1–×6, …8 for ×7–×8, …12 from ×9; both ways round), and about
// one question in five reviewing the tables before it, as far.
export const REVIEW_SHARE = 1 / 5;
export function journeyQueue(facts, n, count, rng = Math.random) {
  const all = Progress.practiceSet(Progress.PRACTICE_LEVELS.find((l) => l.table === n).difficulty);
  const reviews = n > 1 ? Math.round(count * REVIEW_SHARE) : 0;
  const main = Progress.pickPracticeFacts(facts, all, count - reviews, rng, [n]);
  const earlier = Array.from({ length: n - 1 }, (_, i) => i + 1);
  const review = reviews ? Progress.pickPracticeFacts(facts, all, reviews * 4, rng, earlier).filter(([a, b]) => a !== n && b !== n).slice(0, reviews) : [];
  const queue = [...main];
  for (const fact of review) queue.splice(1 + Math.floor(rng() * queue.length), 0, fact); // (never first)
  return queue;
}

// The question at the round's index (or none: the round is done). A retry is a
// missed fact asked again at the end; it doesn't count towards the score.
function ask(round) {
  if (round.index >= round.queue.length) {
    round.current = null;
    round.done = true;
    return;
  }
  const [a, b] = round.queue[round.index];
  round.current = { a, b, area: a * b, retry: round.index >= round.count, attempts: 0, wrong: [], helped: false, done: false };
}

// "Question 3 of 10 · ×3 ×4 · 🧠 Expert"
export function counter(round) {
  const focus = (round.tables.length ? ` · ${[...round.tables].sort((x, y) => x - y).map((n) => `×${n}`).join(' ')}` : '') + (round.expert ? ' · 🧠 Expert' : '');
  return `Question ${round.index + 1} of ${round.queue.length}${focus}`;
}

// A missed fact comes back once, later in the round
function requeue(round, q) {
  const key = Progress.factKey(q.a, q.b);
  if (round.requeued.has(key)) return;
  round.requeued.add(key);
  round.queue.push([q.a, q.b]);
}

// An answer. ms: how long it took (help excluded); timer: { secs, left } with
// a timer. Right: { correct, firstTry, points, bonus (with each part's points,
// doubled on Expert), earned, text }. Wrong: { correct: false, attempts,
// helpNow } (help after two misses, never on Expert).
export function answer(state, round, value, { ms = 0, timer = null } = {}) {
  const q = round.current;
  if (!q || q.done) return null;
  if (Number(value) === q.area) {
    q.done = true;
    const firstTry = q.attempts === 0 && !q.helped; // ("Help me count" too: no bonus, no streak)
    round.answered++;
    if (firstTry && !q.retry) round.firstTry++;
    round.times.push(Math.round(ms));
    round.streak = firstTry ? round.streak + 1 : 0;
    round.bestStreak = Math.max(round.bestStreak, round.streak);
    const bonus = Progress.answerBonus({ firstTry, ms, streak: round.streak, timer });
    const multiplier = round.expert ? PRACTICE_EXPERT_BONUS : 1;
    const points = PRACTICE_BASE_POINTS + bonus.total * multiplier;
    round.points += points;
    Progress.addPoints(state, points);
    Progress.recordAnswer(state, round.name, { a: q.a, b: q.b, firstTry, correct: true, wrongAnswers: q.wrong, ms });
    const learned = Progress.learnedAfterHelp(state, q.a, q.b, firstTry);
    const earned = Progress.awardAchievements(state, { event: 'answer', correct: true, firstTry, ms, streak: round.streak, a: q.a, b: q.b, facts: playerFacts(state, round.name), size: tableSize(state), learned });
    return {
      correct: true,
      firstTry,
      points,
      bonus: { ...bonus, parts: bonus.parts.map((p) => ({ ...p, points: p.points * multiplier })), multiplier },
      earned,
      text: firstTry ? `Correct! +${points} points 🎉` : `You got it! +${points} point${points === 1 ? '' : 's'}`,
    };
  }
  q.attempts++;
  q.wrong.push(Number(value));
  round.streak = 0;
  requeue(round, q);
  return { correct: false, attempts: q.attempts, helpNow: q.attempts >= 2 && !q.helped && !round.expert };
}

// "Help me count" (once a question, never on Expert): rows of the fact with
// their running totals. Returns { rows, group, totals, earned } or null.
export function help(state, round) {
  const q = round.current;
  if (!q || q.done || q.helped || round.expert) return null;
  q.helped = true;
  Progress.noteHelp(state, q.a, q.b);
  const earned = Progress.awardAchievements(state, { event: 'help' });
  return { rows: q.a, group: q.b, totals: Array.from({ length: q.a }, (_, i) => (i + 1) * q.b), earned };
}

// Out of time: it counts as missed and comes back later. Returns what to say.
export function timeout(state, round) {
  const q = round.current;
  if (!q || q.done) return null;
  q.done = true;
  round.streak = 0;
  Progress.recordAnswer(state, round.name, { a: q.a, b: q.b, firstTry: false, correct: false, wrongAnswers: q.wrong, timeout: true });
  requeue(round, q);
  return { text: `⏰ Time's up! ${q.a} × ${q.b} = ${q.area}. It'll come back later.` };
}

// On to the next question (after a right answer or a timeout)
export function next(round) {
  round.index++;
  ask(round);
  return round.current;
}

// The end: the finishing bonus, the round in the counters and achievements.
// Returns { points, finish, earned, sub, changes: [{ fact, was, now, up }],
// record } (record: the history entry, as the web game's Stats keep it).
export function finish(state, round, now = Date.now) {
  state.counters.practiceRounds = (state.counters.practiceRounds || 0) + 1;
  const finishBonus = Progress.practiceFinishBonus(round.count, round.expert);
  if (finishBonus) {
    round.points += finishBonus;
    Progress.addPoints(state, finishBonus);
  }
  Progress.noteActivity(state, { kind: 'practice', difficulty: round.difficulty, count: round.count, expert: round.expert, finished: true, firstTry: round.firstTry });
  const earned = Progress.awardAchievements(state, { event: 'practice' });
  // a Practice Journey round: moving up to the next table, or what it still takes
  const journey = round.journeyLevel ? Progress.recordPracticeLevel(state, round.journeyLevel, round) : null;
  if (journey) earned.push(...journey.earned);
  const retries = round.queue.length - round.count; // missed facts asked again
  const sub =
    (round.expert ? '🧠 Expert · ' : '') +
    `${round.firstTry} of ${round.count} right first time` +
    (retries ? ` · ${retries} ${retries === 1 ? 'fact' : 'facts'} retried` : '') +
    (round.bestStreak >= 3 ? ` · best streak ${round.bestStreak} 🔥` : '');
  const facts = playerFacts(state, round.name);
  const changes = Object.entries(round.before)
    .map(([fact, was]) => ({ fact, was, now: Progress.factStatus(facts[fact]) }))
    .filter((c) => c.was !== c.now)
    .sort((x, y) => STATUS_ORDER[y.now] - STATUS_ORDER[y.was] - (STATUS_ORDER[x.now] - STATUS_ORDER[x.was]))
    .map((c) => ({ ...c, up: STATUS_ORDER[c.now] > STATUS_ORDER[c.was] }));
  const at = now();
  const record = { kind: 'practice', at, ...(round.journeyLevel ? { journeyLevel: round.journeyLevel } : {}), duration: at - round.startedAt, name: round.name, size: round.max, level: round.expert ? 'expert' : 'learn', tables: round.tables, count: round.count, firstTry: round.firstTry, times: round.times, points: round.points };
  return {
    points: round.points,
    finish: finishBonus,
    journey,
    finishToast: finishBonus ? [`🏁 Finished all ${round.count} questions!`, `+${finishBonus} bonus points${round.expert ? ` (×${PRACTICE_EXPERT_BONUS} Expert)` : ''}`] : null,
    earned,
    sub,
    changes,
    record,
  };
}
