import test from 'node:test';
import assert from 'node:assert';
import * as Rooms from '../src/rooms.js';
import * as Core from '@blockout/engine';

// A class with players who are all "connected".
function classOf(names, settings = {}) {
  const room = Rooms.createRoom(settings, { rng: () => 0.1 });
  const players = names.map((n) => Object.assign(Rooms.join(room, n), { connections: 1 }));
  return { room, players };
}

function placeFor(room, player) {
  const [a, b] = room.roll;
  const [move] = Core.validPlacements(player.board, a, b);
  return { round: room.round, kind: 'placed', rect: { x: move.x, y: move.y, w: move.w, h: move.h }, firstTry: true, ms: 4000 };
}

test('codes are four easy-to-read letters; settings are cleaned', () => {
  const room = Rooms.createRoom({ size: 99, difficulty: 'hard', rounds: 10 });
  assert.match(room.code, /^[A-HJ-NP-Z]{4}$/);
  assert.deepEqual(room.settings, {
    size: 12,
    difficulty: 'hard',
    rounds: 10,
    placeMode: 'choice',
    answerTime: 0,
    autoRoll: false,
    fitRolls: 'end',
    cpuSpeed: 'normal',
    format: 'knockout',
    matchTurns: 0,
    swissRounds: 3,
    kothMatches: 10,
  });
  Rooms.setSettings(room, { placeMode: 'auto', answerTime: 20, autoRoll: true, fitRolls: 'always', cpuSpeed: 'fast' });
  assert.equal(room.settings.placeMode, 'auto');
  assert.equal(room.settings.answerTime, 20);
  assert.equal(room.settings.autoRoll, true);
  Rooms.setSettings(room, { answerTime: 7, placeMode: 'teleport' }); // not allowed: back to the defaults
  assert.equal(room.settings.answerTime, 0);
  assert.equal(room.settings.placeMode, 'choice');
  assert.equal(room.settings.difficulty, 'hard'); // untouched
  assert.equal(room.state, 'lobby');
});

test('names: first names only, no duplicates', () => {
  const { room } = classOf(['Maya']);
  assert.throws(() => Rooms.join(room, 'maya'), { code: 'taken' });
  assert.throws(() => Rooms.join(room, '   '), { code: 'name' });
  assert.throws(() => Rooms.join(room, '<b>hi</b>'), { code: 'name' });
  assert.equal(Rooms.join(room, '  José   María ').name, 'José María');
  assert.equal(Rooms.cleanName('A very long first name'), 'A very long fi');
});

test('everyone gets the same roll; a good answer scores squares plus the bonus', () => {
  const { room, players } = classOf(['Ann', 'Bo']);
  Rooms.start(room);
  assert.equal(room.round, 1);
  const [a, b] = room.roll;
  Rooms.submit(room, players[0], placeFor(room, players[0]));
  // first try (2) + under 5 s (3)
  assert.equal(players[0].score, a * b + 5);
  assert.equal(players[0].done, true);
  assert.equal(Rooms.allDone(room), false);
  assert.throws(() => Rooms.submit(room, players[0], placeFor(room, players[0])), { code: 'done' });
  Rooms.submit(room, players[1], { round: 1, kind: 'timeout' });
  assert.equal(players[1].score, 0);
  assert.equal(Rooms.allDone(room), true);
});

test('the server checks rectangles: right size, on the board, not overlapping', () => {
  const { room, players } = classOf(['Ann']);
  Rooms.start(room);
  const [a, b] = room.roll;
  const p = players[0];
  assert.throws(() => Rooms.submit(room, p, { round: 1, kind: 'placed', rect: { x: 0, y: 0, w: a + 1, h: b } }), { code: 'rect' });
  assert.throws(() => Rooms.submit(room, p, { round: 1, kind: 'placed', rect: { x: 12, y: 0, w: a, h: b } }), { code: 'rect' }); // off the board
  assert.throws(() => Rooms.submit(room, p, { round: 2, kind: 'timeout' }), { code: 'stale' });
  assert.throws(() => Rooms.submit(room, p, { round: 1, kind: 'pass' }), { code: 'fits' });
  Rooms.submit(room, p, { round: 1, kind: 'placed', rect: { x: 0, y: 0, w: b, h: a } }); // either way round
  assert.equal(p.squares, a * b);
});

