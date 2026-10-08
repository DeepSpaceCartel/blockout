// Area Puzzle (like tangrams / pentominoes): a shape on a grid is split into
// spaces, each showing its area. The tray holds rectangles named by their sides
// (3 × 4). Work out each rectangle's area and put it in the space it fills exactly:
// the right area AND the right shape (12 could be 3 × 4 or 2 × 6).

const BOX = { easy: [10, 4], medium: [8, 6], hard: [10, 6] }; // shape's bounding box: columns × rows
const MAX_SIDE = { easy: 5, medium: 6, hard: 6 };
const MAX_AREA = { easy: 20, medium: 24, hard: 30 };
const ROUNDS = 2;
const COLORS = ['#e4572e', '#2a9d5c', '#3a7bd5', '#e0a800', '#9b59b6', '#16a0a0', '#d6336c', '#c77d3a'];

export function mount(stage, ctx) {
  const [W, H] = BOX[ctx.level];
  let round = 0;
  let spaces = [];
  let tray = [];
  let selected = null; // tray index
  let score = 0;
  let mistakes = 0;
  let done = false;

  addStyle();
  const board = document.createElement('div');
  board.className = 'tg-board';
  board.style.setProperty('--w', W);
  board.style.setProperty('--h', H);
  const trayEl = document.createElement('div');
  trayEl.className = 'tg-tray';
  stage.append(board, trayEl);

  // cut a rectangle in two until every piece is small enough (and sometimes a bit more)
  function cut(rect, out) {
    const { w, h } = rect;
    const big = w > MAX_SIDE[ctx.level] || h > MAX_SIDE[ctx.level] || w * h > MAX_AREA[ctx.level];
    const canW = w >= 4; // splitting leaves both halves at least 2 wide
    const canH = h >= 4;
    if ((!big && (w * h <= 6 || ctx.rng() < 0.5)) || (!canW && !canH)) return out.push(rect);
    const alongW = canW && (!canH || w > h || (w === h && ctx.rng() < 0.5));
    if (alongW) {
      const k = ctx.randInt(2, w - 2);
      cut({ ...rect, w: k }, out);
      cut({ ...rect, c: rect.c + k, w: w - k }, out);
    } else {
      const k = ctx.randInt(2, h - 2);
      cut({ ...rect, h: k }, out);
      cut({ ...rect, r: rect.r + k, h: h - k }, out);
    }
    return out;
  }

  function newRound() {
    // best of many cuts: 4–8 pieces, lots of different sizes, sides from the level's
    // tables, and ideally two pieces with the same area but different shapes
    // (so the area alone isn't enough)
    const rate = (rs) => {
      const inTables = rs.filter((q) => ctx.L.tables.includes(q.w) || ctx.L.tables.includes(q.h)).length;
      const dims = new Set(rs.map((q) => `${Math.min(q.w, q.h)}x${Math.max(q.w, q.h)}`));
      const areas = new Set(rs.map((q) => q.w * q.h));
      const twins = dims.size > areas.size ? 3 : 0;
      return dims.size * 3 - rs.length + twins + inTables - (rs.length < 4 || rs.length > 8 ? 20 : 0);
    };
    let rects = null;
    for (let tries = 0; tries < 80; tries++) {
      const rs = cut({ r: 0, c: 0, w: W, h: H }, []);
      if (!rects || rate(rs) > rate(rects)) rects = rs;
    }
    // drop a corner piece now and then so the shape isn't always a plain rectangle
    if (rects.length >= 5 && ctx.rng() < 0.6) {
      const corners = rects.filter((q) => (q.r === 0 || q.r + q.h === H) && (q.c === 0 || q.c + q.w === W));
      const gone = ctx.pick(corners);
      rects = rects.filter((q) => q !== gone);
    }
    spaces = rects.map((q, i) => ({ ...q, area: q.w * q.h, filled: false, color: COLORS[i % COLORS.length] }));
    // tray pieces: sides as a fact, in a random turn (3 × 4 or 4 × 3 fit the same space)
    tray = ctx.shuffle(spaces.map((q) => (ctx.rng() < 0.5 ? { a: q.h, b: q.w } : { a: q.w, b: q.h }))).map((p) => ({ ...p, used: false }));
    selected = null;
    render();
    ctx.hud.info(`Shape ${round + 1} of ${ROUNDS}`);
    ctx.hud.msg('Pick a rectangle, then tap its space');
  }

  function render() {
    board.replaceChildren(
      ...spaces.map((q, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `tg-space${q.filled ? ' filled' : ''}`;
        b.dataset.i = i;
        b.style.gridArea = `${q.r + 1} / ${q.c + 1} / span ${q.h} / span ${q.w}`;
        if (q.filled) b.style.background = q.color;
        b.innerHTML = `<span>${q.filled ? q.label : q.area}</span>`;
        b.setAttribute('aria-label', q.filled ? `Filled, ${q.area}` : `Space of area ${q.area}`);
        return b;
      })
    );
    trayEl.replaceChildren(
      ...tray.map((p, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `btn tg-piece${i === selected ? ' sel' : ''}`;
        b.dataset.i = i;
        b.disabled = p.used;
        b.textContent = `${p.a} × ${p.b}`;
        return b;
      })
    );
  }

  function place(i) {
    const q = spaces[i];
    if (q.filled || done) return;
    if (selected === null) return ctx.hud.msg('First pick a rectangle from the tray');
    const p = tray[selected];
    const area = p.a * p.b;
    const fits = (p.a === q.w && p.b === q.h) || (p.a === q.h && p.b === q.w);
    if (area !== q.area) {
      mistakes++;
      ctx.hud.msg(`${p.a} × ${p.b} = ${area}, not ${q.area}`, 'bad');
      return;
    }
    if (!fits) {
      mistakes++;
      ctx.hud.msg(`${p.a} × ${p.b} = ${area} ✓ but this space is ${q.h} × ${q.w}. Try another space!`, 'bad');
      return;
    }
    q.filled = true;
    q.label = `${p.a} × ${p.b} = ${area}`;
    p.used = true;
    selected = null;
    score += 10;
    ctx.hud.score(score);
    ctx.hud.msg(`${p.a} × ${p.b} = ${area} ✓`, 'good');
    render();
    if (spaces.every((s) => s.filled)) {
      const total = spaces.reduce((s, x) => s + x.area, 0);
      round++;
      ctx.toast('🧩 Shape filled!', `${spaces.map((s) => s.area).join(' + ')} = ${total} squares`);
      if (round < ROUNDS) ctx.after(1200, newRound);
      else {
        done = true;
        ctx.after(1200, () =>
          ctx.finish({ title: 'Every shape filled!', won: true, lines: [`${ROUNDS} shapes, no gaps`, mistakes ? `${mistakes} piece${mistakes > 1 ? 's' : ''} didn't fit the first time` : 'Every piece fit first time!', `Score: ${score}`] })
        );
      }
    }
  }

  ctx.listen(trayEl, 'click', (e) => {
    const b = e.target.closest('.tg-piece');
    if (!b || done) return;
    selected = Number(b.dataset.i) === selected ? null : Number(b.dataset.i);
    if (selected !== null) ctx.hud.msg(`${tray[selected].a} × ${tray[selected].b}: tap the space it fills`);
    render();
  });
  ctx.listen(board, 'click', (e) => {
    const b = e.target.closest('.tg-space');
    if (b) place(Number(b.dataset.i));
  });

  newRound();

  return {
    state: () => ({
      round,
      rounds: ROUNDS,
      spaces: spaces.map(({ r, c, w, h, area, filled }) => ({ r, c, w, h, area, filled })),
      tray: tray.map((p) => ({ ...p })),
      selected,
      score,
      mistakes,
      done,
    }),
  };
}

