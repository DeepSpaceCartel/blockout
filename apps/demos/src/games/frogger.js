// Answer Hopper (like Frogger): each river lane asks a question and its logs
// carry numbers. Pick a log in the next lane (← →, or tap it), then hop (↑).
// The right answer: the frog rides that log. Wrong: splash, a heart, and that
// log sinks, so there are fewer choices next try. Cross the river to win.

const W = 640;
const H = 480;
const SIGN = 124; // the question signs on the left bank
const LANES = 4;
const LANE_H = 80;
const BANK = 80; // far bank at the top, near bank at the bottom
const LOG_W = 116;
const LOGS = { easy: 3, medium: 3, hard: 4 };
const DRIFT = { easy: 26, medium: 38, hard: 50 }; // px per second
const CROSSINGS = 2;

export function mount(stage, ctx) {
  addStyle();
  document.activeElement?.blur?.();
  const { canvas, ctx: g, point } = ctx.canvas(stage, W, H);
  const span = W - SIGN + LOG_W; // logs wrap around this distance, out of sight
  const laneY = (i) => BANK + (LANES - 1 - i) * LANE_H; // lane 0 is nearest the frog's bank

  let lanes = [];
  let crossing = 0;
  let score = 0;
  let hearts = 3;
  let right = 0;
  let wrong = 0;
  let over = false;
  const frog = { lane: -1, log: null, x: SIGN + (W - SIGN) / 2, hop: 0 }; // lane -1: near bank, LANES: far bank
  let sel = null; // the chosen log in the next lane
  let splash = null;

  function newRiver() {
    crossing++;
    lanes = [];
    for (let i = 0; i < LANES; i++) {
      let fact = ctx.fact();
      for (let k = 0; k < 20 && (fact.a === 1 || fact.b === 1); k++) fact = ctx.fact(); // ×1 is too easy
      const n = LOGS[ctx.level];
      const nums = ctx.shuffle([fact.answer, ...ctx.nearMisses(fact.answer, n - 1, fact)]);
      const speed = DRIFT[ctx.level] * (i % 2 ? -1 : 1) * (0.8 + ctx.rng() * 0.4);
      const offset = ctx.rng() * span;
      lanes.push({ fact, speed, logs: nums.map((num, k) => ({ n: num, pos: (offset + (k * span) / n) % span, sunk: false })) });
    }
    Object.assign(frog, { lane: -1, log: null, x: SIGN + (W - SIGN) / 2 });
    sel = null;
    ctx.hud.info(`Crossing ${crossing}/${CROSSINGS}`);
    ask();
  }
  const logX = (log) => SIGN - LOG_W + log.pos; // left edge on screen
  const next = () => lanes[frog.lane + 1];
  // logs you can pick: afloat and (nearly) all in view
  const choices = () => (next() ? next().logs.filter((l) => !l.sunk && logX(l) > SIGN - 12 && logX(l) + LOG_W < W + 12) : []);
  function ask() {
    const lane = next();
    ctx.hud.msg(lane ? `${lane.fact.text} = ?  Pick a log, then hop` : 'Hop up onto the far bank!');
    pickNearest();
  }
  function pickNearest() {
    const list = choices();
    sel = list.length ? list.reduce((a, b) => (Math.abs(logX(b) + LOG_W / 2 - frog.x) < Math.abs(logX(a) + LOG_W / 2 - frog.x) ? b : a)) : null;
  }
  // ← →: the next log along to the left or right of the chosen one
  function choose(dir) {
    if (over) return;
    const list = choices().sort((a, b) => logX(a) - logX(b));
    if (!list.length) return;
    const i = list.indexOf(sel);
    sel = i < 0 ? list[0] : list[Math.max(0, Math.min(list.length - 1, i + dir))];
  }

  function hop() {
    if (over || frog.hop > 0 || frog.lane >= LANES) return;
    const lane = next();
    if (!lane) {
      // the far bank: always safe
      frog.lane = LANES;
      frog.log = null;
      frog.hop = 0.25;
      score += 25;
      ctx.hud.score(score);
      if (crossing >= CROSSINGS) return end(true, 'Across the river!');
      ctx.toast('🐸 Across!', '+25 bonus points. A new river…');
      return ctx.after(700, newRiver);
    }
    if (!sel) return;
    if (sel.n === lane.fact.answer) {
      right++;
      score += 10;
      ctx.hud.score(score);
      frog.lane++;
      frog.log = sel;
      frog.hop = 0.25;
      ctx.hud.msg(`${lane.fact.text} = ${lane.fact.answer} ✓`, 'good');
      ctx.after(900, () => !over && ask());
      sel = null;
    } else {
      wrong++;
      hearts--;
      ctx.hud.hearts(hearts);
      ctx.hud.msg(`${lane.fact.text} = ${lane.fact.answer}, not ${sel.n}. Splash!`, 'bad');
      splash = { x: logX(sel) + LOG_W / 2, y: laneY(frog.lane + 1) + LANE_H / 2, t: 0.7 };
      sel.sunk = true;
      if (hearts <= 0) return end(false, 'Out of hearts!');
      pickNearest();
    }
  }
  function end(won, title) {
    over = true;
    draw();
    const lane = lanes[Math.max(0, Math.min(LANES - 1, frog.lane + 1))];
    ctx.finish({ title, won, lines: [`Score: ${score}`, `Right hops: ${right}`, `Splashes: ${wrong}`, won ? 'The frog made it home!' : `${lane.fact.text} = ${lane.fact.answer}`] });
  }

  ctx.listen(window, 'keydown', (e) => {
    const k = e.key;
    if (k === 'ArrowLeft') choose(-1);
    else if (k === 'ArrowRight') choose(1);
    else if (k === 'ArrowUp' || k === ' ') hop();
    else return;
    e.preventDefault();
  });
  // tap a log in the next lane to hop onto it (or the far bank when it's next)
  ctx.listen(canvas, 'pointerdown', (e) => {
    const p = point(e);
    if (!next()) return p.y < BANK + LANE_H && hop();
    const y = laneY(frog.lane + 1);
    if (p.y < y || p.y > y + LANE_H) return;
    const log = choices().find((l) => p.x >= logX(l) - 8 && p.x <= logX(l) + LOG_W + 8);
    if (log) {
      sel = log;
      hop();
    }
  });
  const pad = document.createElement('div');
  pad.className = 'frogger-pad';
  for (const [label, name, fn] of [['◀', 'Pick the log to the left', () => choose(-1)], ['▲ Hop', 'Hop', hop], ['▶', 'Pick the log to the right', () => choose(1)]]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `btn frogger-btn${fn === hop ? ' btn-primary' : ''}`;
    b.textContent = label;
    b.setAttribute('aria-label', name);
    b.tabIndex = -1;
    ctx.listen(b, 'pointerdown', (e) => {
      e.preventDefault();
      fn();
    });
    pad.append(b);
  }
  stage.append(pad);

  ctx.hud.hearts(hearts);
  ctx.hud.score(0);
  newRiver();

  ctx.loop((dt) => {
    if (over) return;
    // logs drift, except under the frog: its lane holds still so it never rides off the edge
    lanes.forEach((lane, i) => {
      if (i === frog.lane) return;
      for (const log of lane.logs) log.pos = (((log.pos + lane.speed * dt) % span) + span) % span;
    });
    if (frog.log) frog.x = logX(frog.log) + LOG_W / 2;
    frog.hop = Math.max(0, frog.hop - dt);
    if (splash) splash.t -= dt;
    if (splash && splash.t <= 0) splash = null;
    // keep the choice valid as logs drift off the edge
    if (next() && (!sel || !choices().includes(sel))) pickNearest();
    draw();
  });

  function draw() {
    // banks and water
    g.fillStyle = ctx.color('--good-bg') || '#dff5e6';
    g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(64, 150, 230, 0.28)'; // water: see-through blue works on light and dark
    g.fillRect(SIGN, BANK, W - SIGN, LANES * LANE_H);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '800 16px system-ui, sans-serif';
    g.fillStyle = ctx.color('--ink');
    g.fillText('🏁 Far bank', SIGN + (W - SIGN) / 2, BANK / 2);
    for (let i = 0; i < LANES; i++) {
      const lane = lanes[i];
      const y = laneY(i);
      const isNext = i === frog.lane + 1;
      // the question sign; the next lane's is lit up
      g.fillStyle = isNext ? ctx.color('--gold-bg') : ctx.color('--paper');
      g.strokeStyle = ctx.color('--edge');
      g.lineWidth = isNext ? 3 : 1.5;
      g.beginPath();
      g.roundRect(8, y + 12, SIGN - 16, LANE_H - 24, 10);
      g.fill();
      g.stroke();
      g.fillStyle = ctx.color(isNext ? '--ink' : '--muted');
      g.font = '900 20px system-ui, sans-serif';
      g.fillText(i < frog.lane + 1 ? '✓' : lane.fact.text, SIGN / 2, y + LANE_H / 2 + 1);
      // logs (clipped to the river)
      g.save();
      g.beginPath();
      g.rect(SIGN, y, W - SIGN, LANE_H);
      g.clip();
      for (const log of lane.logs) {
        if (log.sunk) continue;
        const x = logX(log);
        const chosen = log === sel;
        g.fillStyle = chosen ? ctx.color('--gold-line') || '#c98a1b' : '#9a6a3a';
        g.strokeStyle = chosen ? ctx.color('--ink') : '#6b4423';
        g.lineWidth = chosen ? 4 : 2;
        g.beginPath();
        g.roundRect(x, y + 16, LOG_W, LANE_H - 32, 20);
        g.fill();
        g.stroke();
        g.fillStyle = chosen ? ctx.color('--ink') : '#fff';
        g.font = '900 22px system-ui, sans-serif';
        g.fillText(String(log.n), x + LOG_W / 2, y + LANE_H / 2 + 1);
      }
      g.restore();
    }
    if (splash) {
      g.strokeStyle = '#fff';
      g.lineWidth = 3;
      for (const r of [0.4, 0.7, 1]) {
        g.beginPath();
        g.arc(splash.x, splash.y, 40 * r * (1 - splash.t / 0.7) + 6, 0, Math.PI * 2);
        g.stroke();
      }
    }
    // the frog (a little bigger mid-hop)
    const fy = frog.lane < 0 ? H - BANK / 2 : frog.lane >= LANES ? BANK / 2 + 14 : laneY(frog.lane) + LANE_H / 2;
    const fx = frog.x;
    const r = 18 * (1 + frog.hop);
    g.fillStyle = ctx.color('--good') || '#2e9e5b';
    g.beginPath();
    g.arc(fx, fy - (frog.log ? 22 : 0), r, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff';
    for (const ex of [-7, 7]) {
      g.beginPath();
      g.arc(fx + ex, fy - (frog.log ? 22 : 0) - 8, 5, 0, Math.PI * 2);
      g.fill();
    }
    // a dotted line to the chosen log
    if (sel && !over) {
      g.setLineDash([6, 6]);
      g.strokeStyle = ctx.color('--ink');
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(fx, fy - (frog.log ? 22 : 0) - r);
      g.lineTo(logX(sel) + LOG_W / 2, laneY(frog.lane + 1) + LANE_H - 16);
      g.stroke();
      g.setLineDash([]);
    }
  }

  return {
    state: () => {
      const lane = next();
      return {
        lane: frog.lane,
        question: lane ? lane.fact.text : null,
        answer: lane ? lane.fact.answer : null,
        selected: sel ? sel.n : null,
        choices: choices().map((l) => ({ n: l.n, x: logX(l) + LOG_W / 2, y: laneY(frog.lane + 1) + LANE_H / 2 })),
        frog: { lane: frog.lane, x: frog.x },
        crossing,
        crossings: CROSSINGS,
        score,
        hearts,
      };
    },
  };
}

function addStyle() {
  if (document.getElementById('frogger-style')) return;
  const s = document.createElement('style');
  s.id = 'frogger-style';
  s.textContent = `
    .frogger-pad { display: grid; grid-template-columns: 72px 120px 72px; gap: 10px; }
    .frogger-btn { font-size: 1.3rem; font-weight: 900; padding: 12px 0; touch-action: none; user-select: none; }
  `;
  document.head.append(s);
}
