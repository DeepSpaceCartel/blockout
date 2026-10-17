// Number Snake: the page. The rules are in ./rules.js; this draws the board,
// runs the clock and reads the keys, swipes and on-screen arrows.
import './style.css';
import { toast, confettiFrom, confettiFullScreen } from '@blockout/ui/rewards';
import * as R from './rules.js';

const $ = (id) => document.getElementById(id);
const SAVE_KEY = 'blockout.snake'; // { settings: { mode, level }, best: { 'answer.easy': 120, … } }

const el = {
  start: $('start-screen'),
  gameScreen: $('game-screen'),
  canvas: $('board'),
  task: $('task'),
  fact: $('fact'),
  hearts: $('hearts'),
  score: $('score'),
  best: $('best'),
  pause: $('pause-btn'),
  over: $('over'),
  ask: $('ask'),
  askQ: $('ask-q'),
  askBox: $('ask-box'),
  dpad: document.querySelector('.dpad'),
};
const ctx = el.canvas.getContext('2d');

// ---------------------------------------------------------------- saved settings and best scores

const DEFAULTS = { mode: 'answer', level: 'easy', movement: 'auto', speed: 'slow', walls: 'bump' };
const manual = () => save.settings.movement === 'manual';
const save = (() => {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY)) || {};
    return { best: {}, ...saved, settings: { ...DEFAULTS, ...(saved.settings || {}) } };
  } catch (e) {
    return { settings: { ...DEFAULTS }, best: {} };
  }
})();
const writeSave = () => {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch (e) {}
};
const bestKey = () => `${save.settings.mode}.${save.settings.level}`;

// ---------------------------------------------------------------- menu

// what each difficulty means depends on the way to play
const levelSub = (l) => (save.settings.mode === 'sum' ? `add ${l.add[0]}–${l.add[1]} · to ${l.goal}` : l.sub);

function renderMenu() {
  $('level').innerHTML = Object.entries(R.LEVELS)
    .map(([id, l]) => `<button type="button" data-level="${id}">${l.label} <small>${levelSub(l)}</small></button>`)
    .join('');
  for (const b of document.querySelectorAll('.mode-card')) {
    const on = b.dataset.mode === save.settings.mode;
    b.classList.toggle('selected', on);
    b.setAttribute('aria-checked', on);
  }
  for (const b of document.querySelectorAll('#level button')) b.classList.toggle('selected', b.dataset.level === save.settings.level);
  $('movement').innerHTML = Object.entries(R.MOVEMENTS)
    .map(([id, m]) => `<button type="button" data-movement="${id}" class="${id === save.settings.movement ? 'selected' : ''}">${m.label} <small>${m.sub}</small></button>`)
    .join('');
  $('speed-field').hidden = manual(); // manual has no clock
  $('speed').innerHTML = Object.entries(R.SPEEDS)
    .map(([id, sp]) => `<button type="button" data-speed="${id}" class="${id === save.settings.speed ? 'selected' : ''}">${sp.label}</button>`)
    .join('');
  $('walls').innerHTML = Object.entries(R.WALLS)
    .map(([id, w]) => `<button type="button" data-walls="${id}" class="${id === save.settings.walls ? 'selected' : ''}">${w.label} <small>${w.sub}</small></button>`)
    .join('');
  el.best.textContent = save.best[bestKey()] || 0;
  writeSave();
}
document.querySelector('.mode-picker').addEventListener('click', (e) => {
  const b = e.target.closest('[data-mode]');
  if (b) (save.settings.mode = b.dataset.mode), renderMenu();
});
$('level').addEventListener('click', (e) => {
  const b = e.target.closest('[data-level]');
  if (b) (save.settings.level = b.dataset.level), renderMenu();
});
$('movement').addEventListener('click', (e) => {
  const b = e.target.closest('[data-movement]');
  if (b) (save.settings.movement = b.dataset.movement), renderMenu();
});
$('speed').addEventListener('click', (e) => {
  const b = e.target.closest('[data-speed]');
  if (b) (save.settings.speed = b.dataset.speed), renderMenu();
});
$('walls').addEventListener('click', (e) => {
  const b = e.target.closest('[data-walls]');
  if (b) (save.settings.walls = b.dataset.walls), renderMenu();
});
$('setup-form').addEventListener('submit', (e) => {
  e.preventDefault();
  start();
});
renderMenu();

// ---------------------------------------------------------------- the game loop

let game = null;
let clock = null;
let paused = false;

function start() {
  game = R.createGame({ mode: save.settings.mode, level: save.settings.level, walls: save.settings.walls });
  paused = false;
  el.pause.textContent = 'Pause';
  el.pause.hidden = manual(); // nothing to pause when it only moves on a press
  el.over.hidden = true;
  el.start.hidden = true;
  el.gameScreen.hidden = false;
  el.fact.textContent = '';
  el.fact.className = 'snake-fact';
  resize();
  render();
  run();
}

