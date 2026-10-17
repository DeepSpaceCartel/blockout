import test from 'node:test';
import assert from 'node:assert';
import * as Core from '../src/core.js';

test('first rectangle may go anywhere by default', () => {
  const b = Core.createBoard(12);
  assert.equal(Core.mustUseCorner(b), false);
  assert.equal(Core.isValidPlacement(b, 3, 3, 2, 5), true);
  assert.equal(Core.validPlacements(b, 2, 5).length, 11 * 8 + 8 * 11);
});

test('corner rule: first rectangle must go in the top-left corner', () => {
  const b = Core.createBoard(12, { firstInCorner: true });
  assert.equal(Core.isValidPlacement(b, 3, 3, 2, 5), false);
  assert.equal(Core.isValidPlacement(b, 0, 0, 2, 5), true);
  const opts = Core.validPlacements(b, 2, 5);
  assert.deepEqual(opts, [{ x: 0, y: 0, w: 2, h: 5 }, { x: 0, y: 0, w: 5, h: 2 }]);
});

test('rectangles cannot overlap or leave the board', () => {
  const b = Core.createBoard(12, { firstInCorner: true });
  Core.place(b, 0, 0, 3, 4, 0);
  assert.equal(Core.isValidPlacement(b, 2, 3, 2, 2), false);
  assert.equal(Core.isValidPlacement(b, 3, 0, 2, 2), true);
  assert.equal(Core.isValidPlacement(b, 11, 0, 2, 1), false);
  assert.throws(() => Core.place(b, 1, 1, 1, 1, 1));
  assert.equal(Core.emptyCount(b), 144 - 12);
});

test('d6 profiles match the original board-size loading', () => {
  assert.deepEqual(Core.diceProfile(12), { sides: 6, common: [1, 4], rare: { 5: 2, 6: 1 } });
  assert.deepEqual(Core.diceProfile(16), { sides: 6, common: [2, 5], rare: { 1: 1, 6: 2 } });
  assert.deepEqual(Core.diceProfile(20), { sides: 6, common: [3, 6], rare: { 1: 1, 2: 2 } });
});

test('custom board sizes use the nearest preset loading', () => {
  const p = Core.diceProfile;
  assert.deepEqual(p(6), p(12));
  assert.deepEqual(p(13), p(12));
  assert.deepEqual(p(14), p(16));
  assert.deepEqual(p(17), p(16));
  assert.deepEqual(p(18), p(20));
  assert.deepEqual(p(30), p(20));
});

test('8- and 12-sided profiles cover every face exactly once', () => {
  for (const sides of [6, 8, 12]) {
    for (const size of [12, 16, 20]) {
      const { common, rare } = Core.diceProfile(size, sides);
      const faces = [];
      for (let f = common[0]; f <= common[1]; f++) faces.push(f);
      faces.push(...Object.keys(rare).map(Number));
      assert.deepEqual(faces.sort((a, b) => a - b), Array.from({ length: sides }, (_, i) => i + 1), `${sides} sides, board ${size}`);
    }
  }
  assert.deepEqual(Core.diceProfile(12, 12).common, [1, 8]);
  assert.deepEqual(Core.diceProfile(20, 12).common, [5, 12]);
});

test('loaded dice stay in range and respect per-game limits', () => {
  for (const sides of [6, 8, 12]) {
    for (const size of [12, 16, 20]) {
      const profile = Core.diceProfile(size, sides);
      for (let g = 0; g < 200; g++) {
        const dice = Core.createDice(size, Math.random, sides);
        const seen = {};
        for (let i = 0; i < 80; i++) {
          const v = dice.roll();
          assert.ok(v >= 1 && v <= sides);
          seen[v] = (seen[v] || 0) + 1;
        }
        for (const [face, limit] of Object.entries(profile.rare)) {
          assert.ok((seen[face] || 0) <= limit, `d${sides} size ${size}: face ${face} rolled ${seen[face]}x, limit ${limit}`);
        }
      }
    }
  }
});

test('removing a rectangle frees its squares', () => {
  const b = Core.createBoard(12);
  const first = Core.place(b, 0, 0, 3, 4, 0);
  const second = Core.place(b, 5, 5, 2, 2, 1);
  Core.removeRect(b, first);
  assert.deepEqual(b.rects, [second]);
  assert.equal(Core.emptyCount(b), 144 - 4);
  assert.equal(Core.isValidPlacement(b, 0, 0, 3, 4), true);
  assert.throws(() => Core.removeRect(b, first));
});

// A 6x6 board with everything filled except the given [x, y] squares.
function boardWithHoles(holes) {
  const b = Core.createBoard(6);
  b.cells.fill(0);
  for (const [x, y] of holes) b.cells[y * 6 + x] = Core.EMPTY;
  return b;
}
const key = ([a, b]) => `${a}x${b}`;

