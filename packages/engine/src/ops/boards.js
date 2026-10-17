// Board models for the prototypes, independent of the UI.
//
// grid: a cols x rows grid of squares. Pieces are rectangles.
//   - fill mode: rectangles go on empty squares (like Blockout).
//   - clear mode: the board starts covered in stones and a piece knocks out
//     a line of stones.
//   - block: optional size of "wholes"; a rectangle can't cross from one whole
//     into another (the thick lines).
// bars: fraction strips, each one whole long, measured in `units` (e.g. 120ths).
//   - fill mode: pieces pack in from the left.
//   - take mode: bars start full and pieces are taken off the right end.

const EMPTY = -1;
const STONE = -2;

// ------------------------------------------------------------------ grid

function createGrid({ cols, rows, block = 0, mode = 'fill', stones = null }) {
  const cells = new Array(cols * rows).fill(EMPTY);
  // clear mode: `stones` of them (default all), laid out in reading order
  // so a count like 43 shows as four rows of ten and three more
  const n = mode === 'clear' ? (stones == null ? cols * rows : stones) : 0;
  for (let i = 0; i < n; i++) cells[i] = STONE;
  return { kind: 'grid', cols, rows, block, mode, cells, pieces: [], total: mode === 'clear' ? n : cols * rows };
}

// A square the piece may cover: empty when filling, a stone when clearing.
function usable(board, c, r) {
  if (c < 0 || r < 0 || c >= board.cols || r >= board.rows) return false;
  const v = board.cells[r * board.cols + c];
  return board.mode === 'clear' ? v === STONE : v === EMPTY;
}

function sameBlock(board, x, y, w, h) {
  const b = board.block;
  if (!b) return true;
  return Math.floor(x / b) === Math.floor((x + w - 1) / b) && Math.floor(y / b) === Math.floor((y + h - 1) / b);
}

function gridFitsAt(board, x, y, w, h) {
  if (x < 0 || y < 0 || x + w > board.cols || y + h > board.rows) return false;
  if (!sameBlock(board, x, y, w, h)) return false;
  for (let r = y; r < y + h; r++) for (let c = x; c < x + w; c++) if (!usable(board, c, r)) return false;
  return true;
}

function gridOrientations(piece) {
  const { w, h } = piece;
  return piece.rotatable === false || w === h ? [{ w, h, turned: false }] : [{ w, h, turned: false }, { w: h, h: w, turned: true }];
}

function gridPlacements(board, piece) {
  const out = [];
  for (const o of gridOrientations(piece)) {
    for (let y = 0; y + o.h <= board.rows; y++) {
      for (let x = 0; x + o.w <= board.cols; x++) if (gridFitsAt(board, x, y, o.w, o.h)) out.push({ x, y, w: o.w, h: o.h, turned: o.turned });
    }
  }
  return out;
}

function gridFits(board, piece) {
  for (const o of gridOrientations(piece)) {
    for (let y = 0; y + o.h <= board.rows; y++) {
      for (let x = 0; x + o.w <= board.cols; x++) if (gridFitsAt(board, x, y, o.w, o.h)) return true;
    }
  }
  return false;
}

function gridPlace(board, piece, p, owner, correct) {
  if (!gridFitsAt(board, p.x, p.y, p.w, p.h)) throw new Error('Invalid placement');
  for (let r = p.y; r < p.y + p.h; r++) for (let c = p.x; c < p.x + p.w; c++) board.cells[r * board.cols + c] = owner;
  const rec = { ...p, owner, correct, piece };
  board.pieces.push(rec);
  return rec;
}