// the clock speeds up as the snake eats (auto movement only)
function run() {
  clearInterval(clock);
  if (!manual()) clock = setInterval(step, R.tickMs(game, save.settings.speed));
}

function step() {
  if (!game || paused || game.asking) return;
  moved(R.tick(game));
}

// Manual movement: an arrow press moves one square that way
function stepTo(dir) {
  if (!game || game.asking) return;
  moved(R.step(game, dir));
}

// after the snake moved (or bumped, or ate): messages, speed, the end
function moved(last) {
  if (last && last.asking) return startAsking();
  if (last && last.bump) {
    el.fact.textContent = last.hurt ? 'Ouch! That cost a heart. Pick a way to go.' : 'Bump! Pick a way to go.';
    el.fact.className = `snake-fact ${last.hurt ? 'bad' : ''}`;
  }
  if (last && last.ate !== null) {
    el.fact.textContent = last.good ? `Yum! ${last.fact}` : `Oops: ${last.fact}`;
    el.fact.className = `snake-fact ${last.good ? 'good' : 'bad'}`;
    if (last.cleared) {
      toast(`🎉 Every multiple of ${last.cleared}!`, `+${R.POINTS.cleared} bonus points`);
      confettiFrom(el.canvas, 1);
    }
    if (last.good) run(); // a little faster
  }
  render();
  if (game.over) finish();
}

// ---------------------------------------------------------------- add it up: the new total

let typed = '';
function startAsking() {
  typed = '';
  el.fact.textContent = '';
  render();
}

function press(key) {
  if (!game || !game.asking) return;
  if (key === 'back') typed = typed.slice(0, -1);
  else if (key === 'check') return typed && submit();
  else if (/^\d$/.test(key) && typed.length < 4) typed += key;
  render();
}

function submit() {
  const last = R.answer(game, Number(typed));
  typed = '';
  el.fact.textContent = last.good ? `Yes! ${last.fact}` : `Oops: ${last.fact}`;
  el.fact.className = `snake-fact ${last.good ? 'good' : 'bad'}`;
  if (last.goal) {
    toast(`🎉 You reached ${last.goal}!`, `+${R.POINTS.goal} bonus points · a new round starts at 0`);
    confettiFrom(el.canvas, 1);
  }
  if (last.good) run();
  render();
  if (game.over) finish();
}
document.getElementById('keypad').addEventListener('click', (e) => {
  const b = e.target.closest('[data-key]');
  if (b) press(b.dataset.key);
});

function finish() {
  clearInterval(clock);
  const key = bestKey();
  const best = save.best[key] || 0;
  const record = game.score > best;
  if (record) save.best[key] = game.score;
  writeSave();
  $('over-title').textContent = { wall: 'Bonk! That’s the wall.', self: 'Oops, you bit your tail!', hearts: 'Out of hearts!' }[game.why];
  $('over-sub').textContent = `${game.score} points · ${game.eaten} right${record && game.score ? ' · a new best!' : ` · best ${Math.max(best, game.score)}`}`;
  const extra = $('over-extra');
  extra.innerHTML = '';
  if (game.missed.length) {
    const p = document.createElement('p');
    p.className = 'missed-title';
    p.textContent = 'Worth another look:';
    extra.append(p);
    const list = document.createElement('div');
    list.className = 'missed';
    for (const m of game.missed) {
      const chip = document.createElement('span');
      chip.className = 'missed-chip';
      chip.textContent = m.answer !== null ? `${m.text} = ${m.answer} (not ${m.ate})` : `${m.ate}: not a ${m.text}`;
      list.append(chip);
    }
    extra.append(list);
  }
  el.over.hidden = false;
  $('over-again').focus();
  if (record && game.score) confettiFullScreen();
}

function quit() {
  clearInterval(clock);
  game = null;
  el.over.hidden = true;
  el.gameScreen.hidden = true;
  el.start.hidden = false;
  renderMenu();
}

function togglePause() {
  if (!game || game.over) return;
  paused = !paused;
  el.pause.textContent = paused ? 'Go' : 'Pause';
  render();
}

$('quit-btn').addEventListener('click', quit);
$('over-menu').addEventListener('click', quit);
$('over-again').addEventListener('click', start);
el.pause.addEventListener('click', togglePause);

// ---------------------------------------------------------------- steering

const KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
document.addEventListener('keydown', (e) => {
  if (!game || el.gameScreen.hidden) return;
  if (e.key === ' ') {
    e.preventDefault();
    return togglePause();
  }
  if (e.key === 'Enter' && game.over) return start();
  if (game.asking) {
    if (/^\d$/.test(e.key)) press(e.key);
    else if (e.key === 'Backspace') press('back');
    else if (e.key === 'Enter') press('check');
    else return;
    return e.preventDefault();
  }
  const dir = KEYS[e.key] || KEYS[e.key.toLowerCase()];
  if (!dir) return;
  e.preventDefault();
  if (manual()) return stepTo(dir);
  if (paused) togglePause();
  R.turn(game, dir);
});
document.querySelector('.dpad').addEventListener('click', (e) => {
  const b = e.target.closest('[data-dir]');
  if (b && game) manual() ? stepTo(b.dataset.dir) : R.turn(game, b.dataset.dir);
});
// swipe on the board
let touch = null;
el.canvas.addEventListener('touchstart', (e) => (touch = { x: e.touches[0].clientX, y: e.touches[0].clientY }), { passive: true });
el.canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
el.canvas.addEventListener('touchend', (e) => {
  if (!touch || !game) return;
  const dx = e.changedTouches[0].clientX - touch.x;
  const dy = e.changedTouches[0].clientY - touch.y;
  touch = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
  const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
  manual() ? stepTo(dir) : R.turn(game, dir);
});

// ---------------------------------------------------------------- drawing

let cell = 30;
function resize() {
  if (!game) return;
  const wrap = el.canvas.parentElement.getBoundingClientRect();
  const room = Math.min(wrap.width - 24, window.innerHeight - 140);
  cell = Math.max(16, Math.floor(room / game.size));
  const px = cell * game.size;
  const dpr = window.devicePixelRatio || 1;
  el.canvas.width = px * dpr;
  el.canvas.height = px * dpr;
  el.canvas.style.width = `${px}px`;
  el.canvas.style.height = `${px}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', () => (resize(), render()));

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function render() {
  if (!game) return;
  const n = game.size;
  const px = cell * n;
  // board: soft checkerboard
  ctx.fillStyle = css('--surface') || '#fffdf7';
  ctx.fillRect(0, 0, px, px);
  ctx.fillStyle = css('--soft') || '#f4efe6';
  for (let y = 0; y < n; y++) for (let x = (y % 2); x < n; x += 2) ctx.fillRect(x * cell, y * cell, cell, cell);
  // numbers
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const num of game.numbers) {
    const cx = num.x * cell + cell / 2;
    const cy = num.y * cell + cell / 2;
    ctx.fillStyle = css('--gold-bg') || '#fff6d6';
    ctx.strokeStyle = css('--gold-line') || '#e6c35c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, cell * 0.46, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = css('--ink') || '#2b2a33';
    const digits = String(num.value).length;
    ctx.font = `800 ${Math.round(cell * (digits > 2 ? 0.36 : digits > 1 ? 0.46 : 0.56))}px system-ui, sans-serif`;
    ctx.fillText(String(num.value), cx, cy + 1);
  }
  // snake: head darker, with eyes looking the way it goes
  const body = css('--good') || '#2a9d5c';
  game.snake.forEach((s, i) => {
    ctx.fillStyle = i === 0 ? css('--good-ink') || '#1d6e41' : body;
    const inset = i === 0 ? 1 : 3;
    roundRect(s.x * cell + inset, s.y * cell + inset, cell - inset * 2, cell - inset * 2, cell * 0.3);
  });
  const h = game.snake[0];
  const [ex, ey] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[game.dir];
  ctx.fillStyle = '#fff';
  for (const side of [-1, 1]) {
    const x = h.x * cell + cell / 2 + ex * cell * 0.18 + ey * side * cell * 0.18;
    const y = h.y * cell + cell / 2 + ey * cell * 0.18 + ex * side * cell * 0.18;
    ctx.beginPath();
    ctx.arc(x, y, cell * 0.09, 0, Math.PI * 2);
    ctx.fill();
  }
  if (paused) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(0, 0, px, px);
    ctx.fillStyle = '#fff';
    ctx.font = `800 ${Math.round(cell * 1.2)}px system-ui, sans-serif`;
    ctx.fillText('Paused', px / 2, px / 2);
  }
  // side panel
  el.task.textContent =
    game.task.kind === 'multiples' ? `${game.task.text} (${game.task.left} to go)` : game.task.kind === 'sum' ? `Total ${game.total} · goal ${game.task.goal}` : game.task.text;
  el.ask.hidden = !game.asking;
  el.dpad.hidden = Boolean(game.asking);
  if (game.asking) {
    el.askQ.textContent = game.asking.text.replace(' = ?', ' =');
    el.askBox.textContent = typed;
  }
  el.hearts.textContent = '❤️'.repeat(Math.max(0, game.hearts)) + '🤍'.repeat(Math.max(0, R.HEARTS - game.hearts));
  el.score.textContent = game.score;
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

// For automated checks: the game's state
window.SnakeGame = { state: () => game, turn: (d) => game && R.turn(game, d), tick: () => step(), step: (d) => stepTo(d), pause: () => togglePause() };
