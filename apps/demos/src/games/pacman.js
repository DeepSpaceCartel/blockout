// Multiple Muncher (like Pac-Man): a maze of numbered dots. Eat only the
// multiples of the number at the top; wrong dots and ghosts cost a heart.
// Movement is cell to cell (smoothly drawn), with the next turn remembered,
// so it's easy to steer with keys, the on-screen pad or a tap in the maze.

const MAP = [
  '#############',
  '#.....#.....#',
  '#.###.#.###.#',
  '#...........#',
  '#.#.##.##.#.#',
  '#.#.......#.#',
  '#.#.##.##.#.#',
  '#...........#',
  '#.###.#.###.#',
  '#.....#.....#',
  '#############',
];
const ROWS = MAP.length;
const COLS = MAP[0].length;
const CELL = 40;
const TOP = 44; // header band with the number
const W = COLS * CELL;
const H = ROWS * CELL + TOP;
const START = { r: 9, c: 3 };
const GHOSTS = [{ r: 5, c: 5 }, { r: 5, c: 7 }];
const GHOST_COUNT = { easy: 1, medium: 2, hard: 2 };
const SPEED = 3.6; // cells per second
const GHOST_SPEED = { easy: 1.6, medium: 2.1, hard: 2.6 };
const CHASE = { easy: 0.25, medium: 0.4, hard: 0.55 }; // chance a ghost turns towards you
const GOOD = { easy: 8, medium: 10, hard: 10 }; // multiples per maze
const ROUNDS = 2;
const DIRS = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };
const KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };

