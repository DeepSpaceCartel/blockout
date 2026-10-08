// Four in a Row (the classic "Product Game"): the board holds the 36 products
// of 1–9. Two markers sit on a factor strip 1–9. On your turn move ONE marker,
// work out the product of the two markers and tap that square to claim it.
// The CPU does the same. Four in a row (across, down or diagonal) wins.
// The level sets how clever the CPU is and how much help you get.

const N = 6;
const PRODUCTS = [...new Set(Array.from({ length: 81 }, (_, i) => (Math.floor(i / 9) + 1) * ((i % 9) + 1)))].sort((a, b) => a - b); // 36 of them
const LINES = (() => {
  const out = [];
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
        const cells = [0, 1, 2, 3].map((k) => [r + dr * k, c + dc * k]);
        if (cells.every(([rr, cc]) => rr >= 0 && cc >= 0 && rr < N && cc < N)) out.push(cells.map(([rr, cc]) => rr * N + cc));
      }
    }
  }
  return out;
})();

export function mount(stage, ctx) {
  const owner = Array(N * N).fill(null); // 'you' | 'cpu'
  const markers = { a: 0, b: 0 };
  let turn = 'you'; // 'you' (move a marker) | 'find' (tap the product) | 'cpu' | 'over'
  let pending = null; // { a, b, product, tries }
  let score = 0;
  let winner = null;

  // start on an unclaimed pair that isn't a giveaway
  markers.a = ctx.randInt(2, 5);
  markers.b = ctx.randInt(2, 5);

  addStyle();
  const board = document.createElement('div');
  board.className = 'c4-board';
  PRODUCTS.forEach((p, i) => board.insertAdjacentHTML('beforeend', `<button type="button" class="c4-cell" data-i="${i}">${p}</button>`));
  const strips = document.createElement('div');
  strips.className = 'c4-strips';
  const say = document.createElement('div');
  say.className = 'demo-big c4-say';
  strips.append(say);
  for (const m of ['a', 'b']) {
    const row = document.createElement('div');
    row.className = `c4-strip c4-${m}`;
    row.innerHTML = `<span class="c4-label">${m === 'a' ? '▲' : '▼'}</span>` + [1, 2, 3, 4, 5, 6, 7, 8, 9].map((v) => `<button type="button" data-m="${m}" data-v="${v}">${v}</button>`).join('');
    strips.append(row);
  }
  const wrap = document.createElement('div');
  wrap.className = 'demo-row';
  wrap.append(board, strips);
  stage.append(wrap);

  const index = (p) => PRODUCTS.indexOf(p);
  const free = (p) => owner[index(p)] === null;
  const winLine = (who) => LINES.find((l) => l.every((i) => owner[i] === who));
  // all moves from here: move marker a or b to another number, onto an unclaimed product
  const moves = (m = markers) => {
    const out = [];
    for (const k of ['a', 'b']) {
      for (let v = 1; v <= 9; v++) {
        if (v === m[k]) continue;
        const next = { ...m, [k]: v };
        const p = next.a * next.b;
        if (free(p) && !out.some((x) => x.product === p)) out.push({ ...next, product: p });
      }
    }
    return out;
  };

  function render() {
    board.querySelectorAll('.c4-cell').forEach((b, i) => {
      b.className = `c4-cell${owner[i] ? ` ${owner[i]}` : ''}`;
      b.disabled = turn !== 'find' || !!owner[i];
    });
    for (const b of strips.querySelectorAll('button')) {
      const m = b.dataset.m;
      const v = Number(b.dataset.v);
      b.classList.toggle('on', markers[m] === v);
      b.disabled = turn !== 'you';
    }
    say.textContent = { you: 'Your turn: move ▲ or ▼', find: `${pending?.a} × ${pending?.b} = ?`, cpu: 'CPU is thinking…', over: '' }[turn];
    const line = winner && winLine(winner);
    if (line) for (const i of line) board.children[i].classList.add('win');
  }

  function claim(who, p) {
    owner[index(p)] = who;
    if (winLine(who)) return end(who);
    if (!moves().length || owner.every(Boolean)) return end(null);
    turn = who === 'you' ? 'cpu' : 'you';
    render();
    if (turn === 'cpu') ctx.after(900, cpuMove);
  }

  function end(who) {
    winner = who;
    turn = 'over';
    render();
    const title = who === 'you' ? 'Four in a row. You win!' : who === 'cpu' ? 'The CPU got four in a row' : 'No moves left: a draw!';
    ctx.hud.msg(title, who === 'you' ? 'good' : '');
    ctx.after(1500, () => ctx.finish({ title, won: who === 'you', lines: [`You claimed ${owner.filter((o) => o === 'you').length} squares`, `Score: ${score}`] }));
  }

  // your move: a marker to a new number; then find the product on the board
  function moveMarker(m, v) {
    if (turn !== 'you' || markers[m] === v) return;
    const next = { ...markers, [m]: v };
    const p = next.a * next.b;
    if (!free(p)) return ctx.hud.msg(`${next.a} × ${next.b} = ${p} is taken. Try another number`, 'bad');
    Object.assign(markers, next);
    pending = { a: next.a, b: next.b, product: p, tries: 0 };
    turn = 'find';
    ctx.hud.msg(`Find ${next.a} × ${next.b} on the board`);
    render();
  }

  function tapSquare(i) {
    if (turn !== 'find') return;
    const p = PRODUCTS[i];
    const { a, b, product } = pending;
    if (p !== product) {
      pending.tries++;
      ctx.hud.msg(`${a} × ${b} = ${product}, not ${p}`, 'bad');
      // after a slip, point at the right square (straight away on Easy)
      if (ctx.level === 'easy' || pending.tries > 1) board.children[index(product)].classList.add('hint');
      return;
    }
    score += pending.tries ? 5 : 10;
    ctx.hud.score(score);
    ctx.hud.msg(`${a} × ${b} = ${product} ✓`, 'good');
    board.children[i].classList.remove('hint');
    pending = null;
    claim('you', p);
  }

  // CPU: win if it can, and don't hand you a winning move (Easy slips up, Hard picks its best line)
  function cpuMove() {
    if (turn !== 'cpu') return;
    const options = moves();
    const wins = (who, mv) => {
      const i = index(mv.product);
      owner[i] = who;
      const w = !!winLine(who);
      owner[i] = null;
      return w;
    };
    const givesWin = (mv) => {
      const i = index(mv.product);
      owner[i] = 'cpu';
      const bad = moves(mv).some((x) => wins('you', x));
      owner[i] = null;
      return bad;
    };
    const lineScore = (mv) => {
      const i = index(mv.product);
      return LINES.filter((l) => l.includes(i) && !l.some((j) => owner[j] === 'you')).reduce((s, l) => s + 1 + l.filter((j) => owner[j] === 'cpu').length ** 2, 0);
    };
    const easy = ctx.level === 'easy';
    let mv = easy && ctx.rng() < 0.3 ? null : options.find((x) => wins('cpu', x));
    if (!mv) {
      // Easy only looks out for you half the time and then plays anywhere
      const safe = easy && ctx.rng() < 0.5 ? [] : options.filter((x) => !givesWin(x));
      const pool = safe.length ? safe : options;
      pool.sort((x, y) => lineScore(y) - lineScore(x));
      mv = easy ? ctx.pick(pool) : ctx.level === 'hard' || ctx.rng() < 0.6 ? pool[0] : ctx.pick(pool.slice(0, 4));
    }
    markers.a = mv.a;
    markers.b = mv.b;
    ctx.hud.msg(`CPU moved to ${mv.a} × ${mv.b} = ${mv.product}`);
    claim('cpu', mv.product);
  }

  ctx.listen(strips, 'click', (e) => {
    const b = e.target.closest('button[data-m]');
    if (b) moveMarker(b.dataset.m, Number(b.dataset.v));
  });
  ctx.listen(board, 'click', (e) => {
    const b = e.target.closest('.c4-cell');
    if (b) tapSquare(Number(b.dataset.i));
  });

  ctx.hud.info('You 🔴 vs CPU 🔵');
  ctx.hud.msg(`Markers on ${markers.a} and ${markers.b}. Move one!`);
  ctx.hud.score(0);
  render();

  return {
    state: () => ({
      products: PRODUCTS,
      owner: [...owner],
      markers: { ...markers },
      turn,
      pending: pending && { ...pending },
      legal: turn === 'you' ? moves() : [],
      winner,
      score,
    }),
  };
}

