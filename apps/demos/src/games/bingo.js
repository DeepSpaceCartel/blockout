// Times Bingo (like Bingo): the caller reads out facts; tap their answers on
// your 5 × 5 card. Any fact called so far can still be marked (forgiving), and
// a wrong tap shows the right fact. Five in a row, column or diagonal: Bingo!

const GAP = { easy: 8000, medium: 7000, hard: 6000 }; // ms between calls
const MAX_CALLS = 45;
const LINES = (() => {
  const out = [];
  for (let i = 0; i < 5; i++) {
    out.push([0, 1, 2, 3, 4].map((j) => i * 5 + j));
    out.push([0, 1, 2, 3, 4].map((j) => j * 5 + i));
  }
  out.push([0, 6, 12, 18, 24], [4, 8, 12, 16, 20]);
  return out;
})();

export function mount(stage, ctx) {
  addStyle();
  // every product in the level's tables, and the facts that make each one
  const byValue = new Map();
  for (const a of ctx.L.tables) {
    for (let b = 1; b <= ctx.L.upTo; b++) {
      const n = a * b;
      if (!byValue.has(n)) byValue.set(n, []);
      byValue.get(n).push([a, b]);
    }
  }
  // prefer facts without a × 1 (5 × 4 rather than 20 × 1) when there is one
  const real = (n) => byValue.get(n).filter(([a, b]) => a > 1 && b > 1);
  const factFor = (n) => {
    const [a, b] = ctx.pick(real(n).length ? real(n) : byValue.get(n));
    return ctx.rng() < 0.5 ? { a, b, answer: n, text: `${a} × ${b}` } : { a: b, b: a, answer: n, text: `${b} × ${a}` };
  };

  // the card: 24 different answers around a free centre (Easy has only 23
  // different products, so a spare square there is free too)
  const all = ctx.shuffle([...byValue.keys()]);
  const values = [...all.filter((n) => real(n).length), ...all.filter((n) => !real(n).length)].slice(0, 24);
  const card = [];
  for (let i = 0; i < 25; i++) {
    if (i === 12) card.push({ value: null, free: true, marked: true });
    else {
      const value = values.shift();
      card.push(value == null ? { value: null, free: true, marked: true } : { value, free: false, marked: false });
    }
  }
  const onCard = new Set(card.filter((c) => !c.free).map((c) => c.value));
  const offCard = [...byValue.keys()].filter((n) => !onCard.has(n));

  const top = document.createElement('div');
  top.className = 'bingo-top';
  top.innerHTML = `<div class="bingo-caller"><small>The caller says</small><strong class="bingo-call">…</strong><span class="bingo-timer"><i></i></span></div><button type="button" class="btn bingo-next">Next call ▸</button>`;
  const grid = document.createElement('div');
  grid.className = 'bingo-card';
  card.forEach((c, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'bingo-cell' + (c.free ? ' free marked' : '');
    b.dataset.i = i;
    b.textContent = c.free ? '★' : c.value;
    b.setAttribute('aria-label', c.free ? 'Free square' : String(c.value));
    grid.append(b);
  });
  const past = document.createElement('div');
  past.className = 'bingo-past';
  stage.append(top, grid, past);

  const calls = []; // every fact called so far (newest last)
  let current = null;
  let score = 0;
  let wrong = 0;
  let over = false;
  let stopTimer = null;
  const called = (n) => calls.some((f) => f.answer === n);

  // mostly numbers that are on the card and not called yet; sometimes one that isn't
  function nextCall() {
    if (over) return;
    if (calls.length >= MAX_CALLS) return end(false);
    const fresh = [...onCard].filter((n) => !called(n));
    const n = offCard.length && (ctx.rng() < 0.2 || !fresh.length) ? ctx.pick(offCard) : ctx.pick(fresh);
    current = factFor(n);
    calls.push(current);
    top.querySelector('.bingo-call').textContent = `${current.text}`;
    top.querySelector('.bingo-caller').classList.remove('pop');
    void top.offsetWidth; // restart the pop animation
    top.querySelector('.bingo-caller').classList.add('pop');
    top.querySelector('.bingo-timer i').style.animationDuration = `${GAP[ctx.level]}ms`;
    past.textContent = calls.length > 1 ? `Called before: ${calls.slice(-6, -1).map((f) => f.text).reverse().join(' · ')}` : '';
    ctx.hud.info(`Call ${calls.length} of ${MAX_CALLS}`);
    if (stopTimer) stopTimer();
    stopTimer = ctx.after(GAP[ctx.level], nextCall);
  }

  function tap(i) {
    const c = card[i];
    if (over || !c || c.marked) return;
    if (called(c.value)) {
      c.marked = true;
      grid.children[i].classList.add('marked');
      const f = calls.findLast((x) => x.answer === c.value);
      score += 10;
      ctx.hud.score(score);
      ctx.hud.msg(`${f.text} = ${c.value} ✓`, 'good');
      if (hasBingo()) end(true);
      return;
    }
    wrong++;
    score = Math.max(0, score - 2);
    ctx.hud.score(score);
    grid.children[i].classList.add('shake');
    ctx.after(400, () => grid.children[i].classList.remove('shake'));
    ctx.hud.msg(current ? `${current.text} = ${current.answer}, not ${c.value}` : `${c.value} hasn't been called yet`, 'bad');
  }

  const hasBingo = () => LINES.some((line) => line.every((k) => card[k].marked));

  function end(won) {
    over = true;
    const line = LINES.find((l) => l.every((k) => card[k].marked));
    if (line) for (const k of line) grid.children[k].classList.add('line');
    ctx.after(won ? 900 : 300, () =>
      ctx.finish({
        title: won ? 'BINGO!' : 'Out of calls',
        won,
        lines: [won ? `Bingo after ${calls.length} calls` : `No line after ${MAX_CALLS} calls`, `Squares marked: ${card.filter((c) => c.marked && !c.free).length}`, `Wrong taps: ${wrong}`, `Score: ${score}`],
      })
    );
  }

  ctx.listen(grid, 'click', (e) => {
    const b = e.target.closest('.bingo-cell');
    if (b) tap(Number(b.dataset.i));
  });
  // the Next button skips the wait (for quick kids)
  ctx.listen(top.querySelector('.bingo-next'), 'click', () => !over && nextCall());
  // arrow keys move between squares (Enter / Space presses the focused square)
  ctx.listen(grid, 'keydown', (e) => {
    const i = Number(e.target.dataset?.i);
    const d = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -5, ArrowDown: 5 }[e.key];
    if (Number.isNaN(i) || !d) return;
    e.preventDefault();
    const j = i + d;
    if (j >= 0 && j < 25 && !(Math.abs(d) === 1 && Math.floor(j / 5) !== Math.floor(i / 5))) grid.children[j].focus();
  });

  ctx.hud.msg('Tap the answer if it’s on your card');
  ctx.hud.score(0);
  ctx.after(1200, nextCall);

  return {
    state: () => ({
      card: card.map((c) => ({ ...c })),
      current: current && { ...current },
      calls: calls.map((f) => f.answer),
      score,
      wrong,
      over,
      bingo: hasBingo(),
    }),
  };
}

