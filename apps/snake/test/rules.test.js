import test from 'node:test';
import assert from 'node:assert';
import * as R from '../src/rules.js';

// a repeatable "random" for tests
function seeded(seed = 1) {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
}

// Steer the head straight to a square (right/left first, then up/down), one tick at a time.
function goTo(game, target) {
  for (let i = 0; i < 100 && !game.over; i++) {
    const h = game.snake[0];
    if (h.x === target.x && h.y === target.y) return;
    const want = h.x < target.x ? 'right' : h.x > target.x ? 'left' : h.y < target.y ? 'down' : 'up';
    const back = { up: 'down', down: 'up', left: 'right', right: 'left' }[game.dir];
    // can't reverse: step sideways first (towards the middle of the board)
    if (want === back) R.turn(game, ['left', 'right'].includes(want) ? (h.y < game.size / 2 ? 'down' : 'up') : h.x < game.size / 2 ? 'right' : 'left');
    else R.turn(game, want);
    R.tick(game);
  }
}

test('answer mode: one right number among near misses, all on free squares', () => {
  for (let seed = 1; seed < 40; seed++) {
    const g = R.createGame({ mode: 'answer', level: 'hard', rng: seeded(seed) });
    const good = g.numbers.filter((n) => n.good);
    assert.equal(good.length, 1);
    assert.equal(good[0].value, g.task.a * g.task.b);
    assert.equal(g.numbers.length, 4);
    assert.equal(new Set(g.numbers.map((n) => n.value)).size, 4, 'no repeats');
    for (const n of g.numbers) {
      assert.ok(n.value > 0);
      assert.ok(!g.snake.some((s) => s.x === n.x && s.y === n.y), 'not on the snake');
    }
  }
});

test('multiples mode: the good ones are multiples, the others are not', () => {
  const g = R.createGame({ mode: 'multiples', level: 'medium', rng: seeded(3) });
  for (const n of g.numbers) assert.equal(n.value % g.task.table === 0, n.good, `${n.value} for ×${g.task.table}`);
  assert.equal(g.task.left, g.numbers.filter((n) => n.good).length);
});

test('eating the right number grows the snake and scores; a new question comes', () => {
  const g = R.createGame({ mode: 'answer', level: 'easy', rng: seeded(7) });
  const before = g.task.text;
  const right = g.numbers.find((n) => n.good);
  // clear the wrong ones out of the way so the path is safe
  g.numbers = [right];
  goTo(g, right);
  assert.equal(g.over, false);
  assert.equal(g.score, R.POINTS.right);
  assert.equal(g.eaten, 1);
  assert.equal(g.last.good, true);
  assert.match(g.last.fact, /=/);
  const len = g.snake.length;
  R.tick(g);
  assert.equal(g.snake.length, len + 1, 'grew by one');
  assert.ok(g.task.text !== before || g.numbers.length === 4);
});

test('a wrong number costs a heart and shows the right fact; three ends the game', () => {
  const g = R.createGame({ mode: 'answer', level: 'easy', rng: seeded(11) });
  for (let i = 0; i < 3; i++) {
    const wrong = g.numbers.find((n) => !n.good);
    // put the wrong number right in front of the head
    const h = g.snake[0];
    const [dx, dy] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[g.dir];
    wrong.x = h.x + dx;
    wrong.y = h.y + dy;
    R.tick(g);
    assert.equal(g.last.good, false);
    assert.match(g.last.fact, /not \d+/);
    assert.equal(g.hearts, R.HEARTS - 1 - i);
  }
  assert.equal(g.over, true);
  assert.equal(g.why, 'hearts');
  assert.equal(g.missed.length, 3);
});

test('classic walls and your own tail end the game; you can’t turn straight back', () => {
  const g = R.createGame({ level: 'easy', walls: 'classic', rng: seeded(2) });
  g.numbers = [];
  assert.equal(R.turn(g, 'left'), false, 'no reversing');
  for (let i = 0; i < 20 && !g.over; i++) R.tick(g);
  assert.equal(g.why, 'wall');

  const s = R.createGame({ level: 'easy', rng: seeded(2) });
  s.numbers = [];
  s.grow = 5;
  for (let i = 0; i < 5; i++) R.tick(s); // long enough to bite itself
  for (const d of ['down', 'left', 'up']) {
    R.turn(s, d);
    R.tick(s);
  }
  assert.equal(s.why, 'self');
});

test('turns are queued: two quick presses both happen, in order', () => {
  const g = R.createGame({ level: 'easy', rng: seeded(5) });
  g.numbers = [];
  assert.equal(R.turn(g, 'up'), true);
  assert.equal(R.turn(g, 'left'), true);
  assert.equal(R.turn(g, 'down'), false, 'only two kept');
  R.tick(g);
  assert.equal(g.dir, 'up');
  R.tick(g);
  assert.equal(g.dir, 'left');
});

