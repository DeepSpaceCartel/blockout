// Wardrobe (cosmetics): part of the multiplication game (split from the old js/game.js).

import * as Progress from '@blockout/progress';
import * as Views from '@blockout/progress/views';
import * as Settings from '@blockout/progress/settings';
import * as Wardrobe from '@blockout/progress/wardrobe';
import * as Setup from '@blockout/progress/setup';
import { BOARD_UNLOCK, DEFAULT_NAMES, el, setup } from './base.js';
import { formatPoints, progress, saveProgress, toast, updateMenuBadges } from './wallet.js';
import { saveSettings, settings } from './settings.js';
import { game, make, startGame } from './play.js';
import { confirmUnlock, filterNote, markSeen, refreshOpenNudges, renderWalletBar, seenList, wardrobeKeys } from './shop.js';
import { startPracticeAuto, startPracticeJourney, updatePracticePreview } from './practice.js';
import { checkClassroom } from './classroom.js';
import { journeyDifficulty, practiceJourneyOn, renderJourney } from './journey.js';
import { drawBoard, render, renderDie } from './render.js';

// settings.cosmetics: { dice, pips, roll, colors, pattern, board, place, confetti,
// win, streak, cpu, avatar, keypad, title }. Only owned choices are kept.
function loadCosmetics() {
  const chosen = { ...(settings.cosmetics || {}) };
  if (settings.diceStyle === 'golden' && !chosen.dice) chosen.dice = 'golden'; // old Dice style setting
  delete settings.diceStyle;
  settings.cosmetics = Wardrobe.chosenLooks(chosen, progress);
}

const look = (categoryId) => Wardrobe.look(settings.cosmetics, categoryId);

function chooseCosmetic(categoryId, optionId) {
  settings.cosmetics[categoryId] = optionId;
  // bought or worn while the Wardrobe is open: you've seen it, so it isn't "new"
  if (!el.wardrobeDialog.hidden) markSeen('wardrobe', [`${categoryId}:${optionId}`]);
  saveSettings();
  applyCosmeticsToPage();
  if (!el.wardrobeDialog.hidden) renderWardrobe();
}

// Keypads get a skin class; dice get theirs when drawn; the board is redrawn.
function applyCosmeticsToPage(redraw = true) {
  for (const pad of document.querySelectorAll('.keypad')) {
    pad.className = `keypad skin-${settings.cosmetics.keypad}`;
  }
  if (redraw) drawBoard();
}

// ---- Wardrobe dialog

function chipPreview(cat, opt) {
  const box = make('span', 'chip-preview');
  if (cat.id === 'dice') {
    const die = make('span', `die mini skin-${opt.id}`);
    renderDie(die, 5, 6, opt.id);
    box.append(die);
  } else if (cat.id === 'colors') {
    for (const c of opt.colors) {
      const sw = make('span', 'swatch');
      sw.style.background = c;
      box.append(sw);
    }
  } else if (cat.id === 'pattern' || cat.id === 'board') {
    box.append(make('span', `tile-preview ${cat.id}-${opt.id}`));
  } else if (cat.id === 'keypad') {
    box.append(make('span', `key-preview skin-${opt.id}`, '7'));
  } else if (cat.id === 'roll' || cat.id === 'place') {
    box.append(make('span', `motion-preview ${cat.id}-${opt.id}`, cat.id === 'roll' ? '🎲' : '▦'));
  } else if (cat.id === 'cpu') {
    box.append(make('span', 'emoji-preview', opt.avatar));
  } else {
    box.append(make('span', 'emoji-preview', opt.preview || ''));
  }
  return box;
}

let wardrobeFilter = null; // Set of 'category:option' keys (new or unlockable when picked), or null for all

let wardrobeNew = []; // keys that were new when the Wardrobe opened

const wardrobeAvailable = () => Wardrobe.availableKeys(progress, wardrobeNew);

