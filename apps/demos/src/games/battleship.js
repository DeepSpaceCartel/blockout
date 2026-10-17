// Fact Battleship: both fleets hide on a grid whose rows and columns are numbers,
// so each square is a product. Tap a square in the CPU's waters, then type its
// product to fire; a wrong product means the shot goes wide and the turn passes.
// The CPU fires back at your fleet. Sink all its ships first.

const SETUP = {
  easy: { rows: () => [2, 3, 4, 5, 10], cols: () => [1, 2, 3, 4, 5], ships: [3, 2, 2] },
  medium: { rows: () => [2, 3, 4, 5, 6], cols: (ctx) => sample(ctx, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 6), ships: [3, 3, 2] },
  hard: { rows: (ctx) => sample(ctx, [3, 4, 6, 7, 8, 9, 11, 12], 6), cols: (ctx) => sample(ctx, [2, 3, 4, 5, 6, 7, 8, 9, 11, 12], 6), ships: [4, 3, 2, 2] },
};
const sample = (ctx, list, n) => ctx.shuffle(list).slice(0, n).sort((a, b) => a - b);
const key = (r, c) => `${r},${c}`;

export function mount(stage, ctx) {
  const set = SETUP[ctx.level];
  const rows = set.rows(ctx);
  const cols = set.cols(ctx);
  const R = rows.length;
  const C = cols.length;
  const fleet = () => placeShips(ctx, R, C, set.ships);
  const enemy = { ships: fleet(), shots: new Map() }; // shots: key -> 'hit' | 'miss'
  const mine = { ships: fleet(), shots: new Map() };
  let turn = 'you'; // 'you' (pick a square) | 'aim' (type its product) | 'cpu' | 'over'
  let target = null; // [r, c]
  let score = 0;
  let right = 0;
  let wrong = 0;

  addStyle();
  const makeBoard = (label, cls) => {
    const box = document.createElement('div');
    box.className = `bs-side ${cls}`;
    box.innerHTML = `<h3>${label}</h3>`;
    const grid = document.createElement('div');
    grid.className = 'bs-grid';
    grid.style.setProperty('--c', C);
    grid.insertAdjacentHTML('beforeend', '<span class="bs-head">×</span>' + cols.map((c) => `<span class="bs-head">${c}</span>`).join(''));
    rows.forEach((rv, r) => {
      grid.insertAdjacentHTML('beforeend', `<span class="bs-head">${rv}</span>`);
      cols.forEach((_, c) => grid.insertAdjacentHTML('beforeend', `<button type="button" class="bs-cell" data-r="${r}" data-c="${c}"></button>`));
    });
    box.append(grid);
    return { box, cell: (r, c) => grid.querySelector(`[data-r="${r}"][data-c="${c}"]`), grid };
  };
  const them = makeBoard('CPU’s waters: fire here', 'bs-them');
  const us = makeBoard('Your fleet', 'bs-us');
  const padBox = document.createElement('div');
  const pad = ctx.keypad(padBox, { onSubmit: fire, prompt: 'Pick a square' });
  const row = document.createElement('div');
  row.className = 'demo-row';
  row.append(them.box, padBox, us.box);
  stage.append(row);

  const shipAt = (side, r, c) => side.ships.find((s) => s.cells.some(([sr, sc]) => sr === r && sc === c));
  const sunk = (side, ship) => ship.cells.every(([r, c]) => side.shots.get(key(r, c)) === 'hit');
  const allSunk = (side) => side.ships.every((s) => sunk(side, s));

  function render() {
    for (const [side, view, showShips] of [[enemy, them, false], [mine, us, true]]) {
      for (let r = 0; r < R; r++) {
        for (let c = 0; c < C; c++) {
          const b = view.cell(r, c);
          const shot = side.shots.get(key(r, c));
          const ship = shipAt(side, r, c);
          b.className = 'bs-cell';
          if (showShips && ship) b.classList.add('ship');
          if (shot) b.classList.add(shot);
          if (shot === 'hit' && sunk(side, ship)) b.classList.add('sunk');
          if (side === enemy && target && target[0] === r && target[1] === c) b.classList.add('aim');
          b.textContent = shot === 'hit' ? '💥' : shot === 'miss' ? '•' : '';
          b.disabled = side === mine || !!shot || turn === 'cpu' || turn === 'over';
        }
      }
    }
    pad.enable(turn === 'aim');
    ctx.hud.info(`Ships left: yours ${mine.ships.filter((s) => !sunk(mine, s)).length}, CPU ${enemy.ships.filter((s) => !sunk(enemy, s)).length}`);
  }

  function aim(r, c) {
    if (turn !== 'you' && turn !== 'aim') return;
    target = [r, c];
    turn = 'aim';
    pad.clear();
    pad.prompt(`${rows[r]} × ${cols[c]} =`);
    ctx.hud.msg('Type the product to fire!');
    render();
  }

  function fire(v) {
    if (turn !== 'aim') return;
    const [r, c] = target;
    const answer = rows[r] * cols[c];
    target = null;
    pad.prompt('Pick a square');
    if (v !== answer) {
      wrong++;
      ctx.hud.msg(`${rows[r]} × ${cols[c]} = ${answer}, not ${v}. Your shot went wide!`, 'bad');
    } else {
      right++;
      const ship = shipAt(enemy, r, c);
      enemy.shots.set(key(r, c), ship ? 'hit' : 'miss');
      if (ship) score += 10;
      if (ship && sunk(enemy, ship)) score += 20;
      ctx.hud.score(score);
      ctx.hud.msg(`${rows[r]} × ${cols[c]} = ${answer} ✓ ${!ship ? 'Splash, a miss' : sunk(enemy, ship) ? 'Hit and SUNK! 🚢' : 'Hit! 💥'}`, ship ? 'good' : '');
      if (allSunk(enemy)) return end(true);
    }
    turn = 'cpu';
    render();
    ctx.after(1300, cpuFire);
  }

  // CPU: after a hit it tries the squares next to it (not on Easy), otherwise random
  function cpuFire() {
    if (turn !== 'cpu') return;
    const open = [];
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) if (!mine.shots.has(key(r, c))) open.push([r, c]);
    let pickFrom = open;
    if (ctx.level !== 'easy') {
      const near = open.filter(([r, c]) =>
        [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dr, dc]) => {
          const s = mine.shots.get(key(r + dr, c + dc));
          return s === 'hit' && !sunk(mine, shipAt(mine, r + dr, c + dc));
        })
      );
      if (near.length) pickFrom = near;
    }
    const [r, c] = ctx.pick(pickFrom);
    const ship = shipAt(mine, r, c);
    mine.shots.set(key(r, c), ship ? 'hit' : 'miss');
    ctx.hud.msg(`CPU fires at ${rows[r]} × ${cols[c]} = ${rows[r] * cols[c]}: ${!ship ? 'miss' : sunk(mine, ship) ? 'it sank your ship!' : 'hit!'}`, ship ? 'bad' : '');
    if (allSunk(mine)) return end(false);
    turn = 'you';
    render();
  }

  function end(won) {
    turn = 'over';
    render();
    for (const s of enemy.ships) for (const [r, c] of s.cells) them.cell(r, c).classList.add('ship');
    ctx.after(1400, () =>
      ctx.finish({ title: won ? 'You sank the whole fleet!' : 'The CPU sank your fleet', won, lines: [`${right} shots aimed right, ${wrong} went wide`, `Score: ${score}`] })
    );
  }

  ctx.listen(them.grid, 'click', (e) => {
    const b = e.target.closest('.bs-cell');
    if (b && !b.disabled) aim(Number(b.dataset.r), Number(b.dataset.c));
  });

  ctx.hud.msg('Tap a square in the CPU’s waters');
  ctx.hud.score(0);
  render();

  const shipsOf = (side) => side.ships.map((s) => ({ cells: s.cells.map((x) => [...x]), sunk: sunk(side, s) }));
  return {
    state: () => ({ rows, cols, turn, target, score, right, wrong, enemy: { ships: shipsOf(enemy), shots: Object.fromEntries(enemy.shots) }, mine: { ships: shipsOf(mine), shots: Object.fromEntries(mine.shots) } }),
  };
}

