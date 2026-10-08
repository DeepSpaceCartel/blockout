// Rendering: part of the multiplication game (split from the old js/game.js).

import * as Core from '@blockout/engine';
import { PIPS, ctx, el } from './base.js';
import { settings } from './settings.js';
import { look } from './wardrobe.js';
import { currentDims, currentPlayer, game, make } from './play.js';
import { ordinal, pairLiveTick } from './classroom.js';
import { dragRect, humanPreview, judgeDrawn } from './input.js';

function setMsg(text) {
  el.turnMsg.textContent = text;
  el.turnMsg.classList.remove('oops');
}

// Pips for a normal d6; 8- and 12-sided dice show the number.
// Pips for a normal d6 (dots, or the Wardrobe's hearts/stars/…); 8- and
// 12-sided dice show the number. `skin` defaults to the Wardrobe's dice.
function renderDie(die, value, sides = game ? game.sides : 6, skin = settings.cosmetics.dice) {
  die.innerHTML = '';
  for (const c of [...die.classList]) if (c.startsWith('skin-')) die.classList.remove(c);
  die.classList.add(`skin-${skin}`);
  die.classList.toggle('blank', !value);
  die.classList.toggle('numbered', Boolean(value) && sides > 6);
  die.setAttribute('aria-label', value ? `Die showing ${value}` : 'Die not rolled');
  if (!value) return;
  if (sides > 6) {
    const num = document.createElement('span');
    num.className = 'die-num';
    num.textContent = value;
    die.append(num);
    return;
  }
  const on = PIPS[value];
  const glyph = look('pips').glyph; // e.g. '❤️'; plain dots when undefined
  for (let i = 0; i < 9; i++) {
    const cell = document.createElement('span');
    if (on.includes(i)) {
      cell.className = glyph ? 'pip pip-glyph' : 'pip';
      if (glyph) cell.textContent = glyph;
    }
    die.append(cell);
  }
}

function render() {
  if (!game) return;
  const p = currentPlayer();
  el.turnPanel.style.setProperty('--turn-color', p.color);
  el.turnLabel.textContent =
    game.phase === 'over'
      ? 'Game over'
      : game.mode === 'class'
        ? game.classroom.round
          ? `Roll ${game.classroom.round} of ${game.classroom.view.settings.rounds}`
          : 'Class game'
        : game.mode === 'pair'
          ? game.current === game.classroom.me
            ? 'Your turn'
            : `${p.name}'s turn`
        : game.mode === 'single' && !p.cpu
          ? 'Your turn'
          : `${p.name}'s turn`;
  el.rollBtn.disabled = game.phase !== 'roll';
  const realDice = game.diceMode === 'real';
  el.rollBtn.hidden = p.cpu || realDice || game.mode === 'class' || !['roll', 'rolling'].includes(game.phase);
  el.diceEntry.hidden = p.cpu || !realDice || game.phase !== 'roll';
  const dims = currentDims();
  el.rotateBtn.hidden = !(
    game.phase === 'place' &&
    game.placeMode === 'click' &&
    dims &&
    dims[0] !== dims[1] &&
    !Core.mustUseCorner(game.board)
  );
  el.progress.hidden = !game.showProgress;
  if (game.showProgress) renderProgress();
  el.canvas.style.cursor = game.phase === 'place' ? 'crosshair' : 'default';
  renderScores();
  drawBoard();
  pairLiveTick(); // pairs: your partner watches your move
}

// "Board: 24 of 400 filled", with a bar split into each player's colour.
function renderProgress() {
  const total = game.size * game.size;
  const filled = total - Core.emptyCount(game.board);
  el.progressText.innerHTML =
    `<span class="long">Board: ${filled} of ${total} filled</span>` +
    `<span class="short">${filled} / ${total} filled</span>`;
  el.progressBar.setAttribute('aria-valuemin', '0');
  el.progressBar.setAttribute('aria-valuemax', String(total));
  el.progressBar.setAttribute('aria-valuenow', String(filled));
  const perPlayer = game.players.map(() => 0);
  for (const rect of game.board.rects) perPlayer[rect.player] += rect.area;
  // Reuse the segments so their widths animate as the board fills.
  if (el.progressBar.children.length !== game.players.length) {
    el.progressBar.innerHTML = '';
    for (let i = 0; i < game.players.length; i++) el.progressBar.append(document.createElement('span'));
  }
  game.players.forEach((p, i) => {
    const seg = el.progressBar.children[i];
    seg.style.width = `${(perPlayer[i] / total) * 100}%`;
    seg.style.background = p.color;
  });
}

