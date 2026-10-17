// Blockout cosmetics: the Wardrobe catalog (dice, board, effects, CPU characters,
// avatars, keypads…), seasonal items, earned titles and the sticker album.
// Paid options are added to the shop as items 'cos.<category>.<option>'.
// An ES module (@blockout/progress/cosmetics).

import * as Progress from './progress.js';

// Seasons: month-day ranges (inclusive). Winter wraps past New Year.
const SEASONS = {
  halloween: { label: 'October', from: '10-01', to: '10-31' },
  winter: { label: 'December and January', from: '12-01', to: '01-31' },
  spring: { label: 'March to May', from: '03-01', to: '05-31' },
};

function seasonActive(season, now = new Date()) {
  const s = SEASONS[season];
  if (!s) return true;
  const md = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return s.from <= s.to ? md >= s.from && md <= s.to : md >= s.from || md <= s.to;
}

// Every category and its options. The first option is the free default.
// `preview` is what the Wardrobe shows on the option chip.
const CATEGORIES = [
  {
    id: 'dice', name: 'Dice', options: [
      { id: 'classic', name: 'Classic', price: 0 },
      { id: 'wood', name: 'Wooden', price: 300 },
      { id: 'candy', name: 'Candy stripes', price: 500 },
      { id: 'glass', name: 'Glass', price: 600 },
      { id: 'neon', name: 'Neon', price: 800 },
      { id: 'galaxy', name: 'Galaxy', price: 1500 },
      { id: 'golden', name: 'Golden ✨', price: 10000, item: 'goldenDice' },
      { id: 'pumpkin', name: 'Pumpkin 🎃', price: 666, season: 'halloween' },
    ],
  },
  {
    id: 'pips', name: 'Dice dots', options: [
      { id: 'dots', name: 'Dots', price: 0, preview: '●' },
      { id: 'hearts', name: 'Hearts', price: 400, preview: '❤️', glyph: '❤️' },
      { id: 'stars', name: 'Stars', price: 400, preview: '⭐', glyph: '⭐' },
      { id: 'paws', name: 'Paw prints', price: 400, preview: '🐾', glyph: '🐾' },
      { id: 'dinos', name: 'Dinosaurs', price: 400, preview: '🦖', glyph: '🦖' },
    ],
  },
  {
    id: 'roll', name: 'Rolling', options: [
      { id: 'wobble', name: 'Wobble', price: 0 },
      { id: 'tumble', name: 'Tumble', price: 500 },
      { id: 'bounce', name: 'Bounce', price: 500 },
      { id: 'sparkle', name: 'Sparkle spin', price: 500 },
    ],
  },
  {
    id: 'colors', name: 'Player colors', options: [
      { id: 'classic', name: 'Classic', price: 0, colors: ['#e4572e', '#2e86de', '#2a9d5c', '#8e5bd6'] },
      { id: 'pastel', name: 'Pastel', price: 300, colors: ['#e07a8f', '#5b9bd5', '#4fae8b', '#9b7fd1'] },
      { id: 'ocean', name: 'Ocean', price: 300, colors: ['#0b7a9e', '#1f5fa8', '#12948a', '#4a57b8'] },
      { id: 'jungle', name: 'Jungle', price: 300, colors: ['#3f8a2e', '#b8761f', '#1e7f5c', '#8a5a2b'] },
      { id: 'candy', name: 'Candy', price: 300, colors: ['#e8467c', '#9b4dd6', '#1fa3c7', '#f08a24'] },
    ],
  },
  {
    id: 'pattern', name: 'Rectangle pattern', options: [
      { id: 'none', name: 'Plain', price: 0 },
      { id: 'stripes', name: 'Stripes', price: 400 },
      { id: 'dots', name: 'Polka dots', price: 400 },
      { id: 'bricks', name: 'Bricks', price: 600 },
      { id: 'checker', name: 'Checkerboard', price: 600 },
      { id: 'wood', name: 'Wood grain', price: 800 },
    ],
  },
  {
    id: 'board', name: 'Board', options: [
      { id: 'graph', name: 'Graph paper', price: 0 },
      { id: 'notebook', name: 'Notebook', price: 600 },
      { id: 'chalkboard', name: 'Chalkboard', price: 800 },
      { id: 'beach', name: 'Beach', price: 1000 },
      { id: 'space', name: 'Space', price: 1500 },
      { id: 'snow', name: 'Snowy ❄️', price: 900, season: 'winter' },
    ],
  },
  {
    id: 'place', name: 'Placing effect', options: [
      { id: 'none', name: 'None', price: 0 },
      { id: 'pop', name: 'Pop in', price: 500 },
      { id: 'ripple', name: 'Ripple', price: 500 },
      { id: 'glow', name: 'Glow', price: 500 },
    ],
  },
  {
    id: 'confetti', name: 'Confetti', options: [
      { id: 'paper', name: 'Paper', price: 0, preview: '🎊' },
      { id: 'stars', name: 'Stars', price: 300, preview: '⭐' },
      { id: 'hearts', name: 'Hearts', price: 300, preview: '💖' },
      { id: 'snow', name: 'Snowflakes', price: 300, preview: '❄️' },
      { id: 'coins', name: 'Coins', price: 500, preview: '🪙' },
      { id: 'emoji', name: 'Fun emoji', price: 800, preview: '🍕', glyphs: ['🍕', '🦖', '⚽', '🌈', '🍩', '🚀'] },
      { id: 'blossom', name: 'Blossoms 🌸', price: 400, preview: '🌸', season: 'spring' },
    ],
  },
  {
    id: 'win', name: 'Win celebration', options: [
      { id: 'confetti', name: 'Confetti', price: 0, preview: '🎉' },
      { id: 'fireworks', name: 'Fireworks', price: 1000, preview: '🎆' },
      { id: 'balloons', name: 'Balloons', price: 1000, preview: '🎈' },
      { id: 'trophies', name: 'Trophy rain', price: 1000, preview: '🏆' },
    ],
  },
  {
    id: 'streak', name: 'Streak counter', options: [
      { id: 'plain', name: 'Plain', price: 0, preview: '🔥' },
      { id: 'flames', name: 'Growing flames', price: 500, preview: '🔥🔥' },
    ],
  },
  {
    id: 'cpu', name: 'CPU character', options: [
      { id: 'robot', name: 'Robot', price: 0, avatar: '🤖', cpuName: 'CPU', hello: '', short: 'CPU' },
      { id: 'owl', name: 'Professor Owl', price: 800, avatar: '🦉', cpuName: 'Professor Owl', hello: 'Hoo-hoo!', short: 'Owl' },
      { id: 'dragon', name: 'Dragon', price: 800, avatar: '🐉', cpuName: 'Dragon', hello: 'Roar!', short: 'Dragon' },
      { id: 'cat', name: 'Whiskers the Cat', price: 800, avatar: '🐱', cpuName: 'Whiskers', hello: 'Purr…', short: 'Whiskers' },
      { id: 'alien', name: 'Zorp the Alien', price: 800, avatar: '👽', cpuName: 'Zorp', hello: 'Beep-zorp!', short: 'Zorp' },
    ],
  },
  {
    id: 'avatar', name: 'Your avatar', options: [
      { id: 'none', name: 'None', price: 0, preview: '—' },
      { id: 'smile', name: 'Smile', price: 0, preview: '🙂' },
      { id: 'dog', name: 'Dog', price: 0, preview: '🐶' },
      { id: 'fox', name: 'Fox', price: 0, preview: '🦊' },
      { id: 'panda', name: 'Panda', price: 0, preview: '🐼' },
      { id: 'robot', name: 'Robot', price: 300, preview: '🤖' },
      { id: 'unicorn', name: 'Unicorn', price: 500, preview: '🦄' },
      { id: 'dino', name: 'Dino', price: 500, preview: '🦖' },
      { id: 'dragon', name: 'Dragon', price: 800, preview: '🐲' },
      { id: 'crown', name: 'Crown', price: 1000, preview: '👑' },
    ],
  },
  {
    id: 'keypad', name: 'Keypad', options: [
      { id: 'classic', name: 'Classic', price: 0 },
      { id: 'candy', name: 'Candy', price: 400 },
      { id: 'retro', name: 'Retro calculator', price: 400 },
      { id: 'neon', name: 'Neon', price: 400 },
    ],
  },
];

