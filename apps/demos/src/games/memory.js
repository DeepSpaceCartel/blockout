// Fact Pairs (like Memory): flip two cards; a fact and its answer are a pair.
// A reference demo for a DOM-based game: build elements in `stage`, use ctx.listen
// for events and ctx.after for timers, report with ctx.hud, end with ctx.finish.

const PAIRS = { easy: 6, medium: 8, hard: 10 };

export function mount(stage, ctx) {
  // distinct answers, so every answer card has exactly one fact
  const facts = [];
  const answers = new Set();
  for (let tries = 0; facts.length < PAIRS[ctx.level] && tries < 500; tries++) {
    const f = ctx.fact();
    if (f.b === 1 || f.a === 1 || answers.has(f.answer)) continue;
    answers.add(f.answer);
    facts.push(f);
  }
  const cards = ctx.shuffle(facts.flatMap((f, i) => [{ pair: i, text: f.text, kind: 'fact' }, { pair: i, text: String(f.answer), kind: 'answer' }]));

  const grid = document.createElement('div');
  grid.className = 'memory-grid';
  grid.style.setProperty('--cols', cards.length > 16 ? 5 : 4);
  cards.forEach((c, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `memory-card ${c.kind}`;
    b.dataset.i = i;
    b.innerHTML = `<span class="memory-front">?</span><span class="memory-back">${c.text}</span>`;
    b.setAttribute('aria-label', 'Hidden card');
    grid.append(b);
  });
  stage.append(grid);
  addStyle();

  let open = []; // indexes of the face-up, unmatched cards
  let tries = 0;
  let found = 0;
  let busy = false;
  ctx.hud.info(`${facts.length} pairs`);

  ctx.listen(grid, 'click', (e) => {
    const b = e.target.closest('.memory-card');
    if (!b || busy || b.classList.contains('up')) return;
    const i = Number(b.dataset.i);
    b.classList.add('up');
    b.setAttribute('aria-label', cards[i].text);
    open.push(i);
    if (open.length < 2) return;
    tries++;
    const [x, y] = open;
    if (cards[x].pair === cards[y].pair && cards[x].kind !== cards[y].kind) {
      found++;
      for (const k of open) grid.children[k].classList.add('matched');
      open = [];
      const f = facts[cards[x].pair];
      ctx.hud.msg(`${f.text} = ${f.answer} ✓`, 'good');
      ctx.hud.score(found * 10);
      if (found === facts.length) {
        ctx.after(600, () =>
          ctx.finish({ title: 'All pairs found!', won: true, lines: [`${facts.length} pairs in ${tries} tries`, tries <= facts.length + 2 ? 'Amazing memory!' : 'Try for fewer tries next time.'] })
        );
      }
    } else {
      busy = true;
      ctx.hud.msg('Not a pair', 'bad');
      ctx.after(900, () => {
        for (const k of open) {
          grid.children[k].classList.remove('up');
          grid.children[k].setAttribute('aria-label', 'Hidden card');
        }
        open = [];
        busy = false;
      });
    }
  });

  return { state: () => ({ cards, found, tries, pairs: facts.length }) };
}

function addStyle() {
  if (document.getElementById('memory-style')) return;
  const s = document.createElement('style');
  s.id = 'memory-style';
  s.textContent = `
    .memory-grid { display: grid; grid-template-columns: repeat(var(--cols), minmax(0, 110px)); gap: 10px; width: 100%; justify-content: center; }
    .memory-card { display: flex; align-items: center; justify-content: center; aspect-ratio: 3 / 4; border: 2px solid var(--edge); border-radius: 12px; background: var(--accent); color: #fff; font: inherit; font-weight: 900; font-size: 1.3rem; cursor: pointer; box-shadow: 0 4px 0 var(--edge-shadow); position: relative; }
    .memory-card .memory-back { display: none; }
    .memory-card.up { background: var(--paper); color: var(--ink); }
    .memory-card.up .memory-front { display: none; }
    .memory-card.up .memory-back { display: inline; }
    .memory-card.answer.up { background: var(--gold-bg); }
    .memory-card.matched, .memory-card.answer.matched { background: var(--good); color: #fff; border-color: var(--good-ink); cursor: default; }
    .memory-front { font-size: 1.8rem; }
  `;
  document.head.append(s);
}
