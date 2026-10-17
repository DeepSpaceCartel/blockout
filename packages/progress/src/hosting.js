// A teacher hosting a live class, for every client (the web game's projector
// screen, the phone app): the choices and their words, which settings apply
// to which game, what the buttons say, and how the roster, the pairs and the
// report read. The views are apps/server/src/rooms.js's teacherView. Pure.
import { ordinal, TOURNAMENT_NAMES } from './stats.js';

// [value, label, detail]
export const HOST_TYPES = [
  ['class', 'Whole class', 'One leaderboard'],
  ['pairs', 'Pairs', 'Head to head in twos'],
  ['tournament', 'Tournament', 'Brackets and champions'],
];

export const HOST_TYPE_HELP = {
  class: 'Everyone plays the same rolls on their own board, and the whole class shares one leaderboard.',
  pairs: 'Students are matched in twos and play head to head on a shared board, taking turns. With an odd number, the odd one out plays you or the CPU.',
  tournament: 'Short head-to-head games in a knockout, round robin, Swiss or king-of-the-hill tournament, with the bracket on your screen. Choose the format in the lobby.',
};

// Starting a class: board, difficulty and (whole class) rolls; the rest is in the lobby
export const SETUP = {
  sizes: [6, 8, 10, 12, 16, 20, 24],
  difficulties: [
    ['easy', 'Easy', '6-sided dice'],
    ['medium', 'Medium', '8-sided dice'],
    ['hard', 'Hard', '12-sided dice'],
  ],
  rounds: [10, 15, 20],
  start: { type: 'class', size: 12, difficulty: 'easy', rounds: 15 },
};

// A tournament is many short games: not the biggest boards
export const setupSize = (type, size) => (type === 'tournament' && size === 12 ? 8 : size);

// The lobby's settings, for the whole class and free of shop locks.
// [value, label, detail]; `only` limits a setting to some game types.
export const HOST_SETTINGS = [
  { key: 'size', label: 'Board size', options: [6, 8, 10, 12, 16, 20, 24].map((n) => [n, `${n}×${n}`]) },
  { key: 'difficulty', label: 'Difficulty', options: SETUP.difficulties },
  {
    key: 'format',
    label: 'Tournament format',
    only: ['tournament'],
    wide: true,
    options: [
      ['knockout', 'Knockout', 'lose once and you’re out'],
      ['double', 'Double knockout', 'out after 2 losses'],
      ['roundrobin', 'Round robin', 'everyone plays everyone'],
      ['swiss', 'Swiss', 'set rounds, no knockouts'],
      ['koth', 'King of the hill', 'winner stays on'],
    ],
  },
  { key: 'swissRounds', label: 'Swiss rounds', only: ['tournament'], when: (s) => s.format === 'swiss', options: [2, 3, 4, 5].map((n) => [n, String(n)]) },
  { key: 'kothMatches', label: 'Games per hill', only: ['tournament'], when: (s) => s.format === 'koth', options: [6, 10, 15].map((n) => [n, String(n)]) },
  { key: 'matchTurns', label: 'Game length', only: ['pairs', 'tournament'], options: [[0, 'Full board'], [12, '6 turns each'], [8, '4 turns each']] },
  { key: 'rounds', label: 'Rolls in a game', only: ['class'], options: [[10, '10'], [15, '15'], [20, '20']] },
  { key: 'placeMode', label: 'Placing rectangles', options: [['choice', 'Their choice'], ['draw', 'Draw'], ['click', 'Click'], ['auto', 'Auto', 'fastest']] },
  { key: 'answerTime', label: 'Time to answer', options: [[0, 'No timer'], [30, '30 s'], [20, '20 s'], [10, '10 s']] },
  { key: 'autoRoll', label: 'Rolling', only: ['pairs', 'tournament'], options: [[false, 'Tap to roll'], [true, 'Auto roll']] },
  { key: 'fitRolls', label: 'Only rolls that fit', only: ['pairs', 'tournament'], options: [['end', 'Near the end'], ['always', 'Always'], ['never', 'Never']] },
  { key: 'cpuSpeed', label: 'CPU speed', only: ['pairs'], options: [['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast']] },
];

