// Classroom rooms. Three kinds of game:
//   'class': everyone plays the same rolls on their own board, one leaderboard.
//   'pairs': students are matched in twos and play head to head on a shared
//            board, taking turns (the original Blockout rules). With an odd
//            number, the odd one out plays the teacher (on the projector
//            screen or another device) or the CPU.
//   'tournament': a series of pairs games in a format from server/tournament.js
//            (knockout, double elimination, round robin, Swiss, king of the hill).
// Pure game logic over plain objects (no networking), so it can be tested on its own.
// The server keeps each student's board so it can check where rectangles go and
// work out the scores itself; the leaderboard can't be faked from a browser.
import crypto from 'crypto';
import * as Core from '@blockout/engine';
import * as Progress from '@blockout/progress';
import * as Cosmetics from '@blockout/progress/cosmetics';
import * as Tournament from './tournament.js';

const SIZES = [6, 8, 10, 12, 16, 20, 24];
const DIFFICULTIES = ['easy', 'medium', 'hard'];
const ROUNDS = [10, 15, 20];
const TYPES = ['class', 'pairs', 'tournament'];
const PAIR_ODD = ['screen', 'cpu', 'device']; // who plays the odd one out
const PAIR_MATCHING = ['shuffle', 'keep', 'arrange']; // how pairs are made each game
const RESERVED_NAMES = ['teacher', 'cpu'];
const MAX_PLAYERS = 40;
const NAME_MAX = 14;
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O: easy to read off the board
const CODE_LENGTH = 4;

class RoomError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const token = () => crypto.randomBytes(12).toString('hex');

function newCode(taken, rng = Math.random) {
  for (;;) {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++) code += CODE_LETTERS[Math.floor(rng() * CODE_LETTERS.length)];
    if (!taken.has(code)) return code;
  }
}

// Pacing, set by the teacher for everyone in the class (no shop unlocks needed):
//   placeMode: 'choice' (each student's own setting) | 'draw' | 'click' | 'auto'
//   answerTime: seconds to answer, 0 = no timer
//   autoRoll (pairs): roll by itself when your turn starts
//   fitRolls (pairs): only deal rolls that fit — 'end' (near the end), 'always', 'never'
//   cpuSpeed (pairs, CPU opponent): 'slow' | 'normal' | 'fast'
const PLACE_MODES = ['choice', 'draw', 'click', 'auto'];
const ANSWER_TIMES = [0, 30, 20, 10];
const FIT_MODES = ['end', 'always', 'never'];
const CPU_SPEEDS = ['slow', 'normal', 'fast'];
const pick = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);
// Pairs and tournaments: end a match after this many turns in all (0 = when the board is full)
const MATCH_TURNS = [0, 12, 8];
const SWISS_ROUNDS = [2, 3, 4, 5];
const KOTH_MATCHES = [6, 10, 15]; // matches per hill

function cleanSettings(s = {}) {
  return {
    size: pick(Number(s.size), SIZES, 12),
    difficulty: pick(s.difficulty, DIFFICULTIES, 'easy'),
    rounds: pick(Number(s.rounds), ROUNDS, 15),
    placeMode: pick(s.placeMode, PLACE_MODES, 'choice'),
    answerTime: pick(Number(s.answerTime), ANSWER_TIMES, 0),
    autoRoll: s.autoRoll === true,
    fitRolls: pick(s.fitRolls, FIT_MODES, 'end'),
    cpuSpeed: pick(s.cpuSpeed, CPU_SPEEDS, 'normal'),
    format: pick(s.format, Tournament.FORMATS, 'knockout'),
    matchTurns: pick(Number(s.matchTurns), MATCH_TURNS, 0),
    swissRounds: pick(Number(s.swissRounds), SWISS_ROUNDS, 3),
    kothMatches: pick(Number(s.kothMatches), KOTH_MATCHES, 10),
  };
}

function createRoom(settings = {}, { taken = new Set(), rng = Math.random, now = Date.now() } = {}) {
  // Tournaments are many short games: 6 turns each by default
  if (settings.type === 'tournament' && settings.matchTurns === undefined) settings = { ...settings, matchTurns: 12 };
  return {
    code: newCode(taken, rng),
    teacherKey: token(),
    playKey: token(), // lets the teacher join as a player (pairs, odd one out) without admin rights
    type: TYPES.includes(settings && settings.type) ? settings.type : 'class',
    pairOptions: { odd: 'screen', matching: 'shuffle' },
    order: [], // pairs: student ids in pairing order (1st + 2nd, 3rd + 4th, …)
    lastPartner: {}, // pairs: id -> last game's partner, to avoid repeats
    matches: [],
    matchSeq: 0, // match ids stay unique for a whole tournament
    tournament: null,
    roundReady: false, // tournament: a round (or a king-of-the-hill match) just finished
    settings: cleanSettings(settings),
    autoNext: true, // next roll by itself once everyone is done
    state: 'lobby', // lobby | playing | ended
    game: 0, // bumps every time a game starts
    round: 0,
    roll: null,
    bag: null,
    players: [],
    createdAt: now,
    touchedAt: now,
  };
}