test('missed rolls, auto-passing when nothing fits, and the end after the last roll', () => {
  const { room, players } = classOf(['Ann', 'Bo'], { rounds: 10 });
  Rooms.start(room);
  Rooms.nextRound(room); // nobody answered roll 1
  assert.equal(players[0].missed, 1);
  // Fill Bo's board so the next roll can't fit
  players[1].board = Core.createBoard(12);
  Core.place(players[1].board, 0, 0, 12, 12, 0);
  Rooms.nextRound(room);
  assert.equal(players[1].done, true);
  assert.equal(players[1].result, 'pass');
  while (room.state === 'playing') Rooms.nextRound(room);
  assert.equal(room.round, 10);
  assert.equal(room.state, 'ended');
});

test('students who dropped off aren’t waited for', () => {
  const { room, players } = classOf(['Ann', 'Bo']);
  Rooms.start(room);
  Rooms.submit(room, players[0], placeFor(room, players[0]));
  players[1].connections = 0;
  assert.equal(Rooms.allDone(room), true);
});

test('leaderboard ranks share ties; the report finds the hardest facts', () => {
  const { room, players } = classOf(['Ann', 'Bo', 'Cy']);
  Rooms.start(room);
  const [a, b] = room.roll;
  Rooms.submit(room, players[0], placeFor(room, players[0]));
  Rooms.submit(room, players[1], placeFor(room, players[1]));
  Rooms.submit(room, players[2], { ...placeFor(room, players[2]), firstTry: false });
  const board = Rooms.leaderboard(room);
  assert.deepEqual(board.map((p) => [p.name, p.rank]), [['Ann', 1], ['Bo', 1], ['Cy', 3]]);
  Rooms.end(room);
  const view = Rooms.teacherView(room);
  assert.deepEqual(view.report.hardest, [{ fact: `${a} × ${b}`, asked: 3, missed: 1 }]);
  assert.equal(view.report.firstTry, 2);
  assert.equal(Rooms.studentView(room, players[0]).you.tied, true); // Ann and Bo have the same score
  const student = Rooms.studentView(room, players[2]);
  assert.equal(student.you.rank, 3);
  assert.equal(student.you.tied, false);
  assert.equal(student.top.length, 3);
  assert.equal(student.you.rects.length, 1);
});

test('back to the lobby clears boards and scores but keeps the class', () => {
  const { room, players } = classOf(['Ann']);
  Rooms.start(room);
  Rooms.submit(room, players[0], placeFor(room, players[0]));
  Rooms.backToLobby(room);
  assert.equal(room.state, 'lobby');
  assert.equal(players[0].score, 0);
  assert.equal(players[0].board.rects.length, 0);
  Rooms.start(room);
  assert.equal(room.game, 2);
});

test('joining mid-game: in the class, but out of this game until the next one', () => {
  const { room, players } = classOf(['Ann']);
  Rooms.start(room);
  const late = Object.assign(Rooms.join(room, 'Zed'), { connections: 1 });
  assert.equal(late.benched, true);
  assert.throws(() => Rooms.submit(room, late, { round: 1, kind: 'timeout' }), { code: 'benched' });
  Rooms.submit(room, players[0], placeFor(room, players[0]));
  assert.equal(Rooms.allDone(room), true); // nobody waits for Zed
  Rooms.nextRound(room);
  assert.equal(late.missed, 0);
  assert.equal(late.done, false); // not dealt this game's rolls
  assert.deepEqual(Rooms.leaderboard(room).map((p) => p.name), ['Ann']);
  assert.deepEqual(Rooms.teacherView(room).waiting.map((p) => p.name), ['Zed']);
  assert.equal(Rooms.studentView(room, late).you.benched, true);
  Rooms.end(room);
  Rooms.backToLobby(room);
  Rooms.start(room);
  assert.equal(late.benched, false);
  assert.equal(Rooms.leaderboard(room).length, 2);
});

