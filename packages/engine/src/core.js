// Blockout game rules, independent of the UI.
// An ES module (@blockout/engine), used by the games and the server.

const EMPTY = -1;

function createBoard(size) {
  return { size, cells: new Array(size * size).fill(EMPTY), rects: [] };
}

function fits(board, x, y, w, h) {
  const n = board.size;
  if (x < 0 || y < 0 || x + w > n || y + h > n) return false;
  for (let r = y; r < y + h; r++) {
    for (let c = x; c < x + w; c++) {
      if (board.cells[r * n + c] !== EMPTY) return false;
    }
  }
  return true;
}

// (Once, the first rectangle of a game had to go in the top-left corner.)
const isValidPlacement = (board, x, y, w, h) => fits(board, x, y, w, h);

// Both orientations of an a-by-b roll (only one when a === b).
function orientations(a, b) {
  return a === b ? [[a, b]] : [[a, b], [b, a]];
}

function validPlacements(board, a, b) {
  const out = [];
  for (const [w, h] of orientations(a, b)) {
    for (let y = 0; y + h <= board.size; y++) {
      for (let x = 0; x + w <= board.size; x++) {
        if (isValidPlacement(board, x, y, w, h)) out.push({ x, y, w, h });
      }
    }
  }
  return out;
}

function place(board, x, y, w, h, player) {
  if (!isValidPlacement(board, x, y, w, h)) throw new Error('Invalid placement');
  const n = board.size;
  for (let r = y; r < y + h; r++) {
    for (let c = x; c < x + w; c++) board.cells[r * n + c] = player;
  }
  const rect = { x, y, w, h, player, area: w * h };
  board.rects.push(rect);
  return rect;
}

// Take a rectangle back off the board (e.g. when a player runs out of time).
function removeRect(board, rect) {
  const i = board.rects.indexOf(rect);
  if (i === -1) throw new Error('Rectangle is not on this board');
  board.rects.splice(i, 1);
  const n = board.size;
  for (let r = rect.y; r < rect.y + rect.h; r++) {
    for (let c = rect.x; c < rect.x + rect.w; c++) board.cells[r * n + c] = EMPTY;
  }
}

function emptyCount(board) {
  return board.cells.reduce((sum, v) => sum + (v === EMPTY ? 1 : 0), 0);
}

function isOpen(board, c, r) {
  const n = board.size;
  return c >= 0 && r >= 0 && c < n && r < n && board.cells[r * n + c] === EMPTY;
}

// Number of perimeter neighbours that are walls or already filled.
// Snug placements leave fewer awkward gaps.
function contactScore(board, { x, y, w, h }) {
  let contact = 0;
  for (let c = x; c < x + w; c++) {
    if (!isOpen(board, c, y - 1)) contact++;
    if (!isOpen(board, c, y + h)) contact++;
  }
  for (let r = y; r < y + h; r++) {
    if (!isOpen(board, x - 1, r)) contact++;
    if (!isOpen(board, x + w, r)) contact++;
  }
  return contact;
}

// Count open cells that would end up fully walled in on all four sides
// (only a 1x1 roll could ever use them).
function isolatedHolesAround(board, { x, y, w, h }) {
  const n = board.size;
  const filled = new Set();
  for (let r = y; r < y + h; r++) for (let c = x; c < x + w; c++) filled.add(r * n + c);
  const open = (c, r) => isOpen(board, c, r) && !filled.has(r * n + c);
  let holes = 0;
  for (let r = y - 1; r <= y + h; r++) {
    for (let c = x - 1; c <= x + w; c++) {
      if (!open(c, r)) continue;
      if (!open(c - 1, r) && !open(c + 1, r) && !open(c, r - 1) && !open(c, r + 1)) holes++;
    }
  }
  return holes;
}