const DEFAULTS = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.options[0].id]));

function category(id) {
  return CATEGORIES.find((c) => c.id === id) || null;
}

function option(categoryId, optionId) {
  const cat = category(categoryId);
  return (cat && cat.options.find((o) => o.id === optionId)) || null;
}

// Shop item for a paid option (null when free).
function itemFor(categoryId, optionId) {
  const opt = option(categoryId, optionId);
  if (!opt || !opt.price) return null;
  return opt.item || `cos.${categoryId}.${optionId}`;
}

// Add every paid option to the shop (once), grouped by category.
// Each category's paid looks are a chain (a skill tree, like the main menu):
// each needs the one listed before it, so only the next one shows what it is
// and what it costs. Seasonal looks stay outside the chains.
function registerShopItems(shop) {
  for (const cat of CATEGORIES) {
    let previous = null;
    for (const opt of cat.options) {
      const id = itemFor(cat.id, opt.id);
      if (!id) continue;
      const existing = shop.find((i) => i.id === id);
      const fields = { group: `Wardrobe: ${cat.name}`, name: `${cat.name}: ${opt.name}`, price: opt.price, cosmetic: [cat.id, opt.id] };
      if (opt.season) {
        fields.season = opt.season;
        fields.seasonLabel = SEASONS[opt.season].label;
        fields.available = (now) => seasonActive(opt.season, now);
      } else {
        if (previous) fields.requires = previous;
        previous = id;
      }
      if (existing) Object.assign(existing, fields);
      else shop.push({ id, ...fields });
    }
  }
}

