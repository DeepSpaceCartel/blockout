// Input: part of the multiplication game (split from the old js/game.js).

import * as Core from '@blockout/engine';
import * as Match from '@blockout/engine/match';
import { el } from './base.js';
import { icon } from './wardrobe.js';
import { cancelContinue, clearLastDie, continueResolve, currentPlayer, game, gameId, helpCount, humanRoll, pickDie, placeInstructions, placeRect, pressContinue, setGame, setGameId, startAnswer, startGame, stopTimer, typeDie, typeKey, useRealDice } from './play.js';
import { classSession, leaveClass, showHostView } from './classroom.js';
import { render, renderDie, setMsg } from './render.js';

function setDetailsOpen(open) {
  el.stats.hidden = !open;
  el.detailsBtn.replaceChildren(icon('chart-column'), open ? ' Hide details' : ' Show details');
  el.detailsBtn.setAttribute('aria-expanded', String(open));
}

// One button per face; 8- and 12-sided dice get numbered faces.
function buildDicePicks(sides) {
  el.diePicks.forEach((row, i) => {
    row.innerHTML = '';
    for (let v = 1; v <= sides; v++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'die mini';
      btn.dataset.value = v;
      row.append(btn);
      renderDie(btn, v, sides);
      btn.setAttribute('aria-label', `Die ${i + 1}: ${v}`);
    }
  });
}

function rotate() {
  if (!game || game.phase !== 'place' || game.placeMode !== 'click' || Core.mustUseCorner(game.board)) return;
  game.rotated = !game.rotated;
  render();
}

// Cell under the pointer; null when outside the board unless clamp is set.
function cellFromEvent(e, clamp = false) {
  const rect = el.canvas.getBoundingClientRect();
  const cell = rect.width / game.size;
  let c = Math.floor((e.clientX - rect.left) / cell);
  let r = Math.floor((e.clientY - rect.top) / cell);
  if (clamp) {
    c = Math.max(0, Math.min(c, game.size - 1));
    r = Math.max(0, Math.min(r, game.size - 1));
  } else if (c < 0 || r < 0 || c >= game.size || r >= game.size) {
    return null;
  }
  return { c, r };
}

// The rectangle being previewed, centred on the pointer and kept on the board
// (the rule is shared with the phone app: Match.previewAt)
function humanPreview() {
  if (!game || game.phase !== 'place' || game.placeMode !== 'click' || !game.hover) return null;
  return Match.previewAt(game, game.hover, game.rotated);
}

// ---- draw mode: drag out the rectangle corner to corner

function dragRect() {
  const { c0, r0, c1, r1 } = game.drag;
  return { x: Math.min(c0, c1), y: Math.min(r0, r1), w: Math.abs(c1 - c0) + 1, h: Math.abs(r1 - r0) + 1 };
}

// How the rectangle being drawn compares to the roll.
function judgeDrawn({ x, y, w, h }) {
  const [a, b] = game.dice;
  const rightSize = (w === a && h === b) || (w === b && h === a);
  const fits = Core.fits(game.board, x, y, w, h);
  const corner = !Core.mustUseCorner(game.board) || (x === 0 && y === 0);
  return { rightSize, fits, corner, ok: rightSize && fits && corner };
}

function finishDrag() {
  const r = dragRect();
  game.drag = null;
  const [a, b] = game.dice;
  const verdict = judgeDrawn(r);
  if (verdict.ok) {
    startAnswer(placeRect(r.x, r.y, r.w, r.h));
    return;
  }
  let msg;
  if (!verdict.rightSize) {
    msg = `That's ${r.w} by ${r.h}, but you rolled ${a} and ${b}. Try again!`;
  } else if (!verdict.fits) {
    msg = 'Right size, but it bumps into another rectangle. Try a different spot!';
  } else {
    msg = 'Right size! But the first rectangle has to start in the top-left corner.';
  }
  setMsg(msg);
  el.turnMsg.classList.add('oops');
  render();
}

function toMenu() {
  cancelContinue();
  stopTimer();
  setGameId(gameId + 1);
  setGame(null);
  el.gameOver.hidden = true;
  el.gameScreen.hidden = true;
  el.startScreen.hidden = false;
}