test('pairs: joining mid-game waits for the next game', () => {
  const { room } = pairsOf(['Ann', 'Bo']);
  Rooms.start(room);
  const late = Rooms.join(room, 'Zed');
  assert.equal(late.benched, true);
  assert.equal(Rooms.studentView(room, late).match, null);
  Rooms.end(room);
  Rooms.backToLobby(room);
  Rooms.start(room);
  assert.ok(Rooms.matchOf(room, late));
});

// ---------------------------------------------------------------- pairs

function pairsOf(names, opts = {}) {
  const room = Rooms.createRoom({ type: 'pairs' }, { rng: () => 0.3 });
  Rooms.setPairOptions(room, opts);
  const players = names.map((n) => Object.assign(Rooms.join(room, n), { connections: 1 }));
  return { room, players };
}

// Play whoever's turn it is in match m: roll, then place the first spot that fits.
function playTurn(room, m, rng = Math.random) {
  const p = room.players.find((x) => x.id === m.ids[m.current]);
  if (p.isCpu) {
    const r = Rooms.cpuRoll(room, m, rng);
    if (!r.passed) Rooms.cpuPlace(room, m);
    return;
  }
  const { roll, passed } = Rooms.pairRoll(room, p, rng);
  if (passed) return;
  const [move] = Core.validPlacements(m.board, ...roll);
  Rooms.submit(room, p, { round: m.turn, kind: 'placed', rect: { x: move.x, y: move.y, w: move.w, h: move.h }, firstTry: true, ms: 6000 });
}

test('pairs: students are matched in twos, each pair on its own shared board', () => {
  const { room, players } = pairsOf(['Ann', 'Bo', 'Cy', 'Di']);
  assert.equal(room.type, 'pairs');
  Rooms.start(room);
  assert.equal(room.matches.length, 2);
  const ids = room.matches.flatMap((m) => m.ids).sort();
  assert.deepEqual(ids, players.map((p) => p.id).sort());
  for (const p of players) assert.ok(p.match);
});

test('pairs: turns alternate on the shared board; only the current player may roll', () => {
  const { room } = pairsOf(['Ann', 'Bo']);
  Rooms.start(room);
  const m = room.matches[0];
  const [first, second] = m.ids.map((id) => room.players.find((p) => p.id === id));
  assert.throws(() => Rooms.pairRoll(room, second), { code: 'turn' });
  playTurn(room, m);
  assert.equal(m.current, 1);
  assert.equal(m.turn, 2);
  assert.ok(first.score > 0);
  assert.throws(() => Rooms.pairRoll(room, first), { code: 'turn' });
  const { roll } = Rooms.pairRoll(room, second);
  // rolling again just shows the same roll
  assert.deepEqual(Rooms.pairRoll(room, second).roll, roll);
  // a stale answer (last turn's number) is refused
  assert.throws(() => Rooms.submit(room, second, { round: 1, kind: 'timeout' }), { code: 'stale' });
});

test('pairs: a game ends when the board is full or both pass; the room ends when every pair is done', () => {
  const { room } = pairsOf(['Ann', 'Bo', 'Cy', 'Di']);
  Rooms.start(room);
  let guard = 0;
  while (room.state === 'playing' && guard++ < 2000) {
    for (const m of room.matches) if (!m.over) playTurn(room, m);
  }
  assert.equal(room.state, 'ended');
  for (const m of room.matches) {
    assert.equal(m.over, true);
    const [p, q] = m.ids.map((id) => room.players.find((x) => x.id === id));
    assert.equal(m.winner, p.score === q.score ? null : p.score > q.score ? p.id : q.id);
  }
});

