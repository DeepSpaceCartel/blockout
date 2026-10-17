// One game of Blockout, turn by turn, with no screen and no timers: the rules
// the multiplication game plays by (apps/multiplication/src/game/play.js),
// for clients that draw it their own way (apps/mobile). Every function takes
// the match and changes it; the client animates between the steps.
//
//   roll → place (or pass when nothing fits) → answer (help after two misses,
//   or time out) → endTurn → … → over
//
// The CPU's turn is one step (cpuTurn). Points for an answer are the squares
// plus a bonus that the caller works out (createMatch's answerBonus, normally
// @blockout/progress's), so this package stays free of the progress rules.

import * as Core from './core.js';

const PHASES = ['roll', 'place', 'stuck', 'answer', 'scored', 'cpu', 'over'];
const noBonus = () => ({ total: 0, parts: [] });

// players: [{ name, cpu }]. mode: 'single' (you vs the CPU) or 'multi' (one screen).
function createMatch({ size = 6, difficulty = 'easy', players, mode = 'single', expert = false, bonusMultiplier = 1, firstInCorner = false, fitMode = 'end', weight = null, rng = Math.random, answerBonus = noBonus, now = Date.now } = {}) {
  if (!players || !players.length) throw new Error('a match needs players');
  const pairDice = Core.usesPairDice(difficulty);
  return {
    size,
    difficulty,
    mode,
    startedAt: now(), // (for the history: how long it took)
    expert, // no "Help me count"
    bonusMultiplier, // Expert doubles bonus points
    answerBonus,
    rng,
    fitMode,
    board: Core.createBoard(size, { firstInCorner }),
    faces: Core.diceFaces(difficulty),
    diceBag: pairDice ? Core.createPairDice(size, rng, difficulty, weight) : Core.createDice(size, rng, Core.DIFFICULTY_SIDES[difficulty] || 6),
    players: players.map((p) => ({
      ...p, // (a client's own fields: colours, avatars, the name stats go under)
      name: p.name,
      cpu: Boolean(p.cpu),
      score: 0, // squares + bonus
      squares: 0,
      bonus: 0,
      streak: 0, // first-try answers in a row
      bestStreak: 0,
      answered: 0,
      firstTry: 0,
      log: [],
      stats: { placed: 0, biggest: null, wrong: 0, helped: 0, timeouts: 0, passes: 0, times: [], missed: [] },
    })),
    current: 0,
    turns: 1,
    passes: 0, // passes in a row: everyone passing ends the game
    dice: null,
    lastRect: null,
    pending: null, // { rect, attempts, helped, miss } while a human answers
    phase: players[0].cpu ? 'cpu' : 'roll',
  };
}

const currentPlayer = (m) => m.players[m.current];
const mustUseCorner = (m) => Core.mustUseCorner(m.board);

function expect(m, ...phases) {
  if (!phases.includes(m.phase)) throw new Error(`not now: the match is at ${m.phase}, not ${phases.join(' or ')}`);
}

// A human's roll (or the dice they rolled at the table: forced). Then they
// place, or pass when it fits nowhere ('stuck').
function roll(m, forced = null) {
  expect(m, 'roll');
  m.dice = forced ? [...forced] : Core.rollForBoard(m.board, m.diceBag, m.rng, m.fitMode);
  m.phase = Core.validPlacements(m.board, ...m.dice).length ? 'place' : 'stuck';
  return m.dice;
}

// How a drawn rectangle ({ x, y, w, h }) compares to the roll: the right size
// either way round, in free squares, and in the corner when it's the first.
function judge(m, { x, y, w, h }) {
  const [a, b] = m.dice;
  const rightSize = (w === a && h === b) || (w === b && h === a);
  const fits = Core.fits(m.board, x, y, w, h);
  const corner = !mustUseCorner(m) || (x === 0 && y === 0);
  return { rightSize, fits, corner, ok: rightSize && fits && corner };
}

function putDown(m, { x, y, w, h }) {
  const [a, b] = m.dice;
  const rect = Core.place(m.board, x, y, w, h, m.current);
  Object.assign(rect, { a, b, solved: false });
  m.lastRect = rect;
  m.passes = 0;
  return rect;
}

