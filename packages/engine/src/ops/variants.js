// The seven Blockout prototypes: the rules and the maths for each, independent of the UI.
//
// Each variant describes:
//   levels         easy / medium / hard: the dice and the board
//   newBoard(lvl)  a fresh board for a game
//   pool(lvl)      every roll that can come up (specs); the engine only deals ones that fit
//   task(spec)     { dice, piece, label } for one roll
//   question(task, board, placement) -> { text, answer }  (asked about the board *before* the piece goes on)
//   explain(...)   the CPU's working, step by step; the last step is the whole sum
//   points(...)    a Fraction (whole numbers are n/1)
//   practice       families of facts to drill, and the board they're drilled on

import * as Fr from './fraction.js';
import * as Boards from './boards.js';

const { F } = Fr;
const s = Fr.str;

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const pairs = (xs, ys = xs) => xs.flatMap((x) => ys.map((y) => [x, y]));

// Every proper fraction (0 < f < 1) with one of these denominators, reduced and without repeats.
function properFractions(dens) {
  const seen = new Map();
  for (const d of dens) for (let n = 1; n < d; n++) { const f = F(n, d); seen.set(s(f), f); }
  return [...seen.values()].sort((x, y) => Fr.cmp(x, y));
}
const unitFractions = (dens) => dens.map((d) => F(1, d));

// "is the denominator of one a multiple of the other"
const related = (x, y) => x.d !== y.d && (x.d % y.d === 0 || y.d % x.d === 0);

// Make both fractions the same-sized pieces, as steps.
function commonSteps(x, y) {
  if (x.d === y.d) return { L: x.d, steps: [`Both are counted in the same size pieces: 1/${x.d}s`] };
  const L = Fr.lcm(x.d, y.d);
  const steps = [`Cut both into the same size pieces: 1/${L}s`];
  if (x.d !== L) steps.push(`${s(x)} = ${(x.n * L) / x.d}/${L}`);
  if (y.d !== L) steps.push(`${s(y)} = ${(y.n * L) / y.d}/${L}`);
  return { L, steps };
}

function simplifyStep(n, d) {
  const f = F(n, d);
  if (n === 0 || (f.n === n && f.d === d)) return [];
  if (f.d === 1) return [`${n}/${d} is ${f.n} whole${f.n === 1 ? '' : 's'}`];
  return [`Simplify: ${n}/${d} = ${s(f)}`];
}

// ================================================================ addition

const addition = {
  id: 'addition',
  name: 'Addition',
  title: 'Line Up',
  op: '+',
  grade: 'Grades 1–3 · adding within 20',
  tagline: 'Roll two dice, lay a bar that long, add the two parts.',
  concept:
    'Each roll becomes a straight bar made of two coloured parts, one per die. Laying bars across a grid rewards spotting long gaps, and the two-colour bar is a number line you can see: 8 and 5 make a bar that crosses a row of 10.',
  howto: [
    'Roll two dice. Your piece is a bar made of both: a 5 and a 3 make a bar 5 + 3 squares long.',
    'Place it across or down on empty squares. Press R (or Rotate) to turn it.',
    'Add the two parts. Get it right to score those squares.',
    'When no bar fits for anyone, the game is over. Most squares wins.',
  ],
  answer: 'int',
  unit: 'squares',
  levels: {
    easy: { label: 'Easy', sub: 'd6 · 12×12', sides: 6, size: 12 },
    medium: { label: 'Medium', sub: 'd8 · 16×16', sides: 8, size: 16 },
    hard: { label: 'Hard', sub: 'd10 · 20×20', sides: 10, size: 20 },
  },
  newBoard(lvl) {
    const { size } = this.levels[lvl];
    return Boards.createGrid({ cols: size, rows: size });
  },
  pool(lvl) {
    return pairs(range(1, this.levels[lvl].sides));
  },
  task([a, b], lvl) {
    const sides = lvl ? this.levels[lvl].sides : 10;
    return {
      spec: [a, b],
      dice: [{ type: 'pips', v: a, sides }, { type: 'pips', v: b, sides }],
      piece: { w: a + b, h: 1, parts: [a, b] },
      label: `${a} + ${b}`,
    };
  },
  question(t) {
    const [a, b] = t.spec;
    return { text: `${a} + ${b}`, answer: F(a + b) };
  },
  explain(t) {
    const [a, b] = t.spec;
    const sum = a + b;
    const big = Math.max(a, b);
    const small = Math.min(a, b);
    let steps;
    if (a === b) steps = [`Double ${a}: ${a} + ${a} = ${sum}`];
    else if (big - small === 1) steps = [`Near double: ${small} + ${small} = ${2 * small}`, `One more: ${2 * small} + 1 = ${sum}`];
    else if (sum > 10 && big < 10) {
      const need = 10 - big;
      steps = [`${big} needs ${need} more to make 10`, `Split ${small} into ${need} and ${small - need}`, `10 + ${small - need} = ${sum}`];
    } else if (big === 10) steps = [`10 and ${small} more is ${sum}`];
    else steps = [`Start at ${big} and count on ${small}: ${range(big + 1, sum).join(', ')}`];
    return [...steps, `${a} + ${b} = ${sum}`];
  },
  points(t) {
    return F(t.spec[0] + t.spec[1]);
  },
  practice: {
    board: () => Boards.createGrid({ cols: 20, rows: 20 }),
    seconds: 10,
    families: [
      { id: 'to10', label: 'Sums to 10', facts: () => pairs(range(1, 9)).filter(([a, b]) => a + b <= 10) },
      { id: 'doubles', label: 'Doubles', facts: () => range(1, 10).map((a) => [a, a]) },
      { id: 'near', label: 'Near doubles', facts: () => pairs(range(1, 10)).filter(([a, b]) => Math.abs(a - b) === 1) },
      { id: 'maketen', label: 'Make a ten', facts: () => pairs(range(2, 9)).filter(([a, b]) => a + b > 10) },
      { id: 'all', label: 'Everything to 20', facts: () => pairs(range(1, 10)) },
    ],
    defaults: ['maketen', 'near'],
  },
};