test('add it up: any number can be eaten, then the snake waits for the new total', () => {
  const g = R.createGame({ mode: 'sum', level: 'medium', rng: seeded(9) });
  assert.equal(g.numbers.length, R.SUM_CHOICES);
  assert.ok(g.numbers.every((n) => n.good && n.value >= 5 && n.value <= 25));
  const n = g.numbers[0];
  const h = g.snake[0];
  n.x = h.x + 1;
  n.y = h.y;
  R.tick(g);
  assert.deepEqual([g.asking.before, g.asking.add, g.asking.answer], [0, n.value, n.value]);
  const head = { ...g.snake[0] };
  R.tick(g);
  assert.deepEqual(g.snake[0], head, 'the snake waits while you answer');
  const others = g.numbers.map((m) => `${m.x},${m.y},${m.value}`);
  const last = R.answer(g, n.value);
  for (const o of others) assert.ok(g.numbers.some((m) => `${m.x},${m.y},${m.value}` === o), 'the other numbers stay put');
  assert.equal(last.good, true);
  assert.equal(g.total, n.value);
  assert.equal(g.score, n.value, 'the number eaten is the points');
  assert.equal(g.asking, null);
  assert.equal(g.numbers.length, R.SUM_CHOICES, 'a new number replaces it');
  assert.equal(g.task.text, `Total: ${n.value}`);
});

test('add it up: a wrong total costs a heart but the total is still right; the goal pays and restarts', () => {
  const g = R.createGame({ mode: 'sum', level: 'easy', rng: seeded(4) });
  g.total = 25;
  g.asking = { before: 25, add: 7, answer: 32, text: '25 + 7 = ?' };
  const last = R.answer(g, 31);
  assert.equal(last.good, false);
  assert.match(last.fact, /25 \+ 7 = 32, not 31/);
  assert.equal(g.hearts, R.HEARTS - 1);
  assert.equal(last.goal, 30, 'reached the goal of 30');
  assert.equal(g.total, 0, 'a new round starts from 0');
  assert.equal(g.score, R.POINTS.goal);
});

// run straight at the right-hand wall
function toWall(g) {
  g.numbers = [];
  for (let i = 0; i < g.size && !g.atWall && !g.over; i++) R.tick(g);
}

test('bump walls: the snake stops at the wall, loses nothing, and goes on after a turn', () => {
  const g = R.createGame({ level: 'easy', walls: 'bump', rng: seeded(2) });
  toWall(g);
  assert.equal(g.over, false);
  assert.equal(g.atWall, true);
  assert.equal(g.hearts, R.HEARTS);
  const head = { ...g.snake[0] };
  R.tick(g);
  assert.deepEqual(g.snake[0], head, 'waits');
  assert.equal(g.last.bump, true);
  R.turn(g, 'down');
  R.tick(g);
  assert.deepEqual(g.snake[0], { x: head.x, y: head.y + 1 });
  assert.equal(g.atWall, false);
});

test('soft walls cost one heart per bump; wrap walls come back in on the other side', () => {
  const g = R.createGame({ level: 'easy', walls: 'soft', rng: seeded(2) });
  toWall(g);
  R.tick(g);
  R.tick(g);
  assert.equal(g.hearts, R.HEARTS - 1, 'once, not every tick');
  const w = R.createGame({ level: 'easy', walls: 'wrap', rng: seeded(2) });
  w.numbers = [];
  for (let i = 0; i < w.size - Math.floor(w.size / 2) + 1; i++) R.tick(w); // past the right edge
  assert.equal(w.over, false);
  assert.ok(w.snake[0].x < w.size / 2, 'came in on the left');
});

test('numbers stay off the edges (unless the walls wrap); speeds get only a little faster', () => {
  for (let seed = 1; seed < 30; seed++) {
    const g = R.createGame({ mode: 'multiples', level: 'hard', walls: 'bump', rng: seeded(seed) });
    for (const n of g.numbers) assert.ok(n.x > 0 && n.y > 0 && n.x < g.size - 1 && n.y < g.size - 1, `${n.x},${n.y}`);
  }
  const g = R.createGame({ level: 'easy', rng: seeded(1) });
  assert.equal(R.tickMs(g, 'slow'), R.SPEEDS.slow.ms);
  g.eaten = 1000;
  assert.equal(R.tickMs(g, 'slow'), R.SPEEDS.slow.fastest);
  assert.ok(R.SPEEDS.slow.ms > R.SPEEDS.normal.ms && R.SPEEDS.normal.ms > R.SPEEDS.fast.ms);
});

test('manual movement: one square per press, never straight back', () => {
  const g = R.createGame({ level: 'easy', rng: seeded(6) });
  g.numbers = [];
  const h = { ...g.snake[0] };
  R.step(g, 'right');
  assert.deepEqual(g.snake[0], { x: h.x + 1, y: h.y });
  R.step(g, 'down');
  assert.deepEqual(g.snake[0], { x: h.x + 1, y: h.y + 1 });
  assert.equal(R.step(g, 'up'), null, 'no reversing');
  assert.deepEqual(g.snake[0], { x: h.x + 1, y: h.y + 1 });
});