function addStyle() {
  if (document.getElementById('bingo-style')) return;
  const s = document.createElement('style');
  s.id = 'bingo-style';
  s.textContent = `
    .bingo-top { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; justify-content: center; }
    .bingo-caller { display: flex; flex-direction: column; align-items: center; min-width: 170px; padding: 8px 18px; border: 2px solid var(--edge); border-radius: 14px; background: var(--gold-bg); color: var(--ink); }
    .bingo-caller small { color: var(--muted); font-weight: 700; }
    .bingo-call { font-size: 2rem; font-weight: 900; }
    .bingo-caller.pop { animation: bingo-pop 0.4s; }
    .bingo-timer { display: block; width: 100%; height: 5px; margin-top: 4px; border-radius: 3px; background: var(--soft-2); overflow: hidden; }
    .bingo-timer i { display: block; height: 100%; background: var(--accent); transform-origin: left; }
    .bingo-caller.pop .bingo-timer i { animation: bingo-timer linear forwards; }
    @keyframes bingo-timer { from { transform: scaleX(1); } to { transform: scaleX(0); } }
    @keyframes bingo-pop { 40% { transform: scale(1.12); } }
    .bingo-card { display: grid; grid-template-columns: repeat(5, minmax(0, 72px)); gap: 6px; width: 100%; justify-content: center; }
    .bingo-cell { aspect-ratio: 1; border: 2px solid var(--edge); border-radius: 10px; background: var(--paper); color: var(--ink); font: inherit; font-size: 1.4rem; font-weight: 900; cursor: pointer; box-shadow: 0 3px 0 var(--edge-shadow); }
    .bingo-cell:hover { border-color: var(--accent); }
    .bingo-cell.marked { background: var(--accent); color: #fff; cursor: default; }
    .bingo-cell.free { background: var(--soft-2); color: var(--ink); }
    .bingo-cell.line { background: var(--good); color: #fff; }
    .bingo-cell.shake { animation: shake 0.35s; border-color: var(--bad); }
    .bingo-past { color: var(--muted); font-weight: 700; text-align: center; min-height: 1.3em; }
  `;
  document.head.append(s);
}