function renderWardrobe() {
  const body = el.wardrobeBody;
  body.innerHTML = '';
  renderWalletBar('wardrobe', !!wardrobeFilter);
  if (wardrobeFilter && !wardrobeFilter.size) body.append(make('p', 'filter-note', 'Nothing new to wear yet. Keep playing to earn points!'));
  for (const { category: cat, options } of Wardrobe.wardrobeRows(progress, settings.cosmetics, wardrobeFilter)) {
    body.append(make('h3', 'stats-heading', cat.name));
    const row = make('div', 'wardrobe-row');
    for (const o of options) {
      const opt = o.option;
      const chip = make('button', 'wardrobe-chip' + (o.worn ? ' selected' : '') + (o.owned ? '' : ' locked'));
      chip.type = 'button';
      chip.dataset.cat = cat.id;
      chip.dataset.opt = opt.id;
      chip.append(chipPreview(cat, opt), make('span', 'chip-name', opt.name));
      if (!o.owned) {
        chip.dataset.unlock = o.item;
        const tag = make('span', 'lock-badge');
        if (o.hidden) {
          // further down this category's chain: a placeholder, like the main menu
          chip.classList.add('skeleton');
          chip.setAttribute('aria-label', 'Locked: unlock the one before it first');
          tag.append(icon('lock'));
        } else if (o.season) tag.append(icon('lock'), ` ${o.season}`);
        else {
          chip.dataset.cost = o.price;
          tag.append(icon('lock'), ` ${formatPoints(o.price)}`);
        }
        chip.append(tag);
      }
      row.append(chip);
    }
    body.append(row);
  }
  // Titles are earned, not bought
  const titles = Wardrobe.titleRow(progress, settings.cosmetics, wardrobeFilter);
  if (!titles.length) return;
  body.append(make('h3', 'stats-heading', 'Your title'));
  const row = make('div', 'wardrobe-row');
  for (const { title: t, earned, worn } of titles) {
    const chip = make('button', 'wardrobe-chip title-chip' + (worn ? ' selected' : '') + (earned ? '' : ' locked'));
    chip.type = 'button';
    chip.dataset.cat = 'title';
    chip.dataset.opt = t.id;
    chip.disabled = !earned;
    chip.append(make('span', 'chip-name', t.name));
    if (!earned) chip.append(make('span', 'chip-need', t.need));
    row.append(chip);
  }
  body.append(row);
}

// onlyNew: from a results screen, show just the looks and titles you haven't seen yet
function openWardrobe(onlyNew = false) {
  loadCosmetics();
  const keys = wardrobeKeys();
  wardrobeNew = keys.filter((k) => !seenList('wardrobe').includes(k));
  wardrobeFilter = onlyNew === true ? wardrobeAvailable() : null;
  renderWardrobe();
  markSeen('wardrobe', keys);
  el.wardrobeDialog.hidden = false;
  el.wardrobeDialog.querySelector('.dialog').scrollTop = 0;
  el.wardrobeDone.focus({ preventScroll: true });
}

function closeWardrobe() {
  el.wardrobeDialog.hidden = true;
  refreshOpenNudges();
  updateMenuBadges();
}

// ---- Sticker album

let stickersFilter = null; // Set of sticker ids (new or with spares when opened), or null

function renderStickers() {
  const body = el.stickersBody;
  body.innerHTML = '';
  const album = Views.stickerAlbum(progress, stickersFilter);
  body.append(make('p', 'stats-summary', `${album.got} of ${album.total} collected`));
  if (stickersFilter) {
    body.append(filterNote('Showing your new stickers and spares', () => {
      stickersFilter = null;
      renderStickers();
    }));
  }
  for (const section of album.sections) {
    body.append(make('h3', 'stats-heading', section.name));
    const grid = make('div', 'sticker-grid');
    for (const st of section.slots) {
      const slot = make('div', `sticker ${section.rarity}${st.count ? '' : ' missing'}`);
      slot.append(make('span', 'sticker-emoji', st.emoji || '?'));
      if (st.count > 1) slot.append(make('span', 'sticker-count', `×${st.count}`));
      slot.title = st.count ? `${st.id} (${section.rarity})` : 'Not found yet';
      grid.append(slot);
    }
    body.append(grid);
  }
  el.stickersTrade.disabled = album.spareValue === 0;
  el.stickersTrade.textContent = album.spareValue ? `Swap spares for 🪙 ${formatPoints(album.spareValue)}` : 'No spares to swap';
}

