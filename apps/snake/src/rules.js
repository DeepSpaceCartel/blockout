// Number Snake: the rules, with no drawing or timers, so they can be tested.
// A snake moves one square per tick. Instead of apples there are numbers on the
// board: eat the right one to grow, the wrong one costs a heart.
//
// Three ways to play:
//   answer     a question (6 × 7 = ?); one number on the board is the answer,
//              the others are near misses (6 × 6, 6 × 8, 7 × 7 …)
//   multiples  "eat the multiples of 4": several multiples and some that aren't;
//              eat every multiple to move on to the next table
//   sum        "add it up": eat any number you like; it's added to a running
//              total and the snake waits until you say the new total. Bigger
//              numbers are harder sums and score more. Reach the goal to start again.
//
// Everything random goes through `rng`, so a game can be replayed in tests.

export const LEVELS = {
  // add: the numbers on the board in "add it up", and the total that finishes a round
  easy: { label: 'Easy', sub: '×2, ×5, ×10', tables: [2, 5, 10], upTo: 10, size: 12, add: [1, 9], goal: 30 },
  medium: { label: 'Medium', sub: '×1 to ×6', tables: [1, 2, 3, 4, 5, 6], upTo: 10, size: 14, add: [5, 25], goal: 100 },
  hard: { label: 'Hard', sub: '×1 to ×12', tables: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], upTo: 12, size: 16, add: [11, 99], goal: 500 },
};

// How fast the snake goes, whatever the maths: ms per square at the start,
// a little faster with every right answer (speedUp ms), never faster than fastest.
export const SPEEDS = {
  slow: { label: '🐌 Slow', ms: 450, speedUp: 2, fastest: 350 },
  normal: { label: '🐢 Normal', ms: 320, speedUp: 3, fastest: 220 },
  fast: { label: '🐇 Fast', ms: 220, speedUp: 3, fastest: 140 },
};
export const tickMs = (game, speed) => Math.max(SPEEDS[speed].fastest, SPEEDS[speed].ms - game.eaten * SPEEDS[speed].speedUp);

// What happens at the wall
//   bump     the snake stops and waits for you to turn (no loss)
//   wrap     it comes back in on the other side
//   soft     it stops and you lose a heart
//   classic  game over
export const WALLS = {
  bump: { label: 'Stop', sub: 'wait for a turn' },
  wrap: { label: 'Wrap', sub: 'come out the other side' },
  soft: { label: 'Lose a heart', sub: 'and stop' },
  classic: { label: 'Game over', sub: 'the classic rule' },
};
export const MODES = ['answer', 'multiples', 'sum'];
export const SUM_CHOICES = 4; // numbers on the board in "add it up"
export const HEARTS = 3;
export const POINTS = { right: 10, cleared: 25, goal: 50 }; // a right number; every multiple of a table eaten; a sum round finished
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

const pick = (rng, list) => list[Math.floor(rng() * list.length)];
const key = (x, y) => `${x},${y}`;

export function createGame({ mode = 'answer', level = 'easy', walls = 'bump', rng = Math.random } = {}) {
  const L = LEVELS[level];
  const mid = Math.floor(L.size / 2);
  const game = {
    mode,
    level,
    walls: WALLS[walls] ? walls : 'bump',
    atWall: false, // stopped at a wall, waiting for a turn
    size: L.size,
    rng,
    // head first, moving right
    snake: [
      { x: mid, y: mid },
      { x: mid - 1, y: mid },
      { x: mid - 2, y: mid },
    ],
    dir: 'right',
    queued: [], // turns pressed since the last tick (at most 2 kept)
    grow: 0, // squares still to grow
    hearts: HEARTS,
    score: 0,
    eaten: 0, // right numbers
    missed: [], // { text, answer, ate } for the results
    numbers: [], // { x, y, value, good }
    task: null, // { kind, text, … }
    over: false,
    why: null, // 'wall' | 'self' | 'hearts'
    last: null, // what the last tick did, for the page: { ate, good, fact }
    total: 0, // "add it up": the running total
    asking: null, // "add it up": { before, add, answer } while the snake waits for the new total
  };
  newTask(game);
  return game;
}

// ---------------------------------------------------------------- tasks

