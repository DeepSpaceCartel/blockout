// Product Match (like Match-3): pick three touching tiles in a straight line
// whose product is the target. They clear, the tiles above fall down and new
// ones drop in. The target always comes from a line on the board, so there is
// always at least one answer.

const N = 6;
const GOAL = 8; // matches to win
const VALUES = { easy: [1, 2, 3, 5], medium: [1, 2, 3, 4, 5, 6], hard: [1, 2, 3, 4, 5, 6, 7, 8, 9] };
const MAX = { easy: 60, medium: 120, hard: 200 }; // biggest target
const STEPS = [1, N]; // right, down

export function mount(stage, ctx) {
  addStyle();
  const values = VALUES[ctx.level];
  let grid = Array.from({ length: N * N }, () => ctx.pick(values));
  let selected = [];
  let cursor = 0;
  let target = 0;
  let hearts = 3;
  let score = 0;
  let matches = 0;
  let busy = false;
  let keyboard = false; // show the cursor only once the keys are used
  const fresh = new Set(); // tiles that just dropped in (for the animation)

  const head = document.createElement('div');
  head.className = 'm3-head';
  const board = document.createElement('div');
  board.className = 'm3-board';
  board.style.setProperty('--n', N);
  const cells = Array.from({ length: N * N }, (_, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'm3-tile';
    b.dataset.i = i;
    return board.appendChild(b);
  });
  stage.append(head, board);

  const rowOf = (i) => Math.floor(i / N);
  const colOf = (i) => i % N;
  // every straight line of three, as index triples
  const allLines = [];
  for (let i = 0; i < N * N; i++) {
    if (colOf(i) <= N - 3) allLines.push([i, i + 1, i + 2]);
    if (rowOf(i) <= N - 3) allLines.push([i, i + N, i + 2 * N]);
  }
  const product = (line) => line.reduce((p, i) => p * grid[i], 1);
  const solutions = () => allLines.filter((l) => product(l) === target);

  // a new target from a line on the board (so it can always be made);
  // prefer lines without a 1 and with a product that isn't tiny
  function newTarget() {
    const ok = allLines.filter((l) => product(l) <= MAX[ctx.level] && product(l) > 3);
    const good = ok.filter((l) => l.every((i) => grid[i] !== 1));
    target = product(ctx.pick(good.length && ctx.rng() < 0.8 ? good : ok));
    render();
  }

  // is `sel` a straight, touching line (in any order)?
  function isLine(sel) {
    const s = [...sel].sort((a, b) => a - b);
    return STEPS.some((d) => s.every((v, k) => k === 0 || (v - s[k - 1] === d && (d !== 1 || rowOf(v) === rowOf(s[0])))));
  }

  function tap(i) {
    if (busy) return;
    cursor = i;
    if (selected.includes(i)) selected = selected.filter((x) => x !== i);
    else if (!selected.length || isLine([...selected, i])) selected.push(i);
    else selected = [i]; // not touching: start a new line from here
    render();
    if (selected.length === 3) check();
  }

  function check() {
    const line = [...selected].sort((a, b) => a - b);
    const p = product(line);
    const text = line.map((i) => grid[i]).join(' × ');
    if (p === target) {
      matches++;
      score += 10;
      ctx.hud.score(score);
      ctx.hud.msg(`${text} = ${target} ✓`, 'good');
      busy = true;
      for (const i of line) cells[i].classList.add('good');
      ctx.after(450, () => {
        clear(line);
        selected = [];
        busy = false;
        if (matches >= GOAL) return end(true);
        newTarget();
      });
    } else {
      hearts--;
      ctx.hud.hearts(hearts);
      ctx.hud.msg(`${text} = ${p}, not ${target}`, 'bad');
      busy = true;
      for (const i of line) cells[i].classList.add('bad');
      ctx.after(900, () => {
        selected = [];
        busy = false;
        if (hearts <= 0) return end(false);
        render();
      });
    }
  }

  // remove the tiles; the ones above fall down; new ones fill the top
  function clear(line) {
    const gone = new Set(line);
    fresh.clear();
    for (let c = 0; c < N; c++) {
      const col = [];
      for (let r = N - 1; r >= 0; r--) if (!gone.has(r * N + c)) col.push(grid[r * N + c]);
      for (let r = N - 1, k = 0; r >= 0; r--, k++) {
        const i = r * N + c;
        if (k < col.length) grid[i] = col[k];
        else {
          grid[i] = ctx.pick(values);
          fresh.add(i);
        }
      }
    }
  }

  function end(won) {
    busy = true;
    render();
    ctx.after(500, () =>
      ctx.finish({
        title: won ? 'Board master!' : 'Out of hearts!',
        won,
        lines: [`Matches: ${matches} of ${GOAL}`, `Hearts left: ${hearts}`, `Score: ${score}`],
      })
    );
  }

  function render() {
    const sel = selected.map((i) => grid[i]);
    const sofar = sel.length ? `${sel.join(' × ')}${sel.length < 3 ? ' × ?' : ''}` : 'Pick 3 in a row';
    head.innerHTML = `<div class="demo-big">Make <span class="m3-target">${target}</span></div><div class="m3-sofar">${sofar}</div>`;
    cells.forEach((b, i) => {
      b.textContent = grid[i];
      b.className = `m3-tile v${grid[i]}${selected.includes(i) ? ' sel' : ''}${keyboard && i === cursor ? ' cur' : ''}${fresh.has(i) ? ' drop' : ''}`;
      b.setAttribute('aria-pressed', selected.includes(i));
    });
    fresh.clear();
    ctx.hud.info(`Matches ${matches}/${GOAL}`);
  }

  ctx.listen(board, 'click', (e) => {
    const b = e.target.closest('.m3-tile');
    if (b) tap(Number(b.dataset.i));
  });
  // keyboard: arrows move the cursor, Enter/Space pick, Escape clears
  ctx.listen(window, 'keydown', (e) => {
    const r = rowOf(cursor);
    const c = colOf(cursor);
    const moves = { ArrowLeft: [r, c - 1], ArrowRight: [r, c + 1], ArrowUp: [r - 1, c], ArrowDown: [r + 1, c] };
    if (moves[e.key]) {
      keyboard = true;
      const [nr, nc] = moves[e.key];
      if (nr >= 0 && nr < N && nc >= 0 && nc < N) cursor = nr * N + nc;
      render();
    } else if (e.key === 'Enter' || e.key === ' ') {
      tap(cursor); // (preventDefault below stops a focused tile button clicking too)
    } else if (e.key === 'Escape') {
      selected = [];
      render();
    } else return;
    e.preventDefault();
  });

  ctx.hud.hearts(hearts);
  ctx.hud.score(0);
  newTarget();
  ctx.hud.msg('Tap three touching tiles in a line');

  return {
    state: () => ({ size: N, grid: [...grid], target, selected: [...selected], cursor, hearts, score, matches, goal: GOAL, solutions: solutions() }),
  };
}

