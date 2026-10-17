import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as H from '../src/hosting.js';

const lobby = (over = {}) => ({ type: 'class', state: 'lobby', settings: { rounds: 15, format: 'knockout' }, players: [], waiting: [], matches: [], pairOptions: { matching: 'shuffle', odd: 'cpu' }, odd: { needed: false, ready: true }, ...over });
const kid = (name, extra = {}) => ({ id: name, name, connected: true, score: 0, rank: 1, ...extra });

test('the lobby: settings for the game type, the Start button, the pairs help', () => {
  const shown = (type, settings = {}) => H.HOST_SETTINGS.filter((d) => H.settingShown(d, lobby({ type, settings: { format: 'knockout', ...settings } }))).map((d) => d.key);
  assert.ok(shown('class').includes('rounds') && !shown('class').includes('format'));
  assert.ok(shown('tournament').includes('format') && !shown('tournament').includes('swissRounds'));
  assert.ok(shown('tournament', { format: 'swiss' }).includes('swissRounds'));
  assert.deepEqual(H.startButton(lobby()), { text: 'Waiting for players to join…', disabled: true });
  assert.deepEqual(H.startButton(lobby({ players: [kid('Sam'), kid('Ana')] })), { text: 'Start game (2 players)', disabled: false });
  assert.equal(H.startButton(lobby({ type: 'tournament', players: [kid('Sam')] })).disabled, true);
  const pairs = lobby({ type: 'pairs', players: [kid('Sam'), kid('Ana'), kid('Lee')], odd: { needed: true, ready: true } });
  assert.equal(H.startButton(pairs).text, 'Start 2 games (3 students)');
  assert.match(H.pairsHelp(pairs), /3 students: the odd one out plays the CPU\.$/);
  assert.equal(H.startButton({ ...pairs, odd: { needed: true, ready: false } }).text, 'Waiting for your other device to join…');
  assert.equal(H.setupSize('tournament', 12), 8);
  assert.equal(H.isQuick(lobby({ settings: { ...H.QUICK_SETTINGS } })), true);
  assert.equal(H.isQuick(lobby({ settings: { placeMode: 'draw' } })), false);
});

test('playing: the round, the Next button, the roster and a pair’s card', () => {
  const v = { ...lobby({ state: 'playing', round: 15, players: [kid('Sam', { done: true, score: 30 }), kid('Ana', { connected: false, rank: 2, score: 12 })] }) };
  assert.equal(H.roundLabel(v), 'Roll 15 of 15');
  assert.deepEqual(H.nextButton(v), { text: 'Finish game', disabled: false, finish: true });
  const r = H.roster(v);
  assert.equal(r.title, 'Leaderboard');
  assert.deepEqual(r.rows.map((x) => [x.rank, x.status]), [['1st', '✓'], ['2nd', '📴']]);
  assert.equal(H.nextButton({ ...v, type: 'pairs' }), null);
  const m = { players: [kid('Sam', { score: 9 }), kid('Ana', { score: 4 })], current: 1, over: false, filled: 0.5 };
  assert.deepEqual(H.matchCard(m).rows.map((x) => x.mark), ['', '🎲']);
  assert.equal(H.matchCard(m).status, 'Board 50% full');
  assert.equal(H.matchCard({ ...m, over: true, winner: 'Sam' }).rows[0].mark, '🏆');
});

test('the end: the podium and the report', () => {
  const v = { ...lobby({ state: 'ended', players: [kid('Sam', { score: 30 }), kid('Ana', { rank: 2, score: 12 })] }) };
  assert.deepEqual(H.podium(v).map((p) => [p.medal, p.score]), [['🥇', '30 pts'], ['🥈', '12 pts']]);
  assert.deepEqual(H.reportTiles({ asked: 20, firstTry: 15, avgMs: 4200 }), [['75%', 'right first time'], ['4.2 s', 'average answer'], ['20', 'facts answered']]);
  assert.equal(H.joinMessage('https://b/#class=ABCD', 'ABCD'), 'Join our Blockout class! Tap this link: https://b/#class=ABCD (class code ABCD)');
});
