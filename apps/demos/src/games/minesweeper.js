// Multiple Sweeper (like Minesweeper): every square shows a number, and the
// mines are the multiples of the round's number. Open the squares that aren't
// multiples; flag the ones that are. Opened squares show a clue: how many mines
// touch them, so the child can check their thinking.
// Forgiving: a small 7 × 7 board, 3 hearts, and the first slip is free.

const N = 7;
const MINES = { easy: 8, medium: 10, hard: 12 };

export function mount(stage, ctx) {
  addStyle();
  const n = ctx.pick(ctx.L.tables.filter((t) => t > 1));
  const top = n * ctx.L.upTo;
  const mineAt = new Set(ctx.shuffle([...Array(N * N).keys()]).slice(0, MINES[ctx.level]));
  const cells = [...Array(N * N).keys()].map((i) => {
    let value;
    if (mineAt.has(i)) value = n * ctx.randInt(1, ctx.L.upTo);
    else {
      do value = ctx.randInt(2, top);
      while (value % n === 0);
    }
    return { value, mine: value % n === 0, open: false, flag: false, boom: false };
  });
  const around = (i) => {
    const r = Math.floor(i / N);
    const c = i % N;
    const out = [];
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) if ((dr || dc) && r + dr >= 0 && r + dr < N && c + dc >= 0 && c + dc < N) out.push((r + dr) * N + c + dc);
    return out;
  };
  cells.forEach((cell, i) => (cell.clue = around(i).filter((j) => cells[j].mine).length));
  const safeTotal = cells.filter((c) => !c.mine).length;

  let hearts = 3;
  let score = 0;
  let slips = 0; // mistakes so far (the first one is free)
  let over = false;
  let flagMode = false;
  let cursor = Math.floor((N * N) / 2);
  let keyboard = false;

  const head = document.createElement('div');
  head.className = 'demo-big';
  head.innerHTML = `Mines are multiples of <span class="ms-n">${n}</span>`;
  const board = document.createElement('div');
  board.className = 'ms-board';
  const els = cells.map((_, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ms-cell';
    b.dataset.i = i;
    return board.appendChild(b);
  });
  const modeBtn = document.createElement('button');
  modeBtn.type = 'button';
  modeBtn.className = 'btn ms-mode';
  stage.append(head, board, modeBtn);

  const fact = (v) => `${n} × ${v / n} = ${v}`;
  const neighbours = (v) => {
    const lo = Math.floor(v / n);
    return lo < 1 ? `the ×${n} table starts at ${n}` : `${fact(lo * n)}, ${fact((lo + 1) * n)}`;
  };
  const opened = () => cells.filter((c) => c.open).length;

  // a wrong move: the first one is free, then each costs a heart
  function slip(text) {
    slips++;
    if (slips === 1) return ctx.hud.msg(`${text} This one’s free!`, 'bad');
    hearts--;
    ctx.hud.hearts(hearts);
    ctx.hud.msg(text, 'bad');
    if (hearts <= 0) end(false);
  }

  function open(i) {
    const c = cells[i];
    if (over || c.open || c.boom) return;
    if (c.flag) return ctx.hud.msg('That square has a flag. Flag again to take it off.');
    if (c.mine) {
      if (slips === 0) return slip(`Careful! ${fact(c.value)}: a multiple of ${n}, so it’s a mine. Flag it.`);
      c.boom = true;
      slip(`💥 ${fact(c.value)}: a multiple of ${n}!`);
      return render();
    }
    // open it, and spread through squares with no mines around them
    const todo = [i];
    let count = 0;
    while (todo.length) {
      const k = todo.pop();
      const x = cells[k];
      if (x.open || x.mine || x.flag) continue;
      x.open = true;
      count++;
      if (x.clue === 0) todo.push(...around(k));
    }
    score += count * 5;
    ctx.hud.score(score);
    ctx.hud.msg(`${c.value} isn’t a multiple of ${n} ✓${c.clue ? ` ${c.clue} mine${c.clue > 1 ? 's touch' : ' touches'} it.` : ''}`, 'good');
    render();
    if (opened() === safeTotal) end(true);
  }

  // flags are checked straight away, so a flag is an answer too
  function flag(i) {
    const c = cells[i];
    if (over || c.open || c.boom) return;
    if (c.flag) {
      c.flag = false;
      return render();
    }
    if (!c.mine) return slip(`${c.value} isn’t a multiple of ${n} (${neighbours(c.value)}). Open it!`);
    c.flag = true;
    score += 5;
    ctx.hud.score(score);
    ctx.hud.msg(`${fact(c.value)} 🚩`, 'good');
    render();
  }

  function end(won) {
    over = true;
    // show every mine: flagged for you on a win, as bombs otherwise
    for (const c of cells) if (c.mine && !c.flag && !c.boom) c[won ? 'flag' : 'boom'] = true;
    render();
    ctx.after(800, () =>
      ctx.finish({
        title: won ? 'Board cleared!' : 'Out of hearts!',
        won,
        lines: [`Multiples of ${n}: ${[...new Set(cells.filter((c) => c.mine).map((c) => c.value))].sort((a, b) => a - b).join(', ')}`, `Squares opened: ${opened()} of ${safeTotal}`, `Mistakes: ${slips}`, `Score: ${score}`],
      })
    );
  }

  function render() {
    cells.forEach((c, i) => {
      const b = els[i];
      b.className = `ms-cell${c.open ? ' open' : ''}${c.flag ? ' flag' : ''}${c.boom ? ' boom' : ''}${keyboard && i === cursor ? ' cur' : ''}`;
      if (c.open) b.innerHTML = `<small>${c.value}</small><b class="c${c.clue}">${c.clue || ''}</b>`;
      else if (c.flag) b.innerHTML = `<small>${c.value}</small><b>🚩</b>`;
      else if (c.boom) b.innerHTML = `<small>${c.value}</small><b>💣</b>`;
      else b.textContent = c.value;
      b.setAttribute('aria-label', c.open ? `${c.value}, ${c.clue} mines around` : c.flag ? `${c.value}, flagged` : `${c.value}, closed`);
    });
    modeBtn.textContent = flagMode ? '🚩 Flag mode: ON' : '🚩 Flag mode: off';
    modeBtn.classList.toggle('btn-primary', flagMode);
    ctx.hud.info(`${safeTotal - opened()} safe left`);
  }

  // mouse/touch: tap opens (or flags in flag mode); right-click or long-press flags
  let press = null;
  let longPressed = false;
  const cellOf = (e) => e.target.closest('.ms-cell');
  ctx.listen(board, 'click', (e) => {
    const b = cellOf(e);
    if (!b) return;
    if (longPressed) return (longPressed = false);
    const i = Number(b.dataset.i);
    cursor = i;
    if (flagMode) flag(i);
    else open(i);
  });
  ctx.listen(board, 'contextmenu', (e) => {
    const b = cellOf(e);
    if (!b) return;
    e.preventDefault();
    flag(Number(b.dataset.i));
  });
  ctx.listen(board, 'pointerdown', (e) => {
    const b = cellOf(e);
    if (!b || e.pointerType === 'mouse') return;
    longPressed = false;
    press = ctx.after(450, () => {
      longPressed = true;
      flag(Number(b.dataset.i));
    });
  });
  for (const type of ['pointerup', 'pointerleave', 'pointercancel'])
    ctx.listen(board, type, () => {
      if (press) press();
      press = null;
    });
  ctx.listen(modeBtn, 'click', () => {
    flagMode = !flagMode;
    render();
  });
  // keyboard: arrows move, Enter/Space open, F flags
  ctx.listen(window, 'keydown', (e) => {
    const r = Math.floor(cursor / N);
    const c = cursor % N;
    const moves = { ArrowLeft: [r, c - 1], ArrowRight: [r, c + 1], ArrowUp: [r - 1, c], ArrowDown: [r + 1, c] };
    if (moves[e.key]) {
      const [nr, nc] = moves[e.key];
      if (nr >= 0 && nr < N && nc >= 0 && nc < N) cursor = nr * N + nc;
      keyboard = true;
      render();
    } else if (e.key === 'Enter' || e.key === ' ') open(cursor);
    else if (e.key === 'f' || e.key === 'F') flag(cursor);
    else return;
    e.preventDefault();
  });

  ctx.hud.hearts(hearts);
  ctx.hud.score(0);
  render();
  ctx.hud.msg(`Open squares that aren’t in the ×${n} table`);

  return {
    state: () => ({
      n,
      size: N,
      hearts,
      score,
      slips,
      over,
      flagMode,
      cursor,
      safeLeft: safeTotal - opened(),
      cells: cells.map((c) => ({ value: c.value, mine: c.mine, open: c.open, flag: c.flag, boom: c.boom, clue: c.open ? c.clue : null })),
    }),
  };
}