// Keep only choices the player owns; anything else goes back to the default.
function sanitize(chosen, isUnlocked) {
  const out = { ...DEFAULTS };
  for (const cat of CATEGORIES) {
    const want = chosen && chosen[cat.id];
    if (want && option(cat.id, want) && isUnlocked(itemFor(cat.id, want))) out[cat.id] = want;
  }
  return out;
}

// ---------------------------------------------------------------- titles (earned, never bought)

const count = (state, prefix, suffix = '') =>
  Object.keys(state.achievements || {}).filter((id) => id.startsWith(prefix) && id.endsWith(suffix)).length;

const TITLES = [
  { id: 'none', name: 'No title', need: 'Always available', earned: () => true },
  { id: 'learner', name: 'Times Table Learner', need: 'Earn any ×N learner achievement', earned: (s) => count(s, 'table', '_learn') >= 1 },
  { id: 'ninja', name: 'Times Table Ninja', need: 'Earn 5 ×N master achievements', earned: (s) => count(s, 'table', '_master') >= 5 },
  { id: 'speed', name: 'Speed Demon', need: 'Earn 20 fact speed "under 1 s" tiers', earned: (s) => count(s, 'fact_', '_1') >= 20 },
  { id: 'royalty', name: 'Rectangle Royalty', need: 'Earn the Champion score achievement', earned: (s) => Boolean((s.achievements || {}).score400) },
  { id: 'streaker', name: 'Streak Star', need: 'Earn the On fire achievement', earned: (s) => Boolean((s.achievements || {}).streak10) },
  { id: 'collector', name: 'Sticker Collector', need: 'Collect 15 different stickers', earned: (s) => Object.keys(s.stickers || {}).length >= 15 },
];

function title(id) {
  return TITLES.find((t) => t.id === id) || TITLES[0];
}

// ---------------------------------------------------------------- stickers

// Every (non-minor) achievement drops one random sticker. Rarer stickers
// drop less often and trade for more points.
const RARITY = {
  common: { weight: 10, trade: 5 },
  rare: { weight: 4, trade: 15 },
  epic: { weight: 1, trade: 40 },
};
const STICKERS = [
  ['apple', '🍎', 'common'], ['cat', '🐱', 'common'], ['dog', '🐶', 'common'], ['frog', '🐸', 'common'],
  ['sun', '☀️', 'common'], ['flower', '🌼', 'common'], ['ball', '⚽', 'common'], ['pizza', '🍕', 'common'],
  ['star', '⭐', 'common'], ['rainbow', '🌈', 'common'], ['bee', '🐝', 'common'], ['fish', '🐠', 'common'],
  ['owl', '🦉', 'rare'], ['rocket', '🚀', 'rare'], ['octopus', '🐙', 'rare'], ['cactus', '🌵', 'rare'],
  ['guitar', '🎸', 'rare'], ['volcano', '🌋', 'rare'], ['ufo', '🛸', 'rare'], ['penguin', '🐧', 'rare'],
  ['unicorn', '🦄', 'epic'], ['dragon', '🐉', 'epic'], ['crown', '👑', 'epic'], ['gem', '💎', 'epic'],
].map(([id, emoji, rarity]) => ({ id, emoji, rarity }));

function dropSticker(state, rng = Math.random) {
  const total = STICKERS.reduce((sum, s) => sum + RARITY[s.rarity].weight, 0);
  let r = rng() * total;
  let pick = STICKERS[STICKERS.length - 1];
  for (const s of STICKERS) {
    r -= RARITY[s.rarity].weight;
    if (r < 0) {
      pick = s;
      break;
    }
  }
  state.stickers = state.stickers || {};
  state.stickers[pick.id] = (state.stickers[pick.id] || 0) + 1;
  return { sticker: pick, isNew: state.stickers[pick.id] === 1 };
}

// Points you'd get for trading every duplicate (keeping one of each).
function duplicateValue(state) {
  let points = 0;
  for (const s of STICKERS) {
    const extra = Math.max(0, ((state.stickers || {})[s.id] || 0) - 1);
    points += extra * RARITY[s.rarity].trade;
  }
  return points;
}

function tradeDuplicates(state) {
  const points = duplicateValue(state);
  for (const s of STICKERS) if ((state.stickers || {})[s.id] > 1) state.stickers[s.id] = 1;
  Progress.addPoints(state, points);
  return points;
}

registerShopItems(Progress.SHOP);

export {
  SEASONS,
  seasonActive,
  CATEGORIES,
  DEFAULTS,
  category,
  option,
  itemFor,
  registerShopItems,
  sanitize,
  TITLES,
  title,
  RARITY,
  STICKERS,
  dropSticker,
  duplicateValue,
  tradeDuplicates,
};
