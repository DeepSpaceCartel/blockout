// Fact Towers (like tower defense): monsters walk the path, each showing its
// hit points. Answer the fact to fire a tower; the shot does as much damage as
// the answer, so bigger answers hit harder. Don't let 10 monsters through.

const W = 640;
const H = 310;
const PATH = [[-20, 60], [520, 60], [520, 160], [120, 160], [120, 260], [660, 260]];
const TOWERS = [[250, 112], [400, 212], [590, 160]];
const MAX_ESCAPED = 10;
const PACE = {
  easy: { total: 12, every: 8, walk: 34, hp: [10, 45] },
  medium: { total: 14, every: 7, walk: 30, hp: [12, 40] },
  hard: { total: 16, every: 6, walk: 26, hp: [25, 80] },
};

// the path as segments, so a monster's progress (0–1) maps to a point
const SEGS = PATH.slice(1).map(([x, y], i) => ({ x0: PATH[i][0], y0: PATH[i][1], x1: x, y1: y, len: Math.hypot(x - PATH[i][0], y - PATH[i][1]) }));
const LEN = SEGS.reduce((s, g) => s + g.len, 0);
function at(p) {
  let d = p * LEN;
  for (const s of SEGS) {
    if (d <= s.len) return { x: s.x0 + ((s.x1 - s.x0) * d) / s.len, y: s.y0 + ((s.y1 - s.y0) * d) / s.len };
    d -= s.len;
  }
  return { x: PATH.at(-1)[0], y: PATH.at(-1)[1] };
}