test('pairs: an odd one out plays the CPU, which takes its own turns', () => {
  const { room } = pairsOf(['Ann', 'Bo', 'Cy'], { odd: 'cpu' });
  Rooms.start(room);
  const vsCpu = room.matches.find((m) => m.ids.includes('cpu'));
  assert.ok(vsCpu);
  assert.equal(Rooms.students(room).length, 3); // the CPU isn't a student
  let guard = 0;
  while (!vsCpu.over && guard++ < 500) playTurn(room, vsCpu);
  assert.equal(vsCpu.over, true);
  assert.ok(room.players.find((p) => p.isCpu).score > 0);
  assert.equal(Rooms.leaderboard(room).some((p) => p.name === 'CPU'), false);
});

test('pairs: the teacher plays the odd one out on the screen or from another device', () => {
  const { room } = pairsOf(['Ann', 'Bo', 'Cy'], { odd: 'device' });
  assert.deepEqual(Rooms.oddOpponent(room), { needed: true, how: 'device', ready: false });
  assert.throws(() => Rooms.start(room), { code: 'teacher' });
  const t = Rooms.joinTeacher(room);
  t.connections = 1;
  assert.equal(Rooms.joinTeacher(room), t); // joining again is the same player
  Rooms.start(room);
  assert.ok(room.matches.some((m) => m.ids.includes(t.id)));
  // Even numbers: nobody needs the teacher
  const even = pairsOf(['Ann', 'Bo'], { odd: 'device' }).room;
  assert.equal(Rooms.oddOpponent(even).needed, false);
  // Students can't pretend to be the teacher or the CPU
  assert.throws(() => Rooms.join(room, 'Teacher'), { code: 'name' });
  assert.throws(() => Rooms.join(room, 'cpu'), { code: 'name' });
});

test('pairs: matching can shuffle (avoiding last partners), keep, or follow the teacher’s arrangement', () => {
  const { room, players } = pairsOf(['Ann', 'Bo', 'Cy', 'Di'], { matching: 'arrange' });
  const [ann, bo, cy, di] = players.map((p) => p.id);
  assert.deepEqual(Rooms.syncOrder(room), [ann, bo, cy, di]);
  Rooms.swapOrder(room, bo, cy); // Ann + Cy, Bo + Di
  Rooms.start(room);
  const partners = (id) => room.matches.find((m) => m.ids.includes(id)).ids.find((x) => x !== id);
  assert.equal(partners(ann), cy);
  assert.equal(partners(bo), di);
  // keep: the same pairs next game
  Rooms.backToLobby(room);
  Rooms.setPairOptions(room, { matching: 'keep' });
  Rooms.start(room, Math.random);
  assert.equal(partners(ann), cy);
  // shuffle: nobody gets last game's partner when that's possible
  Rooms.backToLobby(room);
  Rooms.setPairOptions(room, { matching: 'shuffle' });
  Rooms.start(room, Math.random);
  assert.notEqual(partners(ann), cy);
  assert.notEqual(partners(bo), di);
});

test('pairs: someone leaving hands their partner the win', () => {
  const { room, players } = pairsOf(['Ann', 'Bo', 'Cy', 'Di']);
  Rooms.start(room);
  const m = Rooms.matchOf(room, players[0]);
  const partner = m.ids.find((id) => id !== players[0].id);
  Rooms.removePlayer(room, players[0].id);
  assert.equal(m.over, true);
  assert.equal(m.winner, partner);
  assert.equal(m.left, players[0].id);
  assert.equal(Rooms.teacherView(room).matches.find((x) => x.id === m.id).players.find((p) => p.id === players[0].id).name, 'Ann');
  assert.equal(room.state, 'playing'); // the other pair is still going
});