// ================================================================ subtraction

const STONES_WIDE = 10;

const subtraction = {
  id: 'subtraction',
  name: 'Subtraction',
  title: 'Knock Out',
  op: '−',
  grade: 'Grades 2–3 · subtracting within 100',
  tagline: 'The board starts full of blocks. Knock out a line and say how many are left.',
  concept:
    'The board is a pile of blocks laid out in rows of ten, so the number left is always something you can see in tens and ones. Each roll knocks a straight line out of the pile, and the question is always “how many are left now?”, a real two-digit take-away. Take the last blocks to clear the board.',
  howto: [
    'The board starts covered in blocks, in rows of ten.',
    'Roll the die, then knock out a straight line of that many blocks, across or down. Press R to turn it.',
    'Say how many blocks are left on the board. Get it right to keep the blocks you knocked out.',
    'The game ends when the board is empty. Most blocks wins.',
  ],
  answer: 'int',
  unit: 'blocks',
  levels: {
    easy: { label: 'Easy', sub: 'd6 · 100 blocks', sides: 6, rows: 10 },
    medium: { label: 'Medium', sub: 'd10 · 100 blocks', sides: 10, rows: 10 },
    hard: { label: 'Hard', sub: 'd12 · 150 blocks', sides: 12, rows: 15 },
  },
  newBoard(lvl) {
    const L = this.levels[lvl];
    return Boards.createGrid({ cols: STONES_WIDE, rows: L.rows, mode: 'clear' });
  },
  pool(lvl) {
    return range(1, this.levels[lvl].sides).map((n) => [n]);
  },
  // practice facts are [left, take]; games are [take] and "left" is the board
  task(spec, lvl) {
    const n = spec[spec.length - 1];
    const sides = lvl ? this.levels[lvl].sides : 10;
    return { spec, dice: [{ type: 'pips', v: n, sides }], piece: { w: n, h: 1 }, label: spec.length > 1 ? `${spec[0]} − ${n}` : `take ${n}` };
  },
  question(t, board) {
    const left = Boards.gridCount(board, Boards.STONE);
    const n = t.piece.w;
    return { text: `${left} − ${n}`, answer: F(left - n) };
  },
  explain(t, board) {
    const R = Boards.gridCount(board, Boards.STONE);
    const n = t.piece.w;
    const ones = R % 10;
    let steps;
    if (R <= 10 || n <= ones) {
      steps = R <= 10 ? [`Count back ${n} from ${R}`] : [`${R} has ${ones} ones, so take the ${n} from the ones: ${ones} − ${n} = ${ones - n}`];
    } else if (ones === 0) {
      steps = [`${R} is a whole number of tens, so break one ten: 10 − ${n} = ${10 - n}`, `${R - 10} + ${10 - n} = ${R - n}`];
    } else {
      steps = [`Take ${ones} to get down to a ten: ${R} − ${ones} = ${R - ones}`, `Take the other ${n - ones}: ${R - ones} − ${n - ones} = ${R - n}`];
    }
    return [...steps, `${R} − ${n} = ${R - n}`];
  },
  points(t) {
    return F(t.piece.w);
  },
  practice: {
    // each fact gets its own pile, e.g. 43 blocks as four rows of ten and 3 more
    boardFor: ([left]) => Boards.createGrid({ cols: STONES_WIDE, rows: Math.max(2, Math.ceil(left / STONES_WIDE)), mode: 'clear', stones: left }),
    seconds: 12,
    families: [
      { id: 'from10', label: 'Take from 10', facts: () => range(1, 9).map((n) => [10, n]) },
      { id: 'teens', label: 'Teens', facts: () => pairs(range(11, 19), range(2, 9)).filter(([R, n]) => n > R % 10) },
      { id: 'nocross', label: 'Two-digit, no regrouping', facts: () => pairs(range(21, 99), range(1, 9)).filter(([R, n]) => n <= R % 10) },
      { id: 'across', label: 'Across a ten', facts: () => pairs(range(21, 99), range(2, 9)).filter(([R, n]) => n > R % 10) },
    ],
    defaults: ['teens', 'across'],
  },
};