// What this part does when the page loads (main.js runs every part in order)
export function run() {
  el.rollBtn.addEventListener('click', humanRoll);

  el.useDiceBtn.addEventListener('click', useRealDice);

  el.continueBtn.addEventListener('click', pressContinue);

  el.detailsBtn.addEventListener('click', () => setDetailsOpen(el.stats.hidden));

  el.diePicks.forEach((row, i) => {
    row.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (btn) pickDie(i, Number(btn.dataset.value));
    });
  });

  el.rotateBtn.addEventListener('click', rotate);

  el.helpBtn.addEventListener('click', helpCount);

  el.keypad.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (btn) typeKey(btn.dataset.key);
  });

  document.addEventListener('keydown', (e) => {
    if (!game || el.gameScreen.hidden || !el.gameOver.hidden) return;
    if (!el.settingsDialog.hidden || !el.shopDialog.hidden) return; // a dialog is on top of the game
    if (e.target.closest('.overlay, input')) return; // e.g. Esc that just closed a dialog
    if (continueResolve && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      pressContinue();
    } else if (game.phase === 'answer') {
      if (/^[0-9]$/.test(e.key)) typeKey(e.key);
      else if (e.key === 'Backspace') typeKey('back');
      else if (e.key === 'Escape') typeKey('clear');
      else if (e.key === 'Enter') typeKey('check');
      else return;
      e.preventDefault();
    } else if (game.phase === 'roll' && game.diceMode === 'real' && !currentPlayer().cpu) {
      if (/^[1-9]$/.test(e.key) && Number(e.key) <= game.sides) typeDie(Number(e.key));
      else if (e.key === 'Backspace') clearLastDie();
      else if (e.key === 'Enter') useRealDice();
      else return;
      e.preventDefault();
    } else if ((e.key === ' ' || e.key === 'Enter') && game.phase === 'roll') {
      e.preventDefault();
      humanRoll();
    } else if (e.key === 'r' || e.key === 'R') {
      rotate();
    }
  });

  el.canvas.addEventListener('pointerdown', (e) => {
    if (!game || game.phase !== 'place' || game.placeMode !== 'draw') return;
    const cell = cellFromEvent(e);
    if (!cell) return;
    e.preventDefault();
    el.canvas.setPointerCapture(e.pointerId);
    game.drag = { c0: cell.c, r0: cell.r, c1: cell.c, r1: cell.r };
    setMsg(placeInstructions());
    render();
  });

  el.canvas.addEventListener('pointerup', (e) => {
    if (!game || !game.drag || game.phase !== 'place') return;
    const cell = cellFromEvent(e, true);
    game.drag.c1 = cell.c;
    game.drag.r1 = cell.r;
    finishDrag();
  });

  el.canvas.addEventListener('pointercancel', () => {
    if (!game || !game.drag) return;
    game.drag = null;
    render();
  });

  el.canvas.addEventListener('pointermove', (e) => {
    if (!game || game.phase !== 'place') return;
    if (game.drag) {
      const cell = cellFromEvent(e, true);
      if (cell.c === game.drag.c1 && cell.r === game.drag.r1) return;
      game.drag.c1 = cell.c;
      game.drag.r1 = cell.r;
      render();
      return;
    }
    if (e.pointerType === 'touch') return;
    game.hover = cellFromEvent(e);
    render();
  });

  el.canvas.addEventListener('pointerleave', (e) => {
    if (!game || e.pointerType === 'touch') return;
    game.hover = null;
    render();
  });

  // ---- click mode
  // Mouse: click places. Touch: first tap previews, tapping inside the preview places.
  el.canvas.addEventListener('pointerdown', (e) => {
    if (!game || game.phase !== 'place' || game.placeMode !== 'click') return;
    const cell = cellFromEvent(e);
    if (!cell) return;
    if (e.pointerType === 'touch') {
      const prev = humanPreview();
      const inside =
        prev && cell.c >= prev.x && cell.c < prev.x + prev.w && cell.r >= prev.y && cell.r < prev.y + prev.h;
      if (!inside || !prev.valid) {
        game.hover = cell;
        render();
        return;
      }
    } else {
      game.hover = cell;
    }
    const p = humanPreview();
    if (p && p.valid) startAnswer(placeRect(p.x, p.y, p.w, p.h));
    else render();
  });

  el.menuBtn.addEventListener('click', () => {
    if (classSession && classSession.host) return showHostView(); // teacher: back to the class
    const inClass = game && (game.mode === 'class' || game.mode === 'pair');
    const question = inClass ? 'Leave the class game? Your score so far won’t count.' : 'Leave this game and go back to the menu?';
    if (game && game.phase !== 'over' && !confirm(question)) return;
    if (inClass) leaveClass();
    toMenu();
  });

  el.toMenuBtn.addEventListener('click', () => {
    if (classSession && classSession.host) {
      el.gameOver.hidden = true;
      return showHostView();
    }
    if (game && (game.mode === 'class' || game.mode === 'pair')) leaveClass();
    toMenu();
  });

  el.againBtn.addEventListener('click', () => {
    startGame(
      game.players.map(({ name, cpu }) => ({ name, cpu })),
      game.size,
      game.mode,
      game.invite
    );
  });
}

export { buildDicePicks, dragRect, humanPreview, judgeDrawn, setDetailsOpen, toMenu };
