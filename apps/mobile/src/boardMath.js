// Board geometry for touch: which square a finger is on, and the rectangle
// between where a drag started and where it is now. No React here: tested in
// test/boardMath.test.js.

// The square under (x, y), in pixels from the board's top-left. Clamped to the
// board, so a drag that leaves it keeps the nearest square.
export function cellAt(x, y, cellSize, size) {
  const clamp = (v) => Math.max(0, Math.min(size - 1, Math.floor(v / cellSize)));
  return { c: clamp(x), r: clamp(y) };
}

// The rectangle from corner to corner, whichever way the drag went.
export function dragRect({ c0, r0, c1, r1 }) {
  return { x: Math.min(c0, c1), y: Math.min(r0, r1), w: Math.abs(c1 - c0) + 1, h: Math.abs(r1 - r0) + 1 };
}

// What to say about a drawn rectangle that doesn't count (match.judge's verdict).
export function drawnMessage(rect, dice, verdict) {
  const [a, b] = dice;
  if (!verdict.rightSize) return `That's ${rect.w} by ${rect.h}, but you rolled ${a} and ${b}. Try again!`;
  return 'Right size, but it bumps into another rectangle. Try a different spot!';
}

// The board fills the width it's given, in whole pixels per square.
export function boardLayout(width, size) {
  const cell = Math.floor(width / size);
  return { cell, side: cell * size };
}