// ================================================================ division

const division = {
  id: 'division',
  name: 'Division',
  title: 'Split It',
  op: '÷',
  grade: 'Grade 3 · division facts to 144 ÷ 12',
  tagline: 'You get a number of squares and one side. Find the other side, then build it.',
  concept:
    'This is Blockout backwards. The dice give the area and one side of a rectangle; you work out the missing side (the division fact) before you can build it. The rectangle on the board is the array that proves the answer: 3 rows of 6 make 18.',
  howto: [
    'Roll: you get a number of squares (like 18) and one side (like 3).',
    'Work out the missing side: 18 ÷ 3 = ?',
    'Then place your rectangle (3 by your answer) on empty squares. Press R to turn it.',
    'Get it right to score all its squares. Most squares wins.',
  ],
  answer: 'int',
  answerFirst: true,
  unit: 'squares',
  levels: {
    easy: { label: 'Easy', sub: 'd6 · 12×12', sides: 6, size: 12 },
    medium: { label: 'Medium', sub: 'd8 · 16×16', sides: 8, size: 16 },
    hard: { label: 'Hard', sub: 'd12 · 20×20', sides: 12, size: 20 },
  },
  newBoard(lvl) {
    const { size } = this.levels[lvl];
    return Boards.createGrid({ cols: size, rows: size });
  },
  pool(lvl) {
    return pairs(range(1, this.levels[lvl].sides));
  },
  // spec: [side you're given, missing side]
  task([a, q], lvl) {
    const sides = lvl ? this.levels[lvl].sides : 12;
    return {
      spec: [a, q],
      dice: [{ type: 'total', v: a * q }, { type: 'pips', v: a, sides }],
      piece: { w: a, h: q },
      label: `${a * q} ÷ ${a}`,
    };
  },
  question(t) {
    const [a, q] = t.spec;
    return { text: `${a * q} ÷ ${a}`, answer: F(q) };
  },
  explain(t) {
    const [a, q] = t.spec;
    const N = a * q;
    const steps = [`${N} squares in rows of ${a}: how many rows?`];
    if (q <= 12 && a > 1) steps.push(`Count by ${a}s: ${range(1, q).map((k) => k * a).join(', ')}`);
    steps.push(`That's ${q} rows, because ${a} × ${q} = ${N}`);
    return [...steps, `${N} ÷ ${a} = ${q}`];
  },
  points(t) {
    return F(t.spec[0] * t.spec[1]);
  },
  practice: {
    board: () => Boards.createGrid({ cols: 20, rows: 20 }),
    seconds: 10,
    families: range(2, 12).map((a) => ({ id: `d${a}`, label: `÷${a}`, facts: () => range(1, 12).map((q) => [a, q]) })),
    defaults: ['d6', 'd7', 'd8'],
  },
};

// ================================================================ fractions on bars

const BAR_UNITS = 120; // 1/2 … 1/12, 1/5 and 1/10 all come out whole

