// A student in a live class, for every client (the web game, the phone app):
// what the waiting screen says, keeping a game's board in step with the
// server, the results screens, and the rewards and history at the end. The
// server's views are apps/server/src/rooms.js's studentView. A game here is
// a match (@blockout/engine/match) or the web game's state, which is shaped
// like one. Pure; the screens and the connection live in the clients.
import * as Core from '@blockout/engine';
import * as Progress from './progress.js';
import { ordinal } from './stats.js';

// ---- words

// Where you stand in a tournament, between games
export function tournamentLine(t) {
  const record = `${t.wins}–${t.losses}`;
  switch (t.status) {
    case 'champion':
      return `🏆 You won the tournament! (${record})`;
    case 'finished':
      return `${t.champion} won the tournament. You finished ${ordinal(t.place)} of ${t.of} (${record}).`;
    case 'out':
      return `You’re out of the tournament (${record}). Cheer on the others! 📣`;
    case 'bye':
      return 'You have a bye this round: you go straight through! 🎟️';
    case 'playing':
      return 'Your game is on!';
    default:
      return t.line ? `You’re number ${t.line} in line for the hill 👑 (${record})` : `Next round starting soon… (${record})`;
  }
}

// The waiting screen's line. session: { teacher } for the teacher's own player.
export function waitingText(view, session = {}) {
  const t = view && view.tournament;
  if (t) return tournamentLine(t);
  if (session.teacher) return 'You’re the teacher’s player. When there’s an odd number of students, you’ll play the odd one out here.';
  if (view && view.state === 'playing') return 'That game started without you. You’ll play in the next one!';
  if (view && view.state === 'ended') return 'That game just finished. Wait here for the next one!';
  return 'Waiting for your teacher to start the game…';
}

// Why you're out of the class, as a toast [title, text]; null for an old
// class from last time (never got an update: just forget it)
export function goneToast(reason, wasIn) {
  if (!wasIn) return null;
  if (reason === 'closed') return ['👋 Your teacher closed the class', 'Thanks for playing!'];
  if (reason === 'removed') return ['You’ve left the class', 'Join again with the code if that was a mistake.'];
  return ['⚠️ Lost the class', 'Join again with the code on the board.'];
}

// The teacher's settings for everyone (no shop locks); placing is the
// student's own choice unless the teacher picked one (Draw or Auto: a class
// set to Click before it went draws)
const PLACE_MODES = ['draw', 'auto'];
export const classCfg = (s, ownPlaceMode) => {
  const mode = s.placeMode && s.placeMode !== 'choice' ? s.placeMode : ownPlaceMode;
  return { answerTime: s.answerTime || 0, placeMode: PLACE_MODES.includes(mode) ? mode : 'draw' };
};

// ---- the board

// Rejoining a whole-class game half-way: your rectangles back, your score
export function rejoinClass(game, you) {
  const p = game.players[0];
  for (const r of you.rects) {
    const rect = Core.place(game.board, r.x, r.y, r.w, r.h, 0);
    Object.assign(rect, { a: r.a, b: r.b, solved: true });
  }
  Object.assign(p, { squares: you.squares, bonus: you.bonus, score: you.score, streak: you.streak, answered: you.answered, firstTry: you.firstTry });
  return you.rects.length > 0;
}

// The teacher rolled again before you finished the last roll: it's gone
// (its rectangle comes off, it counts as run out of time, the streak ends)
export function skipUnfinished(game) {
  if (game.pending) Core.removeRect(game.board, game.pending.rect);
  game.pending = null;
  const [a, b] = game.dice || [];
  const p = game.players[game.current];
  if (a) p.log.push({ timeout: true, a, b });
  p.streak = 0;
}