test('pairs: views show each student their own match; the teacher sees every match', () => {
  const { room, players } = pairsOf(['Ann', 'Bo', 'Cy']);
  const t = Rooms.joinTeacher(room);
  Rooms.start(room);
  const view = Rooms.studentView(room, players[0]);
  assert.equal(view.type, 'pairs');
  assert.equal(view.match.players.length, 2);
  assert.ok(view.match.players.some((p) => p.id === players[0].id));
  const tv = Rooms.teacherView(room);
  assert.equal(tv.matches.length, 2);
  assert.equal(tv.players.length, 3); // leaderboard: students only
  assert.equal(Rooms.studentView(room, t).match.players.some((p) => p.isTeacher), true);
});

// ---------------------------------------------------------------- tournaments

function tournamentOf(names, settings = {}) {
  const room = Rooms.createRoom({ type: 'tournament', ...settings }, { rng: () => 0.3 });
  const players = names.map((n) => Object.assign(Rooms.join(room, n), { connections: 1 }));
  return { room, players };
}

// Play every running match to the end (stronger = earlier in the list wins more often, not always).
function playAll(room) {
  let guard = 0;
  while (room.state === 'playing' && guard++ < 20000) {
    const live = room.matches.filter((m) => !m.over);
    if (!live.length) {
      if (room.roundReady) Rooms.advanceTournament(room);
      else break;
      continue;
    }
    for (const m of live) playTurn(room, m);
  }
}

test('tournaments: default to short games, and every format plays through to a champion', () => {
  for (const format of ['knockout', 'double', 'roundrobin', 'swiss', 'koth']) {
    const { room } = tournamentOf(['Ann', 'Bo', 'Cy', 'Di', 'Ed'], { format, kothMatches: 6 });
    assert.equal(room.settings.matchTurns, 12);
    Rooms.start(room);
    playAll(room);
    assert.equal(room.state, 'ended', format);
    const view = Rooms.teacherView(room).tournament;
    assert.ok(view.champion, `${format} has a champion`);
    assert.equal(view.standings[0].name, view.champion);
    for (const m of room.matches) assert.ok(m.turn - 1 <= 12, 'games stop after 12 turns');
  }
});

test('tournaments: a tied game still has a winner', () => {
  const { room, players } = tournamentOf(['Ann', 'Bo']);
  Rooms.start(room);
  const m = room.matches[0];
  Rooms.end(room); // both on 0 points: first-try answers tie too, so a coin decides
  assert.ok(m.ids.includes(m.winner));
  assert.equal(m.tiebreak, 'coin');
  assert.equal(Rooms.teacherView(room).tournament.champion, players.find((p) => p.id === m.winner).name);
});

test('tournaments: knocked-out students, byes and walkovers', () => {
  const { room, players } = tournamentOf(['Ann', 'Bo', 'Cy']); // knockout of 3: one bye
  Rooms.start(room);
  assert.equal(room.matches.length, 1);
  const byePlayer = players.find((p) => !room.matches[0].ids.includes(p.id));
  assert.equal(Rooms.studentView(room, byePlayer).tournament.status, 'bye');
  // someone in the match leaves: their opponent goes through
  const leaver = room.players.find((p) => p.id === room.matches[0].ids[0]);
  Rooms.removePlayer(room, leaver.id);
  assert.equal(room.roundReady, true);
  Rooms.advanceTournament(room);
  assert.equal(room.matches.length, 1); // the final
  const final = room.matches[0];
  assert.ok(final.ids.includes(byePlayer.id));
  playAll(room);
  assert.equal(room.state, 'ended');
  const winnerView = Rooms.studentView(room, room.players.find((p) => p.id === final.winner)).tournament;
  assert.equal(winnerView.status, 'champion');
});

// ---------------------------------------------------------------- looks and live play