// A piece for the bars: its length, and the parts it's made of (each with the
// size of its chunks, for the tick marks, and a label).
const barPart = (f, tick = F(1, f.d)) => ({ len: Fr.toUnits(f, BAR_UNITS), tick: Fr.toUnits(tick, BAR_UNITS), label: s(f) });
const barPiece = (parts) => ({ len: parts.reduce((n, p) => n + p.len, 0), parts });
const fracDie = (f) => ({ type: 'frac', f });

// ---------------------------------------------------------------- adding fractions

const ADD_DENS = [2, 3, 4, 5, 6, 8, 10, 12];

function addPairs(kind, dens = ADD_DENS) {
  const fr = properFractions(dens);
  return pairs(fr).filter(([x, y]) => {
    if (Fr.cmp(Fr.add(x, y), Fr.ONE) > 0) return false;
    if (kind === 'same') return x.d === y.d;
    if (kind === 'related') return related(x, y);
    return x.d !== y.d && !related(x, y);
  });
}

const fractionAdd = {
  id: 'fraction-add',
  name: 'Adding fractions',
  title: 'Fill the Whole',
  op: '+',
  grade: 'Grades 4–5 · like and unlike denominators',
  tagline: 'Roll two fraction dice and slide both pieces into a fraction bar.',
  concept:
    'The board is a stack of fraction bars, each one whole long. A roll gives two fraction pieces joined together; you choose which bar to slide them into. The bar has to have room, so you are always thinking about how much is left in each whole. Filling a bar exactly to 1 is a “Blockout”.',
  howto: [
    'Roll two fraction dice, like 1/3 and 1/4. Your piece is both of them joined together.',
    'Choose a bar with enough room. Pieces slide in from the left.',
    'Add the fractions: 1/3 + 1/4 = ? Any equal fraction counts (7/12).',
    'Get it right to score the piece. Fill a bar exactly to make a whole!',
  ],
  answer: 'frac',
  unit: 'wholes',
  levels: {
    easy: { label: 'Easy', sub: 'same denominators', kind: 'same', bars: 10 },
    medium: { label: 'Medium', sub: 'related (1/3 + 1/6)', kind: 'related', bars: 10 },
    hard: { label: 'Hard', sub: 'unlike (1/3 + 1/4)', kind: 'unlike', bars: 10 },
  },
  newBoard(lvl) {
    return Boards.createBars({ count: this.levels[lvl].bars, units: BAR_UNITS });
  },
  pool(lvl) {
    return addPairs(this.levels[lvl].kind);
  },
  task([x, y]) {
    return {
      spec: [x, y],
      dice: [fracDie(x), fracDie(y)],
      piece: barPiece([barPart(x), barPart(y)]),
      label: `${s(x)} + ${s(y)}`,
    };
  },
  question(t) {
    const [x, y] = t.spec;
    return { text: `${s(x)} + ${s(y)}`, answer: Fr.add(x, y) };
  },
  explain(t) {
    const [x, y] = t.spec;
    const { L, steps } = commonSteps(x, y);
    const nx = (x.n * L) / x.d;
    const ny = (y.n * L) / y.d;
    return [...steps, `${nx}/${L} + ${ny}/${L} = ${nx + ny}/${L}`, ...simplifyStep(nx + ny, L), `${s(x)} + ${s(y)} = ${s(Fr.add(x, y))}`];
  },
  points(t) {
    return Fr.add(...t.spec);
  },
  practice: {
    board: () => Boards.createBars({ count: 6, units: BAR_UNITS }),
    seconds: 30,
    families: [
      { id: 'same', label: 'Same denominator', facts: () => addPairs('same') },
      { id: 'related', label: 'Related (halves, quarters, eighths…)', facts: () => addPairs('related') },
      { id: 'unlike', label: 'Unlike denominators', facts: () => addPairs('unlike') },
    ],
    defaults: ['same', 'related'],
  },
};

// ---------------------------------------------------------------- subtracting fractions

const SUB_DICE = {
  easy: properFractions([2, 4, 8]),
  medium: properFractions([2, 3, 4, 6, 12]),
  hard: properFractions([2, 3, 4, 5, 6, 8, 10]),
};