// Tap to place: the rolled rectangle (rotated: the other way round) centred on
// the square tapped ({ c, r }), kept on the board, or in the corner when it's
// the first one. Returns { x, y, w, h, valid }.
function previewAt(m, { c, r }, rotated = false) {
  const [a, b] = m.dice;
  const [w, h] = rotated ? [b, a] : [a, b];
  const clamp = (v, max) => Math.max(0, Math.min(v, max));
  const at = mustUseCorner(m) ? { x: 0, y: 0 } : { x: clamp(c - Math.floor((w - 1) / 2), m.size - w), y: clamp(r - Math.floor((h - 1) / 2), m.size - h) };
  return { ...at, w, h, valid: Core.isValidPlacement(m.board, at.x, at.y, w, h) };
}

// Which way round to start a preview: the rolled way, unless only the other one fits
const startRotated = (m) => !Core.validPlacements(m.board, ...m.dice).some((o) => o.w === m.dice[0] && o.h === m.dice[1]);

// Auto placing: where the CPU would put it (snug against the others)
const autoSpot = (m) => Core.chooseComputerMove(m.board, ...m.dice, m.rng);

// The human's rectangle goes on the board; its points wait for the answer.
function place(m, rect) {
  expect(m, 'place');
  const verdict = judge(m, rect);
  if (!verdict.ok) return { ok: false, verdict };
  const placed = putDown(m, rect);
  m.pending = { rect: placed, attempts: 0, helped: false, miss: null };
  m.phase = 'answer';
  return { ok: true, rect: placed };
}

function award(m, rect, firstTry, bonus = 0) {
  const p = currentPlayer(m);
  rect.solved = true;
  p.squares += rect.area;
  p.bonus += bonus;
  p.score = p.squares + p.bonus;
  p.answered++;
  if (firstTry) p.firstTry++;
  p.stats.placed++;
  if (!p.stats.biggest || rect.area > p.stats.biggest.area) p.stats.biggest = rect;
  p.log.push({ a: rect.a, b: rect.b, area: rect.area, bonus, star: !p.cpu && firstTry });
}

// A missed fact is noted once per turn, with every wrong answer given for it.
function noteMiss(m, { answer = null, timeout = false } = {}) {
  const pend = m.pending;
  if (!pend.miss) {
    pend.miss = { fact: `${pend.rect.a} × ${pend.rect.b}`, answers: [], timeout: false };
    currentPlayer(m).stats.missed.push(pend.miss);
  }
  if (answer !== null) pend.miss.answers.push(answer);
  if (timeout) pend.miss.timeout = true;
}

// Can more typing still change the outcome? No once it matches, overshoots,
// or has as many digits as the answer: the keypad then checks by itself.
function answerDecided(entry, answer) {
  return entry !== '' && (Number(entry) >= answer || entry.length >= String(answer).length);
}

// The human's answer. ms: how long they took (help excluded); timer: { secs,
// left } when there's an answer timer. Right: points and bonus, 'scored'.
// Wrong: try again, and after two misses it's time to help (unless Expert).
// Right first time: no wrong answer, and no "Help me count". Only that earns
// bonus points (first try, speedy, streak, timer) and counts towards mastering
// the fact; a helped answer ends the streak. (Used by every client.)
const firstTry = (pend) => pend.attempts === 0 && !pend.helped;

function answer(m, value, { ms = 0, timer = null } = {}) {
  expect(m, 'answer');
  const pend = m.pending;
  const p = currentPlayer(m);
  const { rect } = pend;
  if (Number(value) === rect.area) {
    const first = firstTry(pend);
    p.stats.times.push(ms);
    p.streak = first ? p.streak + 1 : 0;
    p.bestStreak = Math.max(p.bestStreak, p.streak);
    const bonus = m.answerBonus({ firstTry: first, ms, streak: p.streak, timer });
    const total = bonus.total * m.bonusMultiplier;
    award(m, rect, first, total);
    m.phase = 'scored';
    const wrongAnswers = pend.miss ? pend.miss.answers : [];
    m.pending = null;
    return { correct: true, firstTry: first, rect, bonus: { ...bonus, total }, streak: p.streak, wrongAnswers };
  }
  p.streak = 0;
  pend.attempts++;
  noteMiss(m, { answer: Number(value) });
  p.stats.wrong++;
  return { correct: false, attempts: pend.attempts, helpNow: pend.attempts >= 2 && !pend.helped && !m.expert };
}

