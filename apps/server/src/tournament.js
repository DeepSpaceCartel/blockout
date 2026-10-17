// Tournament formats for classroom games. Pure logic over player ids: who plays
// whom, who goes through, and who wins. Each match itself is a pairs game
// (server/rooms.js); this module only needs the winner (and the scores, for tiebreaks).
//
//   create(format, ids, rng, options) -> state
//   nextMatches(state)                -> [[a, b], …] to start now ([] = nothing yet)
//   record(state, a, b, winner, scores)
//   standings(state)                  -> [{ id, place, wins, losses, points, … }] best first
//   isOver(state), champion(state)
//
// Formats:
//   knockout    single elimination; byes go to the first seeds when the numbers don't work out
//   double      out after two losses (winners' and losers' groups, then a grand final)
//   roundrobin  everyone plays everyone in groups of up to 6; group winners then play a knockout
//   swiss       a set number of rounds; players with the same record meet, no rematches
//   koth        king of the hill: the winner stays on, challengers queue up; longest streak wins
const FORMATS = ['knockout', 'double', 'roundrobin', 'swiss', 'koth'];
const GROUP_MAX = 6;
const HILL_MAX = 8;

function shuffle(list, rng) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Standard bracket order for a bracket of n (a power of 2): 1 v n, and the top
// seeds can only meet late. For 8: [1, 8, 4, 5, 2, 7, 3, 6].
function bracketOrder(n) {
  let order = [1];
  while (order.length < n) {
    const size = order.length * 2;
    order = order.flatMap((s) => [s, size + 1 - s]);
  }
  return order;
}

function create(format, ids, rng = Math.random, options = {}) {
  if (!FORMATS.includes(format)) throw new Error(`Unknown format ${format}`);
  if (ids.length < 2) throw new Error('A tournament needs at least 2 players');
  const seeds = shuffle(ids, rng); // random seeding
  const s = {
    format,
    rng,
    seeds,
    round: 0, // round-based formats: the round being played
    stage: null, // round robin: 'groups' then 'knockout'
    rounds: [], // [{ number, label, matches: [{ a, b, winner, scores }], byes: [id] }]
    pending: [], // matches handed out and not recorded yet: [{ a, b, hill? }]
    stats: {},
    over: false,
    championId: null,
  };
  for (const id of seeds) s.stats[id] = { id, wins: 0, losses: 0, points: 0, byes: 0, played: [], streak: 0, bestStreak: 0, upsets: 0, out: false, outRound: null };
  if (format === 'knockout') s.alive = seeds.slice();
  if (format === 'double') s.alive = seeds.slice(); // anyone with fewer than 2 losses
  if (format === 'swiss') s.totalRounds = Math.max(1, Math.min(9, Number(options.swissRounds) || 3));
  if (format === 'roundrobin') startGroups(s);
  if (format === 'koth') startHills(s, options);
  return s;
}

// ---------------------------------------------------------------- round-based formats

function newRound(s, label, pairs, byes = []) {
  s.round++;
  const round = { number: s.round, label, matches: [], byes };
  for (const id of byes) {
    s.stats[id].byes++;
    if (s.format === 'swiss') s.stats[id].wins++; // in Swiss a bye counts as a win; elsewhere you just go through
  }
  s.rounds.push(round);
  s.pending = pairs.map(([a, b]) => ({ a, b }));
  return pairs;
}

function knockoutPairs(ids, round) {
  if (round === 1) {
    // Byes go to the first seeds: seed k plays seed n+1-k in bracket order
    let size = 1;
    while (size < ids.length) size *= 2;
    const slots = bracketOrder(size).map((seed) => ids[seed - 1] || null);
    const pairs = [];
    const byes = [];
    for (let i = 0; i < slots.length; i += 2) {
      const [a, b] = [slots[i], slots[i + 1]];
      if (a && b) pairs.push([a, b]);
      else if (a || b) byes.push(a || b);
    }
    return { pairs, byes };
  }
  const pairs = [];
  for (let i = 0; i + 1 < ids.length; i += 2) pairs.push([ids[i], ids[i + 1]]);
  return { pairs, byes: ids.length % 2 ? [ids[ids.length - 1]] : [] };
}