function subPairs(kind) {
  const fr = properFractions([2, 3, 4, 5, 6, 8, 10, 12]);
  if (kind === 'whole') return fr.map((r) => [Fr.ONE, r]);
  return pairs(fr).filter(([A, r]) => {
    if (Fr.cmp(A, r) <= 0) return false;
    if (kind === 'same') return A.d === r.d;
    if (kind === 'related') return related(A, r);
    return A.d !== r.d && !related(A, r);
  });
}

const fractionSub = {
  id: 'fraction-subtract',
  name: 'Subtracting fractions',
  title: 'Empty the Whole',
  op: '−',
  grade: 'Grades 4–5 · like and unlike denominators',
  tagline: 'Every bar starts full. Roll a fraction and take it off the bar you choose.',
  concept:
    'All the fraction bars start full (1 whole each). A roll is one fraction to take away, and you choose the bar. The question is about that bar: “it has 3/4, take away 1/3, how much is left?” Picking a bar is the strategy, and emptying one exactly is a “Blockout”.',
  howto: [
    'Every bar starts as 1 whole.',
    'Roll a fraction, like 1/3. Choose a bar with at least that much left.',
    'Work out what’s left in that bar: 3/4 − 1/3 = ? Any equal fraction counts.',
    'Get it right to keep the piece you took. Empty a bar exactly for a Blockout!',
  ],
  answer: 'frac',
  unit: 'wholes',
  levels: {
    easy: { label: 'Easy', sub: 'halves, quarters, eighths', bars: 8 },
    medium: { label: 'Medium', sub: 'thirds, sixths, twelfths too', bars: 8 },
    hard: { label: 'Hard', sub: 'fifths and tenths too', bars: 8 },
  },
  newBoard(lvl) {
    return Boards.createBars({ count: this.levels[lvl].bars, units: BAR_UNITS, mode: 'take' });
  },
  pool(lvl) {
    return SUB_DICE[lvl].map((r) => [r]);
  },
  // practice facts are [amount in the bar, take]; games are [take]
  task(spec) {
    const r = spec[spec.length - 1];
    return { spec, dice: [fracDie(r)], piece: barPiece([barPart(r)]), label: spec.length > 1 ? `${s(spec[0])} − ${s(r)}` : `take ${s(r)}` };
  },
  barAmount(board, p) {
    return F(board.bars[p.bar].amount, BAR_UNITS);
  },
  question(t, board, p) {
    const A = this.barAmount(board, p);
    const r = t.spec[t.spec.length - 1];
    return { text: `${s(A)} − ${s(r)}`, answer: Fr.sub(A, r) };
  },
  explain(t, board, p) {
    const A = this.barAmount(board, p);
    const r = t.spec[t.spec.length - 1];
    const out = Fr.sub(A, r);
    if (A.d === 1) {
      return [`1 whole is ${r.d}/${r.d}`, `${r.d}/${r.d} − ${s(r)} = ${r.d - r.n}/${r.d}`, ...simplifyStep(r.d - r.n, r.d), `1 − ${s(r)} = ${s(out)}`];
    }
    const { L, steps } = commonSteps(A, r);
    const na = (A.n * L) / A.d;
    const nr = (r.n * L) / r.d;
    return [...steps, `${na}/${L} − ${nr}/${L} = ${na - nr}/${L}`, ...simplifyStep(na - nr, L), `${s(A)} − ${s(r)} = ${s(out)}`];
  },
  points(t) {
    return t.spec[t.spec.length - 1];
  },
  practice: {
    // one bar holding the starting amount
    boardFor: ([A]) => Boards.createBars({ count: 1, units: BAR_UNITS, mode: 'take', amounts: [Fr.toUnits(A, BAR_UNITS)] }),
    seconds: 30,
    families: [
      { id: 'whole', label: '1 − a fraction', facts: () => subPairs('whole') },
      { id: 'same', label: 'Same denominator', facts: () => subPairs('same') },
      { id: 'related', label: 'Related denominators', facts: () => subPairs('related') },
      { id: 'unlike', label: 'Unlike denominators', facts: () => subPairs('unlike') },
    ],
    defaults: ['whole', 'same'],
  },
};

// ---------------------------------------------------------------- multiplying fractions

const WHOLE = 12; // each whole is 12 × 12 squares
const MUL_DICE = {
  easy: unitFractions([2, 3, 4]),
  medium: properFractions([2, 3, 4]),
  hard: properFractions([2, 3, 4, 6, 12]),
};

