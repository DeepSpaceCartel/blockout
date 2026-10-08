// Fact Racer (like a racing game): your car and three CPU cars race two laps
// of an oval. Your car creeps along by itself; every right answer is a boost,
// and a wrong answer stalls it for a moment. Beat the CPU cars to the flag.

const W = 640;
const H = 340;
const LAPS = 2;
const CX = 320;
const CY = 170;
const HALF = 150; // half the straight's length
const R = 100; // centre-line turn radius
const LANES = [-39, -13, 13, 39]; // lane offsets from the centre line
const BASE = LAPS / 160; // laps per second with no answers at all
const BOOST = 0.1; // laps per right answer, spread over a second
// seconds each CPU car takes for the race
const CPU_TIMES = { easy: [62, 78, 95], medium: [58, 72, 88], hard: [58, 72, 88] };
const CPU_LOOK = [
  { name: 'Blue', color: '#3b82f6' },
  { name: 'Purple', color: '#8b5cf6' },
  { name: 'Yellow', color: '#eab308' },
];

// position and heading on the oval, s in laps (0 = the flag, mid top straight)
function spot(s, off) {
  const P = 4 * HALF + 2 * Math.PI * R;
  let d = ((s % 1) + 1) % 1 * P + HALF; // measured from the top straight's left end
  d %= P;
  const r = R + off;
  const arc = Math.PI * R;
  if (d < 2 * HALF) return { x: CX - HALF + d, y: CY - r, a: 0 };
  d -= 2 * HALF;
  if (d < arc) {
    const t = -Math.PI / 2 + d / R;
    return { x: CX + HALF + Math.cos(t) * r, y: CY + Math.sin(t) * r, a: t + Math.PI / 2 };
  }
  d -= arc;
  if (d < 2 * HALF) return { x: CX + HALF - d, y: CY + r, a: Math.PI };
  d -= 2 * HALF;
  const t = Math.PI / 2 + d / R;
  return { x: CX - HALF + Math.cos(t) * r, y: CY + Math.sin(t) * r, a: t + Math.PI / 2 };
}
const place = (n) => ['1st', '2nd', '3rd', '4th'][n - 1];