function renderScores() {
  el.scores.innerHTML = '';
  game.players.forEach((p, i) => {
    const card = document.createElement('div');
    card.className = 'score-card' + (i === game.current && game.phase !== 'over' ? ' active' : '');
    card.style.setProperty('--c', p.color);

    const head = document.createElement('div');
    head.className = 'score-head';
    const name = document.createElement('span');
    name.className = 'score-name';
    name.textContent = p.avatar ? `${p.avatar} ${p.name}` : p.name;
    if (p.title) {
      name.append(make('span', 'player-title', p.title));
    }
    const pts = document.createElement('span');
    pts.className = 'score-pts';
    pts.textContent = p.score;
    head.append(name, pts);
    card.append(head);
    if (game.mode === 'class' && game.classroom.view && game.classroom.view.of > 1) {
      const { you, of } = game.classroom.view;
      card.append(make('div', 'score-rank', `🏫 ${you.tied ? 'Tied for ' : ''}${ordinal(you.rank)} of ${of} in the class`));
    }

    if (p.log.length) {
      const log = document.createElement('ul');
      log.className = 'score-log';
      for (const entry of p.log) {
        const li = document.createElement('li');
        if (entry.pass) {
          li.className = 'pass';
          li.textContent = `${entry.a}×${entry.b} pass`;
        } else if (entry.timeout) {
          li.className = 'timeout';
          li.textContent = `${entry.a}×${entry.b} ⏰`;
        } else {
          li.textContent = `${entry.a}×${entry.b}=${entry.area}${entry.bonus ? ` +${entry.bonus}` : ''}`;
          if (entry.star) li.className = 'star';
        }
        log.append(li);
      }
      card.append(log);
    }
    el.scores.append(card);
  });
}

let cssSize = 0;