// onlyNew: from a results screen, show just the new stickers and the ones with spares
function openStickers(onlyNew = false) {
  const have = progress.stickers || {};
  stickersFilter = onlyNew === true ? Views.newOrSpareStickers(progress) : null;
  renderStickers();
  markSeen('stickers', Object.keys(have));
  el.stickersDialog.hidden = false;
  el.stickersDone.focus();
}

function closeStickers() {
  el.stickersDialog.hidden = true;
  refreshOpenNudges();
  updateMenuBadges();
}

// Shop item that unlocks a setting's choice; null when it's free (the default).
const unlockFor = Settings.unlockFor;

// Anything saved before it was locked (or not yet bought) falls back to the default.
// (and settings that are gone dropped, choices that are gone back to the default)
function enforceLocks() {
  const out = Settings.enforce(settings, progress);
  for (const key of Settings.GONE) delete settings[key];
  Object.assign(settings, out);
}

// A Lucide icon from the sprite in index.html, e.g. icon('lock').
function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.append(use);
  return svg;
}

// Mark a button as locked with a "🔒 price" badge, or clear it.
// Locked options show their price; ones further down a chain (see SHOP
// `requires`) are a blurred placeholder with just a lock, so only the next
// step shows what it is and what it costs.
function setLockBadge(btn, itemId) {
  const locked = !Progress.isUnlocked(progress, itemId);
  const hidden = locked && Progress.isHidden(progress, itemId);
  // boards, difficulties and tables the Journeys haven't reached yet aren't shown
  // on the menu at all (settings show their lock: tapping it says where it comes)
  const item = itemId && Progress.shopItem(itemId);
  if (item && (item.journey || item.practiceJourney) && btn.closest('#setup-form')) btn.hidden = locked;
  btn.classList.toggle('locked', locked);
  btn.classList.toggle('skeleton', hidden);
  btn.dataset.unlock = locked ? itemId : '';
  if (hidden) btn.setAttribute('aria-label', 'Locked: unlock the one before it first');
  else if (btn.getAttribute('aria-label') === 'Locked: unlock the one before it first') btn.removeAttribute('aria-label');
  let badge = btn.querySelector('.lock-badge');
  if (locked && !badge) {
    badge = document.createElement('span');
    badge.className = 'lock-badge';
    btn.append(badge);
  }
  if (badge && !locked) badge.remove();
  if (badge && locked) badge.replaceChildren(icon('lock'), hidden ? '' : ` ${formatPoints(Progress.shopItem(itemId).price)}`);
}

function syncSettingsUI() {
  for (const group of document.querySelectorAll('.segmented[data-setting]')) {
    const key = group.dataset.setting;
    for (const btn of group.querySelectorAll('button')) {
      btn.classList.toggle('selected', btn.dataset.value === String(settings[key]));
      setLockBadge(btn, unlockFor(key, btn.dataset.value));
    }
  }
}

// Setting buttons live in the Settings dialog and (difficulty) on the main menu.
function onSettingClick(e) {
  const btn = e.target.closest('.segmented[data-setting] button');
  if (!btn) return;
  if (btn.dataset.unlock) return confirmUnlock(btn.dataset.unlock, btn);
  const key = btn.parentElement.dataset.setting;
  const raw = btn.dataset.value;
  settings[key] = raw === 'true' ? true : raw === 'false' ? false : raw;
  saveSettings();
  syncSettingsUI();
  updatePracticePreview();
  renderGameLevel();
  renderBoardHint();
}

