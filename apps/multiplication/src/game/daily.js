// Today's practice: part of the multiplication game. Three small tasks a day
// to pick from, from the player's own Times Table and Journey
// (@blockout/progress/daily, shared with the phone app), with a reward that
// grows with a streak, and new cards for points. It's shown at the top of
// Homework (../accounts.js), for guests too.

import * as Daily from '@blockout/progress/daily';
import { refreshHomeworkBadge } from '../accounts.js';
import { celebrate, progress, renderWallet, saveProgress, toast } from './wallet.js';
import { make } from './play.js';
import { startPractice } from './practice.js';
import { tap } from './shop.js';

// Today's practice: three cards to pick from, like a level-up's (each plays
// its task), the reward or the streak, and new cards for points. onPlay: before
// one starts (Homework closes).
function dailyCard(onPlay = () => {}) {
  const c = Daily.card(progress);
  const box = make('div', 'daily' + (c.done ? ' done' : ''));
  box.id = 'daily-card';
  const head = make('p', 'daily-head');
  head.append(make('span', 'daily-title', c.title));
  if (c.reward) head.append(' ', make('span', 'daily-reward', c.reward));
  if (c.streak) head.append(' ', make('span', 'daily-streak', c.streak));
  box.append(head);
  if (c.done) {
    box.append(make('p', 'daily-done', c.doneText));
    return box;
  }
  const cards = make('div', 'daily-cards');
  c.cards.forEach((card, i) => {
    const pick = make('button', 'daily-pick');
    pick.type = 'button';
    pick.setAttribute('aria-label', `Play: ${card.text}. ${card.why}`);
    const body = make('span', 'daily-body');
    body.append(make('span', 'daily-task', card.text), make('span', 'daily-why', card.why));
    pick.append(make('span', 'daily-icon', card.icon), body, make('span', 'daily-go', 'Play ›'));
    pick.addEventListener('click', () => {
      onPlay();
      playDaily(i);
    });
    cards.append(pick);
  });
  box.append(cards);
  const again = make('button', 'btn btn-small daily-reroll', c.reroll.label);
  again.type = 'button';
  again.disabled = !c.reroll.can;
  again.addEventListener('click', () => {
    if (!Daily.reroll(progress).ok) return;
    saveProgress();
    renderWallet();
    box.replaceWith(dailyCard(onPlay));
  });
  box.append(again);
  return box;
}

// Still to do today? (Homework's badge counts it)
const dailyOpen = () => !Daily.today(progress).done;

// A card's task: its round straight away (a taste of the next table too,
// though it's still locked), or the menu set up for its game (the Journey's
// level, or a board in Free play), then Start
function playDaily(i) {
  const p = Daily.playFor(Daily.today(progress).choices[i]);
  if (p.practice) return startPractice('You', p.practice.count, p.practice.tables, false, 0, p.practice.difficulty);
  tap('[data-mode="single"]');
  if (p.game.journey) tap('#play-kind [data-play="journey"]');
  else {
    tap('#play-kind [data-play="free"]');
    tap(`[data-setting="difficulty"] [data-value="${p.game.difficulty}"]`);
    tap(`#board-size [data-size="${p.game.size}"]`);
  }
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
  refreshHomeworkBadge(true);
  return earned;
}

// What this part does when the page loads (main.js runs every part in order)
export function run() {
  Daily.today(progress); // (a new day: today's practice)
  saveProgress();
}

export { completeDaily, dailyCard, dailyOpen };
