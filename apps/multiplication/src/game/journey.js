// Single player's Journey on the menu: the level you're on, what it takes to
// move up, and the switch to Free play once it's open. The rules are
// @blockout/progress/journey; part of the multiplication game.

import * as Journey from '@blockout/progress/journey';
import { el, setup } from './base.js';
import { progress } from './wallet.js';
import { renderGameLevel, renderSetupSections } from './wardrobe.js';

// Playing the Journey right now: single player, not Free play, levels left
const journeyOn = () => setup.mode === 'single' && Journey.onJourney(progress, setup.play);

// The level a new single-player game plays (null: Free play)
const journeyGame = () => (journeyOn() ? Journey.journeyLevel(progress) : null);

// The difficulty single player's Level and timers go by: the level's, or null for the menu's
const journeyDifficulty = () => (journeyOn() ? Journey.levelSetup(Journey.journeyLevel(progress)).difficulty : null);

function renderSteps() {
  el.journeySteps.replaceChildren(
    ...Journey.steps(progress).map((s) => {
      const li = document.createElement('li');
      li.textContent = s.level;
      li.className = s.done ? 'done' : s.current ? 'current' : '';
      li.setAttribute('aria-label', `Level ${s.level}${s.done ? ': done' : s.current ? ': you are here' : ''}`);
      return li;
    })
  );
}

// The card, the Journey / Free play switch, and what the rest of the form
// shows: on the Journey the level picks the board and dice.
function renderJourney() {
  if (!el.journeyCard) return;
  const single = setup.mode === 'single';
  const done = Journey.isDone(progress);
  if (done) setup.play = 'free';
  else if (!Journey.freePlayOpen(progress)) setup.play = 'journey';
  el.journeyCard.hidden = !single;
  el.playKind.hidden = !Journey.freePlayOpen(progress) || done;
  for (const b of el.playKind.querySelectorAll('[data-play]')) {
    const on = b.dataset.play === setup.play;
    b.classList.toggle('selected', on);
    b.setAttribute('aria-checked', String(on));
  }
  const level = Journey.journeyLevel(progress);
  el.journeyInfo.hidden = setup.play !== 'journey' && !done;
  el.journeyLevel.textContent = Journey.levelName(level);
  el.journeyLine.textContent = done ? 'You finished every level. Pick any board and dice in Free play!' : Journey.levelLine(level);
  el.journeyGoal.textContent = `🏁 ${Journey.goalLine()} to move up.`;
  el.journeyGoal.hidden = done;
  renderSteps();
  if (!single) return;
  const on = journeyOn();
  el.difficultyField.hidden = on;
  el.boardSizeField.hidden = on;
  if (on) {
    el.startBtn.textContent = `▶ Play ${Journey.levelName(level)}`;
    el.startBtn.disabled = false;
  }
}

// What this part does when the page loads (main.js runs every part in order)
export function run() {
  renderJourney();

  el.playKind.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-play]');
    if (!btn) return;
    setup.play = btn.dataset.play;
    renderSetupSections();
    renderGameLevel();
  });
}

export { journeyDifficulty, journeyGame, journeyOn, renderJourney };