function mulPairs(kind) {
  const unit = unitFractions([2, 3, 4, 6]);
  const proper = properFractions([2, 3, 4, 6]);
  if (kind === 'unit') return pairs(unit);
  if (kind === 'mixed') return pairs(unit, proper.filter((f) => f.n > 1));
  if (kind === 'proper') return pairs(proper.filter((f) => f.n > 1));
  return pairs(properFractions([2, 3, 4, 6, 12])).filter(([x, y]) => x.d === 12 || y.d === 12 || x.d === 6 || y.d === 6);
}

const fractionMul = {
  id: 'fraction-multiply',
  name: 'Multiplying fractions',
  title: 'Part of a Part',
  op: '×',
  grade: 'Grade 5 · the area model',
  tagline: 'Two fraction dice give the sides. Draw the rectangle inside a whole square.',
  concept:
    'This is the closest cousin of Blockout. The board is made of whole squares, each a 12 × 12 grid. Two fraction dice give a rectangle’s width and height as parts of a whole (2/3 wide, 3/4 tall), and it has to fit inside one whole. The rectangle is the area model: it shows 2/3 × 3/4 as 6 of the 12 parts.',
  howto: [
    'Roll two fraction dice, like 2/3 and 3/4. Your rectangle is 2/3 of a whole wide and 3/4 of a whole tall.',
    'Place it inside one of the whole squares (it can’t cross a thick line). Press R to turn it.',
    'Work out how much of a whole it covers: 2/3 × 3/4 = ? Any equal fraction counts.',
    'Get it right to score it. Most wholes covered wins.',
  ],
  answer: 'frac',
  unit: 'wholes',
  levels: {
    easy: { label: 'Easy', sub: '1/2, 1/3, 1/4', grid: 2 },
    medium: { label: 'Medium', sub: '2/3, 3/4 too', grid: 2 },
    hard: { label: 'Hard', sub: 'sixths and twelfths too', grid: 2 },
  },
  newBoard(lvl) {
    const n = this.levels[lvl].grid * WHOLE;
    return Boards.createGrid({ cols: n, rows: n, block: WHOLE });
  },
  pool(lvl) {
    return pairs(MUL_DICE[lvl]);
  },
  task([x, y]) {
    return {
      spec: [x, y],
      dice: [fracDie(x), fracDie(y)],
      piece: { w: Fr.toUnits(x, WHOLE), h: Fr.toUnits(y, WHOLE), ticks: [WHOLE / x.d, WHOLE / y.d] },
      label: `${s(x)} × ${s(y)}`,
    };
  },
  question(t) {
    const [x, y] = t.spec;
    return { text: `${s(x)} × ${s(y)}`, answer: Fr.mul(x, y) };
  },
  explain(t) {
    const [x, y] = t.spec;
    const parts = x.d * y.d;
    const got = x.n * y.n;
    return [
      `Cut the whole ${x.d} ways across and ${y.d} ways down: ${x.d} × ${y.d} = ${parts} equal parts`,
      `The rectangle covers ${x.n} × ${y.n} = ${got} of them: ${got}/${parts}`,
      ...simplifyStep(got, parts),
      `${s(x)} × ${s(y)} = ${s(Fr.mul(x, y))}`,
    ];
  },
  points(t) {
    return Fr.mul(...t.spec);
  },
  practice: {
    board: () => Boards.createGrid({ cols: 2 * WHOLE, rows: 2 * WHOLE, block: WHOLE }),
    seconds: 30,
    families: [
      { id: 'unit', label: 'Unit × unit (1/2 × 1/3)', facts: () => mulPairs('unit') },
      { id: 'mixed', label: 'Unit × other (1/2 × 2/3)', facts: () => mulPairs('mixed') },
      { id: 'proper', label: 'Other × other (2/3 × 3/4)', facts: () => mulPairs('proper') },
      { id: 'small', label: 'Sixths and twelfths', facts: () => mulPairs('small') },
    ],
    defaults: ['unit', 'mixed'],
  },
};

// ---------------------------------------------------------------- dividing fractions

function divPairs(kind) {
  const dens = [2, 3, 4, 6, 8, 12];
  const all = [...properFractions(dens), Fr.ONE];
  const unit = unitFractions(dens);
  return pairs(all, [...properFractions(dens)]).filter(([D, p]) => {
    const q = Fr.div(D, p);
    if (Fr.cmp(q, Fr.ONE) <= 0 && kind !== 'fraction') return false;
    if (kind === 'whole') return D.d === 1 && unit.some((u) => Fr.eq(u, p));
    if (kind === 'same') return D.d !== 1 && q.d === 1 && p.n === 1 && D.d === p.d;
    if (kind === 'other') return D.d !== 1 && q.d === 1 && D.d !== p.d;
    return q.d !== 1 && D.d <= 8 && p.d <= 8;
  });
}

