// Blockout demos: the hub (every demo, by group) and one demo at #<id>.
// Opening a demo shows its intro (the idea, how to play, Easy/Medium/Hard),
// then loads ./games/<id>.js and mounts it (see kit.js).
import './style.css';
import { GROUPS, DEMOS, byId } from './catalog.js';
import { LEVELS, createContext } from './kit.js';

const app = document.getElementById('app');
const games = import.meta.glob('./games/*.js'); // loaded when opened
const LEVEL_KEY = 'blockout.demos.level';
let current = null; // the running demo's ctx

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const savedLevel = () => {
  try {
    return LEVELS[localStorage.getItem(LEVEL_KEY)] ? localStorage.getItem(LEVEL_KEY) : 'easy';
  } catch (e) {
    return 'easy';
  }
};

function stopCurrent() {
  if (current) current.stop();
  current = null;
  window.Demo = null;
}

// ---------------------------------------------------------------- the hub

function showHub() {
  stopCurrent();
  document.title = 'Demos · Blockout';
  app.innerHTML = `
    <main class="hub demos-hub">
      <header class="hub-head">
        <a class="back-link" href="/">← Blockout (multiplication)</a>
        <h1 class="logo">DEMO<span>S</span></h1>
        <p>Classic games, turned into math games. Quick demos to try: pick one, choose Easy, Medium or Hard (the times tables), and play.</p>
      </header>
      ${GROUPS.map(
        (g) => `<section class="demo-group">
          <h2>${esc(g.name)}</h2>
          <div class="hub-grid">
            ${DEMOS.filter((d) => d.group === g.id)
              .map(
                (d) => `<a class="hub-card demo-card" href="#${d.id}">
                  <h2><span class="op-badge">${d.icon}</span> ${esc(d.name)}</h2>
                  <p class="grade">Like ${esc(d.classic)}</p>
                  <p class="idea">${esc(d.idea)}</p>
                </a>`
              )
              .join('')}
          </div>
        </section>`
      ).join('')}
    </main>`;
}

// ---------------------------------------------------------------- one demo

function showIntro(demo) {
  stopCurrent();
  document.title = `${demo.name} · Blockout demos`;
  let level = savedLevel();
  app.innerHTML = `
    <main class="screen">
      <div class="start-card demo-intro">
        <a class="back-link" href="#">← All demos</a>
        <div class="demo-icon" aria-hidden="true">${demo.icon}</div>
        <h1 class="demo-title">${esc(demo.name)}</h1>
        <p class="tagline">Like ${esc(demo.classic)}: ${esc(demo.idea)}</p>
        <ul class="demo-how">${demo.how.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>
        <div class="field">
          <span>Difficulty</span>
          <div class="segmented" id="demo-level">
            ${Object.entries(LEVELS)
              .map(([id, l]) => `<button type="button" data-level="${id}" class="${id === level ? 'selected' : ''}">${l.label} <small>${l.sub}</small></button>`)
              .join('')}
          </div>
        </div>
        <button type="button" class="btn btn-primary btn-big" id="demo-start">Start</button>
      </div>
    </main>`;
  app.querySelector('#demo-level').addEventListener('click', (e) => {
    const b = e.target.closest('[data-level]');
    if (!b) return;
    level = b.dataset.level;
    try {
      localStorage.setItem(LEVEL_KEY, level);
    } catch (err) {}
    for (const x of app.querySelectorAll('#demo-level button')) x.classList.toggle('selected', x === b);
  });
  const start = app.querySelector('#demo-start');
  start.addEventListener('click', () => play(demo, level));
  start.focus();
}

async function play(demo, level) {
  stopCurrent();
  app.innerHTML = `
    <main class="screen demo-screen">
      <header class="game-header">
        <a class="btn btn-small menu-btn" href="#" aria-label="All demos" title="All demos">←</a>
        <h1 class="logo small demo-name">${demo.icon} ${esc(demo.name)}</h1>
        <div class="header-right"><button type="button" class="btn btn-small" id="demo-restart">Restart</button></div>
      </header>
      <div class="demo-hud" id="demo-hud"></div>
      <div class="demo-stage" id="demo-stage"></div>
    </main>
    <div class="overlay" id="demo-over" hidden>
      <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="demo-over-title">
        <h2 id="demo-over-title"></h2>
        <ul class="demo-lines" id="demo-over-lines"></ul>
        <div class="dialog-actions">
          <a class="btn" href="#">All demos</a>
          <button type="button" class="btn btn-primary" id="demo-again">Play again</button>
        </div>
      </div>
    </div>`;
  app.querySelector('#demo-restart').addEventListener('click', () => play(demo, level));
  app.querySelector('#demo-again').addEventListener('click', () => play(demo, level));
  const load = games[`./games/${demo.id}.js`];
  const stage = app.querySelector('#demo-stage');
  if (!load) {
    stage.innerHTML = '<p class="setting-help">This demo isn’t built yet.</p>';
    return;
  }
  const mod = await load();
  const ctx = createContext({
    level,
    hudEl: app.querySelector('#demo-hud'),
    onFinish: (result = {}) => {
      app.querySelector('#demo-over-title').textContent = result.title || 'Done!';
      app.querySelector('#demo-over-lines').innerHTML = (result.lines || []).map((l) => `<li>${esc(l)}</li>`).join('');
      app.querySelector('#demo-over').hidden = false;
      app.querySelector('#demo-again').focus();
      if (result.won) ctx.celebrate();
    },
  });
  current = ctx;
  const handle = mod.mount(stage, ctx) || {};
  // for automated checks
  window.Demo = { id: demo.id, level, state: handle.state || (() => null), finished: () => !app.querySelector('#demo-over').hidden };
}

// ---------------------------------------------------------------- routing

function route() {
  const id = location.hash.slice(1);
  const demo = byId(id);
  if (demo) showIntro(demo);
  else showHub();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);
route();