// Pairs: bring the shared board, scores and turn up to date with the
// server's match. seen: { synced, passSeen } (kept by the client, changed
// here). Returns what to tell the player about the other's move, or ''.
export function syncPair(game, m, me, seen) {
  m.players.forEach((sp, i) => Object.assign(game.players[i], { score: sp.score, squares: sp.squares, bonus: sp.bonus }));
  let note = '';
  // new rectangles (yours are already on the board)
  for (const r of m.rects.slice(seen.synced)) {
    if (game.board.rects.some((x) => x.x === r.x && x.y === r.y && x.w === r.w && x.h === r.h)) continue;
    if (game.pending) {
      // can't happen in turn order, but never draw over your own rectangle
      Core.removeRect(game.board, game.pending.rect);
      game.pending = null;
    }
    const rect = Core.place(game.board, r.x, r.y, r.w, r.h, r.owner);
    Object.assign(rect, { a: r.a, b: r.b, solved: true });
    game.lastRect = rect;
    game.players[r.owner].log.push({ a: r.a, b: r.b, area: rect.area });
    if (r.owner !== me) note = `${game.players[r.owner].name} drew ${r.a} × ${r.b} = ${rect.area}.`;
  }
  seen.synced = m.rects.length;
  if (m.lastPass && m.lastPass.turn > seen.passSeen) {
    seen.passSeen = m.lastPass.turn;
    const who = m.players.findIndex((p) => p.id === m.lastPass.by);
    const [a, b] = m.lastPass.roll;
    game.players[who].log.push({ pass: true, a, b });
    note = who === me ? `No room for a ${a} × ${b} anywhere. You pass.` : `${game.players[who].name} had no room for a ${a} × ${b}, so they pass.`;
  }
  game.current = m.current;
  return note;
}

// What your partner is doing right now, in words
export function partnerLine(name, roll, live) {
  const [a, b] = roll;
  if (live && live.phase === 'answer') return `${name} is working out ${a} × ${b}…`;
  if (live && live.rect) return `${name} is placing a ${a} × ${b} rectangle…`;
  return `${name} rolled ${a} and ${b}…`;
}

// ---- results

// Whole class: { title, sub, rows: [{ gap } | { name, avatar, title, rank, score, you }], celebrate }
export function classResult(view) {
  const you = view.you;
  const alone = view.of < 2;
  const title = alone ? 'Game over!' : you.rank === 1 ? `${you.tied ? 'Tied for top' : 'Top'} of the class! 🏆` : `You ${you.tied ? 'tied for' : 'came'} ${ordinal(you.rank)} of ${view.of}!`;
  const asked = you.answered + you.timeouts;
  const rows = view.top.map((r) => ({ ...r, you: r.name === you.name }));
  if (!rows.some((r) => r.you)) rows.push({ gap: true }, { name: you.name, rank: you.rank, score: you.score, you: true });
  return { title, sub: `${you.score} points · ${you.firstTry} of ${asked} right first time`, rows, celebrate: you.rank === 1 && !alone };
}

// Pairs: { title, sub, rows: [{ name, avatar, title, score, index, you }], won }
export function pairResult(view, me, emptySquares) {
  const m = view.match;
  const mine = m.players[me];
  const opp = m.players[1 - me];
  const oppName = opp.isTeacher ? 'your teacher' : opp.name;
  const Opp = oppName[0].toUpperCase() + oppName.slice(1);
  const title = m.left === opp.id ? `${Opp} left, so you win!` : m.winner === mine.id ? `You beat ${oppName}! 🎉` : m.winner === null ? 'It’s a tie!' : `${Opp} wins this time`;
  let sub = `${mine.score} – ${opp.score} · ${emptySquares === 0 ? 'the board is full' : `${emptySquares} squares left empty`}`;
  if (m.tiebreak) sub += m.tiebreak === 'coin' ? ' · a tie, settled by a coin flip' : ' · a tie, won on answers right first time';
  const rows = m.players.map((p, index) => ({ ...p, index, you: index === me })).sort((x, y) => y.score - x.score);
  return { title, sub, rows, won: m.winner === mine.id };
}

// ---- rewards and history (each changes the save; the client saves it and
// adds the history entry)

const timesOf = (p) => (p && p.stats ? { times: p.stats.times.map(Math.round), missed: p.stats.missed } : { times: [], missed: [] });