function addStyle() {
  if (document.getElementById('connect4-style')) return;
  const s = document.createElement('style');
  s.id = 'connect4-style';
  s.textContent = `
    .c4-board { --cell: min(60px, calc((100vw - 80px) / 6)); display: grid; grid-template-columns: repeat(6, var(--cell)); gap: 4px; padding: 6px; border: 2px solid var(--edge); border-radius: 12px; background: var(--soft-2); }
    .c4-cell { aspect-ratio: 1; border: 2px solid var(--edge); border-radius: 50%; background: var(--surface); color: var(--ink); font: inherit; font-weight: 900; font-size: clamp(0.9rem, 3.6vw, 1.2rem); padding: 0; cursor: pointer; }
    .c4-cell:disabled { cursor: default; opacity: 1; }
    .c4-cell.you { background: #e4572e; color: #fff; }
    .c4-cell.cpu { background: #3a7bd5; color: #fff; }
    .c4-cell.hint { box-shadow: 0 0 0 4px var(--gold-line); }
    .c4-cell.win { outline: 4px solid var(--star); outline-offset: 1px; }
    .c4-strips { display: flex; flex-direction: column; gap: 10px; }
    .c4-strip { display: grid; grid-template-columns: 22px repeat(9, min(38px, calc((100vw - 90px) / 9))); gap: 3px; align-items: center; }
    .c4-say { min-height: 1.4em; }
    .c4-label { font-size: 1.1rem; text-align: center; }
    .c4-strip button { aspect-ratio: 1; border: 2px solid var(--edge); border-radius: 8px; background: var(--surface); color: var(--ink); font: inherit; font-weight: 900; font-size: 1.1rem; padding: 0; cursor: pointer; }
    .c4-strip button:disabled { cursor: default; }
    .c4-a button.on { background: var(--accent); color: #fff; }
    .c4-b button.on { background: var(--ink); color: var(--surface); }
    @media (min-width: 900px) { .c4-strips { align-self: center; } }
  `;
  document.head.append(s);
}
