// Checking the names students type when they join a class, so nobody's name on
// the projector is rude. Two layers:
//   1. An offline word list (server/blocklist.txt), always on. It undoes the usual
//      tricks: accents, l33t speak (sh1t), spacing and dots (f.u.c.k), repeated
//      letters (fuuuck).
//   2. OpenAI's free moderation model, only when the server has OPENAI_API_KEY.
//      Then (and only then) the name is sent to OpenAI. If OpenAI can't be reached
//      the name is allowed, so a class never gets stuck at the door.
// The teacher can still remove anyone from the lobby.
import fs from 'fs';
import path from 'path';

const OPENAI_URL = 'https://api.openai.com/v1/moderations';
const OPENAI_MODEL = 'omni-moderation-latest';
const OPENAI_TIMEOUT_MS = 2000;

// Real names (and name parts) that happen to contain a listed word.
const ALLOW = ['dickens', 'dickson', 'dickinson', 'benedick', 'hancock', 'hitchcock', 'babcock', 'peacock', 'alcock', 'cockburn', 'cockrell', 'scunthorpe', 'shitake', 'crapo', 'hellen', 'penistone', 'sussex', 'essex', 'middlesex', 'dickey', 'dickie', 'cockayne', 'titus', 'titian', 'hoel', 'buttle', 'button', 'shital', 'scrappy'];

const LEET = { 0: 'o', 1: 'i', 2: 'z', 3: 'e', 4: 'a', 5: 's', 6: 'g', 7: 't', 8: 'b', 9: 'g', '@': 'a', $: 's', '!': 'i', '|': 'l', '+': 't', '€': 'e' };

// Lower case, no accents, l33t undone. Keeps word breaks as spaces.
function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '') // accents
    .replace(/[0-9@$!|+€]/g, (c) => LEET[c] || c)
    .replace(/[^a-z]+/g, ' ')
    .trim();
}

const squash = (s) => s.replace(/(.)\1+/g, '$1'); // fuuuck -> fuck

function loadList(file = path.join(import.meta.dirname, 'blocklist.txt')) {
  const whole = [];
  const anywhere = [];
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim().toLowerCase();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('=')) whole.push(normalize(line.slice(1)) || line.slice(1));
    else anywhere.push(normalize(line).replace(/ /g, ''));
  }
  return { whole, anywhere };
}

let LIST = null;

// The offline check. Returns the listed word it found, or null.
function listedWord(name, list = (LIST = LIST || loadList())) {
  const norm = normalize(name);
  if (!norm) return null;
  // Allowed names are taken out first (so "Hancock" passes but "Hancock Fuck" doesn't)
  let clean = ` ${norm} `;
  for (const ok of ALLOW) clean = clean.replace(new RegExp(ok, 'g'), ' ');
  const words = clean.trim().split(/\s+/).filter(Boolean);
  const joined = words.join(''); // f u c k -> fuck
  const forms = [joined, squash(joined)];
  for (const w of list.anywhere) if (forms.some((f) => f.includes(w) || f.includes(squash(w)))) return w;
  // Whole words: each word, and letters spelled out one by one (f u c k)
  const tokens = new Set([...words, ...words.map(squash)]);
  if (words.every((w) => w.length === 1)) tokens.add(joined);
  for (const w of list.whole) if (tokens.has(w)) return w;
  return null;
}

// OpenAI's moderation model: true if it flags the name, false if not,
// null if it couldn't answer (no key, network down, error, too slow).
async function openAiFlags(name, { apiKey, fetch = globalThis.fetch, timeoutMs = OPENAI_TIMEOUT_MS, log = null } = {}) {
  if (!apiKey || !fetch) return null;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  try {
    const res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: OPENAI_MODEL, input: `A child's first name for a classroom game: ${name}` }),
      signal: abort.signal,
    });
    if (!res.ok) throw new Error(`OpenAI moderation: HTTP ${res.status}`);
    const data = await res.json();
    return Boolean(data.results && data.results[0] && data.results[0].flagged);
  } catch (e) {
    if (log) log.warn('moderation.skipped', { 'exception.type': e.name, 'exception.message': e.message });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// { ok: true } or { ok: false, reason: 'words' | 'openai' }
async function checkName(name, options = {}) {
  if (listedWord(name)) return { ok: false, reason: 'words' };
  if ((await openAiFlags(name, options)) === true) return { ok: false, reason: 'openai' };
  return { ok: true };
}

export { normalize, loadList, listedWord, openAiFlags, checkName, OPENAI_URL, OPENAI_MODEL };
