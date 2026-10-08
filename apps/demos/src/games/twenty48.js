// 2048 ×2 (like 2048): slide the tiles; two equal tiles merge into their
// double. When a move makes a big merge, the child says the double (pick it
// or type it) before the tile shows. Tiles start at 2, 3 or 7 by level, so
// it's doubling practice, not just powers of two.

const N = 4;
const BASE = { easy: 2, medium: 3, hard: 7 };
const DIRS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', a: 'left', d: 'right', w: 'up', s: 'down' };

export function mount(stage, ctx) {
  addStyle();
  const base = BASE[ctx.level];
  const goal = base * 32; // 5 doublings: long enough to practise, short enough for a demo
  const ask = base * 4; // merges this big or bigger ask for the double
  let grid = Array(N * N).fill(0);
  let pending = null; // { at, value, answer, choices, gain }
  let typed = '';
  let score = 0;
  let right = 0;
  let wrong = 0;
  let over = false;

  const head = document.createElement('div');
  head.className = 'demo-big t48-head';
  head.textContent = `Make ${goal}!`;
  const board = document.createElement('div');
  board.className = 't48-board';
  const cells = Array.from({ length: N * N }, () => board.appendChild(document.createElement('div')));
  const askEl = document.createElement('div');
  askEl.className = 't48-ask';
  stage.append(head, board, askEl);

  function spawn() {
    const empty = grid.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
    if (empty.length) grid[ctx.pick(empty)] = ctx.rng() < 0.1 ? base * 2 : base;
  }
  // indexes of each line, read in the direction the tiles slide
  function lines(dir) {
    const out = [];
    for (let a = 0; a < N; a++) {
      const line = [];
      for (let b = 0; b < N; b++) {
        if (dir === 'left') line.push(a * N + b);
        if (dir === 'right') line.push(a * N + (N - 1 - b));
        if (dir === 'up') line.push(b * N + a);
        if (dir === 'down') line.push((N - 1 - b) * N + a);
      }
      out.push(line);
    }
    return out;
  }
  // slide + merge; returns the new grid and the merges ({ at, value: the new tile })
  function slide(dir) {
    const next = Array(N * N).fill(0);
    const merges = [];
    for (const line of lines(dir)) {
      const vals = line.map((i) => grid[i]).filter(Boolean);
      const outVals = [];
      for (let k = 0; k < vals.length; k++) {
        if (vals[k] === vals[k + 1]) {
          outVals.push(vals[k] * 2);
          merges.push({ at: line[outVals.length - 1], value: vals[k] * 2 });
          k++;
        } else outVals.push(vals[k]);
      }
      outVals.forEach((v, k) => (next[line[k]] = v));
    }
    return { next, merges, moved: next.some((v, i) => v !== grid[i]) };
  }
  const canMove = () => Object.values(DIRS).some((d) => slide(d).moved);

  function move(dir) {
    if (over || pending) return;
    const { next, merges, moved } = slide(dir);
    if (!moved) return;
    grid = next;
    const gain = merges.reduce((s, m) => s + m.value, 0);
    const big = merges.reduce((m, x) => (!m || x.value > m.value ? x : m), null);
    if (big && big.value >= ask) {
      const half = big.value / 2;
      const answer = big.value;
      const wrongs = ctx.shuffle([answer + 2, answer - 2, answer + 10, answer - 10, half * 3].filter((v) => v > 0 && v !== answer)).slice(0, 2);
      pending = { at: big.at, half, answer, choices: ctx.shuffle([answer, ...wrongs]), gain };
      typed = '';
      ctx.hud.msg(`Two ${half}s merge: what’s double ${half}?`);
    } else {
      addScore(gain);
      after();
    }
    render();
  }

  function answer(v) {
    if (!pending) return;
    const p = pending;
    pending = null;
    if (v === p.answer) {
      right++;
      addScore(p.gain);
      ctx.hud.msg(`${p.half} + ${p.half} = ${p.answer} ✓`, 'good');
    } else {
      wrong++;
      ctx.hud.msg(`Double ${p.half} is ${p.half} + ${p.half} = ${p.answer}, not ${v}`, 'bad');
    }
    after();
    render();
  }
  const addScore = (n) => ctx.hud.score((score += n));

  // after each finished move: new tile, then check for the goal or a full board
  function after() {
    spawn();
    const best = Math.max(...grid);
    if (best >= goal) return end(true);
    if (!canMove()) end(false);
  }
  function end(won) {
    over = true;
    const best = Math.max(...grid);
    ctx.after(700, () =>
      ctx.finish({
        title: won ? `You made ${goal}!` : 'No more moves',
        won,
        lines: [`Biggest tile: ${best}`, `Doubles right: ${right} of ${right + wrong}`, `Score: ${score}`],
      })
    );
  }

  function render() {
    grid.forEach((v, i) => {
      const c = cells[i];
      const q = pending && pending.at === i;
      c.className = `t48-cell${v ? ' tile' : ''}${q ? ' ask' : ''}`;
      c.textContent = q ? '?' : v || '';
      // colour deepens with every doubling above the base
      const k = v ? Math.min(5, Math.round(Math.log2(v / base))) : 0;
      c.style.setProperty('--k', k);
      c.dataset.k = k;
    });
    if (pending) {
      askEl.innerHTML = `<div class="demo-answer"><span>${pending.half} + ${pending.half} =</span><span class="answer-box">${typed || '?'}</span></div>`;
      ctx.choices(askEl.appendChild(document.createElement('div')), pending.choices, (v) => answer(v));
    } else askEl.innerHTML = '<p class="t48-hint">Slide with ← → ↑ ↓ or swipe the board</p>';
    // (the tile being asked about doesn't count yet: it would give the answer away)
    const shown = grid.filter((v, i) => !(pending && pending.at === i));
    ctx.hud.info(`Best: ${Math.max(...shown)} · goal ${goal}`);
  }

  ctx.listen(window, 'keydown', (e) => {
    if (pending) {
      if (/^\d$/.test(e.key) && typed.length < 4) typed += e.key;
      else if (e.key === 'Backspace') typed = typed.slice(0, -1);
      else if (e.key === 'Enter' && typed) return answer(Number(typed));
      else return;
      e.preventDefault();
      return render();
    }
    const dir = DIRS[e.key];
    if (dir) {
      e.preventDefault();
      move(dir);
    }
  });
  // swipes (touch or mouse drag) on the board
  let start = null;
  ctx.listen(board, 'pointerdown', (e) => {
    start = { x: e.clientX, y: e.clientY };
  });
  ctx.listen(window, 'pointerup', (e) => {
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    start = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
  });

  spawn();
  spawn();
  render();
  ctx.hud.score(0);
  ctx.hud.msg('Arrow keys or swipe to slide');

  return {
    state: () => ({
      grid: [...grid],
      base,
      goal,
      best: Math.max(...grid),
      pending: pending && { half: pending.half, answer: pending.answer, choices: [...pending.choices] },
      score,
      right,
      wrong,
      over,
    }),
  };
}