// ships in straight lines that don't overlap or touch sideways
function placeShips(ctx, R, C, lengths) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const taken = new Set();
    const ships = [];
    for (const len of lengths) {
      const spots = [];
      for (let r = 0; r < R; r++) {
        for (let c = 0; c < C; c++) {
          for (const [dr, dc] of [[0, 1], [1, 0]]) {
            const cells = Array.from({ length: len }, (_, k) => [r + dr * k, c + dc * k]);
            const ok = cells.every(([rr, cc]) => rr < R && cc < C && !taken.has(key(rr, cc)));
            if (ok) spots.push(cells);
          }
        }
      }
      if (!spots.length) break;
      const cells = ctx.pick(spots);
      // keep a one-square gap around each ship
      for (const [r, c] of cells) for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) taken.add(key(r + dr, c + dc));
      ships.push({ cells });
    }
    if (ships.length === lengths.length) return ships;
  }
  // tiny boards: allow touching
  return lengths.map((len, i) => ({ cells: Array.from({ length: len }, (_, k) => [i, k]) }));
}

function addStyle() {
  if (document.getElementById('battleship-style')) return;
  const s = document.createElement('style');
  s.id = 'battleship-style';
  s.textContent = `
    .bs-side { display: flex; flex-direction: column; align-items: center; gap: 4px; }
    .bs-side h3 { margin: 0; font-size: 1rem; }
    .bs-grid { --cell: min(48px, calc((100vw - 48px) / (var(--c) + 1))); display: grid; grid-template-columns: repeat(calc(var(--c) + 1), var(--cell)); gap: 3px; }
    .bs-us .bs-grid { --cell: min(34px, calc((100vw - 48px) / (var(--c) + 1))); }
    .bs-head { display: flex; align-items: center; justify-content: center; font-weight: 900; color: var(--accent); aspect-ratio: 1; font-size: 1.05rem; }
    .bs-us .bs-head { font-size: 0.85rem; color: var(--muted); }
    .bs-cell { aspect-ratio: 1; border: 2px solid var(--board-grid); border-radius: 6px; background: color-mix(in srgb, #3a7bd5 22%, var(--surface)); padding: 0; font: inherit; font-size: 1.1rem; cursor: pointer; color: var(--ink); }
    .bs-cell:disabled { cursor: default; }
    .bs-cell.ship { background: color-mix(in srgb, #5d6675 75%, var(--surface)); border-color: #5d6675; }
    .bs-cell.miss { background: var(--soft-2); }
    .bs-cell.hit { background: var(--gold-bg); border-color: var(--danger); }
    .bs-cell.sunk { background: var(--bad-bg); }
    .bs-cell.aim { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-ring); background: var(--accent-soft); }
    .bs-us .bs-cell { font-size: 0.8rem; }
  `;
  document.head.append(s);
}
