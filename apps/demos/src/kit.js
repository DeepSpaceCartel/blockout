// What every demo gets. A demo is a module in ./games/<id>.js:
//
//   export function mount(stage, ctx) {
//     // build the game inside `stage` (an empty <div>), using ctx for everything
//     // that needs cleaning up (listeners, timers, loops)
//     return { state: () => ({ … }) }; // optional: for automated checks
//   }
//
// ctx:
//   level                        'easy' | 'medium' | 'hard'
//   L                            LEVELS[level]: { tables, upTo, label }
//   fact()                       a times-table fact for the level: { a, b, answer, text: '6 × 7' }
//   nearMisses(answer, n, fact?) n wrong answers close to the answer
//   hud.score(n) / hud.hearts(n) / hud.msg(text, 'good'|'bad'|'') / hud.info(text)
//   finish({ title, lines: [] }) ends the demo and shows the results (Play again / All demos)
//   listen(target, type, fn, opts)   addEventListener, removed when the demo closes
//   loop(fn(dt, t))              requestAnimationFrame loop (dt in seconds, capped); returns stop()
//   every(ms, fn) / after(ms, fn)    timers, cleared when the demo closes
//   keys                         a Set of the keys held down right now (e.key)
//   keypad(container, { onSubmit, prompt })  number pad + typing; see below
//   choices(container, values, onPick)       answer buttons
//   canvas(container, w, h)      a sharp <canvas> w × h (CSS pixels) that scales down to fit
//   color(name)                  a theme colour, e.g. color('--accent')
//   rng, pick, shuffle, randInt, isPrime, factorPair
//   toast(title, detail), confetti(el?), celebrate()  (from @blockout/ui/rewards)
import { toast, confettiFrom, confettiFullScreen } from '@blockout/ui/rewards';

export const LEVELS = {
  easy: { label: 'Easy', sub: '×2, ×5, ×10', tables: [2, 5, 10], upTo: 10 },
  medium: { label: 'Medium', sub: '×1 to ×6', tables: [2, 3, 4, 5, 6], upTo: 10 },
  hard: { label: 'Hard', sub: '×2 to ×12', tables: [2, 3, 4, 5, 6, 7, 8, 9, 11, 12], upTo: 12 },
};

