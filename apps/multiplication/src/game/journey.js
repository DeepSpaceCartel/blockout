// The Journeys on the menu: single player's (boards and dice) and Practice's
// (one times table a level). The level you're on, what it takes to move up,
// and the switch to Free play / Free practice once it's open. The rules are
// @blockout/progress/journey; part of the multiplication game.

import * as Journey from '@blockout/progress/journey';
import { el, setup } from './base.js';
import { progress } from './wallet.js';
import { icon, renderGameLevel, renderSetupSections } from './wardrobe.js';
import { updatePracticePreview } from './practice.js';

// Playing the Journey right now: single player, not Free play, levels left
const journeyOn = () => setup.mode === 'single' && Journey.onJourney(progress, setup.play);

// The level a new single-player game plays (null: Free play)
const journeyGame = () => (journeyOn() ? Journey.journeyLevel(progress) : null);

// The difficulty single player's Level and timers go by: the level's, or null for the menu's
const journeyDifficulty = () => (journeyOn() ? Journey.levelSetup(Journey.journeyLevel(progress)).difficulty : null);

// Practicing on the Journey: the ×n table of the Practice level reached
const practiceJourneyOn = () => setup.mode === 'practice' && Journey.onPracticeJourney(progress, setup.practicePlay);

// The Practice level a new round plays (null: Free practice)
const practiceJourneyLevel = () => (practiceJourneyOn() ? Journey.practiceLevel(progress) : null);

// The difficulty Practice's Expert, timers and lengths go by on the Journey (null: the menu's)
const practiceJourneyDifficulty = () => (practiceJourneyOn() ? Journey.practiceTier(progress, Journey.practiceLevel(progress)) : null);

function renderSteps(steps) {
  el.journeySteps.replaceChildren(
    ...steps.map((s) => {
      const li = document.createElement('li');
      li.textContent = s.label || s.level;
      li.className = s.done ? 'done' : s.current ? 'current' : '';
      li.setAttribute('aria-label', `${s.label || `Level ${s.level}`}${s.done ? ': done' : s.current ? ': you are here' : ''}`);
      return li;
    })
  );
}

// What the card shows for single player's Journey or Practice's
function journeyView() {
  if (setup.mode === 'practice') {
    const level = Journey.practiceLevel(progress);
    const done = Journey.practiceDone(progress);
    return {
      key: 'practicePlay', done, open: Journey.freePracticeOpen(progress), on: practiceJourneyOn(),
      name: Journey.practiceName(level),
      line: done ? 'You finished every times table. Pick any of them in Free practice!' : Journey.practiceLine(level),
      goal: Journey.practiceGoalLine(),
      steps: Journey.practiceSteps(progress),
      free: ['Free practice', 'pick tables'],
      start: `Practice ×${level}`,
    };
  }
  const level = Journey.journeyLevel(progress);
  const done = Journey.isDone(progress);
  return {
    key: 'play', done, open: Journey.freePlayOpen(progress), on: journeyOn(),
    name: Journey.levelName(level),
    line: done ? 'You finished every level. Pick any board and dice in Free play!' : Journey.levelLine(level),
    goal: Journey.goalLine(),
    steps: Journey.steps(progress),
    free: ['Free play', 'pick a board'],
    start: `Play ${Journey.levelName(level)}`,
  };
}

// The card, the Journey / Free switch, and what the rest of the form shows: on
// the Journey the level picks the board and dice (or the times table).
function renderJourney() {
  if (!el.journeyCard) return;
  const shown = setup.mode === 'single' || setup.mode === 'practice';
  el.journeyCard.hidden = !shown;
  if (!shown) return;
  const v = journeyView();
  if (v.done) setup[v.key] = 'free';
  else if (!v.open) setup[v.key] = 'journey';
  el.playKind.hidden = !v.open || v.done;
  for (const b of el.playKind.querySelectorAll('[data-play]')) {
    const on = b.dataset.play === setup[v.key];
    b.classList.toggle('selected', on);
    b.setAttribute('aria-checked', String(on));
  }
  const small = document.createElement('small');
  small.textContent = v.free[1];
  el.playKind.querySelector('[data-play="free"]').replaceChildren(icon('dices'), ` ${v.free[0]} `, small);
  const on = journeyOn() || practiceJourneyOn();
  el.journeyInfo.hidden = !on && !v.done;
  el.journeyLevel.textContent = v.name;
  el.journeyLine.textContent = v.line;
  el.journeyGoal.replaceChildren(icon('flag'), ` ${v.goal} to move up.`);
  el.journeyGoal.hidden = v.done;
  renderSteps(v.steps);
  el.difficultyField.hidden = on;
  if (setup.mode === 'single') el.boardSizeField.hidden = on;
  else {
    el.practiceTablesField.hidden = on;
    el.practicePreview.hidden = on;
  }
  if (on) {
    el.startBtn.replaceChildren(icon('play'), ` ${v.start}`);
    el.startBtn.disabled = false;
  }
}

// What this part does when the page loads (main.js runs every part in order)
export function run() {
  renderJourney();

  el.playKind.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-play]');
    if (!btn) return;
    setup[setup.mode === 'practice' ? 'practicePlay' : 'play'] = btn.dataset.play;
    renderSetupSections();
    renderGameLevel();
    updatePracticePreview();
  });
}

export { journeyDifficulty, journeyGame, journeyOn, practiceJourneyDifficulty, practiceJourneyLevel, practiceJourneyOn, renderJourney };
