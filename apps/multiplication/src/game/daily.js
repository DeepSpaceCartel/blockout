// Today's practice: part of the multiplication game. One small task a day on
// the menu, picked from the player's own Times Table (@blockout/progress/daily,
// shared with the phone app), with a reward that grows with a streak.

import * as Daily from '@blockout/progress/daily';
import { celebrate, progress, saveProgress, toast } from './wallet.js';
import { make } from './play.js';
import { startPractice } from './practice.js';
import { tap } from './shop.js';

let box = null; // #daily-card

// The menu's card (again after every save: done, or a new day)
function renderDaily() {
  if (!box) return;
  const c = Daily.card(progress);
  box.replaceChildren();
  box.classList.toggle('done', c.done);
  const text = make('div', 'daily-text');
  const title = make('span', 'daily-title', `${c.title} `);
  if (c.reward) title.append(make('span', 'daily-reward', c.reward));
  text.append(title, make('span', 'daily-task', c.text));
  if (!c.done) text.append(make('span', 'daily-why', c.why));
  if (c.streak) text.append(make('span', 'daily-streak', c.streak));
  box.append(text);
  if (!c.done) {
    const play = make('button', 'btn btn-small btn-primary', 'Play ›');
    play.type = 'button';
    play.setAttribute('aria-label', `Play today’s practice: ${c.text}`);
    play.addEventListener('click', playDaily);
    box.append(play);
  }
  box.hidden = false;
}

// Its round straight away (a taste of the next table too, though it's still
// locked), or the menu set up for its game, then Start
function playDaily() {
  const p = Daily.playFor(Daily.today(progress).task);
  if (p.practice) return startPractice('You', p.practice.count, p.practice.tables, false, 0, p.practice.difficulty);
  tap('[data-mode="single"]');
  tap(`[data-setting="difficulty"] [data-value="${p.game.difficulty}"]`);
  tap(`#board-size [data-size="${p.game.size}"]`);
  const start = document.getElementById('start-btn');
  if (!start.disabled) start.click();
}

// A practice round or a game just finished: today's practice, if it was that
function completeDaily(result) {
  const done = Daily.complete(progress, result);
  if (!done) return [];
  toast(...done.toast);
  const earned = celebrate(done.earned);
  saveProgress();
  return earned;
}

// What this part does when the page loads (main.js runs every part in order)
export function run() {
  box = document.getElementById('daily-card');
  Daily.today(progress); // (a new day: today's practice)
  saveProgress();
  renderDaily();
}

export { completeDaily, renderDaily };
