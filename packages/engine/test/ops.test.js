import test from 'node:test';
import assert from 'node:assert';
import * as Fr from '../src/ops/fraction.js';
import * as B from '../src/ops/boards.js';
import { VARIANTS, byId, BAR_UNITS } from '../src/ops/variants.js';

const { F } = Fr;

test('fractions are kept reduced and do exact arithmetic', () => {
  assert.deepEqual(F(6, 8), { n: 3, d: 4 });
  assert.deepEqual(F(3, -6), { n: -1, d: 2 });
  assert.deepEqual(Fr.add(F(1, 3), F(1, 4)), F(7, 12));
  assert.deepEqual(Fr.sub(F(3, 4), F(1, 3)), F(5, 12));
  assert.deepEqual(Fr.mul(F(2, 3), F(3, 4)), F(1, 2));
  assert.deepEqual(Fr.div(F(1, 2), F(1, 3)), F(3, 2));
  assert.equal(Fr.mixed(F(11, 4)), '2 3/4');
  assert.equal(Fr.str(F(4, 2)), '2');
  assert.equal(Fr.toUnits(F(3, 8), 120), 45);
  assert.throws(() => Fr.toUnits(F(1, 7), 120));
});

test('typed answers: equal fractions count, and we know if it is in simplest form', () => {
  assert.deepEqual(Fr.parseAnswer('2', '4'), { value: F(1, 2), simplest: false });
  assert.deepEqual(Fr.parseAnswer('1', '2'), { value: F(1, 2), simplest: true });
  assert.deepEqual(Fr.parseAnswer('6', ''), { value: F(6), simplest: true });
  assert.equal(Fr.parseAnswer('', '3'), null);
  assert.equal(Fr.parseAnswer('3', '0'), null);
});

test('grid: pieces can’t cross into another whole', () => {
  const b = B.createGrid({ cols: 24, rows: 24, block: 12 });
  assert.ok(B.gridFitsAt(b, 0, 0, 12, 12));
  assert.ok(!B.gridFitsAt(b, 6, 0, 12, 3));
  B.place(b, { w: 12, h: 12 }, { x: 0, y: 0, w: 12, h: 12 }, 0, true);
  assert.ok(!B.gridFitsAt(b, 0, 0, 1, 1));
  assert.equal(B.progress(b), 0.25);
});

test('grid clear mode: stones in rows of ten, lines must be all stones', () => {
  const b = B.createGrid({ cols: 10, rows: 5, mode: 'clear', stones: 43 });
  assert.equal(B.gridCount(b, B.STONE), 43);
  assert.ok(B.fits(b, { w: 10, h: 1 }));
  assert.ok(B.gridFitsAt(b, 2, 4, 1, 1)); // the 43rd block
  assert.ok(!B.gridFitsAt(b, 3, 4, 1, 1)); // past it
  assert.ok(B.gridFitsAt(b, 0, 0, 1, 5) && !B.gridFitsAt(b, 3, 0, 1, 5));
  B.place(b, { w: 7, h: 1 }, { x: 0, y: 0, w: 7, h: 1 }, 0, true);
  assert.equal(B.gridCount(b, B.STONE), 36);
});

test('bars: fill packs from the left; take comes off the right', () => {
  const fill = B.createBars({ count: 2, units: 12 });
  B.place(fill, { len: 8 }, { bar: 0 }, 0, true);
  assert.equal(B.barRoom(fill, 0), 4);
  assert.deepEqual(B.placements(fill, { len: 6 }), [{ bar: 1, start: 0 }]);
  assert.deepEqual(B.cpuChoose(fill, { len: 4 }, () => 0), { bar: 0, start: 8 }); // finishes the whole
  const take = B.createBars({ count: 1, units: 12, mode: 'take' });
  const rec = B.place(take, { len: 5 }, { bar: 0 }, 1, true);
  assert.equal(rec.start, 7);
  assert.ok(!B.fits(take, { len: 8 }));
});

test('every variant: every roll fits a new board, and games reach an end', () => {
  for (const v of VARIANTS) {
    for (const lvl of Object.keys(v.levels)) {
      const board = v.newBoard(lvl);
      const tasks = v.pool(lvl).map((spec) => v.task(spec, lvl));
      assert.ok(tasks.length > 0, `${v.id} ${lvl} has rolls`);
      for (const t of tasks) assert.ok(B.fits(board, t.piece), `${v.id} ${lvl}: ${t.label} fits`);
      // CPU plays itself until nothing fits
      let turns = 0;
      for (;;) {
        const fitting = tasks.filter((t) => B.fits(board, t.piece));
        if (!fitting.length) break;
        const t = fitting[turns % fitting.length];
        const p = B.cpuChoose(board, t.piece, () => 0.5);
        v.question(t, board, p);
        B.place(board, t.piece, p, turns % 2, true);
        assert.ok(++turns < 500, `${v.id} ${lvl} ends`);
      }
      assert.ok(turns >= 6, `${v.id} ${lvl}: a game lasts a while (${turns} turns)`);
    }
  }
});

test('every practice fact: the working ends with the right answer', () => {
  for (const v of VARIANTS) {
    for (const fam of v.practice.families) {
      const facts = fam.facts();
      assert.ok(facts.length > 0, `${v.id} ${fam.id} has facts`);
      for (const spec of facts) {
        const t = v.task(spec);
        const board = v.practice.boardFor ? v.practice.boardFor(spec) : v.practice.board();
        const p = B.placements(board, t.piece)[0];
        assert.ok(p, `${v.id} ${t.label} fits the practice board`);
        const q = v.question(t, board, v.answerFirst ? null : p);
        const steps = v.explain(t, board, v.answerFirst ? null : p);
        assert.ok(steps.at(-1).endsWith(`= ${Fr.str(q.answer)}`), `${v.id} ${t.label}: ${steps.at(-1)}`);
      }
    }
  }
});

test('the maths behind a few questions', () => {
  const sub = byId('subtraction');
  const pile = sub.practice.boardFor([43, 7]);
  assert.deepEqual(sub.question(sub.task([43, 7]), pile).answer, F(36));
  const div = byId('division');
  assert.deepEqual(div.question(div.task([3, 6])), { text: '18 ÷ 3', answer: F(6) });
  const fsub = byId('fraction-subtract');
  const bar = fsub.practice.boardFor([F(3, 4), F(1, 3)]);
  assert.deepEqual(fsub.question(fsub.task([F(3, 4), F(1, 3)]), bar, { bar: 0 }).answer, F(5, 12));
  const fmul = byId('fraction-multiply');
  assert.deepEqual(fmul.task([F(2, 3), F(3, 4)]).piece, { w: 8, h: 9, ticks: [4, 3] });
  const fdiv = byId('fraction-divide');
  const piece = fdiv.task([F(3, 4), F(1, 8)]).piece;
  assert.equal(piece.len, (3 / 4) * BAR_UNITS);
  assert.equal(piece.parts[0].tick, BAR_UNITS / 8);
});