export const randInt = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
export const pick = (rng, list) => list[Math.floor(rng() * list.length)];
export function shuffle(rng, list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
export function isPrime(n) {
  if (n < 2) return false;
  for (let d = 2; d * d <= n; d++) if (n % d === 0) return false;
  return true;
}
// two factors, neither 1, as close to each other as rng likes (null for primes)
export function factorPair(rng, n) {
  const pairs = [];
  for (let d = 2; d * d <= n; d++) if (n % d === 0) pairs.push([d, n / d]);
  return pairs.length ? pick(rng, pairs) : null;
}

export function makeFact(level, rng) {
  const L = LEVELS[level];
  const a = pick(rng, L.tables);
  const b = randInt(rng, 1, L.upTo);
  return rng() < 0.5 ? { a, b, answer: a * b, text: `${a} × ${b}` } : { a: b, b: a, answer: a * b, text: `${b} × ${a}` };
}

// wrong answers a child might give: the facts next door, off by one, a ten out
export function nearMisses(rng, answer, n, fact = null) {
  const out = new Set();
  const cands = [answer + 1, answer - 1, answer + 10, answer - 10, answer + 2];
  if (fact) cands.push(fact.a * (fact.b + 1), fact.a * (fact.b - 1), (fact.a + 1) * fact.b, (fact.a - 1) * fact.b);
  for (const v of shuffle(rng, cands)) if (v > 0 && v !== answer) out.add(v);
  while (out.size < n) {
    const v = answer + randInt(rng, -12, 12);
    if (v > 0 && v !== answer) out.add(v);
  }
  return [...out].slice(0, n);
}

const make = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

// ctx for one run of one demo. hudEl: the demo's status bar; onFinish(result).
export function createContext({ level, hudEl, onFinish, rng = Math.random }) {
  const cleanups = [];
  let running = true;
  const keys = new Set();

  const listen = (target, type, fn, opts) => {
    target.addEventListener(type, fn, opts);
    cleanups.push(() => target.removeEventListener(type, fn, opts));
  };
  listen(window, 'keydown', (e) => keys.add(e.key));
  listen(window, 'keyup', (e) => keys.delete(e.key));
  listen(window, 'blur', () => keys.clear());

  const hud = (() => {
    hudEl.innerHTML = '';
    const score = make('span', 'demo-score', '0');
    const hearts = make('span', 'demo-hearts');
    const info = make('span', 'demo-info');
    const msg = make('span', 'demo-msg');
    msg.setAttribute('aria-live', 'polite');
    const left = make('span', 'demo-left');
    left.append(hearts, info);
    const right = make('span', 'demo-right');
    right.append(make('small', null, 'Score '), score);
    hudEl.append(left, msg, right);
    return {
      score: (n) => (score.textContent = n),
      hearts: (n, max = 3) => (hearts.textContent = n === null ? '' : '❤️'.repeat(Math.max(0, n)) + '🤍'.repeat(Math.max(0, max - n))),
      info: (text) => (info.textContent = text || ''),
      msg: (text, kind = '') => {
        msg.textContent = text || '';
        msg.className = `demo-msg ${kind}`;
      },
    };
  })();
  hud.hearts(null);

  const ctx = {
    level,
    L: LEVELS[level],
    rng,
    hud,
    keys,
    listen,
    randInt: (lo, hi) => randInt(rng, lo, hi),
    pick: (list) => pick(rng, list),
    shuffle: (list) => shuffle(rng, list),
    isPrime,
    factorPair: (n) => factorPair(rng, n),
    fact: () => makeFact(level, rng),
    nearMisses: (answer, n, fact) => nearMisses(rng, answer, n, fact),
    toast,
    confetti: (el) => confettiFrom(el || hudEl),
    celebrate: () => confettiFullScreen(),
    color: (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim(),
    get running() {
      return running;
    },

    loop(fn) {
      let last = performance.now();
      let id = requestAnimationFrame(function frame(t) {
        if (!running) return;
        const dt = Math.min(0.05, (t - last) / 1000);
        last = t;
        fn(dt, t);
        id = requestAnimationFrame(frame);
      });
      const stop = () => cancelAnimationFrame(id);
      cleanups.push(stop);
      return stop;
    },
    every(ms, fn) {
      const id = setInterval(() => running && fn(), ms);
      cleanups.push(() => clearInterval(id));
      return () => clearInterval(id);
    },
    after(ms, fn) {
      const id = setTimeout(() => running && fn(), ms);
      cleanups.push(() => clearTimeout(id));
      return () => clearTimeout(id);
    },

    // A number pad (0–9, delete, OK) that also takes typing (digits, Backspace, Enter).
    // onSubmit(number) is called on OK/Enter. Returns { el, clear(), set(text), enable(on), prompt(text) }.
    keypad(container, { onSubmit, prompt = '' } = {}) {
      const box = make('div', 'demo-keypad');
      const q = make('div', 'demo-q', prompt);
      const shown = make('span', 'answer-box');
      const line = make('div', 'demo-answer');
      line.append(q, shown);
      const pad = make('div', 'keypad');
      for (const k of ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0', 'ok']) {
        const b = make('button', k === 'back' ? 'back' : k === 'ok' ? 'check' : '', k === 'back' ? '⌫' : k === 'ok' ? '✓' : k);
        b.type = 'button';
        b.dataset.key = k;
        pad.append(b);
      }
      box.append(line, pad);
      container.append(box);
      let typed = '';
      let enabled = true;
      const render = () => (shown.textContent = typed);
      const press = (k) => {
        if (!enabled) return;
        if (k === 'back') typed = typed.slice(0, -1);
        else if (k === 'ok') {
          if (!typed) return;
          const v = Number(typed);
          typed = '';
          render();
          return onSubmit && onSubmit(v);
        } else if (/^\d$/.test(k) && typed.length < 5) typed += k;
        render();
      };
      listen(pad, 'click', (e) => {
        const b = e.target.closest('[data-key]');
        if (b) press(b.dataset.key);
      });
      listen(window, 'keydown', (e) => {
        if (!enabled || e.target.closest('input, textarea')) return;
        if (/^\d$/.test(e.key)) press(e.key);
        else if (e.key === 'Backspace') press('back');
        else if (e.key === 'Enter') press('ok');
        else return;
        e.preventDefault();
      });
      return {
        el: box,
        clear: () => ((typed = ''), render()),
        set: (text) => ((typed = String(text)), render()),
        enable: (on) => {
          enabled = on;
          box.classList.toggle('disabled', !on);
        },
        prompt: (text) => (q.textContent = text),
        get value() {
          return typed;
        },
      };
    },

    // Answer buttons; onPick(value, button). Returns the container element.
    choices(container, values, onPick) {
      const box = make('div', 'demo-choices');
      for (const v of values) {
        const b = make('button', 'btn', String(v));
        b.type = 'button';
        b.dataset.value = v;
        b.addEventListener('click', () => onPick(v, b));
        box.append(b);
      }
      container.replaceChildren(box);
      return box;
    },

    // A canvas drawn at w × h CSS pixels, sharp on high-DPI screens, shrinking to fit.
    canvas(container, w, h) {
      const c = make('canvas', 'demo-canvas');
      const dpr = window.devicePixelRatio || 1;
      c.width = w * dpr;
      c.height = h * dpr;
      c.style.aspectRatio = `${w} / ${h}`;
      c.style.maxWidth = `${w}px`;
      const g = c.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      container.append(c);
      // pointer position in canvas coordinates
      const point = (e) => {
        const r = c.getBoundingClientRect();
        return { x: ((e.clientX - r.left) / r.width) * w, y: ((e.clientY - r.top) / r.height) * h };
      };
      return { canvas: c, ctx: g, width: w, height: h, point };
    },

    finish(result) {
      if (!running) return;
      running = false;
      stopAll();
      onFinish(result);
    },
  };

  function stopAll() {
    running = false;
    while (cleanups.length) {
      try {
        cleanups.pop()();
      } catch (e) {}
    }
  }
  ctx.stop = stopAll;
  return ctx;
}