function applyTheme(redraw = true) {
  const root = document.documentElement;
  if (settings.theme === 'light' || settings.theme === 'dark') root.dataset.theme = settings.theme;
  else delete root.dataset.theme;
  applyCosmeticsToPage(false);
  if (redraw) drawBoard();
}

let settingsOpener = null; // button to return focus to

function openSettings(opener) {
  settingsOpener = opener;
  const inGame = !el.gameScreen.hidden && game && game.phase !== 'over';
  el.settingsNote.hidden = !inGame;
  if (inGame) {
    el.settingsNote.textContent = game.invite
      ? 'You’re playing an invite, so its rules stay the same until the game ends. Theme changes apply now.'
      : 'Theme, CPU speed and the progress bar change now. Other changes start from the next turn.';
  }
  syncSettingsUI();
  el.settingsDialog.hidden = false;
  el.settingsDone.focus();
}

// Settings changed during a game (not an invite): these are safe to switch at once.
function applySettingsNow() {
  if (!game || game.invite || game.phase === 'over') return;
  game.cpuSpeed = settings.cpuSpeed;
  game.cpuEnd = settings.cpuEnd;
  game.showProgress = settings.showProgress;
  render();
}

// ...and these wait for the start of the next turn, so a move is never changed halfway.
function applySettingsForTurn() {
  if (!game || game.invite || game.fixed) return;
  applySettingsNow();
  game.placeMode = settings.placeMode;
  game.autoRoll = settings.autoRoll === 'auto';
  game.cpuInstant = settings.cpuSteps === 'instant';
  // single player uses its own Expert timer; the Settings timer is for Home multiplayer
  game.answerTime = game.mode === 'single' ? game.levelTimer : Number(settings.answerTime) || 0;
}

function selectIn(container, button) {
  container.querySelectorAll('button').forEach((b) => b.classList.toggle('selected', b === button));
}

// Single player and Classroom are free; Local multiplayer, 3/4 players and
// Practice are shop unlocks.
const MODE_UNLOCK = { single: null, multi: null, practice: 'practice' };

const PLAYERS_UNLOCK = { 2: null, 3: 'players3', 4: 'players4' };

function syncModeLocks() {
  el.modeCards.forEach((card) => setLockBadge(card, MODE_UNLOCK[card.dataset.mode]));
  for (const btn of el.playerCount.querySelectorAll('button')) setLockBadge(btn, PLAYERS_UNLOCK[btn.dataset.count]);
  setLockBadge(el.multiKind.querySelector('[data-kind="local"]'), 'multiplayer');
}

// Which parts of the setup form show for the chosen mode (and, for
// multiplayer, Local or Classroom).
function renderSetupSections() {
  const classroom = setup.mode === 'multi' && setup.multiKind === 'classroom';
  el.singleSetup.hidden = setup.mode !== 'single';
  el.multiSetup.hidden = setup.mode !== 'multi';
  el.practiceSetup.hidden = setup.mode !== 'practice';
  if (setup.mode !== 'practice') renderBoardHint();
  el.localSetup.hidden = setup.multiKind !== 'local';
  el.classroomSetup.hidden = setup.multiKind !== 'classroom';
  el.boardSizeField.hidden = setup.mode === 'practice' || classroom; // practice has no board
  el.difficultyField.hidden = classroom; // the teacher picks these when hosting
  el.startBtn.hidden = classroom; // Join / Host instead
  el.startBtn.textContent = setup.mode === 'practice' ? 'Start practice' : 'Start game';
  if (classroom) checkClassroom();
  renderJourney(); // (single player and Practice: the Journey picks the board and dice, or the table)
}

function selectMultiKind(kind) {
  setup.multiKind = kind;
  for (const b of el.multiKind.querySelectorAll('[data-kind]')) {
    const on = b.dataset.kind === kind;
    b.classList.toggle('selected', on);
    b.setAttribute('aria-checked', String(on));
  }
  renderSetupSections();
}

const CUSTOM_MIN = 6;

const CUSTOM_MAX = 30;