const roundName = (left) => (left === 2 ? 'Final' : left <= 4 ? 'Semi-finals' : left <= 8 ? 'Quarter-finals' : null);

// Who's left in a knockout, in bracket order: winners of last round's matches
// (in match order) with byes kept in their slot.
function knockoutNext(s) {
  if (s.alive.length === 1) return finish(s, s.alive[0]);
  const { pairs, byes } = knockoutPairs(s.alive, s.koRound + 1);
  s.koRound++;
  s.koOrder = [];
  if (s.koRound === 1) {
    let size = 1;
    while (size < s.alive.length) size *= 2;
    const slots = bracketOrder(size).map((seed) => s.alive[seed - 1] || null);
    for (let i = 0; i < slots.length; i += 2) s.koOrder.push(slots[i] && slots[i + 1] ? { pair: [slots[i], slots[i + 1]] } : { bye: slots[i] || slots[i + 1] });
  } else {
    for (let i = 0; i < s.alive.length; i += 2) s.koOrder.push(s.alive[i + 1] ? { pair: [s.alive[i], s.alive[i + 1]] } : { bye: s.alive[i] });
  }
  return newRound(s, roundName(s.alive.length) || `Round ${s.koRound}`, pairs, byes);
}

function knockoutAfterRound(s) {
  const round = s.rounds[s.rounds.length - 1];
  const next = [];
  for (const slot of s.koOrder) {
    if (slot.bye) next.push(slot.bye);
    else {
      const m = round.matches.find((x) => (x.a === slot.pair[0] && x.b === slot.pair[1]) || (x.a === slot.pair[1] && x.b === slot.pair[0]));
      next.push(m.winner);
    }
  }
  s.alive = next;
}

// Double elimination, played in rounds: players with no losses meet each other,
// players with one loss meet each other (odd ones out get a bye). When one
// unbeaten player and one once-beaten player are left, it's the grand final; if
// the once-beaten player wins it, both have one loss and they play once more.
function doubleNext(s) {
  const alive = s.seeds.filter((id) => !s.stats[id].out);
  if (alive.length === 1) return finish(s, alive[0]);
  const unbeaten = alive.filter((id) => s.stats[id].losses === 0);
  const once = alive.filter((id) => s.stats[id].losses === 1);
  if (alive.length === 2) {
    const label = unbeaten.length === 1 ? 'Grand final' : unbeaten.length === 2 ? `Round ${s.round + 1}` : 'Grand final (decider)';
    return newRound(s, label, [[alive[0], alive[1]]]);
  }
  const pairs = [];
  const byes = [];
  for (const group of [unbeaten, once]) {
    // with an odd number, someone who hasn't sat out yet (or the fewest times) sits out
    const order = [...group].sort((x, y) => s.stats[x].byes - s.stats[y].byes);
    const sitOut = order.length % 2 ? order[0] : null;
    const playing = order.filter((id) => id !== sitOut);
    pairs.push(...swissPairs(s, playing));
    if (sitOut) byes.push(sitOut);
  }
  // A lone unbeaten player waits for the losers' group without a "win"
  const realByes = byes.filter((id) => !(unbeaten.length === 1 && id === unbeaten[0]));
  const round = newRound(s, `Round ${s.round + 1}`, pairs, realByes);
  s.rounds[s.rounds.length - 1].waiting = byes.filter((id) => !realByes.includes(id));
  return round;
}

// Round robin: groups of up to GROUP_MAX, circle method per group.
function startGroups(s) {
  const n = s.seeds.length;
  const count = Math.ceil(n / GROUP_MAX);
  s.groups = Array.from({ length: count }, () => []);
  s.seeds.forEach((id, i) => s.groups[i % count].push(id));
  s.stage = 'groups';
  // schedule[r] = pairs across all groups for round r
  const schedule = [];
  for (const group of s.groups) {
    const list = group.length % 2 ? [...group, null] : [...group];
    const m = list.length;
    for (let r = 0; r < m - 1; r++) {
      schedule[r] = schedule[r] || { pairs: [], byes: [] };
      for (let i = 0; i < m / 2; i++) {
        const a = list[i];
        const b = list[m - 1 - i];
        if (a && b) schedule[r].pairs.push([a, b]);
        else if (a || b) schedule[r].byes.push(a || b);
      }
      list.splice(1, 0, list.pop()); // rotate all but the first
    }
  }
  s.schedule = schedule;
}

