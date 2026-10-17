import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLES, confettiGlyphs, winPieces } from '../src/celebration.js';

// (the same numbers every run)
const seeded = (seed) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

test('every win look makes pieces with their whole path sampled', () => {
  for (const win of ['confetti', 'fireworks', 'balloons', 'trophies']) {
    const pieces = winPieces(win, null, 390, 844, seeded(3));
    assert.ok(pieces.length >= 20, win);
    for (const p of pieces) {
      for (const list of [p.xs, p.ys, p.spins, p.opacities]) assert.equal(list.length, SAMPLES + 1, win);
      assert.ok(p.opacities.every((o) => o >= 0 && o <= 1), win);
    }
  }
});

test('confetti falls, balloons rise, and pieces fade out by the end', () => {
  const fall = winPieces('trophies', null, 390, 844, seeded(5));
  assert.ok(fall.every((p) => p.ys[SAMPLES] > p.ys[0]));
  const rise = winPieces('balloons', null, 390, 844, seeded(5));
  assert.ok(rise.every((p) => p.ys[SAMPLES] < p.ys[0] && p.glyph === '🎈'));
  assert.ok(rise.every((p) => p.spins.every((d) => Math.abs(d) <= 15)), 'balloons stay upright');
  assert.ok(winPieces('confetti', null, 390, 844, seeded(7)).every((p) => p.opacities[SAMPLES] === 0));
});

test('the confetti look picks paper or emoji pieces', () => {
  assert.equal(confettiGlyphs({ id: 'paper' }), null);
  assert.deepEqual(confettiGlyphs({ id: 'snow' }), ['❄️']);
  assert.deepEqual(confettiGlyphs({ id: 'emoji', glyphs: ['🍕', '🌮'] }), ['🍕', '🌮']);
  const emoji = winPieces('confetti', ['🍕'], 390, 844, seeded(9));
  assert.ok(emoji.every((p) => p.glyph === '🍕'));
});