// Edges and squares the next piece can't use count as contact; snug pieces
// (and, when clearing, knocking out stones from the edge of the pile) leave
// fewer awkward gaps. Squares walled in on all sides are penalised.
function gridCpuChoose(board, piece, rng = Math.random) {
  const options = gridPlacements(board, piece);
  if (!options.length) return null;
  const open = (c, r, p) => usable(board, c, r) && inBlockOf(board, c, r, p) &&
    !(c >= p.x && c < p.x + p.w && r >= p.y && r < p.y + p.h);
  let best = null;
  let bestScore = -Infinity;
  for (const p of options) {
    let contact = 0;
    for (let c = p.x; c < p.x + p.w; c++) contact += !open(c, p.y - 1, p) + !open(c, p.y + p.h, p);
    for (let r = p.y; r < p.y + p.h; r++) contact += !open(p.x - 1, r, p) + !open(p.x + p.w, r, p);
    let holes = 0;
    for (let r = p.y - 1; r <= p.y + p.h; r++) {
      for (let c = p.x - 1; c <= p.x + p.w; c++) {
        if (!open(c, r, p)) continue;
        if (!open(c - 1, r, p) && !open(c + 1, r, p) && !open(c, r - 1, p) && !open(c, r + 1, p)) holes++;
      }
    }
    const score = contact / (2 * (p.w + p.h)) - 0.6 * holes + rng() * 0.05;
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}

// Is (c, r) inside the same whole as the placement? (Squares in the next
// whole over are behind a thick line, so they count as a wall.)
function inBlockOf(board, c, r, p) {
  const b = board.block;
  if (!b) return true;
  return Math.floor(c / b) === Math.floor(p.x / b) && Math.floor(r / b) === Math.floor(p.y / b);
}

function gridCount(board, value) {
  return board.cells.reduce((n, v) => n + (v === value ? 1 : 0), 0);
}

// 0..1: how much of the game is done
function gridProgress(board) {
  if (board.mode === 'clear') return board.total ? 1 - gridCount(board, STONE) / board.total : 1;
  return 1 - gridCount(board, EMPTY) / board.total;
}

// ------------------------------------------------------------------ bars

function createBars({ count, units, mode = 'fill', amounts = null }) {
  const bars = [];
  for (let i = 0; i < count; i++) {
    const amount = amounts ? amounts[i] : mode === 'take' ? units : 0;
    bars.push({ amount, start: amount, segments: [] });
  }
  return { kind: 'bars', units, mode, bars, pieces: [] };
}

function barRoom(board, i) {
  const bar = board.bars[i];
  return board.mode === 'take' ? bar.amount : board.units - bar.amount;
}

function barsPlacements(board, piece) {
  const out = [];
  board.bars.forEach((bar, i) => {
    if (barRoom(board, i) >= piece.len) out.push({ bar: i, start: board.mode === 'take' ? bar.amount - piece.len : bar.amount });
  });
  return out;
}

const barsFits = (board, piece) => board.bars.some((_, i) => barRoom(board, i) >= piece.len);

function barsPlace(board, piece, p, owner, correct) {
  if (barRoom(board, p.bar) < piece.len) throw new Error('Invalid placement');
  const bar = board.bars[p.bar];
  const start = board.mode === 'take' ? bar.amount - piece.len : bar.amount;
  bar.amount += board.mode === 'take' ? -piece.len : piece.len;
  const rec = { bar: p.bar, start, len: piece.len, owner, correct, piece };
  bar.segments.push(rec);
  board.pieces.push(rec);
  return rec;
}

// Finish a whole if possible, otherwise leave the smallest gap.
function barsCpuChoose(board, piece, rng = Math.random) {
  const options = barsPlacements(board, piece);
  if (!options.length) return null;
  let best = null;
  let bestScore = Infinity;
  for (const p of options) {
    const left = barRoom(board, p.bar) - piece.len;
    const score = left + rng() * 0.5;
    if (score < bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}

function barsProgress(board) {
  const total = board.bars.reduce((n, b) => n + (board.mode === 'take' ? b.start : board.units), 0);
  const done = board.bars.reduce((n, b) => n + (board.mode === 'take' ? b.start - b.amount : b.amount), 0);
  return total ? done / total : 1;
}

// ------------------------------------------------------------------ shared

const KINDS = {
  grid: { placements: gridPlacements, fits: gridFits, place: gridPlace, cpuChoose: gridCpuChoose, progress: gridProgress },
  bars: { placements: barsPlacements, fits: barsFits, place: barsPlace, cpuChoose: barsCpuChoose, progress: barsProgress },
};

export const placements = (b, piece) => KINDS[b.kind].placements(b, piece);
export const fits = (b, piece) => KINDS[b.kind].fits(b, piece);
export const place = (b, piece, p, owner, correct) => KINDS[b.kind].place(b, piece, p, owner, correct);
export const cpuChoose = (b, piece, rng) => KINDS[b.kind].cpuChoose(b, piece, rng);
export const progress = (b) => KINDS[b.kind].progress(b);

export {
  EMPTY,
  STONE,
  createGrid,
  createBars,
  gridFitsAt,
  gridCount,
  barRoom,
};
