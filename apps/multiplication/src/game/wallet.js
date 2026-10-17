// Progress (wallet, unlocks, achievements): part of the multiplication game (split from the old js/game.js).

import * as Auth from '@blockout/auth';
import * as Cosmetics from '@blockout/progress/cosmetics';
import * as Progress from '@blockout/progress';
import * as Shop from '@blockout/progress/shop';
import { PROGRESS_KEY, el } from './base.js';
import { settings } from './settings.js';
import { look } from './wardrobe.js';
import { make } from './play.js';
import { affordableCount, affordableLooks, newStickers, newWardrobe, spareStickers } from './shop.js';
import { refreshUnlocks } from './cheats.js';

let progress, glyphSprites;

function loadProgress() {
  try {
    return Progress.normalize(JSON.parse(localStorage.getItem(PROGRESS_KEY)));
  } catch (_) {
    return Progress.createProgress();
  }
}

function saveProgress() {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch (_) {
    // not fatal: progress just won't persist
  }
  if (Auth) Auth.queueProgress(progress); // signed in: send it to the account too
  renderWallet();
}

// Swap in another save (the account's, after signing in) and redraw what shows it.
function replaceProgress(next) {
  for (const key of Object.keys(progress)) delete progress[key];
  Object.assign(progress, Progress.normalize(next));
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch (_) {
    // not fatal
  }
  refreshUnlocks();
  renderWallet();
}

function renderWallet() {
  el.walletAmount.textContent = formatPoints(progress.wallet);
  updateMenuBadges();
}

// iPhone-style red count badges on the main-menu Shop, Wardrobe and Stickers buttons.
function updateMenuBadges() {
  if (!Cosmetics || !el.shopBtn) return;
  setBadge(el.shopBtn, 'Shop', affordableCount(), 'you can unlock');
  setBadge(el.wardrobeBtn, 'Wardrobe', newWardrobe() + affordableLooks(), 'new or ready to unlock');
  setBadge(el.stickersBtn, 'Stickers', newStickers() + spareStickers(), 'new or spare');
}

function setBadge(btn, label, count, what) {
  let badge = btn.querySelector('.badge');
  if (!count) {
    if (badge) badge.remove();
    btn.removeAttribute('aria-label');
    return;
  }
  if (!badge) {
    badge = make('span', 'badge');
    badge.setAttribute('aria-hidden', 'true');
    btn.append(badge);
  }
  badge.textContent = count > 99 ? '99+' : String(count);
  btn.setAttribute('aria-label', `${label}, ${count} ${what}`);
}

// 10000 → "10,000" (in the reader's locale).
const formatPoints = Shop.formatPoints;

// Show newly earned achievements as toasts; returns them for the caller.
// Every big (non-minor) achievement drops one random sticker.
function grantStickers(earned) {
  return earned.filter((a) => !a.minor).map(() => Cosmetics.dropSticker(progress));
}

function celebrate(earned) {
  queueAchievements(earned);
  for (const { sticker, isNew } of grantStickers(earned)) {
    toast(`🎁 ${isNew ? 'New sticker' : 'Sticker'}: ${sticker.emoji}`, isNew ? `${sticker.rarity} · added to your album` : `a spare you can swap for points`);
  }
  // one full-screen celebration (bigger for several), not for minor ones like fact speed
  const major = earned.filter((a) => !a.minor).length;
  if (major) confettiFullScreen(major);
  return earned;
}

// ---- confetti: paper bits that fly, then fall and flutter. Every toast gets a
// burst from itself; achievements also get a full-screen celebration.
// Drawn on a see-through canvas that ignores clicks; skipped for reduced motion.
const CONFETTI_COLORS = ['#e4572e', '#2e86de', '#2a9d5c', '#8e5bd6', '#f2c94c', '#ff8fab'];

const confetti = { canvas: null, ctx: null, parts: [], frame: null, last: 0 };

// Confetti doesn't need retina sharpness; 1× keeps the full-screen canvas small and fast.
const CONFETTI_DPR = 1;

// Emoji pieces are bigger than paper, so half as many look just as full (and draw faster).
const pieceCount = (n) => Math.round(n * (confettiGlyphs() ? 0.5 : 1));