test('fitting rolls go up to the die size', () => {
  const b = Core.createBoard(12);
  assert.equal(Core.fittingRolls(b, 12).length, 144);
  assert.equal(Core.fittingRolls(b).length, 36);
});

test('fitting rolls: 4 squares in a line', () => {
  const b = boardWithHoles([[1, 2], [2, 2], [3, 2], [4, 2]]);
  assert.deepEqual(Core.fittingRolls(b).map(key).sort(), ['1x1', '1x2', '1x3', '1x4', '2x1', '3x1', '4x1']);
});

test('fitting rolls: a 2x2 gap', () => {
  const b = boardWithHoles([[3, 3], [4, 3], [3, 4], [4, 4]]);
  assert.deepEqual(Core.fittingRolls(b).map(key).sort(), ['1x1', '1x2', '2x1', '2x2']);
});

test('near the end, every roll fits', () => {
  for (const size of [12, 16, 20]) {
    const b = boardWithHoles([[0, 0], [1, 0], [2, 0], [0, 5], [1, 5], [0, 4], [1, 4]]);
    const bag = Core.createDice(size);
    const ok = new Set(Core.fittingRolls(b).map(key));
    for (let i = 0; i < 500; i++) {
      const roll = Core.rollForBoard(b, bag);
      assert.ok(ok.has(key(roll)), `size ${size}: ${key(roll)} does not fit`);
    }
    for (const n of Object.values(bag.remaining)) assert.ok(n >= 0);
  }
});

test('"near the end" scales with board size and difficulty', () => {
  assert.equal(Core.fitThreshold(12, 6), 36); // classic game unchanged
  assert.equal(Core.fitThreshold(16, 6), 51);
  assert.equal(Core.fitThreshold(20, 6), 80);
  assert.equal(Core.fitThreshold(12, 8), 64);
  assert.equal(Core.fitThreshold(20, 12), 144);
  assert.equal(Core.fitThreshold(30, 6), 180);
});

test('fit modes: always, never, near the end', () => {
  const b = Core.createBoard(12);
  assert.equal(Core.fitOnlyNow(b, 6, 'always'), true);
  assert.equal(Core.fitOnlyNow(b, 6, 'never'), false);
  assert.equal(Core.fitOnlyNow(b, 6, 'end'), false);
  b.cells.fill(0, 0, 144 - 35); // 35 empty
  assert.equal(Core.fitOnlyNow(b, 6, 'end'), true);
  assert.equal(Core.fitOnlyNow(b, 6, 'never'), false);
});

test('"always" keeps every roll drawable, even with lots of room but awkward gaps', () => {
  // 12x12 with every other row filled: 72 empty squares, but only 1-high strips.
  const b = Core.createBoard(12);
  for (let y = 0; y < 12; y += 2) b.cells.fill(0, y * 12, y * 12 + 12);
  const bag = Core.createDice(12);
  for (let i = 0; i < 300; i++) {
    const [x, y] = Core.rollForBoard(b, bag, Math.random, 'always');
    assert.ok(x === 1 || y === 1, `${x}x${y} cannot fit in a 1-high strip`);
  }
});

test('"never" keeps the original rules (passes are possible)', () => {
  const b = boardWithHoles([[0, 0]]); // one empty square
  const bag = Core.createDice(12);
  const seen = new Set();
  for (let i = 0; i < 300; i++) seen.add(key(Core.rollForBoard(b, bag, Math.random, 'never')));
  assert.ok(seen.size > 1, 'rolls that do not fit should still come up');
});

test('with plenty of room, rolls are not filtered', () => {
  const b = Core.createBoard(12);
  const bag = Core.createDice(12);
  const seen = new Set();
  for (let i = 0; i < 2000; i++) for (const v of Core.rollForBoard(b, bag)) seen.add(v);
  assert.deepEqual([...seen].sort(), [1, 2, 3, 4, 5, 6]);
});

test('square rolls have a single orientation', () => {
  assert.deepEqual(Core.orientations(4, 4), [[4, 4]]);
  assert.deepEqual(Core.orientations(2, 6), [[2, 6], [6, 2]]);
});

test('no placements when the roll does not fit', () => {
  const b = Core.createBoard(6);
  Core.place(b, 0, 0, 6, 3, 0);
  Core.place(b, 0, 3, 3, 3, 1);
  assert.equal(Core.validPlacements(b, 4, 1).length, 0);
  assert.equal(Core.chooseComputerMove(b, 4, 1), null);
  assert.ok(Core.chooseComputerMove(b, 3, 3));
});

