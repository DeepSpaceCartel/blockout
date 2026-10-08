// Fact Dominoes (like Dominoes): each half of a domino is a number or a fact
// (12, 3 × 4, 2 × 6). Play a domino next to an end of the line when the
// touching halves are equal. You and the CPU take turns; first to empty their
// hand wins. The set is a classic "double-five" set built on 6 answers.

const VALUES = 6; // 6 answers → 21 dominoes (every pair, doubles included)
const HAND = { easy: 5, medium: 6, hard: 7 };
const CPU_WAIT = 1100;

export function mount(stage, ctx) {
  addStyle();
  // 6 different answers that have a real fact (no × 1) in the level's tables
  const facts = new Map();
  for (const a of ctx.L.tables) for (let b = 2; b <= ctx.L.upTo; b++) (facts.get(a * b) || facts.set(a * b, []).get(a * b)).push([a, b]);
  const values = ctx.shuffle([...facts.keys()]).slice(0, VALUES);
  const half = (value, asNumber) => {
    if (asNumber) return { value, text: String(value) };
    const [a, b] = ctx.pick(facts.get(value));
    return ctx.rng() < 0.5 ? { value, text: `${a} × ${b}` } : { value, text: `${b} × ${a}` };
  };
  let set = [];
  for (let i = 0; i < VALUES; i++) {
    for (let j = i; j < VALUES; j++) {
      // doubles get one number and one fact, so they still need thinking
      set.push({ halves: [half(values[i], i === j || ctx.rng() < 0.4), half(values[j], i !== j && ctx.rng() < 0.4)] });
    }
  }
  set = ctx.shuffle(set);
  const hand = set.splice(0, HAND[ctx.level]);
  const cpu = set.splice(0, HAND[ctx.level]);
  const line = [set.shift()]; // each domino's halves in line order, left to right
  const boneyard = set;

  let turn = 'me';
  let selected = -1;
  let score = 0;
  let wrong = 0;
  let passes = 0; // passes in a row (two means the game is blocked)

  const board = document.createElement('div');
  board.className = 'dom-board';
  const handEl = document.createElement('div');
  handEl.className = 'dom-hand';
  const bar = document.createElement('div');
  bar.className = 'dom-bar';
  bar.innerHTML = `<span class="dom-cpu"></span><button type="button" class="btn dom-draw">Draw a domino</button>`;
  stage.append(bar, board, handEl);

  const ends = () => ({ left: line[0].halves[0], right: line[line.length - 1].halves[1] });
  const fits = (d, end) => d.halves.findIndex((h) => h.value === ends()[end].value);
  const moves = (list) => {
    const out = [];
    list.forEach((d, i) => ['left', 'right'].forEach((end) => fits(d, end) >= 0 && out.push({ i, end })));
    return out;
  };
  const tile = (d, cls = '') => `<span class="dom-tile ${cls}"><span class="dom-half">${d.halves[0].text}</span><span class="dom-half">${d.halves[1].text}</span></span>`;

  function render() {
    // long lines show their two ends and hide the middle
    const shown = line.length > 7 ? [...line.slice(0, 3).map((d) => tile(d)), `<span class="dom-more">+${line.length - 6}</span>`, ...line.slice(-3).map((d) => tile(d))] : line.map((d) => tile(d));
    const can = turn === 'me' ? '' : ' disabled';
    board.innerHTML = `<button type="button" class="btn dom-end" data-end="left"${can}>◀ here</button>${shown.join('')}<button type="button" class="btn dom-end" data-end="right"${can}>here ▶</button>`;
    handEl.innerHTML = hand.map((d, i) => `<button type="button" class="dom-pick${i === selected ? ' selected' : ''}" data-i="${i}"${can}><small>${i + 1}</small>${tile(d)}</button>`).join('');
    bar.querySelector('.dom-cpu').textContent = `CPU: ${cpu.length} dominoes · Pile: ${boneyard.length}`;
    const draw = bar.querySelector('.dom-draw');
    draw.textContent = boneyard.length ? 'Draw a domino' : 'Pass';
    draw.disabled = turn !== 'me';
    ctx.hud.info(`Your hand: ${hand.length}`);
    ctx.hud.score(score);
  }

  // put domino d on an end, turned so the matching half touches the line
  function place(d, end) {
    const k = fits(d, end);
    const halves = end === 'left' ? (k === 1 ? d.halves : [d.halves[1], d.halves[0]]) : k === 0 ? d.halves : [d.halves[1], d.halves[0]];
    if (end === 'left') line.unshift({ halves });
    else line.push({ halves });
  }

  function play(i, end) {
    if (turn !== 'me' || !hand[i]) return;
    const d = hand[i];
    const e = ends()[end];
    if (fits(d, end) < 0) {
      wrong++;
      selected = -1;
      const said = (h) => (h.text === String(h.value) ? h.text : `${h.text} = ${h.value}`);
      ctx.hud.msg(`That end is ${said(e)}; your domino has ${said(d.halves[0])} and ${said(d.halves[1])}`, 'bad');
      return render();
    }
    const h = d.halves[fits(d, end)];
    hand.splice(i, 1);
    place(d, end);
    selected = -1;
    passes = 0;
    score += 10;
    // facts first, the number last: "3 × 4 = 2 × 6 = 12 ✓"
    const said = [...new Set([e.text, h.text, String(e.value)])].sort((x, y) => /×/.test(y) - /×/.test(x));
    ctx.hud.msg(`${said.join(' = ')} ✓`, 'good');
    endTurn();
  }

  function drawOrPass() {
    if (turn !== 'me') return;
    if (moves(hand).length) return ctx.hud.msg(`You can play! Look for ${ends().left.value} or ${ends().right.value}`, 'bad');
    if (boneyard.length) {
      hand.push(boneyard.shift());
      ctx.hud.msg('You drew a domino');
      return render();
    }
    passes++;
    ctx.hud.msg('You pass');
    endTurn();
  }

  function endTurn() {
    if (!hand.length) return over();
    if (passes >= 2) return over();
    turn = 'cpu';
    render();
    ctx.after(CPU_WAIT, cpuTurn);
  }

  // the CPU plays its first fit, drawing until it has one
  function cpuTurn() {
    let m = moves(cpu);
    while (!m.length && boneyard.length) {
      cpu.push(boneyard.shift());
      m = moves(cpu);
    }
    if (m.length) {
      const { i, end } = ctx.pick(m);
      const d = cpu.splice(i, 1)[0];
      const e = ends()[end];
      place(d, end);
      passes = 0;
      ctx.hud.msg(`CPU played ${d.halves.map((h) => h.text).join(' | ')} on ${e.text}`);
    } else {
      passes++;
      ctx.hud.msg('The CPU passes');
    }
    if (!cpu.length || passes >= 2) return over();
    turn = 'me';
    render();
  }

  function over() {
    turn = 'over';
    render();
    const won = !hand.length || (cpu.length && hand.length < cpu.length);
    const blocked = hand.length && cpu.length;
    ctx.after(800, () =>
      ctx.finish({
        title: won ? 'You win!' : !blocked || hand.length > cpu.length ? 'The CPU wins' : 'A draw!',
        won: Boolean(won),
        lines: [blocked ? `Nobody could play: you had ${hand.length}, the CPU had ${cpu.length}` : won ? 'You played all your dominoes!' : 'The CPU played all its dominoes first.', `Dominoes in the line: ${line.length}`, `Wrong tries: ${wrong}`, `Score: ${score}`],
      })
    );
  }

  ctx.listen(handEl, 'click', (e) => {
    const b = e.target.closest('.dom-pick');
    if (!b || turn !== 'me') return;
    selected = Number(b.dataset.i) === selected ? -1 : Number(b.dataset.i);
    render();
  });
  ctx.listen(board, 'click', (e) => {
    const b = e.target.closest('.dom-end');
    if (!b) return;
    if (selected < 0) return ctx.hud.msg('First tap a domino in your hand');
    play(selected, b.dataset.end);
  });
  ctx.listen(bar.querySelector('.dom-draw'), 'click', drawOrPass);
  // keys: 1–9 pick a domino, ← → play it on that end, D draws / passes
  ctx.listen(window, 'keydown', (e) => {
    if (turn !== 'me') return;
    if (/^[1-9]$/.test(e.key) && hand[Number(e.key) - 1]) {
      selected = Number(e.key) - 1;
      render();
    } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && selected >= 0) play(selected, e.key === 'ArrowLeft' ? 'left' : 'right');
    else if (e.key === 'd' || e.key === 'D') drawOrPass();
    else return;
    e.preventDefault();
  });

  ctx.hud.msg('Tap a domino, then an end where it fits');
  render();

  return {
    state: () => ({
      turn,
      selected,
      hand: hand.map((d) => ({ halves: d.halves.map((h) => ({ ...h })) })),
      ends: ends(),
      moves: turn === 'me' ? moves(hand) : [],
      line: line.length,
      cpu: cpu.length,
      boneyard: boneyard.length,
      score,
      wrong,
    }),
  };
}

