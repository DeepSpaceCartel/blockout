// Multiplier Bakery (like an idle / clicker game): click the cookie to bake.
// Ovens bake by themselves: ovens × cookies per oven, every second. To buy an
// oven or a better recipe you must say the new per-second total (a real
// times-table fact). Bake the goal to finish.

const GOAL = { easy: 1000, medium: 1000, hard: 1500 };
// cookies per oven, one recipe step at a time (all from the level's tables)
const RECIPES = { easy: [2, 5, 10], medium: [2, 3, 4, 5, 6], hard: [3, 6, 7, 8, 9, 12] };

export function mount(stage, ctx) {
  addStyle();
  const goal = GOAL[ctx.level];
  const recipes = RECIPES[ctx.level];
  const maxOvens = ctx.L.upTo;
  let cookies = 0; // to spend
  let baked = 0; // all-time, for the goal
  let ovens = 0;
  let recipe = 0; // index into recipes
  let asking = null; // { kind, text, answer } while buying
  let right = 0;
  let wrong = 0;
  let clicks = 0;
  let time = 0;
  let done = false;

  const per = () => recipes[recipe];
  const rate = () => ovens * per();
  const ovenCost = () => 10 + 15 * ovens;
  const recipeCost = () => 25 * (recipe + 1) * (recipe + 2);

  const box = document.createElement('div');
  box.className = 'bake';
  box.innerHTML = `
    <div class="bake-left">
      <button type="button" class="bake-cookie" aria-label="Bake a cookie">🍪</button>
      <div class="bake-count"><strong></strong> cookies</div>
      <div class="bake-rate"></div>
      <div class="bake-goal"><i></i></div>
      <small class="bake-goal-text"></small>
    </div>
    <div class="bake-right">
      <button type="button" class="bake-buy" data-kind="oven"></button>
      <button type="button" class="bake-buy" data-kind="recipe"></button>
      <div class="bake-ask" hidden><div class="bake-ask-title"></div><div class="bake-pad"></div><button type="button" class="btn btn-small bake-cancel">Cancel</button></div>
    </div>`;
  stage.append(box);
  const $ = (s) => box.querySelector(s);
  const pad = ctx.keypad($('.bake-pad'), { onSubmit: answer });
  pad.enable(false);

  function render() {
    $('.bake-count strong').textContent = Math.floor(cookies);
    $('.bake-rate').textContent = ovens ? `${ovens} oven${ovens > 1 ? 's' : ''} × ${per()} = ${rate()} per second` : 'No ovens yet: click the cookie!';
    $('.bake-goal i').style.width = `${Math.min(100, (baked / goal) * 100)}%`;
    $('.bake-goal-text').textContent = `Baked ${Math.floor(baked)} of ${goal}`;
    const oven = $('[data-kind="oven"]');
    oven.innerHTML = ovens >= maxOvens ? `🔥 Ovens: ${ovens} <small>(kitchen full)</small>` : `🔥 Buy an oven <small>(you have ${ovens})</small><b>${ovenCost()} 🍪</b>`;
    oven.disabled = Boolean(asking) || ovens >= maxOvens || cookies < ovenCost();
    oven.hidden = Boolean(asking); // the question takes their place while buying
    const rec = $('[data-kind="recipe"]');
    const next = recipes[recipe + 1];
    rec.innerHTML = !next ? `📜 Best recipe: ${per()} per oven` : !ovens ? `📜 Better recipe <small>(buy an oven first)</small>` : `📜 Better recipe <small>${per()} → ${next} per oven</small><b>${recipeCost()} 🍪</b>`;
    rec.disabled = Boolean(asking) || !next || !ovens || cookies < recipeCost();
    rec.hidden = Boolean(asking);
    ctx.hud.score(Math.floor(baked));
    ctx.hud.info(`${rate()} / sec`);
  }

  function bake() {
    if (done) return;
    cookies++;
    baked++;
    clicks++;
    const c = $('.bake-cookie');
    c.classList.remove('pop');
    void c.offsetWidth; // restart the squish animation
    c.classList.add('pop');
    check();
    render();
  }

  // buying asks for the new per-second total: that's the multiplication
  function buy(kind) {
    if (done || asking) return;
    if (kind === 'oven' && (ovens >= maxOvens || cookies < ovenCost())) return;
    if (kind === 'recipe' && (!recipes[recipe + 1] || !ovens || cookies < recipeCost())) return;
    const a = kind === 'oven' ? ovens + 1 : ovens;
    const b = kind === 'oven' ? per() : recipes[recipe + 1];
    asking = { kind, a, b, text: `${a} × ${b}`, answer: a * b };
    $('.bake-ask-title').innerHTML = `${kind === 'oven' ? 'One more oven!' : 'A better recipe!'} With <b>${a}</b> oven${a > 1 ? 's' : ''} baking <b>${b}</b> each, how many cookies a second?`;
    pad.prompt(`${a} × ${b} =`);
    pad.clear();
    pad.enable(true);
    $('.bake-ask').hidden = false;
    render();
  }

  function answer(v) {
    if (!asking) return;
    const q = asking;
    if (v === q.answer) {
      right++;
      if (q.kind === 'oven') {
        cookies -= ovenCost();
        ovens++;
      } else {
        cookies -= recipeCost();
        recipe++;
      }
      ctx.hud.msg(`${q.text} = ${q.answer} ✓ Now ${q.answer} cookies a second!`, 'good');
    } else {
      wrong++;
      ctx.hud.msg(`${q.text} = ${q.answer}, not ${v}. Try buying again!`, 'bad');
    }
    close();
  }

  function close() {
    asking = null;
    pad.enable(false);
    $('.bake-ask').hidden = true;
    render();
  }

  function check() {
    if (done || baked < goal) return;
    done = true;
    close();
    ctx.after(500, () =>
      ctx.finish({
        title: `${goal} cookies baked! 🍪`,
        won: true,
        lines: [`Time: ${Math.round(time)} seconds`, `Final bakery: ${ovens} ovens × ${per()} = ${rate()} per second`, `Upgrades answered right: ${right}, wrong: ${wrong}`, `Cookies clicked: ${clicks}`],
      })
    );
  }

  ctx.listen($('.bake-cookie'), 'click', bake);
  ctx.listen(box, 'click', (e) => {
    const b = e.target.closest('.bake-buy');
    if (b) buy(b.dataset.kind);
  });
  ctx.listen($('.bake-cancel'), 'click', close);
  // keys: Space or C bakes, O buys an oven, R a recipe, Esc cancels
  ctx.listen(window, 'keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'escape' && asking) close();
    else if (asking) return;
    else if (k === ' ' && e.target.closest('button')) return; // a focused button handles its own Space
    else if ((k === ' ' || k === 'c') && !e.repeat) bake();
    else if (k === 'o') buy('oven');
    else if (k === 'r') buy('recipe');
    else return;
    e.preventDefault();
  });

  let last = -1;
  ctx.loop((dt) => {
    if (done) return;
    time += dt;
    cookies += rate() * dt;
    baked += rate() * dt;
    check();
    // redraw a few times a second, not every frame (the buttons are DOM)
    if (Math.floor(time * 5) !== last) {
      last = Math.floor(time * 5);
      render();
    }
  });

  ctx.hud.msg('Click the cookie! Space works too');
  render();

  return {
    state: () => ({
      cookies: Math.floor(cookies),
      baked: Math.floor(baked),
      goal,
      ovens,
      perOven: per(),
      rate: rate(),
      ovenCost: ovenCost(),
      recipeCost: recipes[recipe + 1] ? recipeCost() : null,
      nextPer: recipes[recipe + 1] || null,
      asking: asking && { ...asking },
      right,
      wrong,
      done,
    }),
  };
}