test('computer always picks a valid, snug move and games terminate', () => {
  for (let g = 0; g < 200; g++) {
    const b = Core.createBoard(12);
    let passes = 0, turn = 0, moves = 0;
    while (passes < 2 && Core.emptyCount(b) > 0) {
      const [a, c] = [Core.rollDie(), Core.rollDie()];
      const m = Core.chooseComputerMove(b, a, c);
      if (!m) { passes++; } else {
        assert.ok(Core.isValidPlacement(b, m.x, m.y, m.w, m.h));
        assert.deepEqual([m.w, m.h].sort(), [a, c].sort());
        Core.place(b, m.x, m.y, m.w, m.h, turn % 2);
        passes = 0; moves++;
      }
      turn++;
    }
    assert.ok(moves > 0);
  }
});

test('difficulties after Hard: Tricky, Master and Legend dice', () => {
  assert.deepEqual(Core.DIFFICULTIES, ['easy', 'medium', 'hard', 'tricky', 'master', 'legend']);
  // Tricky: no ×1, ×2, ×5, ×10, ×11 facts
  const tricky = Core.createPairDice(12, Math.random, 'tricky');
  for (let i = 0; i < 200; i++) {
    const [a, b] = tricky.rollPair();
    assert.ok(Core.TRICKY_FACES.includes(a) && Core.TRICKY_FACES.includes(b), `${a} × ${b}`);
  }
  // Legend: teen × 2–9 for about LEGEND_TEEN_SHARE of the rolls, Tricky's facts otherwise
  const legend = Core.createPairDice(20, Math.random, 'legend');
  let teens = 0;
  for (let i = 0; i < 2000; i++) {
    const [a, b] = legend.rollPair();
    const teen = a >= 11 && a <= 19 && b >= 2 && b <= 9;
    if (teen) teens++;
    else assert.ok(Core.TRICKY_FACES.includes(a) && Core.TRICKY_FACES.includes(b), `${a} × ${b}`);
  }
  assert.ok(Math.abs(teens / 2000 - Core.LEGEND_TEEN_SHARE) < 0.05, `teen share ${teens / 2000}`);
  assert.equal(Core.fitsDifficulty('legend', 8), false);
  assert.equal(Core.fitsDifficulty('legend', 10), false);
  assert.equal(Core.fitsDifficulty('legend', 12), true);
  assert.equal(Core.fitsDifficulty('legend', 20), true);
  assert.equal(Core.fitsDifficulty('hard', 6), true);
  // Master: the weight picks the facts
  const master = Core.createPairDice(12, Math.random, 'master', (a, b) => (a === 7 && b === 8 ? 1000 : 0.001));
  let hits = 0;
  for (let i = 0; i < 200; i++) if (master.rollPair().join() === '7,8') hits++;
  assert.ok(hits > 180, `7 × 8 came up ${hits} times`);
  // rolls on a board still fit when the board asks for it
  const board = Core.createBoard(12);
  const roll = Core.rollForBoard(board, tricky, Math.random, 'always');
  assert.ok(Core.TRICKY_FACES.includes(roll[0]));
});

// Plays a CPU-vs-CPU game with the difficulty's dice; returns how many rectangles went down.
function playOut(size, difficulty) {
  const board = Core.createBoard(size);
  const bag = Core.usesPairDice(difficulty) ? Core.createPairDice(size, Math.random, difficulty) : Core.createDice(size, Math.random, Core.DIFFICULTY_SIDES[difficulty]);
  let passes = 0;
  let placed = 0;
  while (passes < 2 && Core.emptyCount(board) > 0) {
    const [a, b] = Core.rollForBoard(board, bag, Math.random, 'end');
    const move = Core.chooseComputerMove(board, a, b);
    if (!move) {
      passes++;
      continue;
    }
    passes = 0;
    Core.place(board, move.x, move.y, move.w, move.h, placed % 2);
    placed++;
  }
  return placed;
}

test('Tricky, Master and Legend games last about as long as Hard (not 3 rectangles)', () => {
  for (const difficulty of ['tricky', 'master', 'legend']) {
    let total = 0;
    for (let i = 0; i < 30; i++) total += playOut(12, difficulty);
    assert.ok(total / 30 >= 7, `${difficulty} on 12×12: ${total / 30} rectangles`);
    total = 0;
    for (let i = 0; i < 20; i++) total += playOut(24, difficulty);
    assert.ok(total / 20 >= 16, `${difficulty} on 24×24: ${total / 20} rectangles`);
  }
});

test('tiny dice roll every face evenly', () => {
  assert.deepEqual(Core.diceProfile(2, 2), { sides: 2, common: [1, 2], rare: {} });
  const bag = Core.createDice(3, Math.random, 3);
  const seen = new Set();
  for (let i = 0; i < 300; i++) seen.add(bag.roll());
  assert.deepEqual([...seen].sort(), [1, 2, 3]);
  assert.deepEqual(Core.diceFaces('easy', 4), { a: [1, 2, 3, 4], b: [1, 2, 3, 4] });
});
