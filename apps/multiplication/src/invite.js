// Blockout invites: a teacher or parent packs a game setup (players, board,
// difficulty, settings, a note and a dice seed) into a link or code.
// An ES module.

const VERSION = 1;
const NOTE_MAX = 140;
const NAME_MAX = 14;

// Every setting an invite may set, with its allowed values.
const SETTING_VALUES = {
  difficulty: ['easy', 'medium', 'hard', 'tricky', 'master', 'legend'],
  placeMode: ['draw', 'auto'],
  autoRoll: ['manual', 'auto'],
  answerTime: ['0', '30', '10', '5', '20'], // 20 s is no longer offered but old invites still open
  cpuSpeed: ['slow', 'normal', 'fast'],
  cpuSteps: ['show', 'instant'],
  cpuEnd: ['auto', 'button'],
  showProgress: [false, true],
};

// Settings the game no longer has (the corner rule, real dice, when rolls fit):
// old invites may still carry them, so they're ignored and those links still open.
const REMOVED_SETTINGS = ['firstInCorner', 'diceMode', 'fitRolls'];

// Invite shape (short keys keep links short):
//   { v: 1, m: 'single'|'multi', b: boardSize, p: [{ n: name, c: isCpu }],
//     s: { setting: value }, t: note, r: dice seed }
// Returns a clean copy, or null if anything is missing or out of range.
function validate(raw) {
  if (!raw || typeof raw !== 'object' || raw.v !== VERSION) return null;
  if (raw.m !== 'single' && raw.m !== 'multi') return null;
  if (!Number.isInteger(raw.b) || raw.b < 6 || raw.b > 30) return null;
  if (raw.s && raw.s.difficulty === 'legend' && raw.b < 12) return null; // Legend's teens need room
  if (!Array.isArray(raw.p)) return null;
  const count = raw.p.length;
  if (raw.m === 'single' ? count !== 1 : count < 2 || count > 4) return null;
  const players = [];
  for (const p of raw.p) {
    if (!p || typeof p !== 'object') return null;
    const cpu = raw.m === 'multi' && p.c === true;
    const name = typeof p.n === 'string' ? p.n.trim().slice(0, NAME_MAX) : '';
    players.push({ n: name, c: cpu });
  }
  const s = {};
  for (const [key, given] of Object.entries(raw.s || {})) {
    if (REMOVED_SETTINGS.includes(key)) continue;
    const value = key === 'placeMode' && given === 'click' ? 'draw' : given; // Click to place is gone: draw it
    if (!SETTING_VALUES[key] || !SETTING_VALUES[key].includes(value)) return null;
    s[key] = value;
  }
  const clean = { v: VERSION, m: raw.m, b: raw.b, p: players, s };
  if (typeof raw.t === 'string' && raw.t.trim()) clean.t = raw.t.trim().slice(0, NOTE_MAX);
  if (raw.r !== undefined) {
    if (!Number.isInteger(raw.r) || raw.r < 0 || raw.r > 0xffffffff) return null;
    clean.r = raw.r;
  }
  return clean;
}

// base64url of the UTF-8 JSON, so names and notes can use any language.
function encode(invite) {
  const bytes = new TextEncoder().encode(JSON.stringify(invite));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decode(token) {
  try {
    const b64 = token.trim().replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
    return validate(JSON.parse(new TextDecoder().decode(bytes)));
  } catch (_) {
    return null;
  }
}

// Accepts a bare code, a "#invite=CODE" fragment or a full link.
function tokenFrom(text) {
  const match = String(text).match(/[#&?]invite=([A-Za-z0-9_-]+)/);
  if (match) return match[1];
  const bare = String(text).trim();
  return /^[A-Za-z0-9_-]+$/.test(bare) ? bare : null;
}

// Small, fast seeded generator (mulberry32): same seed, same dice.
function seededRandom(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function newSeed() {
  return Math.floor(Math.random() * 0xffffffff);
}

export {
  VERSION,
  SETTING_VALUES,
  validate,
  encode,
  decode,
  tokenFrom,
  seededRandom,
  newSeed,
};