function newTask(game) {
  const L = LEVELS[game.level];
  if (game.mode === 'sum') {
    game.task = { kind: 'sum', goal: L.goal, text: `Total: ${game.total}` };
    const values = new Set();
    while (values.size < SUM_CHOICES) values.add(L.add[0] + Math.floor(game.rng() * (L.add[1] - L.add[0] + 1)));
    placeNumbers(game, [...values].map((value) => ({ value, good: true })));
    return;
  }
  if (game.mode === 'answer') {
    const a = pick(game.rng, L.tables);
    const b = 1 + Math.floor(game.rng() * L.upTo);
    const answer = a * b;
    // near misses: the facts next door, all different from the answer
    const wrong = new Set();
    for (const v of [a * (b + 1), a * (b - 1), (a + 1) * b, (a - 1) * b, answer + 1, answer - 1, answer + 10]) {
      if (v > 0 && v !== answer) wrong.add(v);
    }
    const distractors = shuffle(game.rng, [...wrong]).slice(0, 3);
    game.task = { kind: 'answer', a, b, answer, text: `${a} × ${b} = ?` };
    placeNumbers(game, [{ value: answer, good: true }, ...distractors.map((value) => ({ value, good: false }))]);
  } else {
    const table = pick(game.rng, L.tables.filter((t) => t > 1 || L.tables.length === 1));
    const multiples = shuffle(game.rng, range(1, L.upTo).map((n) => n * table)).slice(0, 4);
    const others = new Set();
    while (others.size < 3) {
      const v = 1 + Math.floor(game.rng() * table * L.upTo);
      if (v % table !== 0) others.add(v);
    }
    game.task = { kind: 'multiples', table, left: multiples.length, text: `Eat the multiples of ${table}` };
    placeNumbers(game, [...multiples.map((value) => ({ value, good: true })), ...[...others].map((value) => ({ value, good: false }))]);
  }
}

function range(a, b) {
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}