function resizeBoard() {
  if (!game) return;
  const wrapStyle = getComputedStyle(el.boardWrap);
  const pad = parseFloat(wrapStyle.paddingLeft) + parseFloat(wrapStyle.paddingRight);
  const available = el.boardWrap.clientWidth - pad;
  const narrow = window.innerWidth <= 820;
  // Leave room for the header, and on phones for the dice panel below the board.
  const maxByHeight = window.innerHeight - (narrow ? 300 : 110);
  cssSize = Math.max(200, Math.floor(Math.min(available, maxByHeight, 760)));
  const dpr = window.devicePixelRatio || 1;
  el.canvas.style.width = el.canvas.style.height = `${cssSize}px`;
  el.canvas.width = el.canvas.height = Math.round(cssSize * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawBoard();
}

// Board colours come from the CSS theme, so the canvas follows light/dark mode.
let pal = {};

function readPalette() {
  const css = getComputedStyle(document.documentElement);
  const v = (name) => css.getPropertyValue(name).trim();
  pal = {
    bg: v('--board-bg'),
    grid: v('--board-grid'),
    hint: v('--board-hint'),
    edge: v('--board-edge'),
    fade: v('--board-fade'),
    wrong: v('--board-wrong'),
    bad: v('--bad'),
    tagBg: v('--invert-bg'),
    tagInk: v('--invert-ink'),
  };
  Object.assign(pal, BOARD_THEMES[settings.cosmetics.board] || {}); // Wardrobe board
}

// Wardrobe boards: colours plus a little decoration. Graph paper follows the theme.
const BOARD_THEMES = {
  graph: null,
  notebook: { bg: '#fdfdf6', grid: '#b9d3ea', edge: '#2b2a33', hint: '#8a8f99', fade: 'rgba(253, 253, 246, 0.65)', decor: 'notebook' },
  chalkboard: { bg: '#2f4f3a', grid: 'rgba(255, 255, 255, 0.16)', edge: '#1b3024', hint: '#d7e8dc', fade: 'rgba(47, 79, 58, 0.7)', wrong: '#c9d6cc', decor: 'chalk' },
  beach: { bg: '#f4e1b0', grid: 'rgba(150, 110, 50, 0.25)', edge: '#b58a4a', hint: '#8a6a3a', fade: 'rgba(244, 225, 176, 0.65)', decor: 'sand' },
  space: { bg: '#10143a', grid: 'rgba(255, 255, 255, 0.12)', edge: '#3a3f7a', hint: '#aab0e0', fade: 'rgba(16, 20, 58, 0.7)', wrong: '#aab0e0', decor: 'stars' },
  snow: { bg: '#eef6ff', grid: '#c8dcf0', edge: '#7a9cc0', hint: '#6d86a4', fade: 'rgba(238, 246, 255, 0.65)', decor: 'flakes' },
};

// Repeatable pseudo-random numbers so decorations don't jump around on every redraw.
function decorRandom(seed) {
  let a = seed;
  return () => {
    a = (a * 1103515245 + 12345) % 2147483648;
    return a / 2147483648;
  };
}

function drawBoardDecor(kind, cell) {
  const r = decorRandom(7);
  ctx.save();
  if (kind === 'notebook') {
    ctx.strokeStyle = 'rgba(230, 110, 110, 0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cell * 0.5, 0);
    ctx.lineTo(cell * 0.5, cssSize);
    ctx.stroke();
  } else if (kind === 'stars' || kind === 'flakes' || kind === 'sand' || kind === 'chalk') {
    const count = kind === 'sand' ? 260 : kind === 'chalk' ? 40 : 90;
    for (let i = 0; i < count; i++) {
      const x = r() * cssSize;
      const y = r() * cssSize;
      const size = kind === 'chalk' ? 6 + r() * 14 : 0.6 + r() * (kind === 'flakes' ? 2.2 : 1.6);
      ctx.fillStyle =
        kind === 'stars' ? `rgba(255, 255, 255, ${0.35 + r() * 0.6})` :
        kind === 'flakes' ? 'rgba(160, 190, 225, 0.6)' :
        kind === 'sand' ? 'rgba(160, 120, 60, 0.35)' : 'rgba(255, 255, 255, 0.05)';
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// Wardrobe rectangle patterns: light marks over your own rectangles.
const patternCache = {};

function rectPattern(kind) {
  if (patternCache[kind]) return patternCache[kind];
  const tile = document.createElement('canvas');
  tile.width = tile.height = 16;
  const g = tile.getContext('2d');
  g.strokeStyle = g.fillStyle = 'rgba(255, 255, 255, 0.35)';
  g.lineWidth = 3;
  if (kind === 'stripes') {
    g.beginPath();
    g.moveTo(-4, 20);
    g.lineTo(20, -4);
    g.moveTo(-4, 4);
    g.lineTo(4, -4);
    g.moveTo(12, 20);
    g.lineTo(20, 12);
    g.stroke();
  } else if (kind === 'dots') {
    g.beginPath();
    g.arc(4, 4, 2.5, 0, Math.PI * 2);
    g.arc(12, 12, 2.5, 0, Math.PI * 2);
    g.fill();
  } else if (kind === 'bricks') {
    g.lineWidth = 1.5;
    g.strokeRect(0, 0.75, 16, 7.5);
    g.beginPath();
    g.moveTo(8, 8);
    g.lineTo(8, 16);
    g.stroke();
  } else if (kind === 'checker') {
    g.fillRect(0, 0, 8, 8);
    g.fillRect(8, 8, 8, 8);
  } else if (kind === 'wood') {
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(0, 4);
    g.bezierCurveTo(5, 2, 11, 6, 16, 4);
    g.moveTo(0, 11);
    g.bezierCurveTo(5, 13, 11, 9, 16, 11);
    g.stroke();
  }
  return (patternCache[kind] = ctx.createPattern(tile, 'repeat'));
}

// ---- placing effects: redraw the board for a moment after a rectangle lands
const PLACE_FX_MS = 650;

let boardAnimUntil = 0;

function animateBoard(ms) {
  const already = boardAnimUntil > performance.now();
  boardAnimUntil = Math.max(boardAnimUntil, performance.now() + ms);
  if (already) return;
  const step = () => {
    drawBoard();
    if (performance.now() < boardAnimUntil) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

const easeOutBack = (t) => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2);

function drawBoard() {
  if (!game || !cssSize) return;
  readPalette();
  const n = game.size;
  const cell = cssSize / n;
  ctx.clearRect(0, 0, cssSize, cssSize);
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, cssSize, cssSize);
  if (pal.decor) drawBoardDecor(pal.decor, cell);

  // grid
  ctx.strokeStyle = pal.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const v = Math.round(i * cell) + 0.5;
    ctx.moveTo(v, 0);
    ctx.lineTo(v, cssSize);
    ctx.moveTo(0, v);
    ctx.lineTo(cssSize, v);
  }
  ctx.stroke();

  if (Core.mustUseCorner(game.board)) {
    ctx.fillStyle = pal.hint;
    ctx.font = `700 ${Math.max(8, cell * 0.2)}px system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ['Start', 'here'].forEach((t, i) => ctx.fillText(t, 4, 4 + i * cell * 0.24));
  }

  for (const rect of game.board.rects) {
    drawRect(rect, game.players[rect.player].color, cell, rect === game.lastRect);
  }

  // pairs: your partner's move as they make it
  if (game.mode === 'pair' && game.partnerLive && game.partnerLive.rect) {
    drawPartnerLive(game.partnerLive, game.players[1 - game.classroom.me].color, cell);
  }

  const preview = game.cpuPreview ? { ...game.cpuPreview, valid: true } : humanPreview();
  if (preview) drawPreview(preview, currentPlayer().color, cell);
  if (game.phase === 'place' && game.placeMode === 'draw') {
    if (game.drag) drawDragging(dragRect(), currentPlayer().color, cell);
    else if (game.hover) drawHoverCell(game.hover, currentPlayer().color, cell);
  }

  ctx.strokeStyle = pal.edge;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, cssSize - 2, cssSize - 2);
}

// Your partner's rectangle: dashed while they're still moving it, then solid
// with a "?" while they work out the answer.
function drawPartnerLive(live, color, cell) {
  const { x, y, w, h } = live.rect;
  ctx.save();
  if (live.phase === 'answer') {
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.55;
    ctx.fillRect(x * cell, y * cell, w * cell, h * cell);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff';
    ctx.font = `900 ${Math.max(14, Math.min(w, h) * cell * 0.5)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', (x + w / 2) * cell, (y + h / 2) * cell);
  } else {
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.18;
    ctx.fillRect(x * cell, y * cell, w * cell, h * cell);
    ctx.globalAlpha = 1;
  }
  ctx.setLineDash(live.phase === 'answer' ? [] : [6, 4]);
  ctx.strokeStyle = shade(color, -0.3);
  ctx.lineWidth = 2.5;
  ctx.strokeRect(x * cell + 1.5, y * cell + 1.5, w * cell - 3, h * cell - 3);
  ctx.restore();
}

function drawRect(rect, color, cell, highlight) {
  const x = rect.x * cell;
  const y = rect.y * cell;
  const w = rect.w * cell;
  const h = rect.h * cell;
  const t = rect.fx ? Math.min(1, (performance.now() - rect.placedAt) / PLACE_FX_MS) : 1;
  if (rect.fx === 'pop' && t < 1) return drawPopIn(rect, color, cell, t);
  const owner = game.players[rect.player];
  ctx.save();
  if (rect.fx === 'glow' && t < 1) {
    ctx.shadowColor = color;
    ctx.shadowBlur = 36 * (1 - t);
  }
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.82;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
  if (!owner.cpu && settings.cosmetics.pattern !== 'none') {
    ctx.fillStyle = rectPattern(settings.cosmetics.pattern);
    ctx.fillRect(x, y, w, h);
  }
  ctx.strokeStyle = shade(color, -0.35);
  ctx.lineWidth = highlight ? 3.5 : 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  if (rect.fx === 'ripple' && t < 1) {
    const grow = t * cell * 0.9;
    ctx.save();
    ctx.globalAlpha = 1 - t;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.strokeRect(x - grow, y - grow, w + grow * 2, h + grow * 2);
    ctx.restore();
  }
  if (game.counting && game.counting.rect === rect) drawCounting(game.counting, color, cell);
  else drawLabel(rect, x, y, w, h, cell);
}

// Pop-in: the squares spring up one after another.
function drawPopIn(rect, color, cell, t) {
  const total = rect.w * rect.h;
  ctx.fillStyle = color;
  for (let k = 0; k < total; k++) {
    const local = Math.max(0, Math.min(1, (t - (k / total) * 0.55) / 0.45));
    if (!local) continue;
    const s = easeOutBack(local);
    const cx = (rect.x + (k % rect.w) + 0.5) * cell;
    const cy = (rect.y + Math.floor(k / rect.w) + 0.5) * cell;
    const half = (cell / 2) * s;
    ctx.globalAlpha = 0.82;
    ctx.fillRect(cx - half, cy - half, half * 2, half * 2);
  }
  ctx.globalAlpha = 1;
}

// Skip counting: rows (or columns) already counted stay bright and show the
// running total; the rest are faded out.
function drawCounting({ rect, byRows, shown }, color, cell) {
  const stripes = byRows ? rect.h : rect.w;
  const group = byRows ? rect.w : rect.h;
  for (let i = 0; i < stripes; i++) {
    const sx = (rect.x + (byRows ? 0 : i)) * cell;
    const sy = (rect.y + (byRows ? i : 0)) * cell;
    const sw = (byRows ? rect.w : 1) * cell;
    const sh = (byRows ? 1 : rect.h) * cell;
    if (i >= shown) {
      ctx.fillStyle = pal.fade;
      ctx.fillRect(sx, sy, sw, sh);
      continue;
    }
    ctx.strokeStyle = shade(color, -0.45);
    ctx.lineWidth = 2;
    ctx.strokeRect(sx + 2, sy + 2, sw - 4, sh - 4);
    const size = Math.max(10, Math.min(cell * 0.55, 24));
    ctx.font = `900 ${size}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 4;
    ctx.strokeStyle = shade(color, -0.5);
    ctx.fillStyle = '#ffffff';
    const text = String((i + 1) * group);
    ctx.strokeText(text, sx + sw / 2, sy + sh / 2);
    ctx.fillText(text, sx + sw / 2, sy + sh / 2);
  }
}

function drawLabel(rect, x, y, w, h, cell) {
  const size = Math.max(9, Math.min(cell * 0.5, 22));
  ctx.font = `800 ${size}px system-ui, sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const cx = x + w / 2;
  const cy = y + h / 2;
  if (!rect.solved) {
    ctx.font = `900 ${Math.max(12, Math.min(cell * 0.9, 36))}px system-ui, sans-serif`;
    ctx.fillText('?', cx, cy);
    return;
  }
  const full = `${rect.a}×${rect.b}=${rect.area}`;
  if (ctx.measureText(full).width <= w - 8) {
    ctx.fillText(full, cx, cy);
  } else if (h > w && ctx.measureText(full).width <= h - 8) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(full, 0, 0);
    ctx.restore();
  } else if (ctx.measureText(String(rect.area)).width <= w - 4) {
    ctx.fillText(String(rect.area), cx, cy);
  }
}

// The rectangle a human is dragging out, labelled with its current size.
// Player colour when it matches the roll and fits, grey when the size is
// wrong, red when it overlaps.
function drawDragging(r, color, cell) {
  const verdict = judgeDrawn(r);
  const tint = !verdict.fits ? pal.bad : verdict.ok ? color : pal.wrong;
  const x = r.x * cell;
  const y = r.y * cell;
  const w = r.w * cell;
  const h = r.h * cell;
  ctx.fillStyle = tint;
  ctx.globalAlpha = verdict.ok ? 0.55 : 0.3;
  ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = shade(tint, -0.3);
  ctx.lineWidth = 2.5;
  ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);

  const label = `${r.w} × ${r.h}${verdict.ok ? ' ✓' : ''}`;
  const size = Math.max(12, Math.min(cell * 0.6, 24));
  ctx.font = `900 ${size}px system-ui, sans-serif`;
  const tw = ctx.measureText(label).width + 12;
  const th = size + 8;
  // Tag just above the rectangle (or inside the top if there's no room).
  const tx = Math.max(2, Math.min(x + w / 2 - tw / 2, cssSize - tw - 2));
  const ty = y - th - 4 >= 0 ? y - th - 4 : y + 4;
  ctx.fillStyle = pal.tagBg;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(tx, ty, tw, th, 6);
  else ctx.rect(tx, ty, tw, th);
  ctx.fill();
  ctx.fillStyle = pal.tagInk;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, tx + tw / 2, ty + th / 2 + 1);
}

function drawHoverCell({ c, r }, color, cell) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.strokeRect(c * cell + 2, r * cell + 2, cell - 4, cell - 4);
}

function drawPreview(p, color, cell) {
  const x = p.x * cell;
  const y = p.y * cell;
  const w = p.w * cell;
  const h = p.h * cell;
  ctx.fillStyle = p.valid ? color : pal.bad;
  ctx.globalAlpha = p.valid ? 0.35 : 0.22;
  ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = 1;
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = p.valid ? shade(color, -0.3) : pal.bad;
  ctx.lineWidth = 2.5;
  ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
  ctx.setLineDash([]);
  if (!p.valid) {
    ctx.fillStyle = pal.bad;
    ctx.font = `800 ${Math.max(10, Math.min(cell * 0.5, 20))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✕', x + w / 2, y + h / 2);
  }
}

// Darken (negative amount) or lighten a #rrggbb colour.
function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (v) => Math.round(amount < 0 ? v * (1 + amount) : v + (255 - v) * amount);
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `rgb(${r}, ${g}, ${b})`;
}

// What this part does when the page loads (main.js runs every part in order)
export function run() {
  window.addEventListener('resize', resizeBoard);
}

export { PLACE_FX_MS, animateBoard, drawBoard, render, renderDie, resizeBoard, setMsg };
