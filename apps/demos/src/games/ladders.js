// Snakes & Ladders: race the CPU to square 50. Each turn starts with a fact:
// right, and you roll the die; wrong, and you shuffle on 1 square. Land on a
// ladder: answer a fact to climb it. Land on a snake's head: answer a fact to
// dodge it (wrong, and down you slide). The CPU answers ladder and snake facts
// too, and sometimes gets them wrong. Board on a canvas; die and keypad below.

const COLS = 10;
const ROWS = 5;
const END = COLS * ROWS;
const LADDERS = { 3: 22, 6: 15, 9: 29, 24: 43, 27: 47 }; // short and mostly upright, so they don't tangle
const SNAKES = { 16: 4, 26: 14, 36: 17, 39: 20, 48: 32 };
const CPU_RIGHT = { easy: 0.6, medium: 0.7, hard: 0.8 }; // how often the CPU answers right
const CELL = 60;

export function mount(stage, ctx) {
  const W = COLS * CELL;
  const H = ROWS * CELL;
  const { ctx: g } = ctx.canvas(stage, W, H);
  const panel = document.createElement('div');
  panel.className = 'demo-row lad-panel';
  const dieEl = document.createElement('div');
  dieEl.className = 'demo-big lad-die';
  const padBox = document.createElement('div');
  panel.append(dieEl, padBox);
  stage.append(panel);

  const pos = { you: 1, cpu: 1 };
  let turn = 'ask'; // 'ask' (your fact) | 'moving' | 'cpu' | 'over'
  let die = 0;
  let question = null; // { fact, kind: 'roll' | 'ladder' | 'snake', to, who }
  let score = 0;
  let right = 0;
  let asked = 0;

  const pad = ctx.keypad(padBox, { onSubmit: answer, prompt: '' });

  // square n → centre of its cell; row 0 is the bottom and rows snake left/right
  const where = (n) => {
    const i = n - 1;
    const row = Math.floor(i / COLS);
    const col = row % 2 ? COLS - 1 - (i % COLS) : i % COLS;
    return { x: col * CELL + CELL / 2, y: H - row * CELL - CELL / 2 };
  };

  function setTurn(t) {
    turn = t;
    pad.enable(t === 'ask');
    if (t !== 'ask') pad.prompt(t === 'over' ? '' : turn === 'cpu' ? 'CPU’s turn' : '…');
    dieEl.textContent = die ? `🎲 ${die}` : '🎲';
    draw();
  }

  // your turn: a fact to earn the roll
  function yourTurn() {
    die = 0;
    ask({ fact: ctx.fact(), kind: 'roll', who: 'you' });
    ctx.hud.msg('Answer to roll the die!');
  }

  function ask(q) {
    question = q;
    asked++;
    pad.clear();
    pad.prompt(`${q.fact.text} =`);
    setTurn('ask');
  }

  // step a token one square at a time, then see what it landed on
  function walk(who, steps) {
    setTurn('moving');
    const step = () => {
      if (pos[who] >= END || steps === 0) return land(who);
      pos[who]++;
      steps--;
      draw();
      ctx.after(170, step);
    };
    ctx.after(170, step);
  }

  function land(who) {
    const at = pos[who];
    if (at >= END) return win(who);
    const to = LADDERS[at] || SNAKES[at];
    if (!to) return next(who);
    const kind = LADDERS[at] ? 'ladder' : 'snake';
    const fact = ctx.fact();
    if (who === 'cpu') {
      // the CPU "thinks", then answers (not always right)
      question = { fact, to, kind, who };
      const ok = ctx.rng() < CPU_RIGHT[ctx.level];
      const said = ok ? fact.answer : ctx.pick(ctx.nearMisses(fact.answer, 3, fact));
      ctx.hud.msg(`CPU on a ${kind}: ${fact.text} = ?`);
      ctx.after(1100, () => resolve(said));
      return;
    }
    ask({ fact, to, kind, who });
    ctx.hud.msg(kind === 'ladder' ? `A ladder! Answer to climb to ${to}` : 'A snake! Answer right to dodge it', kind === 'ladder' ? 'good' : 'bad');
  }

  function answer(v) {
    if (turn !== 'ask') return;
    const { fact, kind } = question;
    if (kind !== 'roll') return resolve(v);
    // the roll fact: right rolls the die, wrong moves 1
    question = null;
    if (v === fact.answer) {
      right++;
      score += 5;
      ctx.hud.score(score);
      die = ctx.randInt(1, 6);
      ctx.hud.msg(`${fact.text} = ${fact.answer} ✓ You rolled ${die}`, 'good');
      walk('you', die);
    } else {
      die = 1;
      ctx.hud.msg(`${fact.text} = ${fact.answer}, not ${v}. Move 1 square`, 'bad');
      walk('you', 1);
    }
  }

  // climb or slide (or not) depending on the answer
  function resolve(said) {
    const { fact, to, kind, who } = question;
    const ok = said === fact.answer;
    const name = who === 'you' ? 'You' : 'CPU';
    if (who === 'you' && ok) {
      right++;
      score += kind === 'ladder' ? 20 : 10;
      ctx.hud.score(score);
    }
    if (ok) ctx.hud.msg(`${name}: ${fact.text} = ${fact.answer} ✓ ${kind === 'ladder' ? `Climb to ${to}!` : 'Snake dodged!'}`, who === 'you' ? 'good' : '');
    else ctx.hud.msg(`${name}: ${fact.text} = ${fact.answer}, not ${said}. ${kind === 'ladder' ? 'No climb' : `Slide to ${to}`}`, 'bad');
    if ((kind === 'ladder') === ok) pos[who] = to;
    question = null;
    setTurn('moving');
    ctx.after(ok ? 900 : 1500, () => next(who));
  }

  function next(who) {
    if (who === 'you') {
      setTurn('cpu');
      ctx.after(700, () => {
        die = ctx.randInt(1, 6);
        ctx.hud.msg(`CPU rolled ${die}`);
        walk('cpu', die);
      });
    } else {
      ctx.hud.info(`You ${pos.you} · CPU ${pos.cpu}`);
      yourTurn();
    }
  }

  function win(who) {
    pos[who] = END;
    setTurn('over');
    const won = who === 'you';
    ctx.hud.msg(won ? 'You reached 50 first! 🏁' : 'The CPU reached 50 first', won ? 'good' : 'bad');
    ctx.after(1200, () =>
      ctx.finish({ title: won ? 'You win the race!' : 'The CPU wins this time', won, lines: [`${right} of ${asked} facts right`, `Score: ${score}`] })
    );
  }


  function draw() {
    const ink = ctx.color('--ink');
    for (let n = 1; n <= END; n++) {
      const { x, y } = where(n);
      g.fillStyle = (Math.floor((n - 1) / COLS) + n) % 2 ? ctx.color('--surface') : ctx.color('--soft-2');
      if (n === END) g.fillStyle = ctx.color('--gold-bg');
      g.fillRect(x - CELL / 2, y - CELL / 2, CELL, CELL);
      g.strokeStyle = ctx.color('--board-grid');
      g.strokeRect(x - CELL / 2, y - CELL / 2, CELL, CELL);
      g.fillStyle = ctx.color('--muted');
      g.font = '800 13px system-ui, sans-serif';
      g.textAlign = 'left';
      g.textBaseline = 'top';
      g.fillText(n === END ? '50 🏁' : String(n), x - CELL / 2 + 4, y - CELL / 2 + 3);
    }
    // ladders: two rails and rungs
    for (const [a, b] of Object.entries(LADDERS)) {
      const p = where(Number(a));
      const q = where(b);
      const len = Math.hypot(q.x - p.x, q.y - p.y);
      const nx = ((q.y - p.y) / len) * 8;
      const ny = (-(q.x - p.x) / len) * 8;
      g.strokeStyle = '#a0662b';
      g.lineWidth = 4;
      for (const s of [1, -1]) {
        g.beginPath();
        g.moveTo(p.x + nx * s, p.y + ny * s);
        g.lineTo(q.x + nx * s, q.y + ny * s);
        g.stroke();
      }
      g.lineWidth = 3;
      for (let t = 0.12; t < 1; t += 0.16) {
        const x = p.x + (q.x - p.x) * t;
        const y = p.y + (q.y - p.y) * t;
        g.beginPath();
        g.moveTo(x + nx, y + ny);
        g.lineTo(x - nx, y - ny);
        g.stroke();
      }
    }
    // snakes: a wiggly body from head (top) to tail
    for (const [a, b] of Object.entries(SNAKES)) {
      const p = where(Number(a));
      const q = where(b);
      g.strokeStyle = '#2a9d5c';
      g.lineWidth = 7;
      g.lineCap = 'round';
      g.beginPath();
      for (let t = 0; t <= 1.001; t += 0.05) {
        const wob = Math.sin(t * Math.PI * 4) * 10;
        const len = Math.hypot(q.x - p.x, q.y - p.y);
        g.lineTo(p.x + (q.x - p.x) * t + ((q.y - p.y) / len) * wob, p.y + (q.y - p.y) * t - ((q.x - p.x) / len) * wob);
      }
      g.stroke();
      g.fillStyle = '#1d6e41';
      g.beginPath();
      g.arc(p.x, p.y, 9, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff';
      g.fillRect(p.x - 4, p.y - 3, 2, 2);
      g.fillRect(p.x + 2, p.y - 3, 2, 2);
    }
    g.lineWidth = 1;
    g.lineCap = 'butt';
    // tokens (side by side when they share a square)
    g.font = '30px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const [who, face, dx] of [['cpu', '🤖', 10], ['you', '🙂', -10]]) {
      const { x, y } = where(Math.min(END, pos[who]));
      const off = pos.you === pos.cpu ? dx : 0;
      g.fillStyle = ink;
      g.fillText(face, x + off, y + 6);
    }
  }

  ctx.hud.info('You 1 · CPU 1');
  yourTurn();

  return {
    state: () => ({ you: pos.you, cpu: pos.cpu, turn, die, end: END, question: question && { text: question.fact.text, answer: question.fact.answer, kind: question.kind, to: question.to }, ladders: LADDERS, snakes: SNAKES, score, right, asked }),
  };
}
