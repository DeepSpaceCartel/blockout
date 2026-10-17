// Product War (like War / Top Trumps): you and the CPU each flip two cards.
// Say your product, then say whose product is bigger. The bigger product wins
// all four cards (a tie leaves them in the pot for the next round).
// Ten rounds; most cards wins.

const ROUNDS = 10;

export function mount(stage, ctx) {
  addStyle();
  const table = document.createElement('div');
  table.className = 'war-table';
  table.innerHTML = `
    <div class="war-side"><div class="war-label">You <small class="war-count" data-who="me"></small></div><div class="war-cards" data-who="me"></div><div class="war-product" data-who="me"></div></div>
    <div class="war-vs">vs<small class="war-pot"></small></div>
    <div class="war-side cpu"><div class="war-label">CPU <small class="war-count" data-who="cpu"></small></div><div class="war-cards" data-who="cpu"></div><div class="war-product" data-who="cpu"></div></div>`;
  const panel = document.createElement('div');
  panel.className = 'war-panel';
  const askBox = document.createElement('div');
  const callBox = document.createElement('div');
  callBox.className = 'war-call';
  panel.append(askBox, callBox);
  stage.append(table, panel);
  const $ = (sel) => table.querySelector(sel);

  let round = 0;
  let phase = 'answer'; // 'answer' (type your product) → 'compare' (who wins?) → 'reveal'
  let me = null;
  let cpu = null;
  let myCards = 0;
  let cpuCards = 0;
  let pot = 0;
  let score = 0;
  let rightProducts = 0;
  let rightCalls = 0;

  const pad = ctx.keypad(askBox, { onSubmit: answer });

  // one hand: a fact from the level's tables, so both cards are in range
  const deal = () => {
    const f = ctx.fact();
    return { a: f.a, b: f.b, answer: f.answer };
  };
  const cardHtml = (n, hidden) => `<span class="war-card${hidden ? ' back' : ''}">${hidden ? '?' : n}</span>`;

  function render() {
    $('.war-cards[data-who="me"]').innerHTML = me ? cardHtml(me.a) + cardHtml(me.b) : '';
    // the CPU's cards stay face down until you've said your product
    $('.war-cards[data-who="cpu"]').innerHTML = cpu ? cardHtml(cpu.a, phase === 'answer') + cardHtml(cpu.b, phase === 'answer') : '';
    $('.war-product[data-who="me"]').textContent = phase === 'answer' ? `${me.a} × ${me.b} = ?` : `${me.a} × ${me.b} = ${me.answer}`;
    $('.war-product[data-who="cpu"]').textContent = phase === 'answer' ? '' : `${cpu.a} × ${cpu.b} = ${cpu.answer}`;
    $('.war-count[data-who="me"]').textContent = `${myCards} cards`;
    $('.war-count[data-who="cpu"]').textContent = `${cpuCards} cards`;
    $('.war-pot').textContent = pot ? `pot: ${pot}` : '';
    ctx.hud.info(`Round ${Math.min(round, ROUNDS)} of ${ROUNDS}`);
    ctx.hud.score(score);
  }

  function nextRound() {
    if (round >= ROUNDS) return end();
    round++;
    me = deal();
    cpu = deal();
    phase = 'answer';
    pad.enable(true);
    pad.el.hidden = false;
    pad.prompt(`${me.a} × ${me.b} =`);
    callBox.replaceChildren();
    render();
  }

  // step 1: your product
  function answer(v) {
    if (phase !== 'answer') return;
    if (v === me.answer) {
      score += 10;
      rightProducts++;
      ctx.hud.msg(`${me.a} × ${me.b} = ${me.answer} ✓`, 'good');
    } else ctx.hud.msg(`${me.a} × ${me.b} = ${me.answer}, not ${v}`, 'bad');
    phase = 'compare';
    pad.enable(false);
    pad.el.hidden = true;
    const box = ctx.choices(callBox, ['Mine', 'Same', 'CPU'], (v2) => call(v2));
    box.insertAdjacentHTML('afterbegin', '<p class="war-q">Whose product is bigger? <small>(keys: ← mine, ↓ same, → CPU)</small></p>');
    render();
  }

  // step 2: who wins the round? (the cards go to the real winner either way)
  function call(pickWho) {
    if (phase !== 'compare') return;
    phase = 'reveal';
    const truth = me.answer > cpu.answer ? 'Mine' : me.answer < cpu.answer ? 'CPU' : 'Same';
    const sign = me.answer > cpu.answer ? '>' : me.answer < cpu.answer ? '<' : '=';
    const why = `${me.answer} ${sign} ${cpu.answer}`;
    if (pickWho === truth) {
      score += 5;
      rightCalls++;
    }
    pot += 4;
    let result;
    if (truth === 'Mine') {
      myCards += pot;
      result = `You win ${pot} cards!`;
      pot = 0;
    } else if (truth === 'CPU') {
      cpuCards += pot;
      result = `The CPU wins ${pot} cards.`;
      pot = 0;
    } else result = 'A tie! The cards stay in the pot.';
    ctx.hud.msg(pickWho === truth ? `${why} ✓ ${result}` : `Look again: ${why}. ${result}`, pickWho === truth ? 'good' : 'bad');
    callBox.replaceChildren();
    render();
    ctx.after(1600, nextRound);
  }

  ctx.listen(window, 'keydown', (e) => {
    if (phase !== 'compare') return;
    const k = { ArrowLeft: 'Mine', ArrowRight: 'CPU', ArrowDown: 'Same', ArrowUp: 'Same', '=': 'Same' }[e.key];
    if (!k) return;
    e.preventDefault();
    call(k);
  });

  function end() {
    phase = 'done';
    const won = myCards > cpuCards;
    ctx.finish({
      title: won ? 'You win the war!' : myCards === cpuCards ? 'A draw!' : 'The CPU wins this time',
      won,
      lines: [`Cards: you ${myCards}, CPU ${cpuCards}`, `Products right: ${rightProducts} of ${ROUNDS}`, `Bigger-or-smaller right: ${rightCalls} of ${ROUNDS}`, `Score: ${score}`],
    });
  }

  ctx.hud.msg('Type your product, then say who wins');
  nextRound();

  return {
    state: () => ({ round, rounds: ROUNDS, phase, me: me && { ...me }, cpu: phase === 'answer' ? null : cpu && { ...cpu }, cpuHidden: cpu && { ...cpu }, myCards, cpuCards, pot, score }),
  };
}