export function mount(stage, ctx) {
  addStyle();
  document.activeElement?.blur?.();
  const { canvas, ctx: g, point } = ctx.canvas(stage, W, H);
  const open = (r, c) => MAP[r] && MAP[r][c] === '.';

  let target = 0;
  let dots = []; // { r, c, n, good }
  let round = 0;
  let score = 0;
  let hearts = 3;
  let right = 0;
  let wrong = 0;
  let over = false;
  let safe = 0; // seconds the player can't be caught (after a hit)
  let sleep = 0; // seconds before the ghosts move
  const player = { r: START.r, c: START.c, d: null, t: 0, want: null, face: DIRS.right };
  let ghosts = [];

  // a new number, and a maze of its multiples mixed with near misses
  function newRound() {
    round++;
    const prev = target;
    const tables = ctx.L.tables.filter((t) => t !== prev);
    target = ctx.pick(tables.length ? tables : ctx.L.tables);
    const ks = ctx.shuffle(Array.from({ length: ctx.L.upTo }, (_, i) => i + 1)).slice(0, GOOD[ctx.level]);
    const good = ks.map((k) => target * k);
    const bad = new Set();
    for (const m of ctx.shuffle(good)) for (const d of [-1, 1, 2, -2]) if (m + d > 0 && (m + d) % target) bad.add(m + d);
    while (bad.size < good.length) {
      const v = ctx.randInt(1, target * ctx.L.upTo);
      if (v % target) bad.add(v);
    }
    const cells = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (open(r, c) && !(r === START.r && c === START.c) && !GHOSTS.some((s) => s.r === r && s.c === c)) cells.push({ r, c });
      }
    }
    // wrong dots go only where they never wall off part of the maze, so every
    // multiple can be reached without eating a wrong one
    const blocked = new Set();
    const wrongDots = [];
    const spots = ctx.shuffle(cells);
    const tryBlock = (p) => {
      const k = p.r * COLS + p.c;
      blocked.add(k);
      if (connected(blocked)) return true;
      blocked.delete(k);
      return false;
    };
    for (const n of ctx.shuffle([...bad]).slice(0, good.length)) {
      const i = spots.findIndex(tryBlock);
      if (i < 0) break;
      wrongDots.push({ ...spots.splice(i, 1)[0], n, good: false });
    }
    dots = [...good.map((n, i) => ({ ...spots[i], n, good: true })), ...wrongDots];
    ctx.hud.info(`Maze ${round}/${ROUNDS}`);
    reset();
  }
  function reset() {
    Object.assign(player, { r: START.r, c: START.c, d: null, t: 0, want: null });
    ghosts = GHOSTS.slice(0, GHOST_COUNT[ctx.level]).map((s, i) => ({ r: s.r, c: s.c, d: null, t: 0, color: i ? '--good' : '--bad' }));
    sleep = 1.5;
  }
  const left = () => dots.filter((d) => d.good).length;
  // can every open cell not in `blocked` be reached from the start?
  function connected(blocked) {
    const seen = new Set([START.r * COLS + START.c]);
    const todo = [[START.r, START.c]];
    while (todo.length) {
      const [r, c] = todo.pop();
      for (const [dr, dc] of Object.values(DIRS)) {
        const k = (r + dr) * COLS + c + dc;
        if (open(r + dr, c + dc) && !blocked.has(k) && !seen.has(k)) seen.add(k) && todo.push([r + dr, c + dc]);
      }
    }
    let total = 0;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (open(r, c)) total++;
    return seen.size === total - blocked.size;
  }

  function eat() {
    const i = dots.findIndex((d) => d.r === player.r && d.c === player.c);
    if (i < 0) return;
    const dot = dots[i];
    dots.splice(i, 1);
    if (dot.good) {
      right++;
      score += 10;
      ctx.hud.score(score);
      ctx.hud.msg(`${target} × ${dot.n / target} = ${dot.n} ✓`, 'good');
      if (!left()) {
        if (round >= ROUNDS) return end(true, 'Maze munched!');
        score += 25;
        ctx.hud.score(score);
        ctx.toast(`🟡 All the ${target}s eaten!`, '+25 bonus points');
        newRound();
      }
    } else {
      wrong++;
      // the two multiples it sits between, so the mistake teaches something
      const k = Math.floor(dot.n / target);
      const near = k > 0 ? `${target} × ${k} = ${target * k}, ${target} × ${k + 1} = ${target * (k + 1)}` : `${target} × 1 = ${target}`;
      ctx.hud.msg(`${dot.n} is not a multiple of ${target} (${near})`, 'bad');
      hurt();
    }
  }
  function hurt() {
    hearts--;
    ctx.hud.hearts(hearts);
    safe = 1.5;
    if (hearts <= 0) end(false, 'Out of hearts!');
  }
  function end(won, title) {
    over = true;
    draw();
    ctx.finish({ title, won, lines: [`Score: ${score}`, `Multiples eaten: ${right}`, `Wrong dots: ${wrong}`, `Last number: ${target}`] });
  }

  // steering: remember the wanted turn; reverse straight away
  function steer(name) {
    const d = DIRS[name];
    player.want = d;
    if (player.d && player.t > 0 && d[0] === -player.d[0] && d[1] === -player.d[1]) {
      player.r += player.d[0];
      player.c += player.d[1];
      player.d = d;
      player.t = 1 - player.t;
    }
  }
  const choosePlayer = () => {
    const ok = (d) => d && open(player.r + d[0], player.c + d[1]);
    if (ok(player.want)) return player.want;
    return ok(player.d) ? player.d : null;
  };
  function chooseGhost(gh) {
    let opts = Object.values(DIRS).filter((d) => open(gh.r + d[0], gh.c + d[1]));
    const back = gh.d && opts.filter((d) => !(d[0] === -gh.d[0] && d[1] === -gh.d[1]));
    if (back && back.length) opts = back;
    if (ctx.rng() < CHASE[ctx.level]) {
      const dist = (d) => Math.abs(gh.r + d[0] - player.r) + Math.abs(gh.c + d[1] - player.c);
      return opts.reduce((a, b) => (dist(b) < dist(a) ? b : a));
    }
    return ctx.pick(opts);
  }
  // move along; at each cell, `arrive` runs and `choose` picks the next way
  function advance(e, speed, dt, choose, arrive) {
    if (!e.d) e.d = choose(e);
    if (!e.d) return;
    e.t += speed * dt;
    while (e.t >= 1 && !over) {
      e.r += e.d[0];
      e.c += e.d[1];
      e.t -= 1;
      if (arrive) arrive();
      e.d = choose(e);
      if (!e.d) e.t = 0;
    }
  }
  const pos = (e) => ({ x: (e.c + (e.d ? e.d[1] * e.t : 0) + 0.5) * CELL, y: TOP + (e.r + (e.d ? e.d[0] * e.t : 0) + 0.5) * CELL });

  ctx.listen(window, 'keydown', (e) => {
    const name = KEYS[e.key] || KEYS[e.key.toLowerCase?.()];
    if (!name) return;
    e.preventDefault();
    steer(name);
  });
  // a tap in the maze steers towards it (the bigger of across / up-down)
  ctx.listen(canvas, 'pointerdown', (e) => {
    const p = point(e);
    const me = pos(player);
    const dx = p.x - me.x;
    const dy = p.y - me.y;
    steer(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
  });
  const pad = document.createElement('div');
  pad.className = 'pacman-pad';
  for (const [name, label] of [['up', '▲'], ['left', '◀'], ['down', '▼'], ['right', '▶']]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `btn pacman-btn pacman-${name}`;
    b.textContent = label;
    b.setAttribute('aria-label', name);
    b.tabIndex = -1;
    ctx.listen(b, 'pointerdown', (e) => {
      e.preventDefault();
      steer(name);
    });
    pad.append(b);
  }
  stage.append(pad);

  ctx.hud.hearts(hearts);
  ctx.hud.score(0);
  newRound();
  ctx.hud.msg(`Eat the multiples of ${target}!`);

  ctx.loop((dt) => {
    if (over) return;
    safe = Math.max(0, safe - dt);
    advance(player, SPEED, dt, choosePlayer, eat);
    if (player.d) player.face = player.d;
    if (over) return;
    if (sleep > 0) sleep -= dt;
    else for (const gh of ghosts) advance(gh, GHOST_SPEED[ctx.level], dt, chooseGhost);
    // caught: a heart, and everyone back to the start
    const me = pos(player);
    if (!safe && ghosts.some((gh) => Math.hypot(pos(gh).x - me.x, pos(gh).y - me.y) < CELL * 0.7)) {
      ctx.hud.msg('A ghost got you!', 'bad');
      hurt();
      if (over) return;
      reset();
    }
    draw();
  });

  function draw() {
    g.fillStyle = ctx.color('--surface');
    g.fillRect(0, 0, W, H);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = ctx.color('--ink');
    g.font = '900 22px system-ui, sans-serif';
    g.fillText(`Eat the multiples of ${target}  (${left()} left)`, W / 2, TOP / 2 + 2);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (open(r, c)) continue;
        g.fillStyle = ctx.color('--line');
        g.strokeStyle = ctx.color('--edge');
        g.lineWidth = 1;
        g.fillRect(c * CELL + 2, TOP + r * CELL + 2, CELL - 4, CELL - 4);
        g.strokeRect(c * CELL + 2.5, TOP + r * CELL + 2.5, CELL - 5, CELL - 5);
      }
    }
    for (const d of dots) {
      g.font = `800 ${d.n >= 100 ? 12 : 15}px system-ui, sans-serif`; // 3 digits must fit the dot
      const x = (d.c + 0.5) * CELL;
      const y = TOP + (d.r + 0.5) * CELL;
      g.fillStyle = ctx.color('--gold-bg');
      g.strokeStyle = ctx.color('--edge');
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(x, y, 16, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = ctx.color('--ink');
      g.fillText(String(d.n), x, y + 1);
    }
    for (const gh of ghosts) {
      const { x, y } = pos(gh);
      g.fillStyle = ctx.color(gh.color);
      g.globalAlpha = sleep > 0 ? 0.5 : 1;
      g.beginPath();
      g.arc(x, y - 3, 14, Math.PI, 0);
      g.lineTo(x + 14, y + 14);
      for (let i = 1; i <= 4; i++) g.lineTo(x + 14 - i * 7, y + (i % 2 ? 9 : 14));
      g.closePath();
      g.fill();
      g.fillStyle = '#fff';
      for (const ex of [-5, 5]) g.fillRect(x + ex - 2, y - 7, 5, 6);
      g.globalAlpha = 1;
    }
    // the muncher, blinking while it can't be caught
    if (safe && Math.floor(safe * 8) % 2) return;
    const { x, y } = pos(player);
    const a = Math.atan2(player.face[0], player.face[1]);
    const mouth = 0.25 + 0.2 * Math.abs(Math.sin(performance.now() / 90));
    g.fillStyle = ctx.color('--star') || '#f5c518';
    g.beginPath();
    g.moveTo(x, y);
    g.arc(x, y, 15, a + mouth, a + Math.PI * 2 - mouth);
    g.closePath();
    g.fill();
    g.strokeStyle = ctx.color('--edge');
    g.lineWidth = 1.5;
    g.stroke();
  }

  return {
    state: () => ({
      target,
      map: MAP,
      player: { r: player.r, c: player.c, d: player.d, t: player.t, want: player.want, next: player.d ? { r: player.r + player.d[0], c: player.c + player.d[1] } : { r: player.r, c: player.c } },
      ghosts: ghosts.map((gh) => ({ r: gh.r, c: gh.c, d: gh.d })),
      dots: dots.map((d) => ({ ...d })),
      left: left(),
      round,
      rounds: ROUNDS,
      score,
      hearts,
      safe,
    }),
  };
}

function addStyle() {
  if (document.getElementById('pacman-style')) return;
  const s = document.createElement('style');
  s.id = 'pacman-style';
  s.textContent = `
    .pacman-pad { display: grid; grid-template-columns: repeat(3, 64px); grid-template-areas: ". up ." "left down right"; gap: 8px; }
    .pacman-btn { font-size: 1.4rem; padding: 10px 0; touch-action: none; user-select: none; }
    /* the name is long for a phone header: shrink it while this demo is open */
    .pacman-up { grid-area: up; } .pacman-left { grid-area: left; } .pacman-down { grid-area: down; } .pacman-right { grid-area: right; }
  `;
  document.head.append(s);
}
