// Win celebrations, worked out ahead: every piece's path (the web game's
// confetti physics, in wallet.js and @blockout/ui/rewards), sampled at a few
// moments so the native animation driver can play them smoothly. Pure.

export const COLORS = ['#e4572e', '#2e86de', '#2a9d5c', '#8e5bd6', '#f2c94c', '#ff8fab'];
export const DURATION_MS = 4000;
const FRAME_MS = 16.7;
export const SAMPLES = 24;

// Wardrobe confetti: paper (null), or emoji pieces
const GLYPHS = { stars: ['⭐', '🌟'], hearts: ['💖', '💗', '❤️'], snow: ['❄️'], coins: ['🪙'], blossom: ['🌸', '🌼'] };
export const confettiGlyphs = (confetti) => (confetti.id === 'emoji' ? confetti.glyphs : GLYPHS[confetti.id] || null);

// One piece, flying until maxAge (frames), its path sampled SAMPLES + 1 times
// over DURATION_MS: { glyph, color, size, round, xs, ys, spins, opacities }
function fly(start, random) {
  const p = { ...start, wobble: random() * Math.PI * 2, spin: random() * Math.PI, age: 0 };
  const frames = DURATION_MS / FRAME_MS;
  const out = { glyph: p.glyph, color: p.color, size: p.size, round: p.round, delay: p.delay || 0, xs: [], ys: [], spins: [], opacities: [] };
  for (let f = 0, s = 0; s <= SAMPLES; f++) {
    if (f >= (s / SAMPLES) * frames) {
      out.xs.push(p.x);
      out.ys.push(p.y);
      out.spins.push(((p.upright ? Math.sin(p.wobble) * 0.25 : p.spin) * 180) / Math.PI); // (balloons sway, upright)
      out.opacities.push(Math.max(0, Math.min(1, (p.maxAge - p.age) / 40, (frames - f) / 30))); // (and all gone at the end)
      s++;
    }
    p.age += 1;
    p.vy = Math.min(p.vy + p.gravity, 6);
    p.vx *= 0.985;
    p.wobble += 0.15;
    p.x += p.vx + Math.sin(p.wobble) * 0.8;
    p.y += p.vy;
    p.spin += p.vspin;
  }
  return out;
}

// The pieces for a win in this Wardrobe look (win: confetti, fireworks,
// balloons, trophies), on a w × h screen. glyphs: the confetti look's (null: paper).
export function winPieces(win, glyphs, w, h, random = Math.random) {
  const pick = (list) => list[Math.floor(random() * list.length)];
  const pieces = [];
  const add = (x, y, angleDeg, speed, maxAge, extra = {}) => {
    const g = extra.glyphs !== undefined ? extra.glyphs : glyphs;
    const a = (angleDeg * Math.PI) / 180;
    pieces.push(
      fly(
        {
          x,
          y,
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed,
          size: extra.size || (g ? 9 + random() * 6 : 5 + random() * 6) * (g ? 2 : 1),
          vspin: (random() - 0.5) * (g ? 0.12 : 0.4),
          color: extra.color || pick(COLORS),
          round: random() < 0.3,
          glyph: g ? pick(g) : null,
          gravity: extra.gravity !== undefined ? extra.gravity : 0.28,
          maxAge,
          delay: extra.delay || 0,
          upright: Boolean(extra.upright),
        },
        random
      )
    );
  };
  // (a phone shows fewer pieces than a big screen: each one is a view)
  if (win === 'fireworks') {
    for (let burst = 0; burst < 5; burst++) {
      const x = w * (0.15 + random() * 0.7);
      const y = h * (0.15 + random() * 0.35);
      const color = pick(COLORS);
      for (let i = 0; i < 24; i++) add(x, y, (i / 24) * 360, 3 + random() * 5, 90 + random() * 40, { glyphs: null, gravity: 0.1, color, size: 6, delay: burst * 380 });
    }
  } else if (win === 'balloons') {
    for (let i = 0; i < 24; i++) add(random() * w, h + 20 + random() * h * 0.6, -90 + (random() - 0.5) * 16, 2 + random() * 2.5, 520, { glyphs: ['🎈'], gravity: -0.01, size: 28 + random() * 16, upright: true });
  } else if (win === 'trophies') {
    for (let i = 0; i < 40; i++) add(random() * w, -20 - random() * h * 0.9, 90 + (random() - 0.5) * 20, 1 + random() * 3, 420, { glyphs: ['🏆', '🪙', '⭐', '🥇'] });
  } else {
    // a shower from the top, plus a cannon in each bottom corner
    for (let i = 0; i < 60; i++) add(random() * w, -20 - random() * h * 0.9, 90 + (random() - 0.5) * 30, 1 + random() * 3, 420);
    const reach = Math.sqrt(h) * 0.75;
    for (let i = 0; i < 25; i++) {
      add(0, h, -60 + (random() - 0.5) * 30, reach * (0.7 + random() * 0.5), 300);
      add(w, h, -120 + (random() - 0.5) * 30, reach * (0.7 + random() * 0.5), 300);
    }
  }
  return pieces;
}