// Make sure the canvas exists and matches the window; false when motion is reduced.
function confettiReady() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  if (!confetti.canvas) {
    confetti.canvas = document.createElement('canvas');
    confetti.canvas.className = 'confetti';
    confetti.canvas.setAttribute('aria-hidden', 'true');
    document.body.append(confetti.canvas);
    confetti.ctx = confetti.canvas.getContext('2d');
  }
  const dpr = CONFETTI_DPR;
  const w = Math.round(innerWidth * dpr);
  const h = Math.round(innerHeight * dpr);
  if (confetti.canvas.width !== w || confetti.canvas.height !== h) {
    confetti.canvas.width = w;
    confetti.canvas.height = h;
  }
  confetti.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return true;
}

// Wardrobe confetti: paper, or emoji pieces (stars, hearts, snowflakes, coins…)
const CONFETTI_GLYPHS = {
  stars: ['⭐', '🌟'],
  hearts: ['💖', '💗', '❤️'],
  snow: ['❄️'],
  coins: ['🪙'],
  blossom: ['🌸', '🌼'],
};

const pick = (list) => list[Math.floor(Math.random() * list.length)];

function confettiGlyphs() {
  const kind = settings.cosmetics.confetti;
  return kind === 'emoji' ? look('confetti').glyphs : CONFETTI_GLYPHS[kind] || null;
}

function glyphSprite(glyph, size) {
  const px = Math.round(size);
  const key = `${glyph}|${px}`;
  let sprite = glyphSprites.get(key);
  if (!sprite) {
    const dpr = CONFETTI_DPR;
    const cssSize = Math.ceil(px * 2.6);
    sprite = document.createElement('canvas');
    sprite.width = sprite.height = Math.ceil(cssSize * dpr);
    sprite.cssSize = cssSize;
    const s = sprite.getContext('2d');
    s.scale(dpr, dpr);
    s.font = `${px * 2}px serif`;
    s.textAlign = 'center';
    s.textBaseline = 'middle';
    s.fillText(glyph, cssSize / 2, cssSize / 2 + px * 0.1);
    glyphSprites.set(key, sprite);
  }
  return sprite;
}

// extra: { glyphs, gravity, size } for special effects (balloons, trophies, fireworks)
function addPiece(x, y, angleDeg, speed, maxAge = 200, extra = {}) {
  const angle = (angleDeg * Math.PI) / 180;
  const glyphs = extra.glyphs !== undefined ? extra.glyphs : confettiGlyphs();
  confetti.parts.push({
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    size: extra.size || (glyphs ? 9 + Math.random() * 6 : 5 + Math.random() * 6),
    spin: Math.random() * Math.PI,
    vspin: (Math.random() - 0.5) * (glyphs ? 0.12 : 0.4),
    wobble: Math.random() * Math.PI * 2,
    color: extra.color || CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    round: Math.random() < 0.3,
    glyph: glyphs ? pick(glyphs) : null,
    gravity: extra.gravity !== undefined ? extra.gravity : 0.28,
    age: 0,
    maxAge,
  });
}

function startConfetti() {
  if (!confetti.frame) {
    confetti.last = performance.now();
    confetti.frame = requestAnimationFrame(stepConfetti);
  }
}

// A burst shooting up out of an element (mostly up, leaning right).
function confettiFrom(element, strength = 1) {
  if (!confettiReady()) return;
  const box = element.getBoundingClientRect();
  const count = pieceCount(Math.min(90 + 40 * (strength - 1), 200));
  for (let i = 0; i < count; i++) {
    addPiece(box.left + Math.random() * box.width, box.top + box.height * 0.3, -90 + (Math.random() - 0.35) * 110, 7 + Math.random() * 9);
  }
  startConfetti();
}