function addStyle() {
  if (document.getElementById('tangram-style')) return;
  const s = document.createElement('style');
  s.id = 'tangram-style';
  s.textContent = `
    .tg-board { --cell: min(52px, calc((100vw - 48px) / var(--w))); display: grid; grid-template-columns: repeat(var(--w), var(--cell)); grid-template-rows: repeat(var(--h), var(--cell)); gap: 0; }
    .tg-space { margin: 2px; border: 2px dashed var(--edge); border-radius: 8px; cursor: pointer; font: inherit; font-weight: 900; font-size: clamp(1rem, 4vw, 1.4rem); color: var(--ink); padding: 0;
      background-color: var(--soft-2);
      background-image: linear-gradient(var(--board-grid) 1px, transparent 1px), linear-gradient(90deg, var(--board-grid) 1px, transparent 1px);
      background-size: var(--cell) var(--cell); background-position: -4px -4px; } /* 4px = margin + border, so lines sit on the cells */
    .tg-space:hover:not(.filled) { border-color: var(--accent); }
    .tg-space.filled { border: 2px solid var(--edge); color: #fff; cursor: default; background-image: none; font-size: clamp(0.7rem, 2.6vw, 1rem); }
    .tg-space span { background: var(--surface); border-radius: 6px; padding: 0 6px; }
    .tg-space.filled span { background: rgba(0, 0, 0, 0.25); }
    .tg-tray { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; max-width: 560px; }
    .tg-piece { font-size: 1.2rem; font-weight: 900; min-width: 76px; }
    .tg-piece.sel { background: var(--accent); color: var(--accent-ink); }
    .tg-piece:disabled { visibility: hidden; }
  `;
  document.head.append(s);
}