// First names only: letters (any alphabet), spaces, hyphens and apostrophes.
function cleanName(name) {
  const n = String(name || '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
  if (!n) throw new RoomError('name', 'Type your first name.');
  if (!/^[\p{L}\p{M}][\p{L}\p{M}0-9 '’-]*$/u.test(n)) throw new RoomError('name', 'Use letters for your name.');
  return n;
}

// The students (not the teacher or the CPU when they play in pairs)
// A player's Wardrobe look, from ids the page sends: an avatar emoji and a title
// name, or nothing. Only real Wardrobe ids count (never free text), so nothing
// odd can show up on a classmate's screen.
function cleanLook(look = {}) {
  const avatar = Cosmetics.category('avatar').options.find((o) => o.id === look.avatar && o.id !== 'none');
  const title = Cosmetics.TITLES.find((t) => t.id === look.title && t.id !== 'none');
  return { avatar: avatar ? avatar.preview : '', title: title ? title.name : '' };
}
const lookOf = (p) => {
  if (p.isCpu) return { avatar: '🤖', title: '' };
  if (p.isTeacher) return { avatar: (p.look && p.look.avatar) || '🍎', title: (p.look && p.look.title) || '' };
  return p.look || { avatar: '', title: '' };
};

const students = (room) => room.players.filter((p) => !p.isTeacher && !p.isCpu);
// Students in the game that's running (not those who joined after it started)
const playing = (room) => students(room).filter((p) => !p.benched);

function freshScore(player, size) {
  Object.assign(player, {
    board: Core.createBoard(size),
    score: 0,
    squares: 0,
    bonus: 0,
    streak: 0,
    bestStreak: 0,
    answered: 0,
    firstTry: 0,
    timeouts: 0,
    passes: 0,
    missed: 0, // rounds that went by without an answer
    times: [],
    facts: {}, // '6 × 7' -> { asked, firstTry }
    done: false,
    result: null, // this round's: 'placed' | 'timeout' | 'pass'
  });
  return player;
}

function join(room, name, look) {
  const clean = cleanName(name);
  if (RESERVED_NAMES.includes(clean.toLowerCase())) throw new RoomError('name', 'Please use your own first name.');
  if (students(room).length >= MAX_PLAYERS) throw new RoomError('full', 'This class is full.');
  if (room.players.some((p) => p.name.toLowerCase() === clean.toLowerCase())) {
    throw new RoomError('taken', `Someone called ${clean} is already in. Add your last initial, like “${clean} B”.`);
  }
  const player = freshScore({ id: token().slice(0, 8), key: token(), name: clean, look: cleanLook(look), connections: 0 }, room.settings.size);
  // Joining after the game started: you're in the class, and play the next game
  if (room.state === 'playing') player.benched = true;
  room.players.push(player);
  return player;
}

function findPlayer(room, id, key) {
  const p = room.players.find((x) => x.id === id);
  if (!p || p.key !== key) throw new RoomError('player', 'You’re not in this class any more.');
  return p;
}

// Someone leaving mid-game in pairs: their partner wins that game.
function removePlayer(room, id) {
  const p = room.players.find((x) => x.id === id);
  room.players = room.players.filter((x) => x.id !== id);
  room.order = room.order.filter((x) => x !== id);
  const m = p && matchOf(room, p);
  if (m && !m.over && room.state === 'playing') {
    m.left = id;
    finishMatch(room, m, m.ids.find((x) => x !== id));
  }
}

function setSettings(room, settings) {
  if (room.state === 'playing') throw new RoomError('state', 'Settings can’t change during a game.');
  room.settings = cleanSettings({ ...room.settings, ...settings });
}

function start(room, rng = Math.random) {
  if (room.type === 'pairs') return startPairs(room, rng);
  if (room.type === 'tournament') return startTournament(room, rng);
  if (!room.players.length) throw new RoomError('empty', 'Wait for someone to join first.');
  room.state = 'playing';
  room.game++;
  room.round = 0;
  room.startedAt = Date.now();
  for (const p of room.players) {
    freshScore(p, room.settings.size);
    p.benched = false;
  }
  const sides = Core.DIFFICULTY_SIDES[room.settings.difficulty];
  room.bag = Core.createDice(room.settings.size, rng, sides);
  nextRound(room);
}

// Roll for everyone. Anyone who didn't answer the last roll has missed it; anyone
// whose board has no room for this one passes straight away.
function nextRound(room) {
  if (room.state !== 'playing') throw new RoomError('state', 'The game isn’t running.');
  for (const p of playing(room)) {
    if (room.round > 0 && !p.done) {
      p.missed++;
      p.streak = 0;
    }
  }
  if (room.round >= room.settings.rounds) return end(room);
  room.round++;
  room.roll = [room.bag.roll(), room.bag.roll()];
  for (const p of playing(room)) {
    p.result = null;
    p.done = false;
    if (!canFit(p.board, room.roll)) {
      p.done = true;
      p.result = 'pass';
      p.passes++;
    }
  }
}

function canFit(board, [a, b]) {
  return Core.validPlacements(board, a, b).length > 0;
}

// A student's answer for this round. Returns the player (updated).
//   { round, kind: 'placed', rect: { x, y, w, h }, firstTry, ms }
//   { round, kind: 'timeout' } or { round, kind: 'pass' }
function submit(room, player, r) {
  if (room.type !== 'class') return submitPair(room, player, r); // pairs and tournaments
  if (room.state !== 'playing' || Number(r.round) !== room.round) throw new RoomError('stale', 'That roll is over.');
  if (player.benched) throw new RoomError('benched', 'You’ll play in the next game.');
  if (player.done) throw new RoomError('done', 'Already answered this roll.');
  const [a, b] = room.roll;
  const fact = `${a} × ${b}`;
  const f = (player.facts[fact] = player.facts[fact] || { asked: 0, firstTry: 0 });
  if (r.kind === 'placed') {
    const { x, y, w, h } = r.rect || {};
    if (![x, y, w, h].every(Number.isInteger)) throw new RoomError('rect', 'Bad rectangle.');
    if (!((w === a && h === b) || (w === b && h === a))) throw new RoomError('rect', 'That rectangle isn’t the roll.');
    if (!Core.isValidPlacement(player.board, x, y, w, h)) throw new RoomError('rect', 'That rectangle doesn’t fit there.');
    const rect = Core.place(player.board, x, y, w, h, 0);
    rect.a = a;
    rect.b = b;
    score(player, rect, r);
  } else if (r.kind === 'timeout') {
    player.timeouts++;
    player.streak = 0;
    f.asked++;
  } else if (r.kind === 'pass') {
    if (canFit(player.board, room.roll)) throw new RoomError('fits', 'There’s still room for that one.');
    player.passes++;
  } else {
    throw new RoomError('kind', 'Unknown answer.');
  }
  player.done = true;
  player.result = r.kind;
  return player;
}

// Points for a placed rectangle: its squares plus the answer bonus (first try,
// speed, streak), worked out here from what the student reports.
function score(player, rect, r, { bonus: withBonus = true } = {}) {
  const fact = `${rect.a} × ${rect.b}`;
  const f = (player.facts[fact] = player.facts[fact] || { asked: 0, firstTry: 0 });
  const firstTry = Boolean(r.firstTry);
  const ms = Math.max(0, Math.min(Number(r.ms) || 0, 10 * 60 * 1000));
  player.streak = firstTry ? player.streak + 1 : 0;
  player.bestStreak = Math.max(player.bestStreak, player.streak);
  const bonus = withBonus ? Progress.answerBonus({ firstTry, ms, streak: player.streak }).total : 0;
  player.squares += rect.area;
  player.bonus += bonus;
  player.score = player.squares + player.bonus;
  player.answered++;
  if (firstTry) player.firstTry++;
  if (withBonus) player.times.push(Math.round(ms));
  f.asked++;
  if (firstTry) f.firstTry++;
}

function checkRect(board, [a, b], rect) {
  const { x, y, w, h } = rect || {};
  if (![x, y, w, h].every(Number.isInteger)) throw new RoomError('rect', 'Bad rectangle.');
  if (!((w === a && h === b) || (w === b && h === a))) throw new RoomError('rect', 'That rectangle isn’t the roll.');
  if (!Core.isValidPlacement(board, x, y, w, h)) throw new RoomError('rect', 'That rectangle doesn’t fit there.');
  return { x, y, w, h };
}

// ================================================================ pairs

function setPairOptions(room, opts = {}) {
  if (room.state === 'playing') throw new RoomError('state', 'That can’t change during a game.');
  if (PAIR_ODD.includes(opts.odd)) room.pairOptions.odd = opts.odd;
  if (PAIR_MATCHING.includes(opts.matching)) room.pairOptions.matching = opts.matching;
}

// Keep the pairing order in step with who's here: drop leavers, add newcomers at the end.
function syncOrder(room) {
  const ids = students(room).map((p) => p.id);
  room.order = room.order.filter((id) => ids.includes(id));
  for (const id of ids) if (!room.order.includes(id)) room.order.push(id);
  return room.order;
}

// Teacher arranging pairs in the lobby: swap two students.
function swapOrder(room, a, b) {
  if (room.state === 'playing') throw new RoomError('state', 'Pairs can’t change during a game.');
  const order = syncOrder(room);
  const i = order.indexOf(a);
  const j = order.indexOf(b);
  if (i === -1 || j === -1) throw new RoomError('player', 'That student isn’t here.');
  [order[i], order[j]] = [order[j], order[i]];
}

function shuffled(list, rng) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// New random pairs, avoiding last game's partners (and the same odd one out) where possible.
function shuffleOrder(room, rng) {
  const ids = syncOrder(room);
  let best = ids;
  let bestRepeats = Infinity;
  for (let t = 0; t < 40 && bestRepeats > 0; t++) {
    const order = shuffled(ids, rng);
    let repeats = 0;
    for (let i = 0; i + 1 < order.length; i += 2) if (room.lastPartner[order[i]] === order[i + 1]) repeats++;
    if (order.length % 2 && room.lastPartner[order[order.length - 1]] === 'odd') repeats++;
    if (repeats < bestRepeats) {
      best = order;
      bestRepeats = repeats;
    }
  }
  return best;
}

// The pairs this game would have: [[id, id], …], the last one [id, null] if odd.
function pairsFrom(order) {
  const pairs = [];
  for (let i = 0; i < order.length; i += 2) pairs.push([order[i], order[i + 1] || null]);
  return pairs;
}

function teacherPlayer(room) {
  return room.players.find((p) => p.isTeacher) || null;
}

// The teacher joins as a player (to play the odd one out).
function joinTeacher(room, look) {
  const existing = teacherPlayer(room);
  if (existing) {
    if (look) existing.look = cleanLook(look);
    return existing;
  }
  const t = freshScore({ id: token().slice(0, 8), key: token(), name: 'Teacher', isTeacher: true, look: cleanLook(look), connections: 0 }, room.settings.size);
  room.players.push(t);
  return t;
}

function cpuPlayer(room) {
  let cpu = room.players.find((p) => p.isCpu);
  if (!cpu) {
    cpu = freshScore({ id: 'cpu', key: token(), name: 'CPU', isCpu: true, connections: 1 }, room.settings.size);
    room.players.push(cpu);
  }
  return cpu;
}

// Who would play the odd one out, and are they ready? For the lobby and for start().
function oddOpponent(room) {
  const odd = syncOrder(room).length % 2 === 1;
  if (!odd) return { needed: false };
  const how = room.pairOptions.odd;
  if (how === 'cpu') return { needed: true, how, ready: true };
  const t = teacherPlayer(room);
  // On the teacher's own screen the page joins by itself as the game starts.
  if (how === 'screen') return { needed: true, how, ready: true };
  return { needed: true, how, ready: Boolean(t && connected(t)) };
}

function startPairs(room, rng) {
  const ids = syncOrder(room);
  if (!ids.length) throw new RoomError('empty', 'Wait for someone to join first.');
  const opp = oddOpponent(room);
  if (opp.needed && !opp.ready) throw new RoomError('teacher', 'Join as the teacher on your other device first (scan the teacher QR code).');
  if (room.pairOptions.matching === 'shuffle') room.order = shuffleOrder(room, rng);
  let other = null;
  if (opp.needed) other = opp.how === 'cpu' ? cpuPlayer(room) : joinTeacher(room);
  room.state = 'playing';
  room.game++;
  room.startedAt = Date.now();
  for (const p of room.players) {
    freshScore(p, room.settings.size);
    p.match = null;
    p.benched = false;
  }
  room.lastPartner = {};
  room.matchSeq = 0;
  room.matches = pairsFrom(room.order).map(([a, b]) => {
    room.lastPartner[a] = b || 'odd';
    if (b) room.lastPartner[b] = a;
    return newMatch(room, [a, b || other.id], rng);
  });
}

// A pairs game between two players on a fresh shared board.
function newMatch(room, pair, rng, extra = {}) {
  pair = [...pair];
  if (rng() < 0.5) pair.reverse(); // who goes first
  const id = ++room.matchSeq;
  for (const pid of pair) {
    const p = room.players.find((x) => x.id === pid);
    p.match = id;
    // a tournament plays many games: each starts from zero (facts and times carry on for the report)
    Object.assign(p, { score: 0, squares: 0, bonus: 0, streak: 0, answered: 0, firstTry: 0, timeouts: 0, passes: 0 });
  }
  return {
    id,
    ids: pair,
    names: Object.fromEntries(pair.map((pid) => [pid, room.players.find((p) => p.id === pid).name])), // kept if someone leaves
    board: Core.createBoard(room.settings.size),
    bag: Core.createDice(room.settings.size, rng, Core.DIFFICULTY_SIDES[room.settings.difficulty]),
    current: 0, // index into ids: whose turn it is
    turn: 1, // bumps after every turn
    roll: null, // the current player's roll, once they've rolled
    passes: 0, // in a row; both pass and the game is over
    lastPass: null, // { by, roll, turn }
    over: false,
    winner: null, // id, or null for a tie
    left: null, // id of someone who left
    tiebreak: null, // tournament ties: 'first-try' or 'coin'
    ...extra,
  };
}

// ================================================================ tournaments

function startTournament(room, rng) {
  const ids = syncOrder(room);
  if (ids.length < 2) throw new RoomError('empty', 'A tournament needs at least 2 players.');
  const s = room.settings;
  room.tournament = Tournament.create(s.format, ids, rng, { swissRounds: s.swissRounds, kothMatches: s.kothMatches });
  room.state = 'playing';
  room.game++;
  room.startedAt = Date.now();
  room.matches = [];
  room.matchSeq = 0;
  for (const p of room.players) {
    freshScore(p, room.settings.size);
    p.match = null;
    p.benched = false;
  }
  advanceTournament(room, rng);
}

// Start whatever matches the tournament has ready (the next round, or free hills).
// Anyone who has left gives their opponent a walkover.
function advanceTournament(room, rng = Math.random) {
  const t = room.tournament;
  room.roundReady = false;
  const here = (id) => room.players.some((p) => p.id === id);
  for (let guard = 0; guard < 200; guard++) {
    const pairs = Tournament.nextMatches(t);
    if (Tournament.isOver(t)) return end(room);
    const real = [];
    for (const pair of pairs) {
      const [a, b] = pair;
      if (here(a) && here(b)) real.push(pair);
      else Tournament.record(t, a, b, here(a) ? a : b); // walkover
    }
    if (real.length || !pairs.length) {
      const hills = t.format === 'koth' ? t.pending.filter((x) => real.some(([a, b]) => (x.a === a && x.b === b) || (x.a === b && x.b === a))) : [];
      if (t.format === 'koth') {
        // keep the last result on each hill until its next match replaces it
        const busy = new Set(hills.map((h) => h.hill));
        room.matches = room.matches.filter((m) => !busy.has(m.hill));
      } else room.matches = [];
      for (const [a, b] of real) {
        const hill = hills.find((h) => (h.a === a && h.b === b) || (h.a === b && h.b === a));
        room.matches.push(newMatch(room, [a, b], rng, hill ? { hill: hill.hill } : {}));
      }
      return;
    }
    // everything this round was a walkover: go again
  }
}

// A finished tournament match must have a winner: most points, then most
// answers right first time, then a coin flip.
function tournamentWinner(room, m, rng = Math.random) {
  const [p, q] = m.ids.map((id) => room.players.find((x) => x.id === id));
  if (!p || !q) return (p || q || { id: m.ids[0] }).id;
  if (p.score !== q.score) return p.score > q.score ? p.id : q.id;
  if (p.firstTry !== q.firstTry) {
    m.tiebreak = 'first-try';
    return p.firstTry > q.firstTry ? p.id : q.id;
  }
  m.tiebreak = 'coin';
  return rng() < 0.5 ? p.id : q.id;
}

const matchOf = (room, player) => room.matches.find((m) => m.id === player.match) || null;

function myTurn(room, player) {
  const m = matchOf(room, player);
  if (room.state !== 'playing' || !m || m.over) throw new RoomError('stale', 'This game is over.');
  if (m.ids[m.current] !== player.id) throw new RoomError('turn', 'It’s not your turn.');
  return m;
}

// Roll for whoever's turn it is. No room anywhere: they pass.
function pairRoll(room, player, rng = Math.random) {
  const m = myTurn(room, player);
  if (m.roll) return { roll: m.roll, passed: false };
  const roll = Core.rollForBoard(m.board, m.bag, rng, room.settings.fitRolls);
  if (!canFit(m.board, roll)) {
    player.passes++;
    m.passes++;
    m.lastPass = { by: player.id, roll, turn: m.turn };
    nextTurn(room, m);
    return { roll, passed: true };
  }
  m.roll = roll;
  return { roll, passed: false };
}

function submitPair(room, player, r) {
  const m = myTurn(room, player);
  if (Number(r.round) !== m.turn || !m.roll) throw new RoomError('stale', 'That turn is over.');
  if (r.kind === 'placed') {
    const { x, y, w, h } = checkRect(m.board, m.roll, r.rect);
    const rect = Core.place(m.board, x, y, w, h, m.current);
    [rect.a, rect.b] = m.roll;
    score(player, rect, r);
  } else if (r.kind === 'timeout') {
    player.timeouts++;
    player.streak = 0;
  } else throw new RoomError('kind', 'Unknown answer.');
  m.passes = 0;
  nextTurn(room, m);
  return player;
}

// Pairs: what the player on turn is doing, for their partner to watch live:
// dragging a rectangle ('place', rect or null) or answering ('answer', rect).
// Checked loosely (it's only shown, never scored); the real move comes with submit.
function setLive(room, player, live = {}) {
  const m = myTurn(room, player);
  if (!m.roll) throw new RoomError('stale', 'Roll first.');
  const phase = live.phase === 'answer' ? 'answer' : 'place';
  let rect = null;
  if (live.rect) {
    const { x, y, w, h } = live.rect;
    const n = m.board.size;
    const ok = [x, y, w, h].every(Number.isInteger) && x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= n && y + h <= n && w * h <= n * n;
    if (ok) rect = { x, y, w, h };
  }
  m.live = { by: player.id, turn: m.turn, phase, rect };
  return m;
}

// The CPU's turn, in two steps so everyone can watch: roll, then place.
function cpuRoll(room, m, rng = Math.random) {
  return pairRoll(room, room.players.find((p) => p.id === m.ids[m.current]), rng);
}
function cpuPlace(room, m) {
  const cpu = room.players.find((p) => p.id === m.ids[m.current]);
  const [a, b] = m.roll;
  const move = Core.chooseComputerMove(m.board, a, b);
  const rect = Core.place(m.board, move.x, move.y, move.w, move.h, m.current);
  rect.a = a;
  rect.b = b;
  score(cpu, rect, { firstTry: true }, { bonus: false }); // like single player: squares only
  m.passes = 0;
  nextTurn(room, m);
}
const cpuToMove = (room, m) => !m.over && room.state === 'playing' && m.ids[m.current] === 'cpu';

function nextTurn(room, m) {
  m.roll = null;
  m.live = null;
  m.turn++;
  m.current = 1 - m.current;
  const cap = room.settings.matchTurns;
  if (m.passes >= 2 || Core.emptyCount(m.board) === 0 || (cap && m.turn > cap)) finishMatch(room, m);
}

function finishMatch(room, m, winner) {
  if (m.over) return;
  m.over = true;
  m.roll = null;
  if (room.type === 'tournament') {
    m.winner = winner !== undefined ? winner : tournamentWinner(room, m);
    const scores = Object.fromEntries(m.ids.map((id) => [id, (room.players.find((p) => p.id === id) || { score: 0 }).score]));
    Tournament.record(room.tournament, m.ids[0], m.ids[1], m.winner, scores);
    // (players keep pointing at this match, so they see how it ended, until their next one starts)
    // the next round (or the next challenger) starts after a pause: see advanceTournament
    if (Tournament.roundDone(room.tournament) || room.tournament.format === 'koth') room.roundReady = true;
    return;
  }
  if (winner !== undefined) m.winner = winner;
  else {
    const [p, q] = m.ids.map((id) => room.players.find((x) => x.id === id));
    m.winner = !p || !q || p.score === q.score ? null : p.score > q.score ? p.id : q.id;
  }
  if (room.matches.every((x) => x.over)) end(room);
}

const POLL_GRACE_MS = 35000; // a long-polling student counts as here this long after their last poll

// Here = an open event stream, or polled recently.
const connected = (p, now = Date.now()) => p.isCpu || p.connections > 0 || (p.seenAt > 0 && now - p.seenAt < POLL_GRACE_MS);

// Everyone who's here has answered (students who dropped off aren't waited for).
function allDone(room) {
  const here = playing(room).filter(connected);
  return room.state === 'playing' && here.length > 0 && here.every((p) => p.done);
}

function end(room) {
  if (room.type === 'tournament' && room.tournament) {
    for (const m of room.matches) if (!m.over) finishMatch(room, m); // unfinished games: current leader wins
    Tournament.stop(room.tournament); // stopped early: the best record wins
    room.roundReady = false;
  }
  room.state = 'ended';
  room.roll = null;
  room.endedAt = Date.now();
  for (const m of room.matches) if (!m.over) finishMatch(room, m);
}

function backToLobby(room) {
  room.state = 'lobby';
  room.round = 0;
  room.roll = null;
  room.matches = [];
  room.tournament = null;
  room.roundReady = false;
  for (const p of room.players) {
    freshScore(p, room.settings.size);
    p.match = null;
    p.benched = false;
  }
}

// Highest score first; ties share a rank (first-try answers break ties for order only).
function leaderboard(room) {
  const sorted = playing(room).sort((p, q) => q.score - p.score || q.firstTry - p.firstTry || p.name.localeCompare(q.name));
  let rank = 0;
  return sorted.map((p, i) => {
    if (i === 0 || p.score !== sorted[i - 1].score) rank = i + 1;
    return {
      id: p.id,
      name: p.name,
      ...lookOf(p),
      rank,
      score: p.score,
      squares: p.squares,
      firstTry: p.firstTry,
      asked: p.answered + p.timeouts,
      done: p.done,
      result: p.result,
      connected: connected(p),
    };
  });
}

// For the teacher: the facts the class found hardest.
function report(room) {
  const facts = new Map();
  let asked = 0;
  let firstTry = 0;
  const times = [];
  for (const p of playing(room)) {
    times.push(...p.times);
    for (const [fact, f] of Object.entries(p.facts)) {
      const t = facts.get(fact) || { fact, asked: 0, missed: 0 };
      t.asked += f.asked;
      t.missed += f.asked - f.firstTry;
      facts.set(fact, t);
      asked += f.asked;
      firstTry += f.firstTry;
    }
  }
  const hardest = [...facts.values()]
    .filter((f) => f.missed > 0)
    .sort((x, y) => y.missed / y.asked - x.missed / x.asked || y.missed - x.missed)
    .slice(0, 8);
  const avgMs = times.length ? Math.round(times.reduce((s, t) => s + t, 0) / times.length) : null;
  return { asked, firstTry, avgMs, hardest };
}

const PUBLIC = (p) => ({
  id: p.id,
  name: p.name,
  ...lookOf(p),
  score: p.score,
  squares: p.squares,
  bonus: p.bonus,
  firstTry: p.firstTry,
  answered: p.answered,
  isTeacher: Boolean(p.isTeacher),
  isCpu: Boolean(p.isCpu),
  connected: connected(p),
});

function matchView(room, m) {
  const players = m.ids.map((id) => room.players.find((p) => p.id === id) || { id, name: m.names[id], score: 0, squares: 0, bonus: 0, firstTry: 0, answered: 0 });
  return {
    id: m.id,
    turn: m.turn,
    current: m.current,
    roll: m.roll,
    over: m.over,
    winner: m.winner,
    left: m.left,
    lastPass: m.lastPass,
    // what the player whose turn it is is doing right now (see setLive)
    live: m.live && m.live.turn === m.turn ? { by: m.live.by, phase: m.live.phase, rect: m.live.rect } : null,
    filled: 1 - Core.emptyCount(m.board) / (m.board.size * m.board.size),
    players: players.map(PUBLIC),
    rects: m.board.rects.map(({ x, y, w, h, a, b, player }) => ({ x, y, w, h, a, b, owner: player })),
  };
}

function pairsTeacherView(room) {
  const order = syncOrder(room);
  const who = (id) => {
    const p = room.players.find((x) => x.id === id);
    return { id, name: p ? p.name : undefined, ...(p ? lookOf(p) : {}) };
  };
  const t = teacherPlayer(room);
  return {
    pairOptions: room.pairOptions,
    playKey: room.playKey,
    // lobby preview (shuffle mode shuffles when the game starts)
    pairs: pairsFrom(order).map(([a, b]) => [who(a), b ? who(b) : null]),
    odd: oddOpponent(room),
    teacher: t ? { id: t.id, connected: connected(t), match: t.match } : null,
    matches: room.matches.map((m) => {
      const v = matchView(room, m);
      delete v.rects;
      return v;
    }),
  };
}

// ---------------------------------------------------------------- tournament views

function tournamentView(room) {
  const t = room.tournament;
  if (!t) return null;
  const name = (id) => (room.players.find((p) => p.id === id) || {}).name || room.lastNames?.[id] || '?';
  const lookFor = (id) => {
    const p = room.players.find((x) => x.id === id);
    return p ? lookOf(p) : { avatar: '', title: '' };
  };
  const table = Tournament.standings(t).map((x) => ({ ...x, name: name(x.id), ...lookFor(x.id) }));
  const current = t.rounds[t.rounds.length - 1];
  return {
    format: t.format,
    round: t.round,
    label: current ? current.label : '',
    roundReady: room.roundReady,
    over: t.over,
    champion: t.championId ? name(t.championId) : null,
    standings: table,
    rounds: t.rounds.map((r) => ({
      label: r.label,
      matches: r.matches.map((m) => ({ a: name(m.a), b: name(m.b), winner: name(m.winner), hill: m.hill })),
      byes: (r.byes || []).map(name),
    })),
    hills: (t.hills || []).map((h) => ({
      id: h.id,
      king: h.king ? name(h.king) : null,
      streak: h.king ? t.stats[h.king].streak : 0,
      queue: h.queue.map(name),
      played: h.played,
      limit: t.matchesPerHill,
    })),
  };
}

// A student's place in the tournament, for their waiting screen.
function tournamentYou(room, player) {
  const t = room.tournament;
  if (!t || !t.stats[player.id]) return null;
  const st = t.stats[player.id];
  const row = Tournament.standings(t).find((x) => x.id === player.id);
  const current = t.rounds[t.rounds.length - 1];
  let status = 'waiting';
  let line = null;
  const m = matchOf(room, player);
  if (t.over) status = t.championId === player.id ? 'champion' : 'finished';
  else if (m && !m.over) status = 'playing';
  else if (st.out) status = 'out';
  else if (current && !room.roundReady && (current.byes || []).includes(player.id)) status = 'bye';
  if (t.format === 'koth') {
    const hill = t.hills.find((h) => h.king === player.id || h.queue.includes(player.id));
    if (hill && hill.king !== player.id) line = hill.queue.indexOf(player.id) + 1;
  }
  return { status, place: row.place, of: t.seeds.length, wins: st.wins, losses: st.losses, bestStreak: st.bestStreak, upsets: st.upsets, line, champion: t.championId ? (room.players.find((p) => p.id === t.championId) || {}).name : null };
}

// Whole class: everyone's board, as compact [x, y, w, h] rectangles.
const boardOf = (p) => p.board.rects.map(({ x, y, w, h }) => [x, y, w, h]);

// Up to `max` classmates for a student's side panel: the ones closest to them
// on the leaderboard (rank neighbours), best first.
function classmatesFor(room, player, board, max = 8) {
  const others = board.filter((r) => r.id !== player.id);
  const mine = board.findIndex((r) => r.id === player.id);
  const near = others
    .map((r) => ({ r, d: Math.abs(board.indexOf(r) - (mine < 0 ? 0 : mine)) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, max)
    .map(({ r }) => r)
    .sort((a, b) => board.indexOf(a) - board.indexOf(b));
  return near.map((r) => {
    const p = room.players.find((x) => x.id === r.id);
    return { id: r.id, name: r.name, avatar: r.avatar, title: r.title, rank: r.rank, score: r.score, done: r.done, rects: boardOf(p) };
  });
}

function teacherView(room) {
  const board = leaderboard(room);
  const here = playing(room).filter(connected);
  return {
    // joined after the game started: they play the next one
    waiting: students(room).filter((p) => p.benched).map((p) => ({ id: p.id, name: p.name, ...lookOf(p), connected: connected(p) })),
    code: room.code,
    type: room.type,
    ...(room.type !== 'class' ? pairsTeacherView(room) : {}),
    tournament: room.type === 'tournament' ? tournamentView(room) : null,
    state: room.state,
    game: room.game,
    settings: room.settings,
    autoNext: room.autoNext,
    round: room.round,
    roll: room.roll,
    players: board,
    // whole class: every student's board, for the mini-boards on the projector
    boards: room.type === 'class' ? Object.fromEntries(playing(room).map((p) => [p.id, boardOf(p)])) : null,
    done: here.filter((p) => p.done).length,
    here: here.length,
    report: room.state === 'ended' ? report(room) : null,
  };
}

function studentView(room, player) {
  const board = leaderboard(room);
  const me = board.find((p) => p.id === player.id);
  const m = room.type !== 'class' ? matchOf(room, player) : null;
  return {
    code: room.code,
    type: room.type,
    match: m ? matchView(room, m) : null,
    tournament: room.type === 'tournament' ? tournamentYou(room, player) : null,
    state: room.state,
    game: room.game,
    settings: room.settings,
    round: room.round,
    roll: room.roll,
    you: {
      isTeacher: Boolean(player.isTeacher),
      benched: Boolean(player.benched),
      id: player.id,
      name: player.name,
      done: player.done,
      result: player.result,
      rank: me ? me.rank : null,
      tied: Boolean(me) && board.filter((p) => p.rank === me.rank).length > 1, // same score as someone else
      score: player.score,
      squares: player.squares,
      bonus: player.bonus,
      streak: player.streak,
      answered: player.answered,
      firstTry: player.firstTry,
      timeouts: player.timeouts,
      missed: player.missed,
      rects: player.board.rects.map(({ x, y, w, h, a, b }) => ({ x, y, w, h, a, b })),
    },
    of: board.length,
    // whole class: classmates near you on the leaderboard, with their boards
    classmates: room.type === 'class' && room.state !== 'lobby' ? classmatesFor(room, player, board) : null,
    // at the end everyone sees the top five
    top: room.state === 'ended' ? board.slice(0, 5).map(({ name, avatar, title, rank, score }) => ({ name, avatar, title, rank, score })) : null,
  };
}

const isHere = (p) => connected(p);

export {
  cleanLook,
  setLive,
  SIZES,
  DIFFICULTIES,
  ROUNDS,
  TYPES,
  PAIR_ODD,
  PAIR_MATCHING,
  students,
  setPairOptions,
  syncOrder,
  swapOrder,
  shuffleOrder,
  pairsFrom,
  joinTeacher,
  teacherPlayer,
  oddOpponent,
  matchOf,
  pairRoll,
  cpuRoll,
  cpuPlace,
  cpuToMove,
  advanceTournament,
  tournamentView,
  MAX_PLAYERS,
  RoomError,
  createRoom,
  cleanName,
  join,
  findPlayer,
  removePlayer,
  setSettings,
  start,
  nextRound,
  submit,
  allDone,
  end,
  backToLobby,
  leaderboard,
  report,
  isHere,
  teacherView,
  studentView,
};
