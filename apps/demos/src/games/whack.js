// Whack-a-Multiple (like Whack-a-Mole): moles pop up carrying numbers; whack
// only the multiples of the number shown. 30 seconds on the clock.
// DOM-based: nine holes in a grid, keys 1–9 whack the matching hole.

const SECONDS = 30;
const PACE = { easy: { every: 1100, stay: 1900 }, medium: { every: 950, stay: 1600 }, hard: { every: 800, stay: 1350 } };

export function mount(stage, ctx) {
  addStyle();
  const pace = PACE[ctx.level];
  // the times table for this round (×1 would make every number a multiple)
  const n = ctx.pick(ctx.L.tables.filter((t) => t > 1));
  const top = n * ctx.L.upTo;

  const head = document.createElement('div');
  head.className = 'demo-big whack-head';
  head.innerHTML = `Whack the multiples of <span class="whack-n">${n}</span>`;
  const grid = document.createElement('div');
  grid.className = 'whack-grid';
  const holes = [];
  for (let i = 0; i < 9; i++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'whack-hole';
    b.dataset.i = i;
    b.innerHTML = `<span class="whack-mole"></span><small class="whack-key">${i + 1}</small>`;
    b.setAttribute('aria-label', `Hole ${i + 1}, empty`);
    grid.append(b);
    holes.push({ el: b, mole: null }); // mole: { value, multiple, until, hit }
  }
  stage.append(head, grid);

  let timeLeft = SECONDS;
  let score = 0;
  let hits = 0;
  let wrong = 0;
  let missed = 0;
  let over = false;
  let quietUntil = 0; // don't let a 'missed' note hide a fresh right/wrong message
  const say = (text, kind) => {
    ctx.hud.msg(text, kind);
    quietUntil = performance.now() + 1500;
  };

  // a number for a mole: about half are multiples, the rest are near them
  function moleValue() {
    if (ctx.rng() < 0.5) return n * ctx.randInt(1, ctx.L.upTo);
    let v;
    do v = ctx.randInt(2, top);
    while (v % n === 0);
    return v;
  }
  const times = (v) => `${n} × ${v / n} = ${v}`;
  // the multiples either side, so a wrong whack still teaches something
  const between = (v) => {
    const lo = Math.floor(v / n);
    return lo < 1 ? `the ×${n} table starts at ${n}` : `${times(lo * n)}, ${times((lo + 1) * n)}`;
  };

  function show(i) {
    const h = holes[i];
    const value = moleValue();
    h.mole = { value, multiple: value % n === 0, until: performance.now() + pace.stay, hit: false };
    h.el.classList.add('up');
    h.el.classList.remove('good', 'bad');
    h.el.querySelector('.whack-mole').textContent = value;
    h.el.setAttribute('aria-label', `Hole ${i + 1}, mole ${value}`);
  }
  function hide(i) {
    const h = holes[i];
    h.mole = null;
    h.el.classList.remove('up');
    h.el.setAttribute('aria-label', `Hole ${i + 1}, empty`);
  }

  function whack(i) {
    const h = holes[i];
    if (over || !h.mole || h.mole.hit) return;
    h.mole.hit = true;
    const v = h.mole.value;
    if (h.mole.multiple) {
      hits++;
      score += 10;
      ctx.hud.score(score);
      say(`${times(v)} ✓`, 'good');
      h.el.classList.add('good');
    } else {
      wrong++;
      say(`${v} isn’t in the ×${n} table (${between(v)})`, 'bad');
      h.el.classList.add('bad');
    }
    // stay a moment so the child sees what happened
    h.mole.until = performance.now() + 450;
  }

  ctx.listen(grid, 'pointerdown', (e) => {
    const b = e.target.closest('.whack-hole');
    if (!b) return;
    e.preventDefault();
    whack(Number(b.dataset.i));
  });
  // keyboard: Enter/Space on a focused hole, or keys 1–9
  ctx.listen(grid, 'click', (e) => {
    const b = e.target.closest('.whack-hole');
    if (b && e.detail === 0) whack(Number(b.dataset.i));
  });
  ctx.listen(window, 'keydown', (e) => {
    if (/^[1-9]$/.test(e.key)) {
      e.preventDefault();
      whack(Number(e.key) - 1);
    }
  });

  // pop a mole into a random empty hole (sometimes two at once when time is short)
  const pop = () => {
    const empty = holes.map((h, i) => (h.mole ? -1 : i)).filter((i) => i >= 0);
    if (empty.length) show(ctx.pick(empty));
  };
  ctx.every(pace.every, () => {
    if (over) return;
    pop();
    if (timeLeft <= 10 && ctx.rng() < 0.4) pop();
  });
  ctx.after(300, pop);

  // moles that time out: a missed multiple is shown, but costs nothing
  ctx.loop(() => {
    const now = performance.now();
    holes.forEach((h, i) => {
      if (!h.mole || now < h.mole.until) return;
      if (h.mole.multiple && !h.mole.hit) {
        missed++;
        if (now > quietUntil) ctx.hud.msg(`Missed one: ${times(h.mole.value)}`, '');
      }
      hide(i);
    });
  });

  const tick = () => ctx.hud.info(`⏱ ${timeLeft}s · multiples of ${n}`);
  tick();
  ctx.every(1000, () => {
    if (over) return;
    timeLeft--;
    tick();
    if (timeLeft > 0) return;
    over = true;
    ctx.after(500, () =>
      ctx.finish({
        title: hits >= 10 ? 'Mole master!' : 'Time’s up!',
        won: hits >= 10,
        lines: [`You whacked ${hits} multiples of ${n}`, `Oops whacks: ${wrong}`, `Multiples that got away: ${missed}`, `Score: ${score}`],
      })
    );
  });
  ctx.hud.msg(`Tap only numbers in the ×${n} table`);

  return {
    state: () => ({
      n,
      timeLeft,
      score,
      hits,
      wrong,
      missed,
      over,
      moles: holes.map((h, i) => (h.mole && !h.mole.hit ? { hole: i, value: h.mole.value, multiple: h.mole.multiple } : null)).filter(Boolean),
    }),
  };
}

function addStyle() {
  if (document.getElementById('whack-style')) return;
  const s = document.createElement('style');
  s.id = 'whack-style';
  s.textContent = `
    .whack-head .whack-n { color: var(--accent); font-size: 2.2rem; }
    .whack-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 150px)); gap: 12px; width: 100%; justify-content: center; }
    .whack-hole { position: relative; aspect-ratio: 1; border: 2px solid var(--edge); border-radius: 50% 50% 16px 16px; background: radial-gradient(ellipse at 50% 78%, var(--edge) 0 34%, var(--soft-2) 35%); cursor: pointer; overflow: hidden; font: inherit; touch-action: manipulation; padding: 0; }
    .whack-mole { position: absolute; left: 18%; right: 18%; bottom: 14%; height: 62%; display: flex; align-items: center; justify-content: center; border-radius: 48% 48% 20% 20%; background: var(--gold-bg); border: 2px solid var(--edge); color: var(--ink); font-weight: 900; font-size: clamp(1.3rem, 6vw, 2rem); transform: translateY(120%); transition: transform 0.12s ease-out; }
    .whack-hole.up .whack-mole { transform: translateY(0); }
    .whack-hole.good .whack-mole { background: var(--good); color: #fff; }
    .whack-hole.bad .whack-mole { background: var(--bad); color: #fff; }
    .whack-key { position: absolute; bottom: 4px; left: 8px; font-weight: 800; color: var(--muted); }
  `;
  document.head.append(s);
}