function addStyle() {
  if (document.getElementById('war-style')) return;
  const s = document.createElement('style');
  s.id = 'war-style';
  s.textContent = `
    .war-table { display: flex; align-items: center; justify-content: center; gap: 16px; flex-wrap: wrap; width: 100%; }
    .war-side { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 12px 16px; border: 2px solid var(--edge); border-radius: 14px; background: var(--paper); min-width: 200px; }
    .war-side.cpu { background: var(--soft); }
    .war-label { font-weight: 900; font-size: 1.1rem; }
    .war-label small { color: var(--muted); font-weight: 700; margin-left: 4px; }
    .war-cards { display: flex; gap: 10px; }
    .war-card { display: flex; align-items: center; justify-content: center; width: 70px; height: 96px; border: 2px solid var(--edge); border-radius: 10px; background: var(--surface); color: var(--ink); font-size: 2.2rem; font-weight: 900; box-shadow: 0 4px 0 var(--edge-shadow); }
    .war-card.back { background: var(--accent); color: #fff; }
    .war-product { font-size: 1.3rem; font-weight: 900; min-height: 1.4em; }
    .war-vs { display: flex; flex-direction: column; align-items: center; font-weight: 900; font-size: 1.4rem; color: var(--muted); }
    .war-vs small { font-size: 0.85rem; }
    .war-panel { display: flex; flex-direction: column; align-items: center; min-height: 240px; }
    .war-q { width: 100%; text-align: center; margin: 4px 0; font-weight: 800; }
    .war-q small { color: var(--muted); }
    .war-call .demo-choices .btn { min-width: 90px; }
    @media (max-width: 560px) { .war-side { min-width: 0; padding: 8px 10px; } .war-card { width: 54px; height: 74px; font-size: 1.7rem; } .war-table { gap: 8px; } }
  `;
  document.head.append(s);
}