function addStyle() {
  if (document.getElementById('t48-style')) return;
  const s = document.createElement('style');
  s.id = 't48-style';
  s.textContent = `
    .t48-head { margin: 0; }
    .t48-board { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; width: min(100%, 360px); padding: 8px; border: 2px solid var(--edge); border-radius: 14px; background: var(--soft-2); touch-action: none; user-select: none; -webkit-user-select: none; }
    .t48-cell { aspect-ratio: 1; display: flex; align-items: center; justify-content: center; border-radius: 10px; background: var(--surface); font-weight: 900; font-size: clamp(1.2rem, 6vw, 1.9rem); font-variant-numeric: tabular-nums; }
    .t48-cell.tile { border: 2px solid var(--edge); color: var(--ink); background: color-mix(in srgb, var(--accent) calc(var(--k) * 18%), var(--gold-bg)); }
    .t48-cell.tile[data-k="3"], .t48-cell.tile[data-k="4"], .t48-cell.tile[data-k="5"] { color: #fff; }
    .t48-cell.ask { background: var(--paper); color: var(--accent); outline: 3px solid var(--accent); animation: t48-pulse 0.8s ease-in-out infinite alternate; }
    @keyframes t48-pulse { to { transform: scale(1.06); } }
    .t48-ask { display: flex; flex-direction: column; align-items: center; gap: 8px; }
    .t48-ask { min-height: 110px; }
    .t48-hint { margin: 0; color: var(--muted); font-weight: 700; }
  `;
  document.head.append(s);
}
