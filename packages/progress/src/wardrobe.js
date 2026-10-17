// The Wardrobe, for every client (the web game, the phone app): which looks
// are being worn, what each chip shows (owned, locked with its price, a blurred
// later step, a season's), the titles, and what's new. The looks themselves are
// in cosmetics.js; the choices stay on the device (they're settings), the
// unlocks are the save's.
import * as Progress from './progress.js';
import * as Cosmetics from './cosmetics.js';

// The looks to wear: what's chosen, if it's owned (else the default), and the
// title, if it's earned. chosen: { dice, pips, …, title }
export function chosenLooks(chosen, state) {
  const clean = Cosmetics.sanitize(chosen || {}, (id) => Progress.isUnlocked(state, id));
  const t = Cosmetics.title(chosen && chosen.title);
  clean.title = t.earned(state) ? t.id : 'none';
  return clean;
}

// One category's look being worn (its option), falling back to the first
export const look = (looks, categoryId) => Cosmetics.option(categoryId, looks[categoryId]) || Cosmetics.category(categoryId).options[0];

// The Wardrobe's rows: [{ category, options: [{ option, key, owned, worn,
// hidden (a later step of the chain: no name, no price), season (when it's
// in the shop), price, item }] }]. only: a Set of 'category:option' keys, or
// null for everything.
export function wardrobeRows(state, looks, only = null, now = new Date()) {
  const rows = [];
  for (const cat of Cosmetics.CATEGORIES) {
    const options = [];
    for (const opt of cat.options) {
      const key = `${cat.id}:${opt.id}`;
      if (only && !only.has(key)) continue;
      const item = Cosmetics.itemFor(cat.id, opt.id);
      const owned = Progress.isUnlocked(state, item);
      const check = owned ? null : Progress.canBuy(state, item, now);
      options.push({
        option: opt,
        key,
        owned,
        worn: looks[cat.id] === opt.id,
        hidden: !owned && Progress.isHidden(state, item),
        season: check && check.reason === 'season' ? Progress.shopItem(item).seasonLabel : null,
        price: opt.price,
        item,
      });
    }
    if (options.length) rows.push({ category: cat, options });
  }
  return rows;
}

// The titles row: [{ title, key, earned, worn }] (titles are earned, never bought)
export function titleRow(state, looks, only = null) {
  return Cosmetics.TITLES.filter((t) => !only || only.has(`title:${t.id}`)).map((t) => ({ title: t, key: `title:${t.id}`, earned: t.earned(state), worn: looks.title === t.id }));
}

// What's new or can be unlocked now (the results screens' Wardrobe button):
// newKeys are the owned ones not seen yet
export function availableKeys(state, newKeys = []) {
  const unlockable = Progress.SHOP.filter((i) => i.cosmetic && Progress.canBuy(state, i.id).ok).map((i) => i.cosmetic.join(':'));
  return new Set([...newKeys, ...unlockable]);
}

// How a player looks in a game: the CPU's character (its name, avatar and
// greeting), or, for the one human in single player, the avatar and title
export function playerLook(looks, player, mode) {
  if (player.cpu) {
    const ch = look(looks, 'cpu');
    return { name: player.name === 'CPU' ? ch.cpuName : player.name.replace(/^CPU\b/, ch.short), avatar: ch.avatar, hello: ch.hello };
  }
  if (mode !== 'single') return {};
  const avatar = look(looks, 'avatar');
  const t = Cosmetics.title(looks.title);
  return { avatar: avatar.id === 'none' ? '' : avatar.preview, title: t.id === 'none' ? '' : t.name };
}

// The players' colours
export const playerColors = (looks) => look(looks, 'colors').colors;
