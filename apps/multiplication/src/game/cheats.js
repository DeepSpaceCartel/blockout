// Cheat codes: part of the multiplication game (split from the old js/game.js).

import * as Progress from '@blockout/progress';
import { $, el } from './base.js';
import { celebrate, confettiFullScreen, progress, saveProgress, updateMenuBadges } from './wallet.js';
import { saveSettings } from './settings.js';
import { enforceLocks, renderBoardHint, renderGameLevel, renderWardrobe, syncBoardLocks, syncModeLocks, syncSettingsUI } from './wardrobe.js';
import { game, make } from './play.js';
import { refreshAvailableFilters, refreshOpenNudges, renderShop } from './shop.js';
import { updatePracticePreview } from './practice.js';

let cheatsEl;

const inClassGame = () => game && (game.mode === 'class' || game.mode === 'pair');

// Unlocks changed: bring every menu, list and lock badge up to date.
function refreshUnlocks() {
  enforceLocks();
  saveSettings();
  saveProgress();
  refreshAvailableFilters();
  if (!el.shopDialog.hidden) renderShop();
  if (!el.wardrobeDialog.hidden) renderWardrobe();
  syncSettingsUI();
  syncBoardLocks();
  syncModeLocks();
  updatePracticePreview();
  renderGameLevel();
  renderBoardHint();
  refreshOpenNudges();
  updateMenuBadges();
}

function renderActiveCheats() {
  const codes = Progress.activeCheats(progress);
  cheatsEl.active.hidden = !codes.length;
  cheatsEl.active.replaceChildren();
  if (!codes.length) return;
  cheatsEl.active.append(make('h3', null, 'Active'));
  for (const code of codes) {
    const row = make('div', 'cheat-row');
    const off = make('button', 'btn btn-small', 'Turn off');
    off.type = 'button';
    off.addEventListener('click', () => {
      Progress.cheatOff(progress, code);
      refreshUnlocks();
      renderActiveCheats();
      cheatsEl.msg.className = 'cheats-msg';
      cheatsEl.msg.textContent = 'Cheat turned off.';
    });
    row.append(make('span', null, `✨ ${Progress.CHEAT_CODES[code].name}`), off);
    cheatsEl.active.append(row);
  }
}

function openCheats() {
  cheatsEl.input.value = '';
  cheatsEl.input.classList.remove('wrong');
  cheatsEl.msg.className = 'cheats-msg';
  cheatsEl.msg.textContent = inClassGame() ? 'Cheats are switched off in class games. Nice try! 😄' : '';
  renderActiveCheats();
  cheatsEl.box.hidden = false;
  cheatsEl.input.focus();
}

const closeCheats = () => (cheatsEl.box.hidden = true);

// What this part does when the page loads (main.js runs every part in order)
export function run() {
  // Press ~ anywhere (outside a text box) to open the cheat codes box.

  // code (lower case) -> { name, run() }. None yet.
  // Codes live in Progress.CHEAT_CODES. The menu lists the ones that are on by
  // what they do (never the code itself), each with a Turn off button.
  cheatsEl = { box: $('cheats'), form: $('cheats-form'), input: $('cheats-input'), msg: $('cheats-msg'), close: $('cheats-close'), active: $('cheats-active') };

  document.addEventListener('keydown', (e) => {
    if (e.key !== '~' && e.key !== '`') return;
    if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest('input, textarea, select')) return;
    if ([...document.querySelectorAll('.overlay')].some((o) => !o.hidden)) return; // not on top of another dialog
    e.preventDefault();
    openCheats();
  });

  cheatsEl.close.addEventListener('click', closeCheats);

  cheatsEl.box.addEventListener('click', (e) => e.target === cheatsEl.box && closeCheats());

  cheatsEl.box.addEventListener('keydown', (e) => e.key === 'Escape' && closeCheats());

  cheatsEl.form.addEventListener('submit', (e) => {
    e.preventDefault();
    const code = cheatsEl.input.value.trim().toLowerCase();
    if (!code || inClassGame()) return;
    cheatsEl.input.classList.remove('wrong');
    cheatsEl.input.value = '';
    if (Progress.CHEAT_CODES[code]) {
      const on = Progress.cheatOn(progress, code);
      if (on) {
        confettiFullScreen(3);
        celebrate(Progress.awardAchievements(progress, { event: 'cheat', code })); // Cheater, plus this code's secret
        refreshUnlocks();
      }
      renderActiveCheats();
      cheatsEl.msg.className = 'cheats-msg good';
      cheatsEl.msg.textContent = on ? `✨ ${Progress.CHEAT_CODES[code].name}` : 'That one is already on.';
      return;
    }
    void cheatsEl.input.offsetWidth; // restart the shake
    cheatsEl.input.classList.add('wrong');
    cheatsEl.msg.className = 'cheats-msg';
    cheatsEl.msg.textContent = 'Nothing happened…';
  });
}

export { refreshUnlocks };