function syncBoardLocks() {
  for (const btn of el.boardSize.querySelectorAll('button')) setLockBadge(btn, BOARD_UNLOCK[btn.dataset.size]);
  renderBoardHint();
  renderGameLevel(); // (difficulty or purchases change it too)
  renderJourney();
}

// ---- single player: Level (Learn / Expert) and Expert's timer, per difficulty, like Practice
const GAME_EXPERT_BONUS = Setup.GAME_EXPERT_BONUS;

const GAME_LEVEL_HELP = Setup.GAME_LEVEL_HELP;

function renderGameLevel() {
  if (!el.gameLevel) return;
  const d = journeyDifficulty() || settings.difficulty; // a Journey level has its own
  const expertId = Progress.gameExpertId(d);
  if (!Progress.isUnlocked(progress, expertId)) setup.level = 'learn';
  for (const btn of el.gameLevel.querySelectorAll('button')) {
    btn.classList.toggle('selected', btn.dataset.level === setup.level);
    setLockBadge(btn, btn.dataset.level === 'expert' ? expertId : null);
  }
  el.gameLevelHelp.textContent = GAME_LEVEL_HELP[setup.level];
  el.gameTimerField.hidden = setup.level !== 'expert';
  const timerId = (secs) => (Number(secs) ? Progress.gameTimerId(Number(secs), d) : null);
  if (!Progress.isUnlocked(progress, timerId(setup.timer))) setup.timer = 0;
  for (const btn of el.gameTimer.querySelectorAll('button')) {
    btn.classList.toggle('selected', Number(btn.dataset.secs) === setup.timer);
    setLockBadge(btn, timerId(btn.dataset.secs));
  }
  el.gameTimerHelp.textContent = Setup.timerHelp(setup.timer);
}

// Under the board sizes: the finishing bonus for the chosen size
function renderBoardHint() {
  if (!el.boardSizeHelp) return;
  // Legend rolls a teen (11–19), so it needs a board it fits on
  const warning = Setup.boardWarning(settings.difficulty, setup.size);
  if (setup.mode !== 'practice') el.startBtn.disabled = Boolean(warning);
  el.boardSizeHelp.classList.toggle('warn', Boolean(warning));
  if (warning) {
    el.boardSizeHelp.textContent = warning;
    return;
  }
  const bonus = Progress.boardFinishBonus(setup.size);
  if (settings.difficulty === 'legend' && setup.size < 19 && setup.mode !== 'practice') {
    el.boardSizeHelp.textContent = `Legend: half the rolls are teens like 14 × 7, the rest are Tricky facts. On ${setup.size}×${setup.size} the teens go up to ${setup.size}; bigger boards bring bigger teens (all the way to 19 on 20×20).`;
    return;
  }
  el.boardSizeHelp.textContent = bonus
    ? `🏁 Finish a game against the CPU on ${setup.size}×${setup.size} for +${bonus} bonus points.`
    : `🏁 Bigger boards earn a finishing bonus against the CPU: +${Progress.boardFinishBonus(8)} for 8×8, up to +${Progress.boardFinishBonus(24)} for 24×24.`;
}

function clampCustom(n) {
  n = Math.round(Number(n));
  return Number.isFinite(n) ? Math.max(CUSTOM_MIN, Math.min(n, CUSTOM_MAX)) : 14;
}

// Current custom size (clamped), mirrored next to the input.
function readCustomSize() {
  const size = clampCustom(el.customSizeInput.value);
  el.customSizeEcho.textContent = size;
  return size;
}

function setCustomSize(size) {
  el.customSizeInput.value = clampCustom(size);
  setup.size = readCustomSize();
  renderBoardHint();
}

function saveNameInputs() {
  el.nameInputs.querySelectorAll('input').forEach((input, i) => {
    if (setup.types[i] === 'human') setup.names[i] = input.value;
  });
}

// CPU slots are numbered in order: CPU 1, CPU 2, …
function cpuName(index) {
  const nth = setup.types.slice(0, index + 1).filter((t) => t === 'cpu').length;
  return `CPU ${nth}`;
}