function groupWinner(s, group) {
  return standingsOf(s, group)[0].id;
}

function roundRobinNext(s) {
  if (s.stage === 'groups') {
    const r = s.rounds.length;
    if (r < s.schedule.length) {
      // byes in a round robin are just rest, not wins
      const { pairs, byes } = s.schedule[r];
      newRound(s, s.groups.length > 1 ? `Groups: round ${r + 1}` : `Round ${r + 1}`, pairs);
      s.rounds[s.rounds.length - 1].resting = byes;
      return pairs;
    }
    if (s.groups.length === 1) return finish(s, groupWinner(s, s.groups[0]));
    // Group winners play a knockout
    s.stage = 'knockout';
    s.alive = s.groups.map((g) => groupWinner(s, g));
    s.koRound = 0;
    return knockoutNext(s);
  }
  if (s.alive.length === 1) return finish(s, s.alive[0]);
  return knockoutNext(s);
}

// Swiss: pair top down among equal records, avoiding rematches where possible.
function swissPairs(s, ids) {
  const sorted = [...ids].sort((x, y) => s.stats[y].wins - s.stats[x].wins || s.stats[y].points - s.stats[x].points);
  const pairs = [];
  const left = [...sorted];
  while (left.length > 1) {
    const a = left.shift();
    let j = left.findIndex((b) => !s.stats[a].played.includes(b));
    if (j === -1) j = 0; // everyone left has played a: allow the rematch
    pairs.push([a, left.splice(j, 1)[0]]);
  }
  return pairs;
}

function swissNext(s) {
  if (s.round >= s.totalRounds) return finish(s, standings(s)[0].id);
  const ids = [...s.seeds];
  let bye = null;
  if (ids.length % 2) {
    // the lowest-ranked player who hasn't had a bye yet
    const ranked = standings(s).map((x) => x.id);
    bye = [...ranked].reverse().find((id) => !s.stats[id].byes) || ranked[ranked.length - 1];
  }
  const pairs = swissPairs(s, ids.filter((id) => id !== bye));
  return newRound(s, `Round ${s.round + 1} of ${s.totalRounds}`, pairs, bye ? [bye] : []);
}

// ---------------------------------------------------------------- king of the hill

function startHills(s, options) {
  const count = Math.ceil(s.seeds.length / HILL_MAX);
  s.hills = Array.from({ length: count }, (_, i) => ({ id: i + 1, king: null, queue: [], played: 0, busy: false }));
  s.seeds.forEach((id, i) => s.hills[i % count].queue.push(id));
  // A hill with one player can't play: merge it into the previous one
  s.hills = s.hills.filter((h, i) => {
    if (h.queue.length > 1 || i === 0) return true;
    s.hills[i - 1].queue.push(...h.queue);
    return false;
  });
  s.matchesPerHill = Math.max(2, Number(options.kothMatches) || 10);
  s.round = 1;
  s.rounds.push({ number: 1, label: 'King of the hill', matches: [], byes: [] });
}

function kothNext(s) {
  const out = [];
  for (const hill of s.hills) {
    if (hill.busy || hill.played >= s.matchesPerHill) continue;
    const a = hill.king || hill.queue.shift();
    const b = hill.queue.shift();
    if (!b) {
      if (!hill.king) hill.queue.unshift(a);
      continue;
    }
    hill.king = a;
    hill.busy = true;
    out.push([a, b]);
    s.pending.push({ a, b, hill: hill.id });
  }
  if (!out.length && s.hills.every((h) => !h.busy && h.played >= s.matchesPerHill)) return finish(s, standings(s)[0].id);
  return out;
}

// ---------------------------------------------------------------- shared

