import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Match from '@blockout/engine/match';
import * as Progress from '../src/progress.js';
import * as Live from '../src/classroom.js';

const save = () => Progress.createProgress();
const pairMatch = () => Match.createMatch({ mode: 'pair', difficulty: 'easy', size: 6, players: [{ name: 'Sam' }, { name: 'Ana' }] });

test('the waiting screen and the tournament line', () => {
  assert.match(Live.waitingText({ state: 'lobby' }), /Waiting for your teacher/);
  assert.match(Live.waitingText({ state: 'playing' }), /started without you/);
  assert.match(Live.waitingText(null, { teacher: true }), /teacher’s player/);
  assert.equal(Live.waitingText({ tournament: { status: 'bye', wins: 1, losses: 0 } }), 'You have a bye this round: you go straight through! 🎟️');
  assert.equal(Live.tournamentLine({ status: 'finished', champion: 'Ana', place: 2, of: 8, wins: 2, losses: 1 }), 'Ana won the tournament. You finished 2nd of 8 (2–1).');
  assert.equal(Live.goneToast('closed', false), null, 'an old class: just forgotten');
  assert.deepEqual(Live.goneToast('closed', true), ['👋 Your teacher closed the class', 'Thanks for playing!']);
  assert.deepEqual(Live.classCfg({ placeMode: 'choice', answerTime: 10 }, 'auto'), { answerTime: 10, placeMode: 'auto', firstInCorner: false, diceMode: 'virtual' });
});

test('pairs: the partner’s rectangles, passes and the turn come from the server', () => {
  const game = pairMatch();
  const seen = { synced: 0, passSeen: 0 };
  const m = {
    players: [{ id: 'a', score: 6, squares: 6, bonus: 0 }, { id: 'b', score: 4, squares: 4, bonus: 0 }],
    rects: [{ x: 0, y: 0, w: 3, h: 2, a: 2, b: 3, owner: 0 }, { x: 3, y: 0, w: 2, h: 2, a: 2, b: 2, owner: 1 }],
    current: 0,
  };
  assert.equal(Live.syncPair(game, m, 0, seen), 'Ana drew 2 × 2 = 4.');
  assert.equal(game.board.rects.length, 2);
  assert.equal(game.players[1].score, 4);
  assert.equal(seen.synced, 2);
  assert.equal(Live.syncPair(game, m, 0, seen), '', 'nothing new');
  m.lastPass = { turn: 3, by: 'b', roll: [6, 6] };
  m.current = 1;
  assert.equal(Live.syncPair(game, m, 0, seen), 'Ana had no room for a 6 × 6, so they pass.');
  assert.equal(game.current, 1);
  assert.equal(Live.partnerLine('Ana', [3, 4], { phase: 'answer' }), 'Ana is working out 3 × 4…');
});

test('whole class: rejoining, a skipped roll, the results and the rewards', () => {
  const game = Match.createMatch({ mode: 'class', difficulty: 'easy', size: 6, players: [{ name: 'Sam' }] });
  const you = { name: 'Sam', rank: 7, tied: false, score: 20, squares: 18, bonus: 2, streak: 1, answered: 3, firstTry: 3, timeouts: 0, missed: [], rects: [{ x: 0, y: 0, w: 2, h: 3, a: 3, b: 2 }] };
  assert.equal(Live.rejoinClass(game, you), true);
  assert.equal(game.players[0].score, 20);
  game.phase = 'roll';
  Match.roll(game, [2, 2]);
  Match.place(game, { x: 2, y: 0, w: 2, h: 2 });
  Live.skipUnfinished(game);
  assert.equal(game.board.rects.length, 1, 'the unanswered rectangle came off');
  assert.equal(game.players[0].streak, 0);
  const view = { code: 'ABCD', game: 1, round: 9, of: 20, settings: { size: 6, difficulty: 'easy' }, you, top: [1, 2, 3, 4, 5].map((n) => ({ name: `P${n}`, rank: n, score: 50 - n })) };
  const r = Live.classResult(view);
  assert.equal(r.title, 'You came 7th of 20!');
  assert.equal(r.rows.length, 7, 'the top five, a gap, then you');
  assert.ok(r.rows[5].gap && r.rows[6].you);
  const state = save();
  const { earned, entry } = Live.classRewards(state, view, game.players[0], { now: 5000, startedAt: 1000 });
  assert.equal(state.wallet, 20 + earned.reduce((n, a) => n + a.reward, 0), 'the game’s points, plus any achievements');
  assert.equal(state.counters.classGames, 1);
  assert.deepEqual([entry.rank, entry.of, entry.duration], [7, 20, 4000]);
});

test('pairs and tournaments: results, and the tournament rewarded once', () => {
  const game = pairMatch();
  const view = { code: 'ABCD', game: 2, settings: { size: 6, difficulty: 'easy' }, match: { players: [{ id: 'a', name: 'Sam', score: 30 }, { id: 'b', name: 'Ana', score: 24 }], winner: 'a', left: null } };
  const r = Live.pairResult(view, 0, 0);
  assert.equal(r.title, 'You beat Ana! 🎉');
  assert.equal(r.sub, '30 – 24 · the board is full');
  assert.ok(r.won && r.rows[0].you);
  const state = save();
  const { earned, entry } = Live.pairRewards(state, view, 0, game.players[0]);
  assert.equal(state.counters.pairWins, 1);
  assert.equal(entry.result, 'win');
  assert.ok(Array.isArray(earned));
  const done = new Set();
  const t = { ...view, state: 'ended', tournament: { status: 'champion', place: 1, of: 8, wins: 3, losses: 0, champion: 'Sam' } };
  const first = Live.tournamentRewards(state, t, 'Sam', done);
  assert.ok(first.champion);
  assert.equal(state.counters.tournamentWins, 1);
  assert.equal(Live.tournamentRewards(state, t, 'Sam', done), null, 'only once');
  assert.equal(Live.tournamentRewards(state, { ...t, state: 'playing', game: 3 }, 'Sam', done), null, 'not before it ends');
});