// Computer strategy: pack rectangles tightly against walls and other
// rectangles and avoid leaving single-cell holes. Returns null if nothing fits.
function chooseComputerMove(board, a, b, rng = Math.random) {
  const options = validPlacements(board, a, b);
  if (options.length === 0) return null;
  let best = null;
  let bestScore = -Infinity;
  for (const p of options) {
    const perimeter = 2 * (p.w + p.h);
    const score =
      contactScore(board, p) / perimeter - 0.6 * isolatedHolesAround(board, p) + rng() * 0.05;
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}

function rollDie(rng = Math.random, sides = 6) {
  return 1 + Math.floor(rng() * sides);
}

// Difficulty sets the dice: easy d6, medium d8, hard d12. After Hard the
// facts stay within the times table (or just past it) but get harder:
//   tricky  12-sided dice without the giveaways (no ×1, ×2, ×5, ×10, ×11)
//   master  12-sided dice that lean towards the player's weakest facts
//   legend  two-digit × one-digit: 11–19 on one die, 2–9 on the other
// DIFFICULTY_SIDES is the biggest face (numbered dice, fit maths).
const DIFFICULTIES = ['easy', 'medium', 'hard', 'tricky', 'master', 'legend'];
const DIFFICULTY_SIDES = { easy: 6, medium: 8, hard: 12, tricky: 12, master: 12, legend: 19 };
const TRICKY_FACES = [3, 4, 6, 7, 8, 9, 12];
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

// The faces of each die: { a: [...], b: [...] } (the same for both except Legend).
// sides: numbered dice other than the difficulty's (a Journey level's).
function diceFaces(difficulty, sides = null) {
  if (difficulty === 'tricky') return { a: TRICKY_FACES, b: TRICKY_FACES };
  if (difficulty === 'legend') return { a: range(11, 19), b: range(2, 9) };
  const n = sides || DIFFICULTY_SIDES[difficulty] || 6;
  return { a: range(1, n), b: range(1, n) };
}

// The new difficulties roll both dice at once from a list of pairs (Legend's
// dice differ; Master weights each fact). Easy/Medium/Hard use createDice.
const usesPairDice = (difficulty) => ['tricky', 'master', 'legend'].includes(difficulty);

// Legend: about 1 roll in LEGEND_TEEN_SHARE is a teen × 2–9; the rest are
// Tricky's facts. All-teen games filled the board in 3–8 rectangles.
const LEGEND_TEEN_SHARE = 1 / 2;
const PAIR_ROOM = 1 / 6; // share of the board a "comfortable" rectangle covers

// weight(a, b): how likely a roll is (Master: weak facts more), default even.
// Pairs that can't fit the board at all are left out (Legend on small boards).
function createPairDice(boardSize, rng = Math.random, difficulty = 'tricky', weight = null) {
  const fits = ([a, b]) => a <= boardSize && b <= boardSize;
  const cross = ({ a: A, b: B }) => A.flatMap((a) => B.map((b) => [a, b])).filter(fits);
  // Like the loaded dice: big rectangles are rarer on smaller boards, so a
  // game lasts about as long as on Hard (big facts still come up, just less).
  const roomy = boardSize * boardSize * PAIR_ROOM;
  const sizeBias = (a, b) => 1 / (1 + ((a * b) / roomy) ** 2);
  const given = weight || (() => 1);
  let pairs = cross(diceFaces(difficulty));
  let w = (a, b) => given(a, b) * sizeBias(a, b);
  if (difficulty === 'legend') {
    // Each group gets its share of the rolls, with the size bias inside it
    const isTeen = (a, b) => a >= 11 && b <= 9;
    const teens = pairs;
    const tricky = cross(diceFaces('tricky')).filter(([a, b]) => !isTeen(a, b)); // 12 × 7 is already a teen roll
    pairs = [...teens, ...tricky];
    const total = (list) => list.reduce((sum, [a, b]) => sum + sizeBias(a, b), 0);
    const teenShare = teens.length ? LEGEND_TEEN_SHARE : 0;
    const teenTotal = total(teens) || 1;
    const trickyTotal = total(tricky);
    w = (a, b) => sizeBias(a, b) * (isTeen(a, b) ? teenShare / teenTotal : (1 - teenShare) / trickyTotal);
  }
  return {
    sides: DIFFICULTY_SIDES[difficulty],
    pairs,
    seen: [], // this game's rolls, as shapes ('3x4'): see rollForBoard
    // a weighted pick from `from` (default: every pair)
    rollPair(from = pairs) {
      const total = from.reduce((sum, [a, b]) => sum + w(a, b), 0);
      let r = rng() * total;
      for (const [a, b] of from) if ((r -= w(a, b)) <= 0) return [a, b];
      return from[from.length - 1];
    },
  };
}

// Can a difficulty be played on this board? Legend needs 12×12 or bigger
// (smaller boards would never see a teen).
const fitsDifficulty = (difficulty, boardSize) => (difficulty === 'legend' ? boardSize >= 12 : !usesPairDice(difficulty) || createPairDice(boardSize, Math.random, difficulty).pairs.length > 0);

// "Loaded" dice matched to the board size, so small boards aren't swallowed
// by huge rectangles and big boards don't take ages to fill with 1x1s.
// Most rolls come from the common range; each rare face can only turn up a
// limited number of times per game. For a d6 this gives:
//   small  (<=13): mostly 1-4; 5 at most twice, 6 once
//   medium (<=17): mostly 2-5; 1 at most once, 6 twice
//   large  (18+):  mostly 3-6; 1 at most once, 2 twice
// and the same shape stretched over 8 or 12 sides.
function diceProfile(boardSize, sides = 6) {
  const rare = {};
  let common;
  // A tiny die (a Journey's first levels) rolls every face evenly: loading a
  // d2 would almost never show its 2.
  if (sides <= 4) return { sides, common: [1, sides], rare };
  if (boardSize <= 13) {
    common = [1, Math.round((sides * 2) / 3)];
    for (let f = common[1] + 1; f <= sides; f++) rare[f] = f === sides ? 1 : 2;
  } else if (boardSize <= 17) {
    common = [Math.floor(sides / 6) + 1, sides - Math.ceil(sides / 6)];
    for (let f = 1; f < common[0]; f++) rare[f] = 1;
    for (let f = common[1] + 1; f <= sides; f++) rare[f] = 2;
  } else {
    common = [Math.round(sides / 3) + 1, sides];
    for (let f = 1; f < common[0]; f++) rare[f] = f === 1 ? 1 : 2;
  }
  return { sides, common, rare };
}

// Chance per die of trying rare faces: about 1 in 6 overall, split between them.
const RARE_TOTAL_CHANCE = 1 / 6;

// A per-game dice bag's state, as plain data (it can be saved as JSON, so a
// live class can be stored and picked up by another server).
function diceState(boardSize, sides = 6) {
  const profile = diceProfile(boardSize, sides);
  const remaining = { ...profile.rare };
  return { sides, common: profile.common, remaining, perFace: RARE_TOTAL_CHANCE / Math.max(1, Object.keys(remaining).length), seen: [] };
}

// A bag that rolls from a saved state: bag.roll() gives one die, and uses up
// rare faces in state.remaining (the state itself, so it can be saved again).
function diceFromState(state, rng = Math.random) {
  const { sides, remaining, perFace } = state;
  const [lo, hi] = state.common;
  if (!state.seen) state.seen = []; // (a bag saved before rolls were remembered)
  return {
    sides,
    remaining,
    seen: state.seen, // this game's rolls, as shapes ('3x4'): see rollForBoard
    roll() {
      for (const face of Object.keys(remaining)) {
        if (remaining[face] > 0 && rng() < perFace) {
          remaining[face]--;
          return Number(face);
        }
      }
      return lo + Math.floor(rng() * (hi - lo + 1));
    },
  };
}

// Returns a per-game dice bag: bag.roll() gives one die.
const createDice = (boardSize, rng = Math.random, sides = 6) => diceFromState(diceState(boardSize, sides), rng);

// "No room": when a roll doesn't fit anywhere the player has to pass. To keep
// that from happening, rolls can be limited to ones that fit. Modes: 'always'
// (what every game plays now: nobody passes while anything fits), 'end' (only
// near the end of the game) and 'never' (the original rules).
// "Near the end" means fewer empty squares than the larger of the biggest
// possible rectangle (36 / 64 / 144 for 6 / 8 / 12-sided dice) and a fifth of
// the board, so it scales with both board size and difficulty.
// The classic 12x12 board with a d6 gives 36.
const FIT_MODES = ['end', 'always', 'never'];

function fitThreshold(boardSize, sides = 6) {
  return Math.max(sides * sides, Math.round(boardSize * boardSize * 0.2));
}

function fitOnlyNow(board, sides = 6, mode = 'end') {
  if (mode === 'never') return false;
  if (mode === 'always') return true;
  return emptyCount(board) < fitThreshold(board.size, sides);
}

function canFit(board, a, b) {
  for (const [w, h] of orientations(a, b)) {
    for (let y = 0; y + h <= board.size; y++) {
      for (let x = 0; x + w <= board.size; x++) {
        if (isValidPlacement(board, x, y, w, h)) return true;
      }
    }
  }
  return false;
}

// Every [a, b] roll (1..sides each, both orders) that fits somewhere on the board.
function fittingRolls(board, sides = 6) {
  const out = [];
  for (let a = 1; a <= sides; a++) {
    for (let b = 1; b <= sides; b++) if (canFit(board, a, b)) out.push([a, b]);
  }
  return out;
}

// Rolls worth asking: none with a 1 (1 × 1 is no question, 1 × 7 barely one)
// and none already rolled this game (3 × 4 and 4 × 3 are the same rectangle).
// Roll again until one is both; failing that, one without a 1 even if it's a
// repeat; failing that, whatever the bag rolls. Each preference only holds
// while some roll the dice can make fits that way (the last 1-wide gaps still
// get their 1 × N). The bag remembers its rolls in bag.seen.
const PREFERENCE_REROLLS = 20;
const hasOne = ([a, b]) => a === 1 || b === 1;
const shape = ([a, b]) => (a <= b ? `${a}x${b}` : `${b}x${a}`);
function rollForBoard(board, bag, rng = Math.random, mode = 'always') {
  const seen = bag.seen || (bag.seen = []);
  const options = (bag.rollPair ? bag.pairs : fittingRolls(board, bag.sides || 6)).filter(([a, b]) => canFit(board, a, b));
  const fresh = (r) => !hasOne(r) && !seen.includes(shape(r));
  const preferences = [fresh, (r) => !hasOne(r)].filter((good) => options.some(good));
  let roll = null;
  for (const good of preferences) {
    for (let i = 0; i < PREFERENCE_REROLLS && !roll; i++) {
      const saved = bag.remaining ? { ...bag.remaining } : null;
      const r = rollOnce(board, bag, rng, mode);
      if (good(r)) roll = r;
      else if (saved) Object.assign(bag.remaining, saved); // (a rejected roll doesn't use up rare faces)
    }
    if (!roll) {
      const list = options.filter(good);
      roll = bag.rollPair ? bag.rollPair(list) : list[Math.floor(rng() * list.length)];
    }
    break;
  }
  roll = roll || rollOnce(board, bag, rng, mode);
  seen.push(shape(roll));
  return roll;
}

// Roll two dice from the bag. When fitOnlyNow() says so, re-roll until the
// result fits (without using up rare faces on rejected rolls); if the bag
// can't produce a fitting roll, pick one of the fitting rolls at random.
function rollOnce(board, bag, rng, mode) {
  const sides = bag.sides || 6;
  if (bag.rollPair) {
    // pair dice: near the end (or always), only pairs that fit
    if (!fitOnlyNow(board, sides, mode)) return bag.rollPair();
    const fitting = bag.pairs.filter(([a, b]) => canFit(board, a, b));
    if (fitting.length) return bag.rollPair(fitting);
    // None of this difficulty's facts fit the gaps left: finish the board with
    // smaller facts (up to 12 × 12) rather than ending it half empty.
    const small = fittingRolls(board, 12);
    return small.length ? small[Math.floor(rng() * small.length)] : bag.rollPair();
  }
  if (!fitOnlyNow(board, sides, mode)) return [bag.roll(), bag.roll()];
  const fitting = fittingRolls(board, sides);
  if (!fitting.length) return [bag.roll(), bag.roll()];
  const ok = new Set(fitting.map(([a, b]) => `${a}x${b}`));
  for (let i = 0; i < 100; i++) {
    const saved = { ...bag.remaining };
    const roll = [bag.roll(), bag.roll()];
    if (ok.has(`${roll[0]}x${roll[1]}`)) return roll;
    Object.assign(bag.remaining, saved);
  }
  return fitting[Math.floor(rng() * fitting.length)];
}

export {
  EMPTY,
  createBoard,
  fits,
  isValidPlacement,
  orientations,
  validPlacements,
  place,
  removeRect,
  emptyCount,
  chooseComputerMove,
  rollDie,
  DIFFICULTIES,
  LEGEND_TEEN_SHARE,
  DIFFICULTY_SIDES,
  TRICKY_FACES,
  diceFaces,
  usesPairDice,
  createPairDice,
  fitsDifficulty,
  diceProfile,
  createDice,
  diceState,
  diceFromState,
  FIT_MODES,
  fitThreshold,
  fitOnlyNow,
  fittingRolls,
  rollForBoard,
};
