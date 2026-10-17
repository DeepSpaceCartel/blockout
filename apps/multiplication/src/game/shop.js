// Shop: part of the multiplication game (split from the old js/game.js).

import * as Cosmetics from '@blockout/progress/cosmetics';
import * as Progress from '@blockout/progress';
import * as Shop from '@blockout/progress/shop';
import { $, el } from './base.js';
import { celebrate, formatPoints, progress, saveProgress, toast } from './wallet.js';
import { applyTheme, chooseCosmetic, icon, openStickers, openWardrobe, setWardrobeFilter, syncBoardLocks, syncModeLocks, syncSettingsUI, wardrobeAvailable, wardrobeFilter } from './wardrobe.js';
import { make } from './play.js';
import { updatePracticePreview } from './practice.js';

// (the Shop's rules and words are shared with the phone app: @blockout/progress/shop)

// Opened from a results screen, the Shop / Wardrobe / Stickers show only what
// their button promised; this line says so and can switch to everything.
function filterNote(text, showAll) {
  const note = make('p', 'filter-note', `${text} · `);
  const btn = make('button', 'link-btn', 'Show everything');
  btn.type = 'button';
  btn.addEventListener('click', showAll);
  note.append(btn);
  return note;
}

// Bottom bar of the Shop and Wardrobe: points you have, what an item would
// leave you with while it's hovered, the All / Available toggle and Done.
function renderWalletBar(prefix, onlyAvailable) {
  $(`${prefix}-wallet`).textContent = formatPoints(progress.wallet);
  previewCost(prefix, null);
  for (const b of $(`${prefix}-view`).querySelectorAll('button')) {
    const on = (b.dataset.view === 'available') === onlyAvailable;
    b.classList.toggle('selected', on);
    b.setAttribute('aria-pressed', on);
  }
}

function previewCost(prefix, cost) {
  const after = $(`${prefix}-wallet-after`);
  after.replaceChildren();
  after.className = 'wallet-after';
  if (cost == null) return;
  const left = progress.wallet - cost;
  if (left >= 0) {
    after.append(' ', make('span', 'wallet-cost', `− ${formatPoints(cost)}`), ' = ', make('strong', 'wallet-left', formatPoints(left)));
  } else {
    after.classList.add('short');
    after.append(` · need ${formatPoints(-left)} more`);
  }
}

let shopFilter = null; // Set of item ids (affordable when picked), or null for everything

let shopHighlight = null;

function renderShop(highlight = shopHighlight) {
  shopHighlight = highlight;
  el.shopBody.innerHTML = '';
  renderWalletBar('shop', !!shopFilter);
  if (shopFilter && !shopFilter.size) el.shopBody.append(make('p', 'filter-note', 'Nothing to unlock right now. Keep playing to earn points!'));
  for (const group of Shop.shopGroups(progress, shopFilter)) {
    el.shopBody.append(make('h3', 'stats-heading', group.name));
    for (const { item, owned, hidden, canBuy, why } of group.rows) {
      const row = make('div', 'shop-item' + (item.id === highlight ? ' highlight' : ''));
      if (hidden) row.classList.add('skeleton-row');
      const name = make('span', 'shop-name', hidden ? 'Locked' : item.name);
      if (!hidden && item.perk) name.append(make('span', 'shop-perk', `🎁 ${item.perk}`));
      row.append(name);
      if (owned) {
        row.classList.add('owned');
        const mark = make('span', 'shop-owned');
        mark.append(icon('check'), ' Unlocked');
        row.append(mark);
      } else {
        const btn = make('button', 'btn btn-small' + (canBuy ? ' btn-primary' : ''), `🪙 ${formatPoints(item.price)}`);
        btn.type = 'button';
        btn.dataset.buy = item.id;
        btn.dataset.cost = item.price;
        btn.disabled = !canBuy;
        if (hidden) {
          btn.replaceChildren(icon('lock'));
          btn.setAttribute('aria-label', 'Locked');
        }
        row.append(btn);
        if (why) row.append(make('span', 'shop-why', why));
      }
      el.shopBody.append(row);
    }
  }
}

const shopAvailable = () => Shop.availableIds(progress);

// What was tapped to open the shop, so buying it switches that exact choice on.
let shopSource = null; // { item, el }

// onlyAffordable: from a results screen, list just what can be bought right now
function openShop(highlight, sourceEl = null, onlyAffordable = false) {
  shopSource = highlight && sourceEl ? { item: highlight, el: sourceEl } : null;
  shopFilter = onlyAffordable ? shopAvailable() : null;
  renderShop(highlight);
  el.shopDialog.hidden = false;
  const target = highlight && el.shopBody.querySelector('.shop-item.highlight');
  if (target) target.scrollIntoView({ block: 'center' });
  else el.shopDialog.querySelector('.dialog').scrollTop = 0;
  el.shopDone.focus({ preventScroll: true });
}

