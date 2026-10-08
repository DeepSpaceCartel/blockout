// Picture Products (like a Nonogram): every row and column clue is a fact, and
// its answer is the length of one block of filled squares. Solve the facts,
// fill the blocks, and a picture appears.
// Blocks of 4 and 6 can be times facts (2 × 3 → 6); the rest are divisions from
// the level's tables (15 ÷ 5 → 3), the other side of a times fact.

const PICTURES = {
  5: [
    { name: 'a heart', color: '#e4572e', rows: ['.X.X.', 'XXXXX', 'XXXXX', '.XXX.', '..X..'] },
    { name: 'a tree', color: '#2a9d5c', rows: ['..X..', '.XXX.', 'XXXXX', '..X..', '.XXX.'] },
    { name: 'a house', color: '#c77d3a', rows: ['..X..', '.XXX.', 'XXXXX', '.XXX.', '.X.X.'] },
    { name: 'an arrow', color: '#3a7bd5', rows: ['..X..', '.XX..', 'XXXXX', '.XX..', '..X..'] },
  ],
  6: [
    { name: 'a cat', color: '#c77d3a', rows: ['X....X', 'XX..XX', 'XXXXXX', 'X.XX.X', 'XXXXXX', '.XXXX.'] },
    { name: 'a boat', color: '#3a7bd5', rows: ['..X...', '..XX..', '..XXX.', '..X...', 'XXXXXX', '.XXXX.'] },
    { name: 'a mushroom', color: '#d64533', rows: ['.XXXX.', 'XXXXXX', 'X.XX.X', '..XX..', '..XX..', '.XXXX.'] },
    { name: 'a smiley', color: '#e0a800', rows: ['.XXXX.', 'X.XX.X', 'XXXXXX', 'X.XX.X', 'XX..XX', '.XXXX.'] },
  ],
};
const SIZE = { easy: 5, medium: 6, hard: 6 };

// the block lengths along one line of 0/1 cells
const runs = (line) => line.join('').split('0').filter(Boolean).map((s) => s.length);
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