function addStyle() {
  if (document.getElementById('m3-style')) return;
  const s = document.createElement('style');
  s.id = 'm3-style';
  s.textContent = `
    .m3-head { text-align: center; }
    .m3-head .demo-big { margin: 0; }
    .m3-target { color: var(--accent); font-size: 2.2rem; }
    .m3-sofar { min-height: 1.5em; font-weight: 800; font-size: 1.2rem; color: var(--muted); }
    .m3-board { display: grid; grid-template-columns: repeat(var(--n), 1fr); gap: 6px; width: min(100%, 420px); }
    .m3-tile { aspect-ratio: 1; border: 2px solid var(--edge); border-radius: 12px; font: inherit; font-weight: 900; font-size: clamp(1.3rem, 6vw, 1.8rem); color: var(--ink); background: var(--surface); cursor: pointer; box-shadow: 0 3px 0 var(--edge-shadow); padding: 0; touch-action: manipulation; }
    .m3-tile.v1 { background: var(--soft-2); color: var(--muted); }
    .m3-tile.v2, .m3-tile.v7 { background: var(--gold-bg); }
    .m3-tile.v3, .m3-tile.v8 { background: var(--good-bg); }
    .m3-tile.v4, .m3-tile.v9 { background: var(--accent-soft); }
    .m3-tile.v5 { background: color-mix(in srgb, var(--accent) 22%, var(--surface)); }
    .m3-tile.v6 { background: color-mix(in srgb, var(--good) 22%, var(--surface)); }
    .m3-tile.cur { outline: 3px dashed var(--muted); outline-offset: 1px; }
    .m3-tile.sel { background: var(--accent); color: var(--accent-ink); transform: translateY(-2px); }
    .m3-tile.good { background: var(--good); color: #fff; }
    .m3-tile.bad { background: var(--bad); color: #fff; }
    .m3-tile.drop { animation: m3-drop 0.3s ease-out; }
    @keyframes m3-drop { from { transform: translateY(-40%); opacity: 0; } }
  `;
  document.head.append(s);
}