function closeShop() {
  el.shopDialog.hidden = true;
}

// Buy an item and switch it on; used by the shop and the quick unlock.
function purchase(item) {
  const bought = Shop.purchase(progress, item.id);
  if (!bought.ok) return false;
  toast(...bought.toast);
  celebrate(bought.earned);
  saveProgress();
  refreshAvailableFilters();
  if (!el.shopDialog.hidden) renderShop(item.id);
  syncSettingsUI();
  syncBoardLocks();
  syncModeLocks();
  updatePracticePreview();
  refreshOpenNudges();
  activatePurchase(item);
  return true;
}

// After a purchase, "Available" lists catch up: newly revealed tiers appear,
// things you can't afford any more go, and what you've bought stays (✓ Unlocked).
function refreshAvailableFilters() {
  if (shopFilter) {
    const bought = [...shopFilter].filter((id) => Progress.isUnlocked(progress, id));
    shopFilter = new Set([...shopAvailable(), ...bought]);
  }
  if (wardrobeFilter) {
    const owned = [...wardrobeFilter].filter((key) => {
      const [cat, opt] = key.split(':');
      return cat === 'title' || Progress.isUnlocked(progress, Cosmetics.itemFor(cat, opt));
    });
    setWardrobeFilter(new Set([...wardrobeAvailable(), ...owned]));
  }
}

// ---- quick unlock: tapping a locked thing asks "Unlock X for 🪙 N?" (no whole shop)

let unlockAsk = null; // { item, el }

function confirmUnlock(itemId, sourceEl) {
  const offer = Shop.unlockOffer(progress, itemId);
  if (offer.kind === 'earn') {
    // earned, not bought: a win on the board before, or knowing the times table
    unlockAsk = null;
    el.unlockTitle.textContent = offer.title;
    el.unlockPrice.textContent = '';
    el.unlockMessage.textContent = offer.message;
    el.unlockMessage.hidden = false;
    el.unlockYes.hidden = true;
    el.unlockNo.textContent = 'OK';
    el.unlockDialog.hidden = false;
    el.unlockNo.focus();
    return;
  }
  const yes = offer.kind === 'offer';
  // (what gets switched on is what was tapped, unless a prerequisite is offered instead)
  unlockAsk = yes ? { item: offer.item, el: offer.same ? sourceEl : null } : null;
  el.unlockTitle.textContent = offer.title;
  el.unlockPrice.textContent = offer.price;
  el.unlockMessage.textContent = offer.message || '';
  el.unlockMessage.hidden = !offer.message;
  el.unlockYes.hidden = !yes;
  if (yes) el.unlockYes.textContent = `Unlock for 🪙 ${formatPoints(offer.item.price)}`;
  el.unlockNo.textContent = yes ? 'Cancel' : 'OK';
  el.unlockDialog.hidden = false;
  (yes ? el.unlockYes : el.unlockNo).focus();
}

function closeUnlock() {
  el.unlockDialog.hidden = true;
  unlockAsk = null;
}

// ---- "you can afford something" button on the results screens

const affordableCount = () => Shop.affordableCount(progress);
const wardrobeKeys = () => Shop.wardrobeKeys(progress);
const seenList = (kind) => Shop.seenList(progress, kind);
const newWardrobe = () => Shop.newWardrobe(progress);
const affordableLooks = () => Shop.affordableLooks(progress);
const newStickers = () => Shop.newStickers(progress);
const spareStickers = () => Shop.spareStickers(progress);

function markSeen(kind, keys) {
  Shop.markSeen(progress, kind, keys);
  saveProgress();
}

// Shop / Wardrobe / Stickers buttons on a results screen ('results' or 'pd'), only when there's something new.
function refreshNudges(prefix) {
  const shop = $(`${prefix}-shop-btn`);
  const wardrobe = $(`${prefix}-wardrobe-btn`);
  const stickers = $(`${prefix}-stickers-btn`);
  const n = affordableCount();
  shop.hidden = n === 0;
  if (n) shop.replaceChildren(icon('shopping-cart'), ` Shop · ${n} new ${n === 1 ? 'unlock' : 'unlocks'}`);
  const w = newWardrobe();
  const looks = affordableLooks();
  wardrobe.hidden = !w && !looks;
  const wParts = [w && `${w} new`, looks && `${looks} to unlock`].filter(Boolean);
  if (!wardrobe.hidden) wardrobe.replaceChildren(icon('shirt'), ` Wardrobe · ${wParts.join(' · ')}`);
  const fresh = newStickers();
  const spares = spareStickers();
  stickers.hidden = !fresh && !spares;
  const parts = [fresh && `${fresh} new`, spares && `${spares} ${spares === 1 ? 'spare' : 'spares'}`].filter(Boolean);
  if (!stickers.hidden) stickers.replaceChildren(icon('sticker'), ` Stickers · ${parts.join(' · ')}`);
}