export function mount(stage, ctx) {
  const { ctx: g } = ctx.canvas(stage, W, H);
  const pad = ctx.keypad(stage, { onSubmit: answer });
  const me = { name: 'You', color: '', lane: 3, s: 0, boost: 0, stall: 0, done: 0 };
  const cars = [me, ...CPU_LOOK.map((c, i) => ({ ...c, lane: 2 - i, s: 0, speed: LAPS / CPU_TIMES[ctx.level][i], phase: ctx.rng() * 6, done: 0 }))];
  let phase = 'count'; // 'count' → 'race' → 'done'
  let countdown = 3;
  let time = 0;
  let question = null;
  let right = 0;
  let wrong = 0;
  let score = 0;
  let finishers = 0;

  function ask() {
    question = ctx.fact();
    pad.prompt(`${question.text} =`);
  }

  function answer(v) {
    if (phase !== 'race') return;
    if (v === question.answer) {
      right++;
      score += 10;
      me.boost = Math.min(3, me.boost + 1);
      ctx.hud.msg(`${question.text} = ${question.answer} ✓ Boost!`, 'good');
    } else {
      wrong++;
      me.stall = 1.2;
      ctx.hud.msg(`${question.text} = ${question.answer}, not ${v}`, 'bad');
    }
    ctx.hud.score(score);
    ask();
  }

  const myPlace = () => 1 + cars.filter((c) => c !== me && (c.done ? !me.done || c.done < me.done : c.s > me.s)).length;

  function end() {
    phase = 'done';
    pad.enable(false);
    const p = me.done ? myPlace() : 4;
    ctx.after(900, () =>
      ctx.finish({
        title: p === 1 ? 'You win the race! 🏁' : `You came ${place(p)}`,
        won: p === 1,
        lines: [me.done ? `Race time: ${me.done.toFixed(1)} s` : 'All the CPU cars finished first.', `Boosts (right answers): ${right}`, `Wrong answers: ${wrong}`, `Score: ${score}`],
      })
    );
  }

  ctx.loop((dt) => {
    if (phase === 'count') {
      countdown -= dt;
      if (countdown <= 0) {
        phase = 'race';
        pad.enable(true);
        ctx.hud.msg('Go! Answer to boost', 'good');
      }
    } else if (phase === 'race') {
      time += dt;
      for (const c of cars) {
        if (c.done) continue;
        if (c === me) {
          const v = me.stall > 0 ? BASE * 0.3 : BASE + (me.boost > 0 ? BOOST : 0);
          me.s += v * dt;
          me.stall = Math.max(0, me.stall - dt);
          me.boost = Math.max(0, me.boost - dt);
        } else c.s += c.speed * (1 + 0.15 * Math.sin(time / 3 + c.phase)) * dt; // a little surging
        if (c.s >= LAPS) {
          c.s = LAPS;
          c.done = time;
          finishers++;
          if (c !== me) ctx.hud.msg(`${c.name} finished ${place(finishers)}`);
        }
      }
      if (me.done || finishers === cars.length - 1) end();
      ctx.hud.info(`Lap ${Math.min(LAPS, Math.floor(me.s) + 1)} of ${LAPS} · ${place(myPlace())}`);
    }
    draw();
  });

  function draw() {
    const c = (n, fb) => ctx.color(n) || fb;
    g.fillStyle = c('--good-bg', '#e8f6ec');
    g.fillRect(0, 0, W, H);
    // the track: a thick oval, lane lines, the flag line
    const oval = (r) => {
      g.beginPath();
      g.arc(CX + HALF, CY, r, -Math.PI / 2, Math.PI / 2);
      g.arc(CX - HALF, CY, r, Math.PI / 2, Math.PI * 1.5);
      g.closePath();
    };
    g.strokeStyle = c('--soft-2', '#e6dfd0');
    g.lineWidth = 108;
    oval(R);
    g.stroke();
    g.strokeStyle = c('--edge', '#333');
    g.lineWidth = 2;
    oval(R - 54);
    g.stroke();
    oval(R + 54);
    g.stroke();
    g.setLineDash([8, 10]);
    g.strokeStyle = c('--muted', '#999');
    for (const off of [-26, 0, 26]) {
      oval(R + off);
      g.stroke();
    }
    g.setLineDash([]);
    for (let i = 0; i < 9; i++) {
      for (let j = 0; j < 2; j++) {
        g.fillStyle = (i + j) % 2 ? '#fff' : '#222';
        g.fillRect(CX - 6 + j * 6, CY - R - 54 + i * 12, 6, 12);
      }
    }
    // the cars, each in its lane
    for (const car of cars) {
      const p = spot(car.s, LANES[car.lane]);
      g.save();
      g.translate(p.x, p.y);
      g.rotate(p.a);
      if (car === me && me.boost > 0) {
        g.fillStyle = '#f97316';
        g.beginPath();
        g.moveTo(-18, -6);
        g.lineTo(-32 - ctx.rng() * 8, 0);
        g.lineTo(-18, 6);
        g.fill();
      }
      g.fillStyle = car === me ? c('--accent', '#e4572e') : car.color;
      g.strokeStyle = c('--edge', '#333');
      g.beginPath();
      g.roundRect(-18, -10, 36, 20, 6);
      g.fill();
      g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.7)';
      g.fillRect(4, -7, 8, 14);
      g.restore();
      if (car === me) {
        g.fillStyle = c('--ink', '#222');
        g.font = '900 13px system-ui, sans-serif';
        g.textAlign = 'center';
        g.fillText('YOU', p.x, p.y - 16);
      }
    }
    // in the infield: countdown or place
    g.fillStyle = c('--ink', '#222');
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '900 34px system-ui, sans-serif';
    const mid = phase === 'count' ? String(Math.ceil(countdown)) : phase === 'race' && time < 1 ? 'GO!' : place(myPlace());
    g.fillText(mid, CX, CY - 8);
    g.font = '800 15px system-ui, sans-serif';
    g.fillText(`Lap ${Math.min(LAPS, Math.floor(me.s) + 1)} of ${LAPS}`, CX, CY + 22);
  }

  pad.enable(false);
  ask();
  ctx.hud.msg('Get ready…');
  ctx.hud.score(0);

  return {
    state: () => ({
      phase,
      question: { ...question },
      cars: cars.map((x) => ({ name: x.name, laps: x.s, done: x.done })),
      place: myPlace(),
      boost: me.boost,
      stall: me.stall,
      right,
      wrong,
      score,
    }),
  };
}