test('looks: a Wardrobe avatar and title travel with a player; anything else is dropped', () => {
  const room = Rooms.createRoom({ type: 'class' });
  const ann = Rooms.join(room, 'Ann', { avatar: 'fox', title: 'none' });
  const bo = Rooms.join(room, 'Bo', { avatar: '<img src=x>', title: 'hacker' });
  assert.deepEqual(ann.look, { avatar: '🦊', title: '' });
  assert.deepEqual(bo.look, { avatar: '', title: '' }, 'only real Wardrobe ids');
  Rooms.start(room);
  const row = Rooms.teacherView(room).players.find((p) => p.id === ann.id);
  assert.equal(row.avatar, '🦊');
  const t = Rooms.joinTeacher(room, { avatar: 'owl' });
  assert.equal(Rooms.cleanLook({ avatar: 'owl' }).avatar, t.look.avatar);
});

test('pairs: your partner sees your live move (dragging, answering) until the turn moves on', () => {
  const { room, players } = pairsOf(['Ann', 'Bo'], { matching: 'keep' });
  Rooms.start(room);
  const m = Rooms.matchOf(room, players[0]);
  const onTurn = room.players.find((p) => p.id === m.ids[m.current]);
  const partner = room.players.find((p) => p.id === m.ids[1 - m.current]);
  assert.throws(() => Rooms.setLive(room, partner, { phase: 'place', rect: { x: 0, y: 0, w: 2, h: 2 } }), /turn/i, 'only the player on turn');
  assert.throws(() => Rooms.setLive(room, onTurn, { phase: 'place' }), /Roll first/);
  Rooms.pairRoll(room, onTurn, () => 0.5);
  Rooms.setLive(room, onTurn, { phase: 'place', rect: { x: 1, y: 2, w: 3, h: 2 } });
  let seen = Rooms.studentView(room, partner).match.live;
  assert.deepEqual(seen, { by: onTurn.id, phase: 'place', rect: { x: 1, y: 2, w: 3, h: 2 } });
  Rooms.setLive(room, onTurn, { phase: 'place', rect: { x: -1, y: 0, w: 99, h: 1 } });
  assert.equal(Rooms.studentView(room, partner).match.live.rect, null, 'off the board: not shown');
  Rooms.setLive(room, onTurn, { phase: 'answer', rect: { x: 0, y: 0, w: 1, h: 1 } });
  assert.equal(Rooms.studentView(room, partner).match.live.phase, 'answer');
  // the match view carries both players' looks
  assert.ok('avatar' in Rooms.studentView(room, partner).match.players[0]);
  // once the turn is over, nothing is live
  const [a, b] = m.roll;
  let spot = null;
  for (let y = 0; y < m.board.size && !spot; y++) for (let x = 0; x < m.board.size && !spot; x++) if (Core.isValidPlacement(m.board, x, y, a, b)) spot = { x, y, w: a, h: b };
  Rooms.submit(room, onTurn, { round: m.turn, kind: 'placed', rect: spot, firstTry: true, ms: 1000 });
  seen = Rooms.studentView(room, partner).match.live;
  assert.equal(seen, null);
});

test('whole class: students see up to 8 classmates near them, with their boards; the teacher sees every board', () => {
  const room = Rooms.createRoom({ type: 'class' });
  const kids = Array.from({ length: 12 }, (_, i) => Object.assign(Rooms.join(room, `Kid${String.fromCharCode(65 + i)}`), { connections: 1 }));
  Rooms.start(room);
  const [a, b] = room.roll;
  Rooms.submit(room, kids[0], { round: room.round, kind: 'placed', rect: { x: 0, y: 0, w: a, h: b }, firstTry: true, ms: 900 });
  const view = Rooms.studentView(room, kids[5]);
  assert.equal(view.classmates.length, 8);
  assert.ok(!view.classmates.some((c) => c.id === kids[5].id), 'not yourself');
  const t = Rooms.teacherView(room);
  assert.equal(Object.keys(t.boards).length, 12);
  assert.deepEqual(t.boards[kids[0].id], [[0, 0, a, b]]);
  const lead = Rooms.studentView(room, kids[1]).classmates.find((c) => c.id === kids[0].id);
  assert.deepEqual(lead && lead.rects, [[0, 0, a, b]], 'the leader is near the top');
});
