// Times Cages (like KenKen): fill an n × n grid so every row and column has
// 1..n once, and the numbers in each cage multiply to its clue.
// Puzzles are made fresh: a random Latin square, cut into cages, kept only if
// a small solver finds exactly one solution (so logic alone solves it).

const SIZE = { easy: 3, medium: 4, hard: 5 };
const CAGE = { easy: [1, 2, 2, 3], medium: [1, 2, 2, 3, 3], hard: [2, 2, 3, 3, 4] }; // cage sizes to pick from

export function mount(stage, ctx) {
  const n = SIZE[ctx.level];
  const { solution, cages, cageOf } = makePuzzle(ctx, n);
  const grid = Array.from({ length: n }, () => Array(n).fill(0));
  let sel = [0, 0];
  let mistakes = 0;
  let done = false;
  const judged = new Map(); // cage index -> 'good' | 'bad' (last verdict, so each wrong cage counts once)

  addStyle();
  const board = document.createElement('div');
  board.className = 'kk-board';
  board.style.setProperty('--n', n);
  const cells = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'kk-cell';
      b.dataset.r = r;
      b.dataset.c = c;
      // thick edges where the neighbour is in another cage
      const k = cageOf[r][c];
      const other = (rr, cc) => rr < 0 || cc < 0 || rr >= n || cc >= n || cageOf[rr][cc] !== k;
      const sides = [other(r - 1, c), other(r, c + 1), other(r + 1, c), other(r, c - 1)];
      b.style.borderWidth = sides.map((o) => (o ? '3px' : '1px')).join(' ');
      b.style.borderColor = sides.map((o) => (o ? 'var(--edge)' : 'var(--board-grid)')).join(' ');
      const first = cages[k].cells[0];
      b.innerHTML = `${first[0] === r && first[1] === c ? `<span class="kk-clue">${cages[k].product}${cages[k].cells.length > 1 ? '×' : ''}</span>` : ''}<span class="kk-val"></span>`;
      board.append(b);
      cells.push(b);
    }
  }
  const pad = document.createElement('div');
  pad.className = 'kk-pad';
  for (let v = 1; v <= n; v++) pad.insertAdjacentHTML('beforeend', `<button type="button" class="btn" data-v="${v}">${v}</button>`);
  pad.insertAdjacentHTML('beforeend', '<button type="button" class="btn" data-v="0" aria-label="Clear">⌫</button>');
  stage.append(board, pad);

  const cellEl = (r, c) => cells[r * n + c];
  const product = (cage) => cage.cells.reduce((p, [r, c]) => p * grid[r][c], 1);

  function render() {
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const b = cellEl(r, c);
        b.querySelector('.kk-val').textContent = grid[r][c] || '';
        b.classList.toggle('sel', r === sel[0] && c === sel[1]);
        const v = grid[r][c];
        const dup = v && (grid[r].filter((x) => x === v).length > 1 || grid.filter((row) => row[c] === v).length > 1);
        b.classList.toggle('dup', !!dup);
        const verdict = judged.get(cageOf[r][c]);
        b.classList.toggle('good', verdict === 'good');
        b.classList.toggle('bad', verdict === 'bad');
      }
    }
  }

  function put(v) {
    if (done) return;
    const [r, c] = sel;
    grid[r][c] = v;
    const k = cageOf[r][c];
    const cage = cages[k];
    const full = cage.cells.every(([rr, cc]) => grid[rr][cc]);
    const factText = cage.cells.map(([rr, cc]) => grid[rr][cc]).join(' × ');
    const right = full && product(cage) === cage.product;
    // a full cage gets a verdict; each wrong cage counts as one mistake until it changes
    if (!full) judged.delete(k);
    else if (right) judged.set(k, 'good');
    else {
      if (judged.get(k) !== 'bad') mistakes++;
      judged.set(k, 'bad');
    }
    if (v && grid[r].filter((x) => x === v).length > 1) ctx.hud.msg(`Row ${r + 1} already has a ${v}`, 'bad');
    else if (v && grid.filter((row) => row[c] === v).length > 1) ctx.hud.msg(`Column ${c + 1} already has a ${v}`, 'bad');
    else if (right) ctx.hud.msg(cage.cells.length > 1 ? `${factText} = ${cage.product} ✓` : `${v} ✓`, 'good');
    else if (full && cage.cells.length === 1) ctx.hud.msg(`This square is a ${cage.product}, not ${v}`, 'bad');
    else if (full) ctx.hud.msg(`${factText} = ${product(cage)}, not ${cage.product}`, 'bad');
    else ctx.hud.msg('');
    ctx.hud.score([...judged.values()].filter((x) => x === 'good').length * 10);
    render();
    checkWin();
  }

  function checkWin() {
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (!grid[r][c]) return;
    for (let i = 0; i < n; i++) {
      if (new Set(grid[i]).size < n || new Set(grid.map((row) => row[i])).size < n) return;
    }
    if (!cages.every((cage) => product(cage) === cage.product)) return;
    done = true;
    ctx.hud.msg('Solved! Every cage is right ✓', 'good');
    board.classList.add('solved');
    ctx.after(700, () =>
      ctx.finish({ title: 'Puzzle solved!', won: true, lines: [`${n} × ${n} grid, ${cages.length} cages`, mistakes ? `${mistakes} cage${mistakes > 1 ? 's' : ''} needed a second try` : 'No mistakes. Brilliant!'] })
    );
  }

  ctx.listen(board, 'click', (e) => {
    const b = e.target.closest('.kk-cell');
    if (!b) return;
    sel = [Number(b.dataset.r), Number(b.dataset.c)];
    render();
  });
  ctx.listen(pad, 'click', (e) => {
    const b = e.target.closest('[data-v]');
    if (b) put(Number(b.dataset.v));
  });
  ctx.listen(window, 'keydown', (e) => {
    const moves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (moves[e.key]) {
      sel = [(sel[0] + moves[e.key][0] + n) % n, (sel[1] + moves[e.key][1] + n) % n];
      render();
    } else if (/^[1-9]$/.test(e.key) && Number(e.key) <= n) put(Number(e.key));
    else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') put(0);
    else return;
    e.preventDefault();
  });

  ctx.hud.info(`Each row and column: 1 to ${n}`);
  ctx.hud.msg('Tap a square, then a number');
  render();

  return { state: () => ({ n, solution, cages: cages.map((c) => ({ cells: c.cells, product: c.product })), grid: grid.map((r) => [...r]), sel, mistakes, done }) };
}