function nextMatches(s) {
  if (s.over || (s.pending.length && s.format !== 'koth')) return [];
  if (s.format === 'knockout') {
    if (s.round > 0) knockoutAfterRound(s);
    else s.koRound = 0;
    return knockoutNext(s) || [];
  }
  if (s.format === 'double') return doubleNext(s) || [];
  if (s.format === 'roundrobin') {
    if (s.stage === 'knockout' && s.koRound > 0 && !s.pending.length) knockoutAfterRound(s);
    return roundRobinNext(s) || [];
  }
  if (s.format === 'swiss') return swissNext(s) || [];
  return kothNext(s) || [];
}

// Is the current round finished (so nextMatches would start another)?
const roundDone = (s) => !s.over && s.pending.length === 0;

function record(s, a, b, winner, scores = {}) {
  const i = s.pending.findIndex((m) => (m.a === a && m.b === b) || (m.a === b && m.b === a));
  if (i === -1) throw new Error('That match isn’t being played');
  const [match] = s.pending.splice(i, 1);
  const loser = winner === a ? b : a;
  const W = s.stats[winner];
  const L = s.stats[loser];
  if (L.wins > W.wins) W.upsets++; // beat someone with a better record
  W.wins++;
  L.losses++;
  W.points += scores[winner] || 0;
  L.points += scores[loser] || 0;
  W.played.push(loser);
  L.played.push(winner);
  W.streak++;
  W.bestStreak = Math.max(W.bestStreak, W.streak);
  L.streak = 0;
  s.rounds[s.rounds.length - 1].matches.push({ a, b, winner, scores, hill: match.hill || null });
  if (s.format === 'knockout' || (s.format === 'roundrobin' && s.stage === 'knockout')) knockOut(s, loser);
  if (s.format === 'double' && L.losses >= 2) knockOut(s, loser);
  if (s.format === 'koth') {
    const hill = s.hills.find((h) => h.id === match.hill);
    hill.busy = false;
    hill.played++;
    hill.king = winner;
    hill.queue.push(loser);
  }
}

function knockOut(s, id) {
  s.stats[id].out = true;
  s.stats[id].outRound = s.round;
}

function finish(s, id) {
  s.over = true;
  s.championId = id;
  s.pending = [];
  return [];
}

// Stop early (the teacher ended it): the best record so far wins.
function stop(s) {
  if (s.over) return;
  s.pending = [];
  finish(s, standings(s)[0].id);
}

const isOver = (s) => s.over;
const champion = (s) => s.championId;

function standingsOf(s, ids) {
  return ids
    .map((id) => s.stats[id])
    .sort((x, y) => {
      if (s.championId === x.id) return -1;
      if (s.championId === y.id) return 1;
      // knocked out later = better; then wins, fewer losses, points
      const xr = x.out ? x.outRound : Infinity;
      const yr = y.out ? y.outRound : Infinity;
      const elimination = s.format === 'knockout' || s.format === 'double' || (s.format === 'roundrobin' && s.stage === 'knockout');
      return (elimination ? yr - xr : 0) || (s.format === 'koth' ? y.bestStreak - x.bestStreak : 0) || y.wins - x.wins || x.losses - y.losses || y.points - x.points;
    });
}

// Everyone, best first, with places (ties in knockouts share a place: both semi-final losers are 3rd).
function standings(s) {
  const list = standingsOf(s, s.seeds);
  let place = 0;
  return list.map((st, i) => {
    const prev = list[i - 1];
    const same =
      prev &&
      st.id !== s.championId &&
      prev.id !== s.championId &&
      (s.format === 'knockout' || s.format === 'double'
        ? prev.out === st.out && (!st.out || prev.outRound === st.outRound) && prev.wins === st.wins && prev.losses === st.losses
        : prev.wins === st.wins && prev.losses === st.losses && prev.points === st.points && prev.bestStreak === st.bestStreak);
    if (!same) place = i + 1;
    return { id: st.id, place, wins: st.wins, losses: st.losses, points: st.points, byes: st.byes, out: st.out, bestStreak: st.bestStreak, upsets: st.upsets };
  });
}

export { FORMATS, bracketOrder, create, nextMatches, roundDone, record, standings, stop, isOver, champion };