// Winning: the Wardrobe's win celebration.
function celebrateWin() {
  if (!confettiReady()) return;
  const w = innerWidth;
  const h = innerHeight;
  const style = settings.cosmetics.win;
  if (style === 'fireworks') {
    for (let burst = 0; burst < 6; burst++) {
      setTimeout(() => {
        if (!confettiReady()) return;
        const x = w * (0.15 + Math.random() * 0.7);
        const y = h * (0.15 + Math.random() * 0.35);
        const color = pick(CONFETTI_COLORS);
        for (let i = 0; i < 70; i++) {
          addPiece(x, y, (i / 70) * 360, 3 + Math.random() * 5, 90 + Math.random() * 40, { glyphs: null, gravity: 0.1, color, size: 4 });
        }
        startConfetti();
      }, burst * 380);
    }
  } else if (style === 'balloons') {
    for (let i = 0; i < 36; i++) {
      addPiece(Math.random() * w, h + 20 + Math.random() * h * 0.6, -90 + (Math.random() - 0.5) * 16, 2 + Math.random() * 2.5, 520, { glyphs: ['🎈'], gravity: -0.01, size: 14 + Math.random() * 8 });
    }
    startConfetti();
  } else if (style === 'trophies') {
    for (let i = 0; i < 90; i++) {
      addPiece(Math.random() * w, -20 - Math.random() * h * 0.9, 90 + (Math.random() - 0.5) * 20, 1 + Math.random() * 3, 420, { glyphs: ['🏆', '🪙', '⭐', '🥇'] });
    }
    startConfetti();
  } else {
    confettiFullScreen(3);
  }
}

// Full screen: a shower from the top across the whole width, plus a cannon
// in each bottom corner firing towards the middle.
function confettiFullScreen(strength = 1) {
  if (!confettiReady()) return;
  const w = innerWidth;
  const h = innerHeight;
  const shower = pieceCount(Math.min(Math.round((w / 6) * (0.8 + 0.3 * strength)), 420));
  for (let i = 0; i < shower; i++) {
    // start above the screen at different heights so it keeps raining for a while
    addPiece(Math.random() * w, -20 - Math.random() * h * 0.9, 90 + (Math.random() - 0.5) * 30, 1 + Math.random() * 3, 420);
  }
  const perCannon = pieceCount(Math.min(70 + 30 * (strength - 1), 150));
  const reach = Math.sqrt(h) * 0.75; // strong enough to reach the upper half on any screen
  for (let i = 0; i < perCannon; i++) {
    addPiece(0, h, -60 + (Math.random() - 0.5) * 30, reach * (0.7 + Math.random() * 0.5), 300);
    addPiece(w, h, -120 + (Math.random() - 0.5) * 30, reach * (0.7 + Math.random() * 0.5), 300);
  }
  startConfetti();
}

function stepConfetti(now) {
  const dt = Math.min(2, (now - confetti.last) / 16.7); // in 60fps frames, capped after tab switches
  confetti.last = now;
  const g = confetti.ctx;
  g.clearRect(0, 0, innerWidth, innerHeight);
  confetti.parts = confetti.parts.filter((p) => (p.y < innerHeight + 20 || p.vy < 0) && p.y > -120 && p.age < p.maxAge);
  const dpr = CONFETTI_DPR;
  const air = Math.pow(0.985, dt);
  for (const p of confetti.parts) {
    p.age += dt;
    p.vy += p.gravity * dt; // gravity (balloons have a little negative gravity)
    p.vx *= air;
    p.vy = Math.min(p.vy, 6); // paper falls slowly
    p.wobble += 0.15 * dt;
    p.x += (p.vx + Math.sin(p.wobble) * 0.8) * dt;
    p.y += p.vy * dt;
    p.spin += p.vspin * dt;
    // Position each piece with one setTransform (no save/restore per piece: much faster)
    const cos = Math.cos(p.spin) * dpr;
    const sin = Math.sin(p.spin) * dpr;
    g.globalAlpha = Math.min(1, (p.maxAge - p.age) / 40);
    if (p.glyph) {
      // emoji: stamp a pre-drawn image instead of drawing the text every frame
      const sprite = glyphSprite(p.glyph, p.size);
      g.setTransform(cos, sin, -sin, cos, p.x * dpr, p.y * dpr);
      g.drawImage(sprite, -sprite.cssSize / 2, -sprite.cssSize / 2, sprite.cssSize, sprite.cssSize);
    } else if (p.round) {
      g.setTransform(dpr, 0, 0, dpr, p.x * dpr, p.y * dpr);
      g.fillStyle = p.color;
      g.beginPath();
      g.arc(0, 0, p.size / 2.4, 0, Math.PI * 2);
      g.fill();
    } else {
      const flip = Math.cos(p.wobble); // flipping paper
      g.setTransform(cos, sin, -sin * flip, cos * flip, p.x * dpr, p.y * dpr);
      g.fillStyle = p.color;
      g.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
    }
  }
  g.globalAlpha = 1;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (confetti.parts.length) confetti.frame = requestAnimationFrame(stepConfetti);
  else {
    confetti.frame = null;
    g.clearRect(0, 0, innerWidth, innerHeight);
  }
}