// Whole class: points, achievements, and the history entry. player: your
// player in the game (for answer times and misses).
export function classRewards(state, view, player, { now = Date.now(), startedAt = now, statsName = 'You' } = {}) {
  const you = view.you;
  Progress.addPoints(state, you.score);
  state.counters.classGames = (state.counters.classGames || 0) + 1;
  Progress.noteActivity(state, { kind: 'class', type: 'class', rank: you.rank });
  const asked = you.answered + you.timeouts;
  const earned = Progress.awardAchievements(state, {
    event: 'class',
    classGames: state.counters.classGames,
    rank: you.rank,
    of: view.of,
    perfect: asked >= 5 && you.firstTry === asked,
    missed: you.missed,
    rolls: view.round,
  });
  const entry = {
    kind: 'class',
    at: now,
    duration: now - startedAt,
    code: view.code,
    size: view.settings.size,
    difficulty: view.settings.difficulty,
    name: you.name,
    statsName,
    rank: you.rank,
    of: view.of,
    score: you.score,
    answered: you.answered,
    firstTry: you.firstTry,
    timeouts: you.timeouts,
    ...timesOf(player),
  };
  return { earned, entry };
}

// Pairs (not a tournament game: those just earn their points, see below)
export function pairRewards(state, view, me, player, { now = Date.now(), startedAt = now, statsName = 'You' } = {}) {
  const m = view.match;
  const mine = m.players[me];
  const opp = m.players[1 - me];
  const won = m.winner === mine.id;
  Progress.addPoints(state, mine.score);
  state.counters.pairGames = (state.counters.pairGames || 0) + 1;
  if (won) state.counters.pairWins = (state.counters.pairWins || 0) + 1;
  Progress.noteActivity(state, { kind: 'class', type: view.tournament ? 'tournament' : 'pairs', won });
  const asked = player.answered + player.stats.timeouts;
  const earned = Progress.awardAchievements(state, {
    event: 'pair',
    won,
    tie: m.winner === null,
    vsTeacher: opp.isTeacher,
    vsCpu: opp.isCpu,
    pairGames: state.counters.pairGames,
    pairWins: state.counters.pairWins || 0,
    perfect: asked >= 5 && player.firstTry === asked,
  });
  const entry = {
    kind: 'class',
    type: 'pairs',
    at: now,
    duration: now - startedAt,
    code: view.code,
    size: view.settings.size,
    difficulty: view.settings.difficulty,
    name: mine.name,
    statsName,
    opponent: opp.isTeacher ? 'Teacher' : opp.name,
    result: m.winner === null ? 'tie' : won ? 'win' : 'loss',
    score: mine.score,
    opponentScore: opp.score,
    answered: player.answered,
    firstTry: player.firstTry,
    timeouts: player.stats.timeouts,
    ...timesOf(player),
  };
  return { earned, entry };
}

// One game of a tournament: its points (the tournament's own rewards come at the end)
export const tournamentGamePoints = (state, view, me) => Progress.addPoints(state, view.match.players[me].score);

// The end of a tournament, once (rewarded: the keys done so far, a Set kept
// by the client). Null until it's over, or when it's been rewarded already.
export function tournamentRewards(state, view, name, rewarded, { now = Date.now() } = {}) {
  const t = view.tournament;
  const key = `${view.code}:${view.game}`;
  if (!t || view.state !== 'ended' || rewarded.has(key)) return null;
  rewarded.add(key);
  state.counters.tournaments = (state.counters.tournaments || 0) + 1;
  const champion = t.status === 'champion';
  if (champion) state.counters.tournamentWins = (state.counters.tournamentWins || 0) + 1;
  const earned = Progress.awardAchievements(state, {
    event: 'tournament',
    place: t.place,
    of: t.of,
    champion,
    undefeated: t.losses === 0 && t.wins > 0,
    upsets: t.upsets,
    bestStreak: t.bestStreak,
    tournaments: state.counters.tournaments,
    titles: state.counters.tournamentWins || 0,
  });
  const entry = {
    kind: 'class',
    type: 'tournament',
    at: now,
    duration: 0,
    code: view.code,
    size: view.settings.size,
    difficulty: view.settings.difficulty,
    format: view.settings.format,
    name,
    place: t.place,
    of: t.of,
    wins: t.wins,
    losses: t.losses,
    champion: t.champion,
  };
  return { earned, entry, champion };
}