function refreshOpenNudges() {
  if (!el.gameOver.hidden) refreshNudges('results');
  if (!el.practiceDone.hidden) refreshNudges('pd');
}

// ---- switch a purchase on straight away

// Click a control (even inside a closed dialog) as if the player had tapped it.
function tap(selector) {
  const target = document.querySelector(selector);
  if (target && !target.dataset.unlock) target.click();
}

const setOption = (key, value) => () => tap(`[data-setting="${key}"] [data-value="${value}"]`);

// Bought straight from the shop list: switch on the obvious choice
// (Shop.activation says which), by tapping the menu's own controls.
function applyActivation(a) {
  if (!a) return;
  if (a.mode) tap(`[data-mode="${a.mode}"]`);
  if (a.mode === 'multi') {
    tap('#multi-kind [data-kind="local"]');
    if (a.players > 2) tap(`#player-count [data-count="${a.players}"]`);
  }
  const where = a.mode === 'practice' ? 'practice' : 'game';
  if (a.level) tap(`#${where}-level [data-level="${a.level}"]`);
  if (a.timer) tap(`#${where}-timer [data-secs="${a.timer}"]`);
  if (a.count) tap(`#practice-count [data-count="${a.count}"]`);
  if (a.size) tap(`#board-size [data-size="${a.size}"]`);
  if (a.difficulty) setOption('difficulty', a.difficulty)();
  if (a.setting) setOption(...a.setting)();
  if (a.mode === 'practice') updatePracticePreview();
}

function activatePurchase(item) {
  const source = shopSource;
  shopSource = null;
  if (item.cosmetic) chooseCosmetic(item.cosmetic[0], item.cosmetic[1]); // put it on
  else if (source && source.item === item.id && source.el.isConnected) source.el.click(); // the exact thing tapped
  else applyActivation(Shop.activation(item.id));
  applyTheme(false); // e.g. golden dice
}

// What this part does when the page loads (main.js runs every part in order)
export function run() {
  for (const [prefix, selector] of [['shop', '[data-cost]'], ['wardrobe', '.wardrobe-chip[data-cost]']]) {
    const dialog = $(prefix);
    const show = (e) => {
      const target = e.target.closest(selector);
      previewCost(prefix, target ? Number(target.dataset.cost) : null);
    };
    dialog.addEventListener('pointerover', show);
    dialog.addEventListener('focusin', show);
    dialog.addEventListener('pointerleave', () => previewCost(prefix, null));
  }

  el.shopBtn.addEventListener('click', () => openShop());

  el.shopDone.addEventListener('click', closeShop);

  el.resultsShopBtn.addEventListener('click', () => openShop(null, null, true));

  el.pdShopBtn.addEventListener('click', () => openShop(null, null, true));

  for (const prefix of ['results', 'pd']) {
    $(`${prefix}-wardrobe-btn`).addEventListener('click', () => openWardrobe(true));
    $(`${prefix}-stickers-btn`).addEventListener('click', () => openStickers(true));
  }

  el.shopDialog.addEventListener('click', (e) => {
    if (e.target === el.shopDialog) return closeShop();
    const view = e.target.closest('#shop-view [data-view]');
    if (view) {
      shopFilter = view.dataset.view === 'available' ? shopAvailable() : null;
      renderShop(null);
      el.shopDialog.querySelector('.dialog').scrollTop = 0;
      return;
    }
    const btn = e.target.closest('[data-buy]');
    if (btn) purchase(Progress.shopItem(btn.dataset.buy));
  });

  el.unlockYes.addEventListener('click', () => {
    const ask = unlockAsk;
    closeUnlock();
    if (!ask) return;
    shopSource = ask.el ? { item: ask.item.id, el: ask.el } : null;
    purchase(ask.item);
  });

  el.unlockNo.addEventListener('click', closeUnlock);

  el.unlockDialog.addEventListener('click', (e) => {
    if (e.target === el.unlockDialog) closeUnlock();
  });

  el.unlockDialog.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeUnlock();
  });

  el.shopDialog.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeShop();
  });
}

export { affordableCount, affordableLooks, confirmUnlock, filterNote, markSeen, newStickers, newWardrobe, refreshAvailableFilters, refreshNudges, refreshOpenNudges, renderShop, renderWalletBar, seenList, spareStickers, tap, wardrobeKeys };