const BONUS_TOASTS = { first: '✨', speedy: '⚡', streak: '🔥', timer: '⏱️' };

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Small pop-up message in the corner that disappears by itself.
// ---- achievements: a big banner at the bottom, one at a time, with confetti

const achievementQueue = [];

let bannerUp = false;

const BANNER_MS = 3200;

const MINOR_BANNER_MS = 1800;

// Minor ones in a row (fact speed badges) share one smaller banner.
function queueAchievements(list) {
  for (const a of list) {
    const last = achievementQueue[achievementQueue.length - 1];
    if (a.minor && last && last.minor) {
      last.count++;
      last.reward += a.reward;
      continue;
    }
    achievementQueue.push({ icon: a.icon, name: a.name, reward: a.reward, minor: Boolean(a.minor), count: 1 });
  }
  if (!bannerUp) showNextAchievement();
}

function showNextAchievement() {
  const a = achievementQueue.shift();
  if (!a) {
    bannerUp = false;
    return;
  }
  bannerUp = true;
  const box = make('div', 'achievement-banner' + (a.minor ? ' minor' : ''));
  box.setAttribute('role', 'status');
  const text = make('div', 'banner-text');
  text.append(
    make('span', 'banner-kicker', a.minor ? 'Badge earned' : 'Achievement earned'),
    make('strong', 'banner-name', a.count > 1 ? `+${a.count} fact speed badges` : a.name),
    make('span', 'banner-reward', `+${formatPoints(a.reward)} points`)
  );
  box.append(make('span', 'banner-icon', a.icon), text);
  document.body.append(box);
  requestAnimationFrame(() => box.classList.add('show'));
  setTimeout(() => confettiFrom(box), 250);
  let gone = false;
  const next = () => {
    if (gone) return;
    gone = true;
    box.classList.remove('show');
    box.classList.add('leaving');
    setTimeout(() => {
      box.remove();
      showNextAchievement();
    }, 350);
  };
  // (clicks go straight through the banner, so it never blocks the buttons under it)
  setTimeout(next, a.minor ? MINOR_BANNER_MS : BANNER_MS);
}

function toast(title, detail = '') {
  const box = document.createElement('div');
  box.className = 'toast';
  box.setAttribute('role', 'status');
  const strong = document.createElement('strong');
  strong.textContent = title;
  box.append(strong);
  if (detail) {
    const small = document.createElement('span');
    small.textContent = detail;
    box.append(small);
  }
  el.toasts.append(box);
  // Keep at most 4 on screen: the oldest goes first.
  const all = el.toasts.querySelectorAll('.toast:not(.leaving)');
  if (all.length > 4) all[0].remove();
  setTimeout(() => box.classList.add('leaving'), 3600);
  setTimeout(() => box.remove(), 4000);
  confettiFrom(box); // every toast gets a little burst
  return box;
}

// What this part does when the page loads (main.js runs every part in order)
export function run() {
  progress = loadProgress();

  // Emoji drawn once per glyph and size into a small canvas, then stamped with
  // drawImage. Drawing colour emoji as text every frame is very slow.
  glyphSprites = new Map();
}

export { BONUS_TOASTS, capitalize, celebrate, celebrateWin, confettiFullScreen, formatPoints, grantStickers, progress, queueAchievements, renderWallet, replaceProgress, saveProgress, toast, updateMenuBadges };
