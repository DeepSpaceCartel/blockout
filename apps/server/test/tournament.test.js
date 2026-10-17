import test from 'node:test';
import assert from 'node:assert';
import * as T from '../src/tournament.js';

// A seeded random number generator, so failures can be replayed.
function rng(seed) {
  return () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
}
const ids = (n) => Array.from({ length: n }, (_, i) => `p${i + 1}`);

// Play a whole tournament: the "stronger" player (higher strength) usually wins.
function play(format, n, seed = 1, options = {}) {
  const r = rng(seed);
  const s = T.create(format, ids(n), r, options);
  const strength = Object.fromEntries(ids(n).map((id, i) => [id, i]));
  let rounds = 0;
  let matches = 0;
  for (let guard = 0; guard < 2000 && !T.isOver(s); guard++) {
    const pairs = T.nextMatches(s);
    if (T.isOver(s)) break;
    rounds++;
    const inRound = new Set();
    for (const [a, b] of pairs) {
      assert.ok(a && b && a !== b, 'a real match');
      assert.ok(!inRound.has(a) && !inRound.has(b), `${format}: nobody plays twice at once`);
      inRound.add(a).add(b);
    }
    for (const [a, b] of pairs) {
      const winner = strength[a] + r() * 3 > strength[b] ? a : b;
      T.record(s, a, b, winner, { [a]: 10, [b]: 8 });
      matches++;
    }
  }
  assert.ok(T.isOver(s), `${format} with ${n} finishes`);
  return { s, rounds, matches };
}

test('every format finishes with exactly one champion, for 2 to 33 players', () => {
  for (const format of T.FORMATS) {
    for (const n of [2, 3, 4, 5, 6, 7, 8, 9, 12, 16, 17, 25, 33]) {
      const { s } = play(format, n, n * 7 + format.length);
      const table = T.standings(s);
      assert.equal(table.length, n);
      assert.equal(table[0].id, T.champion(s), `${format} ${n}: champion is first`);
      assert.equal(table.filter((x) => x.place === 1).length, 1, `${format} ${n}: one winner`);
    }
  }
});

test('bracket order keeps top seeds apart', () => {
  assert.deepEqual(T.bracketOrder(8), [1, 8, 4, 5, 2, 7, 3, 6]);
  assert.deepEqual(T.bracketOrder(4), [1, 4, 2, 3]);
});

test('knockout: byes go to the first seeds, then everyone who wins goes through', () => {
  const s = T.create('knockout', ids(5), rng(3));
  const first = T.nextMatches(s);
  assert.equal(first.length, 1); // 5 players: 3 byes, 1 match
  assert.equal(s.rounds[0].byes.length, 3);
  assert.ok(!s.rounds[0].byes.includes(s.seeds[4])); // the last seed has to play
  const { rounds, matches } = play('knockout', 16, 5);
  assert.equal(rounds, 4);
  assert.equal(matches, 15);
});

test('knockout: losers are out, and both semi-final losers share 3rd place', () => {
  const { s } = play('knockout', 8, 9);
  const table = T.standings(s);
  assert.deepEqual(table.map((x) => x.place), [1, 2, 3, 3, 5, 5, 5, 5]);
  assert.equal(table.filter((x) => !x.out).length, 1);
});

test('double elimination: nobody is out until they lose twice', () => {
  const { s } = play('double', 8, 11);
  for (const x of T.standings(s)) {
    if (x.out) assert.equal(x.losses, 2);
    else assert.ok(x.losses <= 1);
  }
});

test('round robin: everyone in a group plays everyone else once', () => {
  const { s } = play('roundrobin', 5, 13);
  for (const st of Object.values(s.stats)) assert.equal(new Set(st.played).size, 4);
  // big classes: groups of up to 6, then group winners play off
  const big = play('roundrobin', 14, 17).s;
  assert.equal(big.groups.length, 3);
  assert.ok(big.groups.every((g) => g.length <= 6));
});

test('swiss: the set number of rounds, no rematches, byes go round', () => {
  const { s, rounds } = play('swiss', 7, 19, { swissRounds: 4 });
  assert.equal(rounds, 4);
  for (const st of Object.values(s.stats)) {
    assert.equal(new Set(st.played).size, st.played.length, 'no rematches');
    assert.ok(st.byes <= 1);
  }
});

test('king of the hill: the winner stays on, the loser joins the back of the line', () => {
  const s = T.create('koth', ids(4), rng(23), { kothMatches: 6 });
  const [[a, b]] = T.nextMatches(s);
  const hill = s.hills[0];
  const waiting = [...hill.queue];
  T.record(s, a, b, b);
  assert.equal(hill.king, b);
  assert.deepEqual(hill.queue, [...waiting, a]);
  const [[king, challenger]] = T.nextMatches(s);
  assert.equal(king, b);
  assert.equal(challenger, waiting[0]);
  // more than 8 players: several hills at once
  const big = T.create('koth', ids(20), rng(29), { kothMatches: 4 });
  assert.equal(big.hills.length, 3);
  assert.equal(T.nextMatches(big).length, 3);
  // the longest streak takes the crown
  const done = play('koth', 5, 31, { kothMatches: 8 }).s;
  const best = Math.max(...Object.values(done.stats).map((x) => x.bestStreak));
  assert.equal(done.stats[T.champion(done)].bestStreak, best);
});

test('stopping early crowns the best record so far', () => {
  const s = T.create('swiss', ids(6), rng(37), { swissRounds: 3 });
  const pairs = T.nextMatches(s);
  for (const [a, b] of pairs) T.record(s, a, b, a);
  T.stop(s);
  assert.ok(T.isOver(s));
  assert.equal(s.stats[T.champion(s)].wins, 1);
});
