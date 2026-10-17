// Stats, for every client (the web game, the phone app): the history a
// finished game or practice round leaves (kept on the device only), the report
// the Stats screen shows, and a player's Times Table grid with the facts to
// practice. Pure functions; the clients only draw them, with the same words.
import * as Progress from './progress.js';

// ---- words

export const FACT_STATUS = {
  mastered: { mark: '✓', label: 'Mastered' },
  learning: { mark: '~', label: 'Learning' },
  practice: { mark: '!', label: 'Needs practice' },
  unseen: { mark: '', label: 'Not seen yet' },
};

export const DIFFICULTY_NAMES = { easy: 'Easy', medium: 'Medium', hard: 'Hard', tricky: 'Tricky', master: 'Master', legend: 'Legend' };
const DIFFICULTY_ORDER = { easy: 0, medium: 1, hard: 2, tricky: 3, master: 4, legend: 5 };

export const TOURNAMENT_NAMES = { knockout: 'Knockout', double: 'Double knockout', roundrobin: 'Round robin', swiss: 'Swiss', koth: 'King of the hill' };

// 1st, 2nd, 3rd, 4th, 11th, 21st
export function ordinal(n) {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th';
  return `${n}${suffix}`;
}

// "40 s", "12 min", "2 h 5 min"
export function formatDuration(ms) {
  const mins = Math.round(ms / 60000);
  if (mins < 1) return `${Math.round(ms / 1000)} s`;
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)} h ${mins % 60} min`;
}

// "2.1s", or "12s" once it's 10 seconds or more, to fit in a grid cell
export function shortTime(ms) {
  const secs = ms / 1000;
  return secs < 10 ? `${secs.toFixed(1)}s` : `${Math.round(secs)}s`;
}

const avgTime = (times) => (times.length ? `${(times.reduce((x, t) => x + t, 0) / times.length / 1000).toFixed(1)} s` : '—');
const percent = (n, of) => (of ? `${Math.round((n / of) * 100)}%` : '—');

// Single player and practice play as "You"
export const isDefaultPlayer = (name) => Progress.playerKey(name) === 'you';

// ---- the history (newest last)

export const HISTORY_LIMIT = 200;

// The history with one more entry, kept to the last HISTORY_LIMIT
export const addToHistory = (history, entry) => [...(Array.isArray(history) ? history : []), entry].slice(-HISTORY_LIMIT);

// A finished game, as the history keeps it. game: { size, difficulty, mode,
// startedAt, turns, players } (a match, or the web game's state); winners: a
// Set of player indexes.
export function gameRecord(game, winners, now = Date.now()) {
  const tie = winners.size > 1;
  return {
    at: now,
    size: game.size,
    duration: now - game.startedAt,
    turns: game.turns,
    difficulty: game.difficulty,
    ...(game.level ? { level: game.level } : {}), // a Journey game
    vsComputer: game.mode === 'single', // the "vs CPU" record counts single-player games only
    players: game.players.map((p, i) => ({
      name: p.name,
      cpu: Boolean(p.cpu),
      score: p.score,
      bonus: p.bonus,
      result: winners.has(i) ? (tie ? 'tie' : 'win') : 'loss',
      answered: p.answered,
      firstTry: p.firstTry,
      timeouts: p.stats.timeouts,
      times: p.stats.times.map(Math.round),
      missed: p.stats.missed,
    })),
  };
}

// ---- the report

function groupRows(list, keyOf, start, add, sort, toRow) {
  const groups = new Map();
  for (const item of list) {
    const key = keyOf(item);
    const row = groups.get(key) || start(item);
    add(row, item);
    groups.set(key, row);
  }
  return [...groups.values()].sort(sort).map(toRow);
}

// What the Stats screen shows. Returns { empty, tiles: [{ value, label }],
// tables: [{ heading, columns, rows: [{ title, sub, values }] }], players:
// [{ name, label }] (whose Times Table to show; label '' for "You"), recent:
// [{ meta, text, winner }] }. at: Date to show times in the device's way.
export function statsReport(history, state) {
  const factPlayers = Object.values(state.facts).filter((p) => Object.keys(p.facts).length);
  if (!history.length && !factPlayers.length) return { empty: true, tiles: [], tables: [], players: [], recent: [] };
  const games = history.filter((g) => !g.kind);
  const rounds = history.filter((g) => g.kind === 'practice');
  const classes = history.filter((g) => g.kind === 'class' && !g.type);
  const pairGames = history.filter((g) => g.kind === 'class' && g.type === 'pairs');
  const tournaments = history.filter((g) => g.kind === 'class' && g.type === 'tournament');

  const tiles = [];
  const tables = [];
  if (history.length) {
    const vs = games.filter((g) => g.vsComputer && g.players.some((p) => !p.cpu)).map((g) => g.players.find((p) => !p.cpu).result);
    const count = (r) => vs.filter((x) => x === r).length;
    const played = games.length + classes.length + pairGames.length + tournaments.length; // class games are games too
    tiles.push(
      { value: `${played}${rounds.length ? ` + ${rounds.length}` : ''}`, label: rounds.length ? 'games + practice rounds' : 'games played' },
      { value: formatDuration([...games, ...rounds, ...classes, ...pairGames].reduce((s, g) => s + g.duration, 0)), label: 'time played' },
      { value: vs.length ? `${count('win')}–${count('loss')}–${count('tie')}` : '—', label: 'vs CPU (W–L–T)' }
    );
    const bySizeAndDifficulty = (a, b) => a.size - b.size || DIFFICULTY_ORDER[a.difficulty] - DIFFICULTY_ORDER[b.difficulty];
    const answers = (row, p) => {
      row.asked += p.answered + p.timeouts;
      row.firstTry += p.firstTry;
      row.times.push(...p.times);
    };
    if (games.length) {
      const rows = groupRows(
        games,
        (g) => `${g.vsComputer ? 'single' : 'multi'}|${g.size}|${g.difficulty || 'easy'}`,
        (g) => ({ mode: g.vsComputer ? 'single' : 'multi', size: g.size, difficulty: g.difficulty || 'easy', games: 0, wins: 0, best: 0, asked: 0, firstTry: 0, times: [] }),
        (row, g) => {
          row.games++;
          const humans = g.players.filter((p) => !p.cpu);
          if (humans.some((p) => p.result === 'win')) row.wins++;
          for (const p of humans) {
            row.best = Math.max(row.best, p.score);
            answers(row, p);
          }
        },
        (a, b) => (a.mode === b.mode ? 0 : a.mode === 'single' ? -1 : 1) || bySizeAndDifficulty(a, b),
        (r) => ({ title: r.mode === 'single' ? 'Single player' : 'Multiplayer', sub: `${r.size}×${r.size} · ${DIFFICULTY_NAMES[r.difficulty]}`, values: [r.games, r.wins, r.best, percent(r.firstTry, r.asked), avgTime(r.times)] })
      );
      tables.push({ heading: 'Games', columns: ['Games', 'Wins', 'Best score', 'Right 1st try', 'Avg answer'], rows });
    }
    if (rounds.length) {
      const rows = groupRows(
        rounds,
        (r) => `${r.size}|${r.level}`,
        (r) => ({ size: r.size, level: r.level, rounds: 0, best: null, asked: 0, firstTry: 0, times: [] }),
        (row, r) => {
          row.rounds++;
          if (!row.best || r.firstTry / r.count > row.best.firstTry / row.best.count) row.best = r;
          row.asked += r.count;
          row.firstTry += r.firstTry;
          row.times.push(...r.times);
        },
        (a, b) => a.size - b.size || (a.level === b.level ? 0 : a.level === 'learn' ? -1 : 1),
        (r) => ({ title: 'Practice', sub: `up to ×${r.size} · ${r.level === 'expert' ? 'Expert' : 'Learn'}`, values: [r.rounds, `${r.best.firstTry}/${r.best.count}`, percent(r.firstTry, r.asked), avgTime(r.times)] })
      );
      tables.push({ heading: 'Practice', columns: ['Rounds', 'Best round', 'Right 1st try', 'Avg answer'], rows });
    }
    if (classes.length) {
      const rows = groupRows(
        classes,
        (g) => `${g.size}|${g.difficulty}`,
        (g) => ({ size: g.size, difficulty: g.difficulty, games: 0, bestRank: null, best: 0, asked: 0, firstTry: 0, times: [] }),
        (row, g) => {
          row.games++;
          if (!row.bestRank || g.rank < row.bestRank.rank) row.bestRank = g;
          row.best = Math.max(row.best, g.score);
          answers(row, g);
        },
        bySizeAndDifficulty,
        (r) => ({ title: 'Classroom', sub: `${r.size}×${r.size} · ${DIFFICULTY_NAMES[r.difficulty]}`, values: [r.games, `${ordinal(r.bestRank.rank)} of ${r.bestRank.of}`, r.best, percent(r.firstTry, r.asked), avgTime(r.times)] })
      );
      tables.push({ heading: 'Classroom', columns: ['Games', 'Best place', 'Best score', 'Right 1st try', 'Avg answer'], rows });
    }
    if (pairGames.length) {
      const rows = groupRows(
        pairGames,
        (g) => `${g.size}|${g.difficulty}`,
        (g) => ({ size: g.size, difficulty: g.difficulty, games: 0, wins: 0, best: 0, asked: 0, firstTry: 0, times: [] }),
        (row, g) => {
          row.games++;
          if (g.result === 'win') row.wins++;
          row.best = Math.max(row.best, g.score);
          answers(row, g);
        },
        bySizeAndDifficulty,
        (r) => ({ title: 'Pairs', sub: `${r.size}×${r.size} · ${DIFFICULTY_NAMES[r.difficulty]}`, values: [r.games, r.wins, r.best, percent(r.firstTry, r.asked), avgTime(r.times)] })
      );
      tables.push({ heading: 'Classroom: pairs', columns: ['Games', 'Wins', 'Best score', 'Right 1st try', 'Avg answer'], rows });
    }
    if (tournaments.length) {
      const rows = groupRows(
        tournaments,
        (g) => g.format,
        (g) => ({ format: g.format, played: 0, titles: 0, best: null, wins: 0, losses: 0 }),
        (row, g) => {
          row.played++;
          if (g.place === 1) row.titles++;
          if (!row.best || g.place < row.best.place) row.best = g;
          row.wins += g.wins;
          row.losses += g.losses;
        },
        () => 0,
        (r) => ({ title: 'Tournament', sub: TOURNAMENT_NAMES[r.format] || r.format, values: [r.played, r.titles, `${ordinal(r.best.place)} of ${r.best.of}`, `${r.wins}–${r.losses}`] })
      );
      tables.push({ heading: 'Classroom: tournaments', columns: ['Played', 'Titles', 'Best finish', 'Games W–L'], rows });
    }
  }

  // Whose Times Table: everyone who has answered anything, in games or practice
  const names = new Map();
  for (const g of games) for (const p of g.players) if (!p.cpu) names.set(Progress.playerKey(p.name), p.name);
  for (const p of factPlayers) if (!names.has(Progress.playerKey(p.name))) names.set(Progress.playerKey(p.name), p.name);
  const players = [...names.values()].map((name) => ({ name, label: isDefaultPlayer(name) ? '' : name }));

  const recent = [...games, ...classes, ...pairGames, ...tournaments]
    .sort((a, b) => a.at - b.at)
    .slice(-10)
    .reverse()
    .map(recentLine);
  return { empty: false, tiles, tables, players, recent };
}

function recentLine(g) {
  const when = new Date(g.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  if (g.kind === 'class' && g.type === 'tournament') {
    return { meta: `${when} · Class ${g.code} · ${TOURNAMENT_NAMES[g.format] || 'Tournament'}`, text: `${g.name} ${g.wins}–${g.losses}`, winner: g.place === 1 ? '🏆 Champion' : `${ordinal(g.place)} of ${g.of} · 🏆 ${g.champion}` };
  }
  if (g.kind === 'class' && g.type === 'pairs') {
    return { meta: `${when} · Class ${g.code} pairs · ${g.size}×${g.size}`, text: `${g.name} ${g.score} – ${g.opponent} ${g.opponentScore}`, winner: g.result === 'win' ? `🏆 ${g.name}` : g.result === 'tie' ? 'Tie' : `🏆 ${g.opponent}` };
  }
  if (g.kind === 'class') {
    return { meta: `${when} · Class ${g.code} · ${g.size}×${g.size}`, text: `${g.name} ${g.score}`, winner: g.rank === 1 && g.of > 1 ? `🏆 1st of ${g.of}` : `${ordinal(g.rank)} of ${g.of}` };
  }
  const won = g.players.filter((p) => p.result === 'win');
  return { meta: `${when} · ${g.size}×${g.size}`, text: g.players.map((p) => `${p.name} ${p.score}`).join(' – '), winner: won.length ? `🏆 ${won[0].name}` : 'Tie' };
}

// ---- a player's Times Table

// The grid: { max, heads: [{ n, mastered }], cells: [[{ a, b, status, mark,
// timed, detail }]] }. size: a fixed size (a teacher looking at a student),
// else up to what this player has seen and unlocked (tableSize). showTime:
// (status) => true to show the best time instead of the mark.
export function factGrid(facts, { size = null, unlocked = 6, showTime = () => false } = {}) {
  const seenMax = Math.max(0, ...Object.keys(facts).flatMap((k) => k.split('×').map((n) => Number(n.trim()))));
  const max = size || Math.max(6, seenMax > 8 ? 12 : seenMax > 6 ? 8 : 6, unlocked);
  const heads = Array.from({ length: max }, (_, i) => ({ n: i + 1, mastered: Progress.lineReached(facts, i + 1, max, 'mastered') }));
  const cells = Array.from({ length: max }, (_, ri) =>
    Array.from({ length: max }, (_, ci) => {
      const [r, c] = [ri + 1, ci + 1];
      const f = facts[Progress.factKey(r, c)];
      const status = Progress.factStatus(f);
      const best = Progress.factBestMs(f);
      const timed = Boolean(showTime(status)) && best !== null;
      const detail = f
        ? `${r} × ${c} = ${r * c}: ${FACT_STATUS[status].label}. ${f.firstTry} of ${f.asked} right first time` +
          (f.wrong ? `, ${f.wrong} wrong` : '') +
          (f.timeouts ? `, ${f.timeouts} timed out` : '') +
          (best !== null ? `, best ${(best / 1000).toFixed(1)} s` : '') +
          (f.timed ? `, avg ${(f.totalMs / f.timed / 1000).toFixed(1)} s` : '')
        : `${r} × ${c} = ${r * c}: not seen yet`;
      return { a: r, b: c, status, mark: timed ? shortTime(best) : FACT_STATUS[status].mark, timed, detail };
    })
  );
  return { max, heads, cells };
}

// The facts this player misses most (up to 8): [{ fact, count, answers, timeouts, rate }]
export function factsToPractice(facts) {
  return Object.entries(facts)
    .filter(([, f]) => f.wrong + f.timeouts > 0)
    .sort(([, a], [, b]) => b.wrong + b.timeouts - (a.wrong + a.timeouts))
    .slice(0, 8)
    .map(([fact, f]) => ({ fact, count: f.wrong + f.timeouts, answers: f.said, timeouts: f.timeouts, rate: `${f.firstTry} of ${f.asked} right first time` }));
}

// A player's facts (the save keeps them by player)
export const playerFacts = (state, name) => (state.facts[Progress.playerKey(name)] || { facts: {} }).facts;