export function mount(stage, ctx) {
  const n = SIZE[ctx.level];
  const pic = ctx.pick(PICTURES[n]);
  const solution = pic.rows.map((row) => [...row].map((ch) => (ch === 'X' ? 1 : 0)));
  const grid = solution.map((row) => row.map(() => 0));
  const col = (g, c) => g.map((row) => row[c]);

  // one fact per block: a times fact when the length has one (2 × 3 → 6, always on
  // Easy), otherwise a division from the level's tables (15 ÷ 5 → 3)
  const clueFor = (len) => {
    const pairs = [];
    for (let a = 2; a < len; a++) if (len % a === 0) pairs.push([a, len / a]);
    if (pairs.length && (ctx.level === 'easy' || ctx.rng() < 0.4)) {
      const [a, b] = ctx.pick(pairs);
      return { text: `${a} × ${b}`, answer: len };
    }
    const t = ctx.pick(ctx.L.tables);
    return { text: `${t * len} ÷ ${t}`, answer: len };
  };
  const compact = (f) => `<span>${f.text.replace(/ /g, '')}</span>`; // narrow enough for a phone
  const rowClues = solution.map((row) => runs(row).map(clueFor));
  const colClues = solution[0].map((_, c) => runs(col(solution, c)).map(clueFor));
  const rowOK = Array(n).fill(false);
  const colOK = Array(n).fill(false);
  let score = 0;
  let taps = 0;
  let done = false;

  addStyle();
  const board = document.createElement('div');
  board.className = 'ng-board';
  board.style.setProperty('--n', n);
  board.append(Object.assign(document.createElement('div'), { className: 'ng-corner' }));
  const colEls = colClues.map((clues) => {
    const d = document.createElement('div');
    d.className = 'ng-clue ng-col';
    d.innerHTML = clues.map(compact).join('');
    board.append(d);
    return d;
  });
  const rowEls = [];
  const cells = [];
  for (let r = 0; r < n; r++) {
    const d = document.createElement('div');
    d.className = 'ng-clue ng-row';
    d.innerHTML = rowClues[r].map(compact).join('');
    board.append(d);
    rowEls.push(d);
    for (let c = 0; c < n; c++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ng-cell';
      b.dataset.r = r;
      b.dataset.c = c;
      b.setAttribute('aria-label', `Row ${r + 1}, column ${c + 1}`);
      board.append(b);
      cells.push(b);
    }
  }
  stage.append(board);

  // What's wrong with a line, as a sentence that shows the facts (or null if it's fine so far).
  function advice(name, line, clues) {
    const want = clues.reduce((s, f) => s + f.answer, 0);
    const have = line.reduce((s, x) => s + x, 0);
    const facts = clues.map((f) => `${f.text} = ${f.answer}`).join(', then ');
    if (have > want) return `${name}: ${facts}. That's ${want} square${want > 1 ? 's' : ''}, not ${have}`;
    if (have === want && !same(runs(line), clues.map((f) => f.answer))) {
      return clues.length > 1 ? `${name}: blocks of ${facts}, with gaps between` : `${name}: ${facts}, all in one block`;
    }
    return null;
  }

  function update(r, c) {
    const check = (name, line, clues, ok, i, el) => {
      const now = same(runs(line), clues.map((f) => f.answer));
      if (now && !ok[i]) score += 10;
      ok[i] = now;
      el.classList.toggle('ok', now);
      const tip = now ? null : advice(name, line, clues);
      el.classList.toggle('bad', !!tip);
      return { now, tip };
    };
    const row = check(`Row ${r + 1}`, grid[r], rowClues[r], rowOK, r, rowEls[r]);
    const column = check(`Column ${c + 1}`, col(grid, c), colClues[c], colOK, c, colEls[c]);
    const tip = row.tip || column.tip;
    if (tip) ctx.hud.msg(tip, 'bad');
    else if (row.now || column.now) {
      const clues = row.now ? rowClues[r] : colClues[c];
      ctx.hud.msg(`${row.now ? `Row ${r + 1}` : `Column ${c + 1}`} ✓ ${clues.map((f) => `${f.text} = ${f.answer}`).join(', ')}`, 'good');
    } else ctx.hud.msg('');
    ctx.hud.score(score);
    ctx.hud.info(`${rowOK.filter(Boolean).length + colOK.filter(Boolean).length} of ${2 * n} lines right`);
    if (rowOK.every(Boolean) && colOK.every(Boolean)) win();
  }

  function win() {
    done = true;
    board.classList.add('done');
    board.style.setProperty('--pic', pic.color);
    ctx.hud.msg(`It's ${pic.name}! 🎉`, 'good');
    ctx.after(1400, () => ctx.finish({ title: `You drew ${pic.name}!`, won: true, lines: [`All ${2 * n} clues solved`, `${taps} taps`, `Score: ${score}`] }));
  }

  ctx.listen(board, 'click', (e) => {
    const b = e.target.closest('.ng-cell');
    if (!b || done) return;
    const r = Number(b.dataset.r);
    const c = Number(b.dataset.c);
    grid[r][c] ^= 1;
    taps++;
    b.classList.toggle('on', !!grid[r][c]);
    update(r, c);
  });

  ctx.hud.info(`0 of ${2 * n} lines right`);
  ctx.hud.msg('Solve a clue, then fill that many squares in a block');

  return {
    state: () => ({ n, picture: pic.name, solution, grid: grid.map((r) => [...r]), rowClues, colClues, rowOK: [...rowOK], colOK: [...colOK], score, done }),
  };
}

function addStyle() {
  if (document.getElementById('nonogram-style')) return;
  const s = document.createElement('style');
  s.id = 'nonogram-style';
  s.textContent = `
    .ng-board { --cell: min(56px, calc((100vw - 170px) / var(--n))); display: grid; grid-template-columns: auto repeat(var(--n), var(--cell)); grid-auto-rows: auto; gap: 3px; align-items: stretch; }
    .ng-clue { display: flex; gap: 2px; font-size: clamp(0.66rem, 2.7vw, 0.95rem); font-weight: 800; color: var(--ink); background: var(--soft-2); border-radius: 6px; padding: 3px 4px; border: 2px solid transparent; }
    .ng-clue span { white-space: nowrap; }
    .ng-col { padding: 3px 0; flex-direction: column; justify-content: flex-end; align-items: center; text-align: center; }
    .ng-row { flex-direction: row; justify-content: flex-end; align-items: center; gap: 6px; }
    .ng-clue.ok { background: var(--good-bg); color: var(--good-ink); border-color: var(--good-line); }
    .ng-clue.bad { background: var(--bad-bg); color: var(--bad); border-color: var(--bad); }
    .ng-cell { width: var(--cell); aspect-ratio: 1; border: 2px solid var(--board-grid); border-radius: 6px; background: var(--surface); cursor: pointer; padding: 0; }
    .ng-cell.on { background: var(--ink); border-color: var(--ink); }
    .ng-board.done .ng-cell.on { background: var(--pic); border-color: var(--pic); transition: background 0.6s; }
    .ng-board.done .ng-cell:not(.on) { opacity: 0.35; }
  `;
  document.head.append(s);
}