function shuffle(rng, list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Free squares in random order: not on the snake, another number, or right in
// front of the snake's head. Unless the walls wrap, not along the edges either,
// so a number never lures you into a wall.
function freeSpots(game) {
  const taken = new Set([...game.snake, ...game.numbers].map((s) => key(s.x, s.y)));
  const head = game.snake[0];
  const [dx, dy] = DIRS[game.dir];
  for (let i = 1; i <= 2; i++) taken.add(key(head.x + dx * i, head.y + dy * i));
  const edge = game.walls === 'wrap' ? 0 : 1;
  const free = [];
  for (let y = edge; y < game.size - edge; y++) for (let x = edge; x < game.size - edge; x++) if (!taken.has(key(x, y))) free.push({ x, y });
  return shuffle(game.rng, free);
}

function placeNumbers(game, items) {
  game.numbers = [];
  const spots = freeSpots(game);
  game.numbers = items.slice(0, spots.length).map((item, i) => ({ ...spots[i], ...item }));
}

// ---------------------------------------------------------------- moving

// A turn from the arrows or a swipe; can't reverse straight into yourself.
export function turn(game, dir) {
  if (!DIRS[dir] || game.over) return false;
  const last = game.queued.length ? game.queued[game.queued.length - 1] : game.dir;
  if (dir === last || dir === OPPOSITE[last] || game.queued.length >= 2) return false;
  game.queued.push(dir);
  return true;
}

// How the snake moves: on its own (auto), or one square per arrow press (manual)
export const MOVEMENTS = {
  auto: { label: 'Auto', sub: 'it keeps going' },
  manual: { label: 'Manual', sub: 'one square per press' },
};

// Manual movement: face that way (not straight back) and take one step.
export function step(game, dir) {
  if (game.over || game.asking || !DIRS[dir] || dir === OPPOSITE[game.dir]) return null;
  game.queued = [];
  game.dir = dir;
  return tick(game);
}

// One square forward. Returns game.last.
export function tick(game) {
  if (game.over || game.asking) return null; // "add it up": waiting for the new total
  if (game.queued.length) game.dir = game.queued.shift();
  const [dx, dy] = DIRS[game.dir];
  const head = { x: game.snake[0].x + dx, y: game.snake[0].y + dy };
  game.last = { ate: null, good: null, fact: null };
  if (head.x < 0 || head.y < 0 || head.x >= game.size || head.y >= game.size) {
    if (game.walls === 'wrap') {
      head.x = (head.x + game.size) % game.size;
      head.y = (head.y + game.size) % game.size;
    } else if (game.walls === 'classic') return end(game, 'wall');
    else {
      // stop and wait for a turn; a soft wall costs a heart (once per bump)
      if (!game.atWall && game.walls === 'soft') {
        game.hearts--;
        game.last.hurt = true;
        if (game.hearts <= 0) return end(game, 'hearts');
      }
      game.atWall = true;
      game.last.bump = true;
      return game.last;
    }
  }
  game.atWall = false;
  // the tail moves out of the way this tick unless the snake is growing
  const body = game.grow > 0 ? game.snake : game.snake.slice(0, -1);
  if (body.some((s) => s.x === head.x && s.y === head.y)) return end(game, 'self');
  game.snake.unshift(head);
  if (game.grow > 0) game.grow--;
  else game.snake.pop();

  const n = game.numbers.find((m) => m.x === head.x && m.y === head.y);
  if (n) eat(game, n);
  return game.last;
}

function eat(game, n) {
  const t = game.task;
  game.last.ate = n.value;
  game.last.good = n.good;
  game.numbers = game.numbers.filter((m) => m !== n);
  if (t.kind === 'sum') {
    // stop and ask for the new total (answer() carries on)
    game.asking = { before: game.total, add: n.value, answer: game.total + n.value, text: `${game.total} + ${n.value} = ?` };
    game.last.asking = game.asking;
    game.last.good = null;
    return;
  }
  if (n.good) {
    game.grow += 1;
    game.eaten++;
    game.score += POINTS.right;
    if (t.kind === 'answer') {
      game.last.fact = `${t.a} × ${t.b} = ${t.answer}`;
      newTask(game);
    } else {
      game.last.fact = `${n.value} = ${n.value / t.table} × ${t.table}`;
      t.left--;
      if (t.left === 0) {
        game.score += POINTS.cleared;
        game.last.cleared = t.table;
        newTask(game);
      }
    }
    return;
  }
  // wrong: a heart, and the fact to learn from it
  game.hearts--;
  if (t.kind === 'answer') {
    game.last.fact = `${t.a} × ${t.b} = ${t.answer}, not ${n.value}`;
    game.missed.push({ text: `${t.a} × ${t.b}`, answer: t.answer, ate: n.value });
  } else {
    game.last.fact = `${n.value} isn’t in the ×${t.table} table`;
    game.missed.push({ text: `multiple of ${t.table}`, answer: null, ate: n.value });
  }
  if (game.snake.length > 2) game.snake.pop(); // a wrong number shrinks you too
  if (game.hearts <= 0) end(game, 'hearts');
}

// "Add it up": the player's new total. Right: grow and score the number eaten;
// wrong: a heart (the total still becomes the right one, so the game goes on).
export function answer(game, value) {
  const q = game.asking;
  if (!q || game.over) return null;
  const right = Number(value) === q.answer;
  const L = LEVELS[game.level];
  game.asking = null;
  game.total = q.answer;
  game.last = { ate: q.add, good: right, fact: `${q.before} + ${q.add} = ${q.answer}${right ? '' : `, not ${value}`}`, answered: true };
  if (right) {
    game.grow += 1;
    game.eaten++;
    game.score += q.add;
  } else {
    game.hearts--;
    game.missed.push({ text: `${q.before} + ${q.add}`, answer: q.answer, ate: Number(value) });
    if (game.snake.length > 2) game.snake.pop();
    if (game.hearts <= 0) return end(game, 'hearts');
  }
  if (game.total >= L.goal) {
    game.score += POINTS.goal;
    game.last.goal = L.goal;
    game.total = 0;
  }
  // the other numbers stay where they are; one new one replaces the eaten one
  game.task = { kind: 'sum', goal: L.goal, text: `Total: ${game.total}` };
  const values = new Set(game.numbers.map((m) => m.value));
  let fresh;
  do fresh = L.add[0] + Math.floor(game.rng() * (L.add[1] - L.add[0] + 1));
  while (values.has(fresh) && values.size < L.add[1] - L.add[0] + 1);
  const spot = freeSpots(game)[0];
  if (spot) game.numbers.push({ ...spot, value: fresh, good: true });
  return game.last;
}

function end(game, why) {
  game.over = true;
  game.why = why;
  return game.last;
}