export function mount(stage, ctx) {
  const pace = PACE[ctx.level];
  const { ctx: g } = ctx.canvas(stage, W, H);
  const pad = ctx.keypad(stage, { onSubmit: answer });

  let monsters = [];
  let shots = []; // flying: { x, y, target, dmg }
  let pops = []; // floating damage numbers
  let question = null;
  let spawned = 0;
  let killed = 0;
  let escaped = 0;
  let score = 0;
  let right = 0;
  let wrong = 0;
  let nextId = 1;
  let spawnIn = 2; // seconds to the next monster
  let flash = null; // { tower, t } muzzle flash
  let done = false;

  function ask() {
    question = ctx.fact();
    pad.prompt(`${question.text} =`);
  }

  function spawn() {
    const [lo, hi] = pace.hp;
    // later monsters are a little tougher
    const hp = Math.round(ctx.randInt(lo, hi) * (1 + spawned * 0.04));
    monsters.push({ id: nextId++, hp, maxHp: hp, p: 0, wobble: ctx.rng() * 6 });
    spawned++;
  }

  // the monster furthest along that isn't already going to die from shots in flight
  function target() {
    const alive = monsters.filter((m) => m.hp > 0).sort((a, b) => b.p - a.p);
    const incoming = (m) => shots.filter((s) => s.target === m).reduce((t, s) => t + s.dmg, 0);
    return alive.find((m) => m.hp - incoming(m) > 0) || alive[0] || null;
  }

  function answer(v) {
    if (done) return;
    const q = question;
    if (v !== q.answer) {
      wrong++;
      ctx.hud.msg(`${q.text} = ${q.answer}, not ${v}`, 'bad');
      return ask();
    }
    right++;
    const m = target();
    if (!m) {
      ctx.hud.msg(`${q.text} = ${q.answer} ✓ (no monsters yet)`, 'good');
      score += 5;
      ctx.hud.score(score);
      return ask();
    }
    // the tower closest to the monster fires
    const pos = at(m.p);
    const t = TOWERS.reduce((best, tw) => (Math.hypot(tw[0] - pos.x, tw[1] - pos.y) < Math.hypot(best[0] - pos.x, best[1] - pos.y) ? tw : best));
    shots.push({ x: t[0], y: t[1] - 18, target: m, dmg: q.answer });
    flash = { tower: t, t: 0.2 };
    ctx.hud.msg(`${q.text} = ${q.answer} ✓ Fire! ${q.answer} damage`, 'good');
    ask();
  }

  function hud() {
    ctx.hud.info(`Through ${escaped}/${MAX_ESCAPED}`);
    ctx.hud.score(score);
  }

  function end(won) {
    done = true;
    pad.enable(false);
    ctx.after(700, () =>
      ctx.finish({
        title: won ? 'The castle is safe!' : 'Too many got through',
        won,
        lines: [`Monsters stopped: ${killed} of ${pace.total}`, `Got through: ${escaped}`, `Facts right: ${right}, wrong: ${wrong}`, `Score: ${score}`],
      })
    );
  }

  ctx.loop((dt) => {
    if (!done) {
      spawnIn -= dt;
      if (spawnIn <= 0 && spawned < pace.total) {
        spawn();
        spawnIn = pace.every;
      }
      for (const m of monsters) {
        m.p += dt / pace.walk;
        if (m.p >= 1 && m.hp > 0) {
          m.hp = 0;
          m.escaped = true;
          escaped++;
          ctx.hud.msg('A monster got through!', 'bad');
        }
      }
      // shots fly fast at their monster; damage lands on arrival
      for (const s of shots) {
        const to = at(s.target.p);
        const d = Math.hypot(to.x - s.x, to.y - s.y);
        const step = 700 * dt;
        if (d <= step || s.target.hp <= 0) {
          s.hit = true;
          if (s.target.hp > 0) {
            s.target.hp -= s.dmg;
            pops.push({ x: to.x, y: to.y - 20, text: `-${s.dmg}`, t: 0.9 });
            if (s.target.hp <= 0) {
              killed++;
              score += 10 + Math.round(s.target.maxHp / 5);
            }
          }
        } else {
          s.x += ((to.x - s.x) / d) * step;
          s.y += ((to.y - s.y) / d) * step;
        }
      }
      shots = shots.filter((s) => !s.hit);
      monsters = monsters.filter((m) => m.hp > 0);
      hud();
      if (escaped >= MAX_ESCAPED) end(false);
      else if (spawned === pace.total && !monsters.length && !shots.length) end(true);
    }
    for (const p of pops) p.t -= dt;
    pops = pops.filter((p) => p.t > 0);
    if (flash && (flash.t -= dt) <= 0) flash = null;
    draw();
  });

  function draw() {
    const c = (n, fb) => ctx.color(n) || fb;
    g.fillStyle = c('--good-bg', '#e8f6ec');
    g.fillRect(0, 0, W, H);
    // the path
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = c('--soft-2', '#e6dfd0');
    g.lineWidth = 44;
    g.beginPath();
    PATH.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.stroke();
    // castle at the exit
    g.font = '34px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('🏰', W - 24, 214);
    g.font = '800 16px system-ui, sans-serif';
    g.textAlign = 'left';
    g.fillStyle = c('--ink', '#222');
    g.fillText(`Monster ${Math.min(spawned, pace.total)} of ${pace.total}`, 12, H - 16);
    g.textAlign = 'center';
    // towers
    for (const [x, y] of TOWERS) {
      g.fillStyle = flash && flash.tower[0] === x && flash.tower[1] === y ? c('--gold-bg', '#ffe9a8') : c('--paper', '#fff');
      g.strokeStyle = c('--edge', '#333');
      g.lineWidth = 2;
      g.beginPath();
      g.roundRect(x - 18, y - 18, 36, 36, 6);
      g.fill();
      g.stroke();
      g.fillStyle = c('--accent', '#e4572e');
      g.fillRect(x - 5, y - 30, 10, 14);
    }
    // monsters, with their hit points
    for (const m of monsters) {
      const { x, y } = at(m.p);
      const bob = Math.sin(m.p * 120 + m.wobble) * 2;
      g.fillStyle = c('--bad', '#c62828');
      g.beginPath();
      g.arc(x, y + bob, 21, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff';
      g.font = '900 19px system-ui, sans-serif';
      g.fillText(String(m.hp), x, y + bob + 1);
      // health bar
      g.fillStyle = c('--edge', '#333');
      g.fillRect(x - 18, y - 32, 36, 5);
      g.fillStyle = c('--good', '#2e7d32');
      g.fillRect(x - 18, y - 32, (36 * m.hp) / m.maxHp, 5);
    }
    // shots
    g.fillStyle = c('--accent', '#e4572e');
    for (const s of shots) {
      g.beginPath();
      g.arc(s.x, s.y, 6, 0, Math.PI * 2);
      g.fill();
    }
    g.font = '900 22px system-ui, sans-serif';
    for (const p of pops) {
      g.fillStyle = c('--ink', '#222');
      g.globalAlpha = Math.min(1, p.t * 2);
      g.fillText(p.text, p.x, p.y - (0.9 - p.t) * 30);
      g.globalAlpha = 1;
    }
  }

  ask();
  hud();
  ctx.hud.msg('Answer to fire: the answer is the damage');

  return {
    state: () => ({
      question: { ...question },
      monsters: monsters.map((m) => ({ id: m.id, hp: m.hp, maxHp: m.maxHp, progress: m.p })),
      shots: shots.length,
      spawned,
      total: pace.total,
      killed,
      escaped,
      score,
      done,
    }),
  };
}