// "Help me count": how to count the rectangle out loud (once a turn, never in
// Expert). Legend's teen facts are split into tens and ones instead.
function help(m) {
  expect(m, 'answer');
  const pend = m.pending;
  if (pend.helped || m.expert) return null;
  pend.helped = true;
  currentPlayer(m).stats.helped++;
  return legendSplit(pend.rect, m.difficulty) || { count: countPlan(pend.rect) };
}

// Count a × b as "a rows (or columns) of b", matching the order of the dice.
function countPlan(rect) {
  const byRows = rect.w === rect.b;
  return { byRows, group: rect.b, steps: rect.a, unit: byRows ? 'row' : 'column', totals: Array.from({ length: rect.a }, (_, i) => (i + 1) * rect.b) };
}

// Legend: a teen times a one-digit number, split into tens and ones
// (14 × 7 = 10 × 7 + 4 × 7). Null for anything else.
function legendSplit(rect, difficulty) {
  if (difficulty !== 'legend') return null;
  const teen = Math.max(rect.a, rect.b);
  const other = Math.min(rect.a, rect.b);
  if (teen < 11) return null;
  const ones = teen - 10;
  return { split: { teen, other, ones, tens: 10 * other, rest: ones * other } };
}

// Out of time: the rectangle comes off the board, no points.
function timeout(m) {
  expect(m, 'answer');
  const p = currentPlayer(m);
  const { rect } = m.pending;
  noteMiss(m, { timeout: true });
  const wrongAnswers = m.pending.miss.answers;
  p.stats.timeouts++;
  p.streak = 0;
  p.log.push({ timeout: true, a: rect.a, b: rect.b });
  Core.removeRect(m.board, rect);
  m.lastRect = null;
  m.passes = 0; // the roll did fit, so this isn't a pass
  m.pending = null;
  m.phase = 'scored';
  return { rect, wrongAnswers };
}

// Nothing fits: the turn passes.
function pass(m) {
  expect(m, 'stuck', 'cpu');
  const p = currentPlayer(m);
  const [a, b] = m.dice;
  p.log.push({ pass: true, a, b });
  p.stats.passes++;
  m.passes++;
  m.phase = 'scored';
}

// The CPU rolls, places snugly and always answers right on the first try.
// Returns { dice, rect } (rect null when it had to pass).
function cpuTurn(m) {
  expect(m, 'cpu');
  m.dice = Core.rollForBoard(m.board, m.diceBag, m.rng, m.fitMode);
  const move = Core.chooseComputerMove(m.board, ...m.dice, m.rng);
  if (!move) {
    pass(m);
    return { dice: m.dice, rect: null };
  }
  const rect = putDown(m, move);
  award(m, rect, true);
  m.phase = 'scored';
  return { dice: m.dice, rect };
}

// Would the game end if the turn ended now?
const isOver = (m) => m.passes >= m.players.length || Core.emptyCount(m.board) === 0;

// Next player, or the end: everyone passed in a row, or the board is full.
function endTurn(m) {
  expect(m, 'scored');
  m.dice = null;
  if (isOver(m)) {
    m.phase = 'over';
    return results(m);
  }
  m.current = (m.current + 1) % m.players.length;
  m.turns++;
  m.phase = currentPlayer(m).cpu ? 'cpu' : 'roll';
  return null;
}

// Ranked by score; winners share the top score (a tie when there are several).
function results(m) {
  const ranked = m.players.map((p, index) => ({ ...p, index })).sort((p, q) => q.score - p.score);
  const top = ranked[0].score;
  const winners = ranked.filter((p) => p.score === top);
  const humans = m.players.filter((p) => !p.cpu);
  const asked = (p) => p.answered + p.stats.timeouts;
  return {
    ranked,
    winners,
    tie: winners.length > 1,
    humanWon: winners.length === 1 && !winners[0].cpu,
    empty: Core.emptyCount(m.board),
    // for the end-of-game achievements
    perfect: humans.some((p) => asked(p) >= 5 && p.firstTry === asked(p)),
    noHelp: humans.some((p) => asked(p) >= 5 && p.stats.helped === 0),
    bestScore: humans.length ? Math.max(...humans.map((p) => p.score)) : 0,
  };
}

export { PHASES, createMatch, currentPlayer, firstTry, mustUseCorner, roll, judge, previewAt, startRotated, autoSpot, award, noteMiss, place, answer, answerDecided, help, countPlan, legendSplit, timeout, pass, cpuTurn, isOver, endTurn, results };