// A puzzle with exactly one answer (or the best try if none turns up quickly).
function makePuzzle(ctx, n) {
  let best = null;
  for (let tries = 0; tries < 300; tries++) {
    const solution = latinSquare(ctx, n);
    const { cages, cageOf } = cutCages(ctx, n, solution);
    const count = countSolutions(n, cages, cageOf, 2);
    if (count === 1) return { solution, cages, cageOf };
    best = best || { solution, cages, cageOf };
  }
  return best;
}

// shuffle the rows, columns and symbols of the plain cyclic square
function latinSquare(ctx, n) {
  const rows = ctx.shuffle([...Array(n).keys()]);
  const cols = ctx.shuffle([...Array(n).keys()]);
  const syms = ctx.shuffle([...Array(n).keys()].map((i) => i + 1));
  return rows.map((r) => cols.map((c) => syms[(r + c) % n]));
}

// grow cages from random cells into random unclaimed neighbours
function cutCages(ctx, n, solution) {
  const cageOf = Array.from({ length: n }, () => Array(n).fill(-1));
  const cages = [];
  const order = ctx.shuffle([...Array(n * n).keys()]);
  for (const i of order) {
    let r = Math.floor(i / n);
    let c = i % n;
    if (cageOf[r][c] >= 0) continue;
    const k = cages.length;
    const cells = [[r, c]];
    cageOf[r][c] = k;
    const want = ctx.pick(CAGE[ctx.level]);
    while (cells.length < want) {
      const next = [];
      for (const [cr, cc] of cells) {
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const rr = cr + dr;
          const c2 = cc + dc;
          if (rr >= 0 && c2 >= 0 && rr < n && c2 < n && cageOf[rr][c2] < 0) next.push([rr, c2]);
        }
      }
      if (!next.length) break;
      [r, c] = ctx.pick(next);
      cageOf[r][c] = k;
      cells.push([r, c]);
    }
    cells.sort((a, b) => a[0] - b[0] || a[1] - b[1]); // clue goes in the top-left cell
    cages.push({ cells, product: cells.reduce((p, [rr, cc]) => p * solution[rr][cc], 1) });
  }
  return { cages, cageOf };
}

// backtracking: rows/columns distinct, partial cage products must divide the clue
function countSolutions(n, cages, cageOf, limit) {
  const g = Array.from({ length: n }, () => Array(n).fill(0));
  let count = 0;
  const fits = (r, c, v) => {
    for (let i = 0; i < n; i++) if (g[r][i] === v || g[i][c] === v) return false;
    const cage = cages[cageOf[r][c]];
    let p = v;
    let left = 0;
    for (const [rr, cc] of cage.cells) {
      if (rr === r && cc === c) continue;
      if (g[rr][cc]) p *= g[rr][cc];
      else left++;
    }
    return left ? cage.product % p === 0 : p === cage.product;
  };
  (function step(i) {
    if (count >= limit) return;
    if (i === n * n) return void count++;
    const r = Math.floor(i / n);
    const c = i % n;
    for (let v = 1; v <= n; v++) {
      if (!fits(r, c, v)) continue;
      g[r][c] = v;
      step(i + 1);
      g[r][c] = 0;
    }
  })(0);
  return count;
}

function addStyle() {
  if (document.getElementById('kenken-style')) return;
  const s = document.createElement('style');
  s.id = 'kenken-style';
  s.textContent = `
    .kk-board { display: grid; grid-template-columns: repeat(var(--n), minmax(0, 76px)); width: min(100%, calc(var(--n) * 76px)); border: 2px solid var(--edge); border-radius: 8px; overflow: hidden; background: var(--surface); }
    .kk-cell { position: relative; aspect-ratio: 1; border-style: solid; background: var(--surface); color: var(--ink); font: inherit; cursor: pointer; padding: 0; display: flex; align-items: center; justify-content: center; }
    .kk-cell.sel { background: var(--accent-soft); box-shadow: inset 0 0 0 3px var(--accent); }
    .kk-cell.good { background: var(--good-bg); }
    .kk-cell.bad { background: var(--bad-bg); }
    .kk-cell.sel.good, .kk-cell.sel.bad { box-shadow: inset 0 0 0 3px var(--accent); }
    .kk-clue { position: absolute; top: 3px; left: 5px; font-size: clamp(0.7rem, 2.6vw, 0.85rem); font-weight: 800; color: var(--muted); }
    .kk-val { font-size: clamp(1.4rem, 6vw, 2rem); font-weight: 900; }
    .kk-cell.dup .kk-val { color: var(--bad); }
    .kk-board.solved .kk-cell { background: var(--good-bg); }
    .kk-pad { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
    .kk-pad .btn { min-width: 56px; font-size: 1.4rem; font-weight: 900; }
  `;
  document.head.append(s);
}
