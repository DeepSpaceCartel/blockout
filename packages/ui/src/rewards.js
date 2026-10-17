// Celebrations shared by the games: a toast in the corner, a WoW-style
// achievement banner (one at a time, from a queue) and paper confetti. Same
// markup and classes as the multiplication game, so css/rewards.css and
// css/results.css style them. Respects prefers-reduced-motion (no confetti).
//   import { toast, queueAchievements, confettiFullScreen } from '@blockout/ui/rewards';

const COLORS = ['#e4572e', '#2e86de', '#2a9d5c', '#8e5bd6', '#f2c94c', '#ff8fab'];
const BANNER_MS = 3200;
const TOAST_MS = 3600;

const make = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

// ---------------------------------------------------------------- confetti

const confetti = { canvas: null, ctx: null, parts: [], frame: null, last: 0 };

function ready() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  if (!confetti.canvas) {
    confetti.canvas = make('canvas', 'confetti');
    confetti.canvas.setAttribute('aria-hidden', 'true');
    document.body.append(confetti.canvas);
    confetti.ctx = confetti.canvas.getContext('2d');
  }
  if (confetti.canvas.width !== innerWidth || confetti.canvas.height !== innerHeight) {
    confetti.canvas.width = innerWidth;
    confetti.canvas.height = innerHeight;
  }
  return true;
}

function addPiece(x, y, angleDeg, speed, maxAge = 200) {
  const angle = (angleDeg * Math.PI) / 180;
  confetti.parts.push({
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    size: 5 + Math.random() * 6,
    spin: Math.random() * Math.PI,
    vspin: (Math.random() - 0.5) * 0.4,
    wobble: Math.random() * Math.PI * 2,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    round: Math.random() < 0.3,
    age: 0,
    maxAge,
  });
}

function start() {
  if (confetti.frame) return;
  confetti.last = performance.now();
  confetti.frame = requestAnimationFrame(step);
}

function step(now) {
  const dt = Math.min(2, (now - confetti.last) / 16.7);
  confetti.last = now;
  const g = confetti.ctx;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, innerWidth, innerHeight);
  confetti.parts = confetti.parts.filter((p) => (p.y < innerHeight + 20 || p.vy < 0) && p.y > -120 && p.age < p.maxAge);
  const air = Math.pow(0.985, dt);
  for (const p of confetti.parts) {
    p.age += dt;
    p.vy = Math.min(p.vy + 0.28 * dt, 6);
    p.vx *= air;
    p.wobble += 0.15 * dt;
    p.x += (p.vx + Math.sin(p.wobble) * 0.8) * dt;
    p.y += p.vy * dt;
    p.spin += p.vspin * dt;
    g.globalAlpha = Math.min(1, (p.maxAge - p.age) / 40);
    g.fillStyle = p.color;
    if (p.round) {
      g.setTransform(1, 0, 0, 1, p.x, p.y);
      g.beginPath();
      g.arc(0, 0, p.size / 2.4, 0, Math.PI * 2);
      g.fill();
    } else {
      const cos = Math.cos(p.spin);
      const sin = Math.sin(p.spin);
      const flip = Math.cos(p.wobble);
      g.setTransform(cos, sin, -sin * flip, cos * flip, p.x, p.y);
      g.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
    }
  }
  g.globalAlpha = 1;
  g.setTransform(1, 0, 0, 1, 0, 0);
  if (confetti.parts.length) confetti.frame = requestAnimationFrame(step);
  else {
    confetti.frame = null;
    g.clearRect(0, 0, innerWidth, innerHeight);
  }
}

// A burst shooting up out of an element.
export function confettiFrom(element, strength = 1) {
  if (!ready()) return;
  const box = element.getBoundingClientRect();
  const count = Math.min(90 + 40 * (strength - 1), 200);
  for (let i = 0; i < count; i++) addPiece(box.left + Math.random() * box.width, box.top + box.height * 0.3, -90 + (Math.random() - 0.35) * 110, 7 + Math.random() * 9);
  start();
}

// Raining from the top and fired from both bottom corners (a win).
export function confettiFullScreen(strength = 1) {
  if (!ready()) return;
  const w = innerWidth;
  const h = innerHeight;
  for (let i = 0; i < Math.min(Math.round((w / 6) * (0.8 + 0.3 * strength)), 420); i++) {
    addPiece(Math.random() * w, -20 - Math.random() * h * 0.9, 90 + (Math.random() - 0.5) * 30, 1 + Math.random() * 3, 420);
  }
  const reach = Math.sqrt(h) * 0.75;
  for (let i = 0; i < Math.min(70 + 30 * (strength - 1), 150); i++) {
    addPiece(0, h, -60 + (Math.random() - 0.5) * 30, reach * (0.7 + Math.random() * 0.5), 300);
    addPiece(w, h, -120 + (Math.random() - 0.5) * 30, reach * (0.7 + Math.random() * 0.5), 300);
  }
  start();
}

// ---------------------------------------------------------------- toasts

function toastBox() {
  let box = document.querySelector('.toasts');
  if (!box) {
    box = make('div', 'toasts');
    box.setAttribute('aria-live', 'polite');
    document.body.append(box);
  }
  return box;
}

// A small message in the corner that goes by itself.
export function toast(title, detail = '') {
  const box = make('div', 'toast');
  box.setAttribute('role', 'status');
  box.append(make('strong', null, title));
  if (detail) box.append(make('span', null, detail));
  const list = toastBox();
  list.append(box);
  const all = list.querySelectorAll('.toast:not(.leaving)');
  if (all.length > 4) all[0].remove();
  setTimeout(() => box.classList.add('leaving'), TOAST_MS);
  setTimeout(() => box.remove(), TOAST_MS + 400);
  confettiFrom(box);
  return box;
}

// ---------------------------------------------------------------- achievement banners

const queue = [];
let showing = false;

// list: [{ icon, name, reward }]
export function queueAchievements(list) {
  queue.push(...list);
  if (!showing) showNext();
}

function showNext() {
  const a = queue.shift();
  if (!a) {
    showing = false;
    return;
  }
  showing = true;
  const box = make('div', 'achievement-banner');
  box.setAttribute('role', 'status');
  const text = make('div', 'banner-text');
  text.append(make('span', 'banner-kicker', 'Achievement earned'), make('strong', 'banner-name', a.name), make('span', 'banner-reward', `+${a.reward} points`));
  box.append(make('span', 'banner-icon', a.icon), text);
  document.body.append(box);
  requestAnimationFrame(() => box.classList.add('show'));
  setTimeout(() => confettiFrom(box), 250);
  setTimeout(() => {
    box.classList.remove('show');
    box.classList.add('leaving');
    setTimeout(() => {
      box.remove();
      showNext();
    }, 350);
  }, BANNER_MS);
}