function addStyle() {
  if (document.getElementById('dominoes-style')) return;
  const s = document.createElement('style');
  s.id = 'dominoes-style';
  s.textContent = `
    .dom-bar { display: flex; gap: 12px; align-items: center; justify-content: center; flex-wrap: wrap; font-weight: 800; color: var(--muted); }
    .dom-board { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; justify-content: center; width: 100%; min-height: 90px; padding: 14px; border: 2px solid var(--edge); border-radius: 14px; background: var(--good-bg); box-sizing: border-box; }
    .dom-tile { display: inline-flex; border: 2px solid var(--edge); border-radius: 8px; background: var(--paper); color: var(--ink); box-shadow: 0 3px 0 var(--edge-shadow); }
    .dom-half { display: flex; align-items: center; justify-content: center; min-width: 58px; height: 48px; padding: 0 6px; font-weight: 900; font-size: 1.05rem; white-space: nowrap; }
    .dom-half + .dom-half { border-left: 2px solid var(--edge); }
    .dom-board > .dom-tile:first-of-type .dom-half:first-child, .dom-board > .dom-tile:last-of-type .dom-half:last-child { background: var(--gold-bg); }
    .dom-more { font-weight: 900; color: var(--muted); padding: 0 4px; }
    .dom-end { font-weight: 900; }
    .dom-hand { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; }
    .dom-pick { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 4px; border: 3px solid transparent; border-radius: 12px; background: none; font: inherit; color: var(--muted); cursor: pointer; }
    .dom-pick small { font-weight: 800; }
    .dom-pick:hover:not(:disabled) .dom-tile { border-color: var(--accent); }
    .dom-pick.selected { border-color: var(--accent); background: var(--accent-soft); transform: translateY(-4px); }
    .dom-pick:disabled { opacity: 0.6; cursor: default; }
    @media (max-width: 560px) { .dom-half { min-width: 44px; height: 42px; font-size: 0.9rem; padding: 0 4px; } .dom-board { padding: 8px; } }
  `;
  document.head.append(s);
}