// Does a setting show for this class now?
export const settingShown = (def, view) => !(def.only && !def.only.includes(view.type)) && !(def.when && !def.when(view.settings));

// "Make it quick": everything that saves time
export const QUICK_SETTINGS = { placeMode: 'auto', answerTime: 20, autoRoll: true, fitRolls: 'always', cpuSpeed: 'fast', matchTurns: 12 };
export const isQuick = (view) =>
  Object.entries(QUICK_SETTINGS).every(([k, v]) => view.settings[k] === v || (k === 'cpuSpeed' && view.type !== 'pairs') || (['autoRoll', 'fitRolls', 'cpuSpeed', 'matchTurns'].includes(k) && view.type === 'class'));

// ---- pairs

export const MATCHING = [
  ['shuffle', 'New random pairs'],
  ['keep', 'Keep pairs'],
  ['arrange', 'I’ll arrange them'],
];
export const ODD = [
  ['screen', 'You', 'on this screen'],
  ['device', 'You', 'on another device'],
  ['cpu', 'The CPU', 'by itself'],
];
export const MATCHING_HELP = {
  shuffle: 'New pairs are drawn when the game starts. Nobody gets last game’s partner if that can be helped.',
  keep: 'Same pairs as last game. Anyone new is paired up at the end.',
  arrange: 'Tap two names to swap them between pairs.',
};

export function pairsHelp(view) {
  const n = view.players.length;
  const who = { screen: 'you, here on this screen', device: 'you, on your other device', cpu: 'the CPU' }[view.pairOptions.odd];
  return `${MATCHING_HELP[view.pairOptions.matching]} ${n ? `${n} ${n === 1 ? 'student' : 'students'}: ` : ''}${view.odd.needed ? `the odd one out plays ${who}.` : n ? 'everyone has a partner.' : ''}`;
}

// ---- the buttons

// The lobby's Start button: { text, disabled }
export function startButton(view) {
  const n = view.players.length;
  if (view.type === 'tournament') return n >= 2 ? { text: `Start the tournament (${n} players)`, disabled: false } : { text: 'A tournament needs at least 2 players…', disabled: true };
  if (!n) return { text: 'Waiting for players to join…', disabled: true };
  if (view.type === 'pairs') {
    if (view.odd.needed && !view.odd.ready) return { text: 'Waiting for your other device to join…', disabled: true };
    const games = Math.ceil(n / 2);
    return { text: `Start ${games} ${games === 1 ? 'game' : 'games'} (${n} ${n === 1 ? 'student' : 'students'})`, disabled: false };
  }
  return { text: `Start game (${n} ${n === 1 ? 'player' : 'players'})`, disabled: false };
}

// While playing: the line at the top
export function roundLabel(view) {
  if (view.type === 'tournament') {
    const t = view.tournament;
    if (t.format === 'koth') return `King of the hill · ${t.hills.reduce((n, h) => n + h.played, 0)} of ${t.hills.reduce((n, h) => n + h.limit, 0)} games`;
    return `${TOURNAMENT_NAMES[t.format]} · ${t.label}`;
  }
  if (view.type === 'pairs') {
    const done = view.matches.filter((m) => m.over).length;
    return `Pairs · ${done} of ${view.matches.length} ${view.matches.length === 1 ? 'game' : 'games'} finished`;
  }
  return `Roll ${view.round} of ${view.settings.rounds}`;
}

// The Next button (null: none, as in pairs and king of the hill): { text, disabled, finish }
export function nextButton(view) {
  if (view.type === 'pairs' || (view.type === 'tournament' && view.tournament && view.tournament.format === 'koth')) return null;
  if (view.type === 'tournament') return { text: 'Next round', disabled: !view.tournament.roundReady, finish: false };
  const last = view.round >= view.settings.rounds;
  return { text: last ? 'Finish game' : 'Next roll', disabled: false, finish: last };
}
export const autoLabel = (view) => (view.type === 'tournament' ? 'Start the next round by itself' : 'Roll again by itself when everyone’s done');