function addStyle() {
  if (document.getElementById('ms-style')) return;
  const s = document.createElement('style');
  s.id = 'ms-style';
  s.textContent = `
    .ms-n { color: var(--accent); font-size: 2.2rem; }
    .ms-board { display: grid; grid-template-columns: repeat(7, 1fr); gap: 5px; width: min(100%, 440px); user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
    .ms-cell { position: relative; aspect-ratio: 1; display: flex; align-items: center; justify-content: center; padding: 0; border: 2px solid var(--edge); border-radius: 10px; background: var(--gold-bg); color: var(--ink); font: inherit; font-weight: 900; font-size: clamp(0.95rem, 4.4vw, 1.35rem); cursor: pointer; box-shadow: 0 3px 0 var(--edge-shadow); touch-action: manipulation; }
    .ms-cell small { position: absolute; top: 2px; left: 5px; font-size: 0.62rem; font-weight: 800; color: var(--muted); }
    .ms-cell.open { background: var(--surface); box-shadow: none; border-color: var(--line); cursor: default; }
    .ms-cell.open b { font-size: 1.4em; }
    .ms-cell.flag { background: var(--good-bg); }
    .ms-cell.boom { background: var(--bad-bg); }
    .ms-cell.cur { outline: 3px dashed var(--accent); outline-offset: 1px; }
    .ms-cell .c1 { color: #2f6fd6; }
    .ms-cell .c2 { color: var(--good); }
    .ms-cell .c3, .ms-cell .c4, .ms-cell .c5, .ms-cell .c6 { color: var(--bad); }
    .ms-mode { min-width: 200px; }
  `;
  document.head.append(s);
}
