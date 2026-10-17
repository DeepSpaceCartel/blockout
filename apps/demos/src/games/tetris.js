// Times Tetris (like Tetris): rectangles fall; when one lands, say its area
// (rows × columns) to lock it in. Wrong: it crumbles away. Full rows clear.
// The falling piece is steered with keys or on-screen buttons; while it waits
// for its area the buttons swap for a number pad (so it fits a phone).

const COLS = 12;
const ROWS = 18;
const CELL = 24;
const W = COLS * CELL;
const H = ROWS * CELL;
const STEP = { easy: 0.9, medium: 0.7, hard: 0.55 }; // seconds per row
const GOAL = { easy: 8, medium: 10, hard: 12 }; // pieces to lock in
const COLORS = ['--accent', '--good', '--gold-line', '--learning', '--star'];

export function mount(stage, ctx) {
  addStyle();
  document.activeElement?.blur?.(); // so Space doesn't press a focused button
  const row = document.createElement('div');
  row.className = 'demo-row tetris-row';
  stage.append(row);
  const { ctx: g } = ctx.canvas(row, W, H);
  const side = document.createElement('div');
  side.className = 'tetris-side';
  row.append(side);

  // move pad (while falling) and number pad (while landed): only one shows
  const moves = document.createElement('div');
  moves.className = 'tetris-moves';
  side.append(moves);
  const held = new Set(); // on-screen buttons held down
  const button = (label, title, onPress, holdKey) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn tetris-btn';
    b.textContent = label;
    b.title = title;
    b.setAttribute('aria-label', title);
    b.tabIndex = -1;
    ctx.listen(b, 'pointerdown', (e) => {
      e.preventDefault();
      if (onPress) onPress();
      if (holdKey) held.add(holdKey);
    });
    for (const t of ['pointerup', 'pointerleave', 'pointercancel']) ctx.listen(b, t, () => holdKey && held.delete(holdKey));
    moves.append(b);
  };
  button('◀', 'Move left', () => move(-1));
  button('⟳', 'Turn', () => rotate());
  button('▶', 'Move right', () => move(1));
  button('▼', 'Drop faster', null, 'down');
  const pad = ctx.keypad(side, { onSubmit: answer });

  const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  let piece = null; // { x, y, w, h, color }
  let phase = 'fall'; // 'fall' | 'answer' | 'crumble' | 'over'
  let acc = 0;
  let score = 0;
  let hearts = 3;
  let locked = 0;
  let cleared = 0;
  let right = 0;
  let wrong = 0;
  let bits = []; // crumbs of a wrong piece
  let colorIx = 0;

  // a rectangle from the level's facts that fits the well: at most 3 rows, area ≤ 24,
  // no thin 1 × n strips except long bars (they help clear rows)
  function newPiece() {
    let a = 2;
    let b = 3;
    for (let i = 0; i < 300; i++) {
      const f = ctx.fact();
      const lo = Math.min(f.a, f.b);
      const hi = Math.max(f.a, f.b);
      if (lo <= 3 && hi <= COLS && f.answer <= 24 && (lo > 1 || hi >= 10)) {
        [a, b] = [lo, hi];
        break;
      }
    }
    const [h, w] = ctx.rng() < 0.3 && b <= 6 ? [b, a] : [a, b];
    return { x: Math.floor((COLS - w) / 2), y: 0, w, h, color: COLORS[colorIx++ % COLORS.length] };
  }
  const fits = (p, x, y, w = p.w, h = p.h) => {
    if (x < 0 || x + w > COLS || y + h > ROWS) return false;
    for (let r = y; r < y + h; r++) for (let c = x; c < x + w; c++) if (r >= 0 && grid[r][c]) return false;
    return true;
  };

  function spawn() {
    piece = newPiece();
    acc = 0;
    if (!fits(piece, piece.x, piece.y)) return end(false, 'The stack reached the top!');
    phase = 'fall';
    showPad(false);
    ctx.hud.info(`Blocks ${locked}/${GOAL[ctx.level]}`);
  }
  function showPad(on) {
    moves.hidden = on;
    pad.el.hidden = !on;
    pad.enable(on);
    pad.clear();
    if (on) pad.prompt(`${piece.h} × ${piece.w} =`);
  }

  function move(dx) {
    if (phase === 'fall' && fits(piece, piece.x + dx, piece.y)) piece.x += dx;
  }
  // turn: swap rows and columns, nudging it back inside the well if needed
  function rotate() {
    if (phase !== 'fall') return;
    const w = piece.h;
    const h = piece.w;
    for (const x of [piece.x, piece.x - 1, piece.x - 2, COLS - w]) {
      if (fits(piece, x, piece.y, w, h)) return Object.assign(piece, { x, w, h });
    }
  }
  function fall() {
    if (fits(piece, piece.x, piece.y + 1)) piece.y++;
    else land();
  }
  function hardDrop() {
    if (phase !== 'fall') return;
    while (fits(piece, piece.x, piece.y + 1)) piece.y++;
    land();
  }
  function land() {
    phase = 'answer';
    showPad(true);
    ctx.hud.msg(`Landed! What is ${piece.h} × ${piece.w}?`);
  }

  function answer(v) {
    if (phase !== 'answer') return;
    const area = piece.w * piece.h;
    if (v === area) {
      right++;
      locked++;
      for (let r = piece.y; r < piece.y + piece.h; r++) for (let c = piece.x; c < piece.x + piece.w; c++) grid[r][c] = piece.color;
      score += area;
      const rows = clearRows();
      if (rows) {
        cleared += rows;
        score += 50 * rows;
        ctx.toast(`🧱 ${rows} row${rows > 1 ? 's' : ''} cleared!`, `+${50 * rows} points`);
      }
      ctx.hud.score(score);
      ctx.hud.msg(`${piece.h} × ${piece.w} = ${area} ✓`, 'good');
      piece = null;
      if (locked >= GOAL[ctx.level]) return end(true, 'You built it!');
      spawn();
    } else {
      wrong++;
      hearts--;
      ctx.hud.hearts(hearts);
      ctx.hud.msg(`${piece.h} × ${piece.w} = ${area}, not ${v}`, 'bad');
      crumble();
    }
  }
  // the wrong piece breaks into falling crumbs, then the next piece comes
  function crumble() {
    phase = 'crumble';
    showPad(false);
    moves.hidden = true;
    bits = [];
    for (let r = 0; r < piece.h; r++) {
      for (let c = 0; c < piece.w; c++) {
        bits.push({ x: (piece.x + c) * CELL, y: (piece.y + r) * CELL, vx: (ctx.rng() - 0.5) * 120, vy: -ctx.rng() * 120, color: piece.color });
      }
    }
    piece = null;
    ctx.after(900, () => {
      bits = [];
      if (hearts <= 0) end(false, 'Out of hearts!');
      else spawn();
    });
  }
  function clearRows() {
    let n = 0;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (grid[r].every(Boolean)) {
        grid.splice(r, 1);
        grid.unshift(Array(COLS).fill(null));
        n++;
        r++; // check the row that moved down into this spot
      }
    }
    return n;
  }
  function end(won, title) {
    phase = 'over';
    draw();
    ctx.finish({ title, won, lines: [`Score: ${score}`, `Blocks locked in: ${locked}`, `Rows cleared: ${cleared}`, `Areas right: ${right}, wrong: ${wrong}`] });
  }

  ctx.listen(window, 'keydown', (e) => {
    const k = e.key;
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(k)) return;
    e.preventDefault();
    if (k === 'ArrowLeft') move(-1);
    else if (k === 'ArrowRight') move(1);
    else if (k === 'ArrowUp') rotate();
    else if (k === ' ') hardDrop();
  });

  ctx.hud.hearts(hearts);
  ctx.hud.score(0);
  ctx.hud.msg('Steer the block, then say its area');
  spawn();

  ctx.loop((dt) => {
    if (phase === 'fall') {
      const fast = ctx.keys.has('ArrowDown') || held.has('down');
      acc += dt;
      const step = fast ? 0.05 : STEP[ctx.level];
      if (acc >= step) {
        acc = 0;
        fall();
      }
    }
    for (const b of bits) {
      b.vy += 900 * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }
    draw();
  });

  function cell(x, y, color) {
    g.fillStyle = ctx.color(color);
    g.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
  }
  function draw() {
    g.fillStyle = ctx.color('--surface');
    g.fillRect(0, 0, W, H);
    // faint grid so the rows and columns can be counted
    g.strokeStyle = ctx.color('--line') || ctx.color('--soft-2');
    g.lineWidth = 1;
    for (let c = 1; c < COLS; c++) g.strokeRect(c * CELL, 0, 0, H);
    for (let r = 1; r < ROWS; r++) g.strokeRect(0, r * CELL, W, 0);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (grid[r][c]) cell(c * CELL, r * CELL, grid[r][c]);
    for (const b of bits) cell(b.x, b.y, b.color);
    if (!piece) return;
    const px = piece.x * CELL;
    const py = piece.y * CELL;
    for (let r = 0; r < piece.h; r++) for (let c = 0; c < piece.w; c++) cell(px + c * CELL, py + r * CELL, piece.color);
    g.strokeStyle = ctx.color('--ink');
    g.lineWidth = phase === 'answer' ? 3 : 2;
    g.strokeRect(px + 1, py + 1, piece.w * CELL - 2, piece.h * CELL - 2);
    // the question on the piece itself when it has room, else just above it
    g.font = '900 16px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const label = phase === 'answer' ? `${piece.h} × ${piece.w} = ?` : `${piece.h} × ${piece.w}`;
    const lw = g.measureText(label).width + 12;
    const ly = piece.h * CELL >= 24 && piece.w * CELL >= lw ? py + (piece.h * CELL) / 2 : Math.max(12, py - 12);
    g.fillStyle = ctx.color('--paper');
    g.fillRect(px + (piece.w * CELL) / 2 - lw / 2, ly - 11, lw, 22);
    g.fillStyle = ctx.color('--ink');
    g.fillText(label, px + (piece.w * CELL) / 2, ly + 1);
  }

  return {
    state: () => ({
      phase,
      piece: piece && { ...piece, area: piece.w * piece.h, question: `${piece.h} × ${piece.w}` },
      answer: piece ? piece.w * piece.h : null,
      grid: grid.map((r) => r.map(Boolean)),
      score,
      hearts,
      locked,
      goal: GOAL[ctx.level],
      cleared,
    }),
  };
}

function addStyle() {
  if (document.getElementById('tetris-style')) return;
  const s = document.createElement('style');
  s.id = 'tetris-style';
  s.textContent = `
    .tetris-row { align-items: center; }
    .tetris-row .demo-canvas { flex: 0 1 ${W}px; min-width: 0; }
    .tetris-side { display: flex; flex-direction: column; align-items: center; gap: 10px; min-width: 200px; }
    .tetris-moves { display: grid; grid-template-columns: repeat(3, 64px); gap: 8px; }
    .tetris-moves[hidden], .tetris-side .demo-keypad[hidden] { display: none; }
    .tetris-btn { font-size: 1.5rem; padding: 10px 0; touch-action: none; user-select: none; }
    .tetris-btn:last-child { grid-column: 1 / -1; }
    /* phones: shrink the well so the number pad fits under it without scrolling */
    @media (max-width: 560px) { .tetris-row .demo-canvas { width: auto; height: clamp(280px, calc(100svh - 450px), ${H}px); } }
  `;
  document.head.append(s);
}