// ---- the roster, the pairs, the report

// A pair's card: who's playing whom, whose turn, how it went
export function matchCard(m) {
  const left = m.left && m.players.find((p) => p.id === m.left);
  return {
    rows: m.players.map((p, i) => ({ ...p, mark: !m.over && m.current === i ? '🎲' : m.over && m.winner === p.id ? '🏆' : '', winner: m.over && m.winner === p.id })),
    status: m.over ? (left ? `${left.name} left` : m.winner ? 'Finished' : 'Tie!') : `Board ${Math.round(m.filled * 100)}% full`,
  };
}

// The roster's title and rows: [{ id, name, avatar, title, rank, score, status, offline, waiting, out }]
export function roster(view) {
  if (view.type === 'tournament' && view.tournament) {
    const t = view.tournament;
    const byId = new Map(view.players.map((p) => [p.id, p]));
    const playingNow = new Set(view.matches.filter((m) => !m.over).flatMap((m) => m.players.map((p) => p.id)));
    const rows = t.standings.map((x) => {
      const p = byId.get(x.id);
      return { ...x, rank: ordinal(x.place), score: `${x.wins}–${x.losses}`, offline: Boolean(p && !p.connected), out: x.out, status: !p ? '👋' : t.over ? (x.place === 1 ? '🏆' : '') : !p.connected ? '📴' : playingNow.has(x.id) ? '🎲' : x.out ? '' : '⏳' };
    });
    for (const p of view.waiting || []) rows.push({ ...p, waiting: '⏳ next tournament' });
    return { title: t.over ? 'Final standings' : 'Standings', rows, ranked: true };
  }
  const n = view.players.length;
  const rows = view.players.map((p) => {
    if (view.state === 'lobby') return { ...p, offline: !p.connected, removable: true };
    const match = view.type === 'pairs' && view.matches.find((m) => m.players.some((x) => x.id === p.id));
    const pairStatus = match ? (match.over ? '🏁' : match.players[match.current].id === p.id ? '🎲' : '') : '';
    const status = !p.connected ? '📴' : view.state !== 'playing' ? '' : view.type === 'pairs' ? pairStatus : p.done ? '✓' : '…';
    return { ...p, rank: ordinal(p.rank), score: String(p.score), status, offline: !p.connected };
  });
  for (const p of view.waiting || []) rows.push({ ...p, offline: !p.connected, waiting: '⏳ next game' });
  return { title: view.state === 'lobby' ? `${n} joined` : view.state === 'playing' ? 'Leaderboard' : 'Final scores', rows, ranked: view.state !== 'lobby' };
}

// The podium at the end: [{ medal, name, avatar, title, score }]
export function podium(view) {
  const medals = ['🥇', '🥈', '🥉'];
  if (view.type === 'tournament' && view.tournament) return view.tournament.standings.filter((s) => s.place <= 3).slice(0, 4).map((x) => ({ ...x, medal: medals[x.place - 1], score: `${x.wins}–${x.losses}` }));
  if (view.type === 'pairs') return [];
  return view.players.filter((x) => x.rank <= 3).slice(0, 5).map((p) => ({ ...p, medal: medals[p.rank - 1], score: `${p.score} pts` }));
}

// The class report: three tiles, and the facts missed most
export function reportTiles(r) {
  return [
    [r.asked ? `${Math.round((r.firstTry / r.asked) * 100)}%` : '—', 'right first time'],
    [r.avgMs ? `${(r.avgMs / 1000).toFixed(1)} s` : '—', 'average answer'],
    [String(r.asked), 'facts answered'],
  ];
}

// What to post in the class chat
export const joinMessage = (link, code) => `Join our Blockout class! Tap this link: ${link} (class code ${code})`;