function renderNameInputs() {
  el.nameInputs.innerHTML = '';
  for (let i = 0; i < setup.count; i++) {
    const isCpu = setup.types[i] === 'cpu';
    const row = document.createElement('div');
    row.className = 'name-row';
    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.style.background = look('colors').colors[i];
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 14;
    input.value = isCpu ? cpuName(i) : setup.names[i];
    input.placeholder = DEFAULT_NAMES[i];
    input.addEventListener('input', () => input.classList.remove('missing'));
    input.disabled = isCpu;
    input.setAttribute('aria-label', `Player ${i + 1} name`);
    const kind = document.createElement('button');
    kind.type = 'button';
    kind.className = 'kind-toggle' + (isCpu ? ' cpu' : '');
    kind.dataset.index = i;
    kind.textContent = isCpu ? '🤖 CPU' : '👤 Human';
    kind.setAttribute('aria-label', `Player ${i + 1}: ${isCpu ? 'CPU' : 'human'}. Click to switch.`);
    row.append(swatch, input, kind);
    el.nameInputs.append(row);
  }
}

// (wardrobeFilter is also changed from other sections)
function setWardrobeFilter(value) {
  return (wardrobeFilter = value);
}

// What this part does when the page loads (main.js runs every part in order)
export function run() {
  loadCosmetics();

  el.wardrobeBtn.addEventListener('click', () => openWardrobe());

  el.wardrobeDone.addEventListener('click', closeWardrobe);

  el.wardrobeDialog.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeWardrobe();
  });

  el.wardrobeDialog.addEventListener('click', (e) => {
    if (e.target === el.wardrobeDialog) return closeWardrobe();
    const view = e.target.closest('#wardrobe-view [data-view]');
    if (view) {
      wardrobeFilter = view.dataset.view === 'available' ? wardrobeAvailable() : null;
      renderWardrobe();
      el.wardrobeDialog.querySelector('.dialog').scrollTop = 0;
      return;
    }
    const chip = e.target.closest('.wardrobe-chip');
    if (!chip || chip.disabled) return;
    if (chip.dataset.unlock) return confirmUnlock(chip.dataset.unlock, chip);
    chooseCosmetic(chip.dataset.cat, chip.dataset.opt);
  });

  el.stickersBtn.addEventListener('click', () => openStickers());

  el.stickersDone.addEventListener('click', closeStickers);

  el.stickersDialog.addEventListener('click', (e) => {
    if (e.target === el.stickersDialog) closeStickers();
  });

  el.stickersDialog.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeStickers();
  });

  el.stickersTrade.addEventListener('click', () => {
    const swap = Views.swapSpares(progress, formatPoints);
    if (!swap.points) return;
    toast(...swap.toast);
    saveProgress();
    renderStickers();
  });

  enforceLocks();

  el.settingsDialog.addEventListener('click', (e) => {
    if (e.target === el.settingsDialog) return el.settingsDone.click(); // backdrop
    onSettingClick(e);
    applyTheme();
  });

  applyTheme(false); // the board doesn't exist yet during setup

  // In Auto, redraw the board when the device switches between light and dark.
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => drawBoard());

  el.setupForm.addEventListener('click', onSettingClick);

  el.settingsBtn.addEventListener('click', () => openSettings(el.settingsBtn));

  el.gameSettingsBtn.addEventListener('click', () => openSettings(el.gameSettingsBtn));

  el.settingsDone.addEventListener('click', () => {
    el.settingsDialog.hidden = true;
    applySettingsNow();
    if (settingsOpener) settingsOpener.focus();
  });

  el.settingsDialog.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') el.settingsDone.click();
  });

  syncSettingsUI();

  syncModeLocks();

  el.modeCards.forEach((card) => {
    card.addEventListener('click', () => {
      if (card.dataset.unlock) return confirmUnlock(card.dataset.unlock, card);
      setup.mode = card.dataset.mode;
      // Local multiplayer is bought in the shop; until then Multiplayer opens on Classroom
      if (setup.mode === 'multi' && !Progress.isUnlocked(progress, 'multiplayer')) selectMultiKind('classroom');
      el.modeCards.forEach((c) => {
        c.classList.toggle('selected', c === card);
        c.setAttribute('aria-checked', String(c === card));
      });
      renderSetupSections();
      updatePracticePreview();
    });
  });

  el.multiKind.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-kind]');
    if (!btn) return;
    if (btn.dataset.unlock) return confirmUnlock(btn.dataset.unlock, btn);
    selectMultiKind(btn.dataset.kind);
  });

  el.playerCount.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.unlock) return confirmUnlock(btn.dataset.unlock, btn);
    saveNameInputs();
    setup.count = Number(btn.dataset.count);
    selectIn(el.playerCount, btn);
    renderNameInputs();
  });

  el.gameLevel.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.unlock) return confirmUnlock(btn.dataset.unlock, btn);
    setup.level = btn.dataset.level;
    renderGameLevel();
  });

  el.gameTimer.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.unlock) return confirmUnlock(btn.dataset.unlock, btn);
    setup.timer = Number(btn.dataset.secs);
    renderGameLevel();
  });

  syncBoardLocks();

  el.boardSize.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.unlock) return confirmUnlock(btn.dataset.unlock, btn);
    selectIn(el.boardSize, btn);
    const custom = btn.dataset.size === 'custom';
    el.customSize.hidden = !custom;
    setup.size = custom ? readCustomSize() : Number(btn.dataset.size);
    renderBoardHint();
  });

  el.customSizeInput.addEventListener('input', () => {
    if (el.customSizeInput.value !== '') setup.size = readCustomSize();
    renderBoardHint();
  });

  el.customSizeInput.addEventListener('change', () => setCustomSize(readCustomSize()));

  el.customSize.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-step]');
    if (btn) setCustomSize(readCustomSize() + Number(btn.dataset.step));
  });

  renderNameInputs();

  el.nameInputs.addEventListener('click', (e) => {
    const btn = e.target.closest('.kind-toggle');
    if (!btn) return;
    saveNameInputs();
    const i = Number(btn.dataset.index);
    setup.types[i] = setup.types[i] === 'cpu' ? 'human' : 'cpu';
    renderNameInputs();
  });

  el.setupForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (setup.mode === 'multi' && setup.multiKind === 'classroom') return; // not built yet
    if (setup.mode === 'practice') {
      const name = el.practiceName.value.trim() || 'You';
      return practiceJourneyOn() ? startPracticeJourney(name) : startPracticeAuto(name);
    }
    saveNameInputs();
    if (!el.customSize.hidden) setCustomSize(readCustomSize());
    let players;
    if (setup.mode === 'single') {
      players = [
        { name: el.singleName.value.trim() || 'You', cpu: false },
        { name: 'CPU', cpu: true },
      ];
    } else {
      // every human player needs a real name
      const inputs = [...el.nameInputs.querySelectorAll('input')];
      const missing = inputs.filter((input, i) => setup.types[i] !== 'cpu' && !input.value.trim());
      inputs.forEach((input) => input.classList.toggle('missing', missing.includes(input)));
      el.namesError.hidden = !missing.length;
      if (missing.length) {
        missing[0].focus();
        return;
      }
      players = setup.names.slice(0, setup.count).map((name, i) =>
        setup.types[i] === 'cpu' ? { name: cpuName(i), cpu: true } : { name: name.trim(), cpu: false }
      );
    }
    startGame(players, setup.size, setup.mode);
  });
}

export { GAME_EXPERT_BONUS, applySettingsForTurn, applyTheme, chooseCosmetic, clampCustom, enforceLocks, icon, look, openSettings, openStickers, openWardrobe, renderBoardHint, renderGameLevel, renderSetupSections, renderWardrobe, saveNameInputs, selectIn, setLockBadge, setWardrobeFilter, syncBoardLocks, syncModeLocks, syncSettingsUI, wardrobeAvailable, wardrobeFilter };
