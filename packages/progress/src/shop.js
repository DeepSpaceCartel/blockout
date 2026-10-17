// The Shop's rules and words, for every client (the web game's shop.js, the
// phone app's Shop): what each item shows, why it can't be bought yet, what
// tapping a locked thing offers, what's new, and what a purchase switches on.
// Pure functions of the save; the clients only draw them.
import * as Progress from './progress.js';
import * as Cosmetics from './cosmetics.js';

// 1,250 rather than 1250
export const formatPoints = (n) => Number(n).toLocaleString();

// "×3, ×4 and ×6"
export function tablesLabel(tables) {
  const list = [...tables].sort((a, b) => a - b).map((n) => `×${n}`);
  return list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}` : list[0];
}

// Why an item can't be bought (Progress.canBuy's reason), in a few words
export function buyReason(r) {
  switch (r.reason) {
    case 'season':
      return `In the shop in ${r.when}`;
    case 'points':
      return `Need ${formatPoints(r.missing)} more`;
    case 'requires':
      return `Unlock ${Progress.shopItem(r.requires).name.split(':')[0]} first`;
    case 'win':
      return `Win a game on ${r.size}×${r.size} first`;
    case 'master':
      return `Master your Times Table up to ${r.size} × ${r.size} first`;
    default:
      return '';
  }
}

// What to do to reveal a hidden board or difficulty (a win, or knowing the table)
export function revealHint(r) {
  if (r.reason === 'win') return `Win a game against the CPU on the ${r.size}×${r.size} board to reveal the next board.`;
  const extra = r.practice ? ` and get the ${r.practice} ${r.practice === 1 ? 'fact' : 'facts'} that need practice back on track` : '';
  const which = r.faces ? `using ${tablesLabel(r.faces)}` : `up to ${r.size} × ${r.size}`;
  return `Master ${r.need} of the ${r.total} facts ${which} on your Times Table${extra} to reveal the next difficulty. You have ${r.mastered} so far. Practice helps!`;
}

// Shop items that aren't Wardrobe looks
const shopItems = () => Progress.SHOP.filter((item) => !item.cosmetic);

// What can be bought right now (ids)
export const availableIds = (state) => new Set(shopItems().filter((i) => Progress.canBuy(state, i.id).ok).map((i) => i.id));

// The Shop, in groups. Each row: { item, owned, hidden (a blurred next-but-one
// step: no name, no price), canBuy, why (one line, when it can't be bought) }.
// only: a Set of ids to list (the "Available" view), or null for everything.
export function shopGroups(state, only = null) {
  const groups = [];
  for (const item of shopItems()) {
    if (only && !only.has(item.id)) continue;
    let group = groups[groups.length - 1];
    if (!group || group.name !== item.group) groups.push((group = { name: item.group, rows: [] }));
    const owned = Progress.isUnlocked(state, item.id);
    const hidden = !owned && Progress.isHidden(state, item.id);
    const check = owned ? null : Progress.canBuy(state, item.id);
    let why = null;
    if (hidden) {
      why = check.reason === 'win' ? `Win a game on ${check.size}×${check.size} to reveal it` : check.reason === 'master' ? `Master your Times Table up to ${check.size} × ${check.size} to reveal it (${check.mastered} of ${check.need})` : 'Unlock the one before it first';
    } else if (check && !check.ok) why = buyReason(check);
    group.rows.push({ item, owned, hidden, canBuy: Boolean(check && check.ok), why });
  }
  return groups;
}

// Tapping a locked thing (a board, a difficulty, a setting) asks about it, or
// about what has to come first. Returns:
//   { kind: 'offer', item, title, price, message }   "Unlock X?" with a buy button
//   { kind: 'info', item, title, price, message }    can't be bought yet (OK only)
//   { kind: 'earn', title, message }                 revealed by a win or by knowing the table
// item is what a "yes" buys (maybe the prerequisite); same: it's what was tapped.
export function unlockOffer(state, itemId) {
  let item = Progress.shopItem(itemId);
  const check = Progress.canBuy(state, itemId);
  let offer = check.ok;
  let message = null;
  let same = true;
  if (Progress.isHidden(state, itemId)) {
    // a locked placeholder: offer the next step, without saying what this one is
    item = Progress.shopItem(Progress.nextInChain(state, itemId));
    const next = Progress.canBuy(state, item.id);
    if (next.reason === 'win' || next.reason === 'master') return { kind: 'earn', title: '🔒 Locked', message: revealHint(next) };
    offer = next.ok;
    message = 'Unlock this first to see what comes next.';
    if (next.reason === 'points') message += ` You need ${formatPoints(next.missing)} more points for it.`;
    same = false;
  } else if (check.reason === 'requires') {
    const first = Progress.shopItem(check.requires);
    const firstCheck = Progress.canBuy(state, first.id);
    message = `${item.name} needs ${first.name} first.`;
    item = first;
    offer = firstCheck.ok;
    if (!offer && firstCheck.reason === 'points') message += ` You need ${formatPoints(firstCheck.missing)} more points for it.`;
    same = false;
  } else if (check.reason === 'points') {
    message = `You need ${formatPoints(check.missing)} more points. Keep playing to earn them!`;
  } else if (check.reason === 'season') {
    message = `This one is in the shop in ${check.when}.`;
  }
  const perk = offer && item.perk ? `🎁 ${item.perk}` : '';
  return {
    kind: offer ? 'offer' : 'info',
    item,
    same,
    title: offer ? `Unlock ${item.name}?` : item.name,
    price: `🪙 ${formatPoints(item.price)} · you have ${formatPoints(state.wallet)}`,
    message: [perk, message].filter(Boolean).join(' ') || null,
  };
}

// Buy it: the purchase, the "buy" achievements, and what to announce.
// Returns { ok, earned, toast: [title, text] } (ok false: nothing changed).
export function purchase(state, itemId) {
  const item = Progress.shopItem(itemId);
  if (!Progress.buy(state, itemId).ok) return { ok: false, earned: [] };
  return { ok: true, item, earned: Progress.awardAchievements(state, { event: 'buy' }), toast: [`🔓 Unlocked: ${item.name}`, `-${formatPoints(item.price)} points`] };
}

// ---- what's new: the counts on the Shop, Wardrobe and Stickers buttons

export const seenList = (state, kind) => (state.seen = state.seen || {})[kind] || (state.seen[kind] = []);

// Shop items (not looks) you can afford right now
export const affordableCount = (state) => shopItems().filter((item) => Progress.canBuy(state, item.id).ok).length;

// Wardrobe looks you could buy right now
export const affordableLooks = (state) => Progress.SHOP.filter((i) => i.cosmetic && Progress.canBuy(state, i.id).ok).length;

// Wardrobe things you own (or titles you've earned), as "category:option"
export function wardrobeKeys(state) {
  const keys = [];
  for (const cat of Cosmetics.CATEGORIES) {
    for (const opt of cat.options) {
      if (opt.price && Progress.isUnlocked(state, Cosmetics.itemFor(cat.id, opt.id))) keys.push(`${cat.id}:${opt.id}`);
    }
  }
  for (const t of Cosmetics.TITLES) if (t.id !== 'none' && t.earned(state)) keys.push(`title:${t.id}`);
  return keys;
}

// ...of which not looked at yet
export const newWardrobe = (state) => wardrobeKeys(state).filter((k) => !seenList(state, 'wardrobe').includes(k)).length;

export const newStickers = (state) => Object.keys(state.stickers || {}).filter((id) => !seenList(state, 'stickers').includes(id)).length;

export const spareStickers = (state) => Object.values(state.stickers || {}).reduce((n, c) => n + Math.max(0, c - 1), 0);

// They've been looked at (the caller saves)
export function markSeen(state, kind, keys) {
  state.seen[kind] = [...new Set([...seenList(state, kind), ...keys])];
}

// ---- what a purchase switches on

// Bought from the Shop list, an item switches on the obvious choice. Returns a
// plain description each client applies its own way, or null (items with no
// clear favourite, like CPU speed, are left alone):
//   { mode: 'single' | 'multi' | 'practice', players, level: 'expert', timer,
//     count, difficulty, size, setting: [key, value] }
export function activation(itemId) {
  const byId = {
    multiplayer: { mode: 'multi', players: 2 },
    players3: { mode: 'multi', players: 3 },
    players4: { mode: 'multi', players: 4 },
    practice: { mode: 'practice' },
    boardCustom: { size: 'custom' },
    diceMode: { setting: ['diceMode', 'real'] },
    autoRoll: { setting: ['autoRoll', 'auto'] },
    fitRolls: { setting: ['fitRolls', 'always'] },
    answerTime30: { setting: ['answerTime', '30'] },
    answerTime10: { setting: ['answerTime', '10'] },
    answerTime5: { setting: ['answerTime', '5'] },
    cpuInstant: { setting: ['cpuSteps', 'instant'] },
    cpuEnd: { setting: ['cpuEnd', 'button'] },
    showProgress: { setting: ['showProgress', 'true'] },
    firstInCorner: { setting: ['firstInCorner', 'true'] },
    timesMastered: { setting: ['timesMastered', 'time'] },
    timesLearning: { setting: ['timesLearning', 'time'] },
    timesPractice: { setting: ['timesPractice', 'time'] },
  };
  if (byId[itemId]) return byId[itemId];
  let m;
  if ((m = /^board(\d+)$/.exec(itemId))) return { size: Number(m[1]) };
  if ((m = /^difficulty\.(\w+)$/.exec(itemId))) return { difficulty: m[1] };
  if (/^table\d+$/.test(itemId)) return { mode: 'practice' };
  for (const d of Progress.DIFFICULTIES) {
    if (itemId === Progress.gameExpertId(d)) return { mode: 'single', level: 'expert' };
    if (itemId === Progress.practiceExpertId(d)) return { mode: 'practice', level: 'expert' };
    for (const secs of [30, 10, 5]) {
      if (itemId === Progress.gameTimerId(secs, d)) return { mode: 'single', level: 'expert', timer: secs };
      if (itemId === Progress.practiceTimerId(secs, d)) return { mode: 'practice', level: 'expert', timer: secs };
    }
    for (const n of [10, 20]) if (itemId === Progress.practiceCountId(n, d)) return { mode: 'practice', count: n };
  }
  return null;
}
