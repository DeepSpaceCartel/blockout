import test from 'node:test';
import assert from 'node:assert';
import { boardLayout, cellAt, dragRect, drawnMessage } from '../src/boardMath.js';

test('the square under a finger, kept on the board', () => {
  assert.deepEqual(cellAt(0, 0, 40, 6), { c: 0, r: 0 });
  assert.deepEqual(cellAt(85, 41, 40, 6), { c: 2, r: 1 });
  assert.deepEqual(cellAt(-10, 999, 40, 6), { c: 0, r: 5 });
});

test('a drag makes the same rectangle whichever way it goes', () => {
  assert.deepEqual(dragRect({ c0: 1, r0: 1, c1: 3, r1: 2 }), { x: 1, y: 1, w: 3, h: 2 });
  assert.deepEqual(dragRect({ c0: 3, r0: 2, c1: 1, r1: 1 }), { x: 1, y: 1, w: 3, h: 2 });
  assert.deepEqual(dragRect({ c0: 4, r0: 4, c1: 4, r1: 4 }), { x: 4, y: 4, w: 1, h: 1 });
});

test('the reason a drawn rectangle is turned down', () => {
  const rect = { w: 3, h: 3 };
  assert.match(drawnMessage(rect, [2, 3], { rightSize: false }), /3 by 3, but you rolled 2 and 3/);
  assert.match(drawnMessage(rect, [3, 3], { rightSize: true, fits: false }), /bumps into/);
  assert.match(drawnMessage(rect, [3, 3], { rightSize: true, fits: true, corner: false }), /top-left corner/);
});

test('the board fits the width in whole pixels per square', () => {
  assert.deepEqual(boardLayout(361, 6), { cell: 60, side: 360 });
});