const fractionDiv = {
  id: 'fraction-divide',
  name: 'Dividing fractions',
  title: 'How Many Fit?',
  op: '÷',
  grade: 'Grades 5–6 · measuring with pieces',
  tagline: 'Roll a length and a piece size. How many pieces fit? Then lay the length on a bar.',
  concept:
    'Division as measuring: 3/4 ÷ 1/8 asks “how many eighths fit in three quarters?”. The piece you place is the dividend, marked off in divisor-sized chunks, so the answer is literally the number of chunks you can count (and at Hard, a leftover part chunk that makes the answer a fraction).',
  howto: [
    'Roll a length (like 3/4) and a piece size (like 1/8).',
    'Choose a bar with enough room for the length. It is marked in piece-sized chunks.',
    'How many pieces fit? 3/4 ÷ 1/8 = ? (At Hard the answer can be a fraction, like 3/2.)',
    'Get it right to score the length you placed. Fill a bar exactly for a Blockout!',
  ],
  answer: 'frac',
  unit: 'wholes',
  levels: {
    easy: { label: 'Easy', sub: 'same size pieces', kinds: ['whole', 'same'], bars: 10 },
    medium: { label: 'Medium', sub: 'different pieces', kinds: ['other'], bars: 10 },
    hard: { label: 'Hard', sub: 'fraction answers', kinds: ['fraction'], bars: 10 },
  },
  newBoard(lvl) {
    return Boards.createBars({ count: this.levels[lvl].bars, units: BAR_UNITS });
  },
  pool(lvl) {
    return this.levels[lvl].kinds.flatMap(divPairs);
  },
  task([D, p]) {
    return {
      spec: [D, p],
      dice: [fracDie(D), fracDie(p)],
      piece: barPiece([barPart(D, p)]),
      label: `${s(D)} ÷ ${s(p)}`,
    };
  },
  question(t) {
    const [D, p] = t.spec;
    return { text: `${s(D)} ÷ ${s(p)}`, answer: Fr.div(D, p) };
  },
  explain(t) {
    const [D, p] = t.spec;
    const q = Fr.div(D, p);
    const steps = [`How many ${s(p)}s fit in ${s(D)}?`];
    const L = Fr.lcm(D.d, p.d);
    const nD = (D.n * L) / D.d;
    const np = (p.n * L) / p.d;
    if (D.d !== L || p.d !== L) steps.push(`In 1/${L}s: ${s(D)} = ${nD}/${L} and ${s(p)} = ${np}/${L}`);
    if (q.d === 1) steps.push(`${nD} ÷ ${np} = ${q.n}: ${q.n} pieces fit`);
    else {
      const whole = Math.floor(q.n / q.d);
      steps.push(`${nD} ÷ ${np} = ${s(q)}`);
      steps.push(`${whole} whole piece${whole === 1 ? '' : 's'} and ${q.n - whole * q.d}/${q.d} of another`);
    }
    return [...steps, `${s(D)} ÷ ${s(p)} = ${s(q)}`];
  },
  points(t) {
    return t.spec[0];
  },
  practice: {
    board: () => Boards.createBars({ count: 6, units: BAR_UNITS }),
    seconds: 30,
    families: [
      { id: 'whole', label: '1 ÷ 1/n', facts: () => divPairs('whole') },
      { id: 'same', label: 'Same size pieces (5/8 ÷ 1/8)', facts: () => divPairs('same') },
      { id: 'other', label: 'Different pieces (3/4 ÷ 1/8)', facts: () => divPairs('other') },
      { id: 'fraction', label: 'Fraction answers (1/2 ÷ 1/3)', facts: () => divPairs('fraction') },
    ],
    defaults: ['whole', 'same'],
  },
};

const VARIANTS = [addition, subtraction, division, fractionAdd, fractionSub, fractionMul, fractionDiv];

export const byId = (id) => VARIANTS.find((v) => v.id === id);

export {
  VARIANTS,
  BAR_UNITS,
  WHOLE,
};