function addStyle() {
  if (document.getElementById('clicker-style')) return;
  const s = document.createElement('style');
  s.id = 'clicker-style';
  s.textContent = `
    .bake { display: flex; flex-wrap: wrap; gap: 20px; justify-content: center; align-items: flex-start; width: 100%; }
    .bake-left, .bake-right { display: flex; flex-direction: column; align-items: center; gap: 8px; width: min(100%, 340px); }
    .bake-cookie { width: 180px; height: 180px; border-radius: 50%; border: 3px solid var(--edge); background: var(--gold-bg); font-size: 110px; line-height: 1; cursor: pointer; box-shadow: 0 6px 0 var(--edge-shadow); user-select: none; touch-action: manipulation; }
    .bake-cookie:active { transform: translateY(3px); box-shadow: 0 3px 0 var(--edge-shadow); }
    .bake-cookie.pop { animation: bake-pop 0.15s; }
    @keyframes bake-pop { 50% { transform: scale(0.94); } }
    .bake-count { font-size: 1.3rem; font-weight: 800; }
    .bake-count strong { font-size: 2rem; font-variant-numeric: tabular-nums; }
    .bake-rate { font-weight: 800; color: var(--muted); text-align: center; }
    .bake-goal { width: 100%; height: 14px; border: 2px solid var(--edge); border-radius: 8px; background: var(--soft-2); overflow: hidden; }
    .bake-goal i { display: block; height: 100%; background: var(--good); transition: width 0.2s; }
    .bake-goal-text { color: var(--muted); font-weight: 700; }
    .bake-buy { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; width: 100%; padding: 12px 14px; border: 2px solid var(--edge); border-radius: 12px; background: var(--paper); color: var(--ink); font: inherit; font-weight: 900; font-size: 1.05rem; text-align: left; cursor: pointer; box-shadow: 0 3px 0 var(--edge-shadow); }
    .bake-buy small { color: var(--muted); font-weight: 700; }
    .bake-buy b { margin-left: auto; }
    .bake-buy:hover:not(:disabled) { border-color: var(--accent); }
    .bake-buy:disabled { opacity: 0.5; cursor: not-allowed; }
    .bake-ask { display: flex; flex-direction: column; align-items: center; gap: 8px; width: 100%; padding: 10px; border: 2px solid var(--accent); border-radius: 12px; background: var(--accent-soft); box-sizing: border-box; }
    .bake-ask-title { text-align: center; font-weight: 700; }
    @media (max-width: 560px) { .bake-cookie { width: 140px; height: 140px; font-size: 84px; } .bake { gap: 12px; } }
  `;
  document.head.append(s);
}
