// Factor Asteroids (like Asteroids): rocks carry composite numbers. A hit
// splits a rock into a factor pair (24 → 4 and 6); primes can't split, so they
// vanish. Clear the field. Arrow keys + Space, on-screen buttons, or tap to aim.

const W = 640;
const H = 480;
const SET = { easy: { rocks: 3, speed: [20, 35] }, medium: { rocks: 4, speed: [28, 45] }, hard: { rocks: 5, speed: [36, 58] } };
const TURN = 3.4; // radians per second
const THRUST = 220;
const BULLET = { speed: 400, life: 1.1, gap: 0.22 };

export function mount(stage, ctx) {
  const set = SET[ctx.level];
  const { canvas, ctx: g, point } = ctx.canvas(stage, W, H);
  const ship = { x: W / 2, y: H / 2, vx: 0, vy: 0, angle: -Math.PI / 2, inv: 2 };
  let rocks = [];
  let bullets = [];
  let hearts = 3;
  let score = 0;
  let splits = 0;
  let cooldown = 0;
  let over = false;
  const held = new Set(); // on-screen buttons held down: 'left' | 'right' | 'thrust' | 'fire'

  const radius = (v) => 21 + Math.sqrt(v) * 2.4;
  // wrap round the edges; m lets a rock slide fully off before it comes back
  const wrap = (o, m = 0) => {
    if (o.x < -m) o.x += W + 2 * m;
    else if (o.x > W + m) o.x -= W + 2 * m;
    if (o.y < -m) o.y += H + 2 * m;
    else if (o.y > H + m) o.y -= H + 2 * m;
  };
  function rock(value, x, y, dir = ctx.rng() * Math.PI * 2) {
    const sp = set.speed[0] + ctx.rng() * (set.speed[1] - set.speed[0]);
    // a lumpy outline, fixed per rock
    const bumps = Array.from({ length: 11 }, () => 0.82 + ctx.rng() * 0.22);
    return { value, x, y, vx: Math.cos(dir) * sp, vy: Math.sin(dir) * sp, r: radius(value), bumps, spin: ctx.rng() * 6 };
  }
  // the factor pair to split into: a fact from the level's tables if there is one
  function split(n) {
    const pairs = [];
    for (let d = 2; d * d <= n; d++) if (n % d === 0) pairs.push([d, n / d]);
    const fact = ([a, b]) => (ctx.L.tables.includes(a) && b <= ctx.L.upTo) || (ctx.L.tables.includes(b) && a <= ctx.L.upTo);
    const fromTables = pairs.filter(fact);
    return ctx.pick(fromTables.length ? fromTables : pairs);
  }

  // starting rocks: composite times-table answers, away from the ship
  for (let tries = 0; rocks.length < set.rocks && tries < 200; tries++) {
    const { answer } = ctx.fact();
    if (answer < 4 || ctx.isPrime(answer) || rocks.some((r) => r.value === answer)) continue;
    const a = ctx.rng() * Math.PI * 2;
    const d = 170 + ctx.rng() * 60;
    rocks.push(rock(answer, W / 2 + Math.cos(a) * d * 1.2, H / 2 + Math.sin(a) * d * 0.8));
  }

  function fire() {
    if (over || cooldown > 0 || bullets.length >= 5) return;
    cooldown = BULLET.gap;
    const c = Math.cos(ship.angle);
    const s = Math.sin(ship.angle);
    bullets.push({ x: ship.x + c * 16, y: ship.y + s * 16, vx: c * BULLET.speed + ship.vx, vy: s * BULLET.speed + ship.vy, life: BULLET.life });
  }

  function hit(r, b) {
    rocks = rocks.filter((x) => x !== r);
    if (ctx.isPrime(r.value)) {
      score += 5;
      ctx.hud.msg(`${r.value} is prime: it can’t split. Poof!`, 'good');
    } else {
      const [a, c] = split(r.value);
      splits++;
      score += 10;
      ctx.hud.msg(`${r.value} = ${a} × ${c}`, 'good');
      // the two halves fly apart, across the bullet's path
      const dir = Math.atan2(b.vy, b.vx);
      const [ox, oy] = [Math.cos(dir + Math.PI / 2) * r.r * 0.6, Math.sin(dir + Math.PI / 2) * r.r * 0.6];
      rocks.push(rock(a, r.x + ox, r.y + oy, dir + Math.PI / 2), rock(c, r.x - ox, r.y - oy, dir - Math.PI / 2));
    }
    ctx.hud.score(score);
    info();
    if (!rocks.length) {
      over = true;
      ctx.after(600, () =>
        ctx.finish({ title: 'Field cleared!', won: true, lines: [`Splits: ${splits}`, `Hearts left: ${hearts}`, `Score: ${score}`] })
      );
    }
  }
  const info = () => ctx.hud.info(`${rocks.length} rock${rocks.length === 1 ? '' : 's'} left`);

  // keyboard: held keys come from ctx.keys; stop the page scrolling
  ctx.listen(window, 'keydown', (e) => {
    if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
    if (e.key === ' ') fire();
  });
  // tap or click the field: turn to face it and shoot
  ctx.listen(canvas, 'pointerdown', (e) => {
    e.preventDefault();
    const p = point(e);
    ship.angle = Math.atan2(p.y - ship.y, p.x - ship.x);
    cooldown = 0;
    fire();
  });
  // on-screen buttons for touch
  const pad = document.createElement('div');
  pad.className = 'demo-row asteroids-pad';
  for (const [id, label] of [['left', '⟲'], ['thrust', '▲'], ['right', '⟳'], ['fire', '● Fire']]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `btn asteroids-${id}`;
    b.dataset.act = id;
    b.textContent = label;
    b.setAttribute('aria-label', id);
    pad.append(b);
  }
  stage.append(pad);
  const release = (e) => {
    const b = e.target.closest('[data-act]');
    if (b) held.delete(b.dataset.act);
  };
  ctx.listen(pad, 'pointerdown', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    e.preventDefault();
    held.add(b.dataset.act);
    if (b.dataset.act === 'fire') fire();
  });
  for (const type of ['pointerup', 'pointerleave', 'pointercancel']) ctx.listen(pad, type, release, true);
  addStyle();

  ctx.hud.hearts(hearts);
  ctx.hud.score(0);
  info();
  ctx.hud.msg('Shoot a rock to split it into factors');

  ctx.loop((dt, t) => {
    if (!over) step(dt);
    draw(t);
  });

  function step(dt) {
    const k = ctx.keys;
    if (k.has('ArrowLeft') || k.has('a') || held.has('left')) ship.angle -= TURN * dt;
    if (k.has('ArrowRight') || k.has('d') || held.has('right')) ship.angle += TURN * dt;
    ship.thrust = k.has('ArrowUp') || k.has('w') || held.has('thrust');
    if (ship.thrust) {
      ship.vx += Math.cos(ship.angle) * THRUST * dt;
      ship.vy += Math.sin(ship.angle) * THRUST * dt;
    }
    // drag, so the ship settles down on its own (easier for small hands)
    const drag = Math.exp(-0.9 * dt);
    ship.vx *= drag;
    ship.vy *= drag;
    ship.x += ship.vx * dt;
    ship.y += ship.vy * dt;
    wrap(ship);
    ship.inv = Math.max(0, ship.inv - dt);
    cooldown = Math.max(0, cooldown - dt);
    if (k.has(' ') || held.has('fire')) fire();

    for (const r of rocks) {
      r.x += r.vx * dt;
      r.y += r.vy * dt;
      r.spin += dt * 0.4;
      wrap(r, r.r);
    }
    for (const b of bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      wrap(b);
      const r = rocks.find((x) => Math.hypot(x.x - b.x, x.y - b.y) < x.r);
      if (r) {
        b.life = 0;
        hit(r, b);
        if (over) return;
      }
    }
    bullets = bullets.filter((b) => b.life > 0);
    // bumping a rock costs a heart; then a short safe time in the middle
    if (ship.inv <= 0 && rocks.some((r) => Math.hypot(r.x - ship.x, r.y - ship.y) < r.r + 10)) {
      hearts--;
      ctx.hud.hearts(hearts);
      if (hearts <= 0) {
        over = true;
        const left = rocks.map((r) => r.value).join(', ');
        return ctx.after(600, () => ctx.finish({ title: 'Ship down!', lines: [`Splits: ${splits}`, `Rocks left: ${left}`, `Score: ${score}`] }));
      }
      ctx.hud.msg('Ouch! Keep away from the rocks', 'bad');
      Object.assign(ship, { x: W / 2, y: H / 2, vx: 0, vy: 0, inv: 2.5 });
    }
  }

  function draw(t) {
    const ink = ctx.color('--ink');
    g.fillStyle = ctx.color('--surface');
    g.fillRect(0, 0, W, H);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 2;
    for (const r of rocks) {
      g.beginPath();
      r.bumps.forEach((k, i) => {
        const a = r.spin + (i / r.bumps.length) * Math.PI * 2;
        g[i ? 'lineTo' : 'moveTo'](r.x + Math.cos(a) * r.r * k, r.y + Math.sin(a) * r.r * k);
      });
      g.closePath();
      // on Easy, primes are gold: a hint that they won't split
      g.fillStyle = ctx.level === 'easy' && ctx.isPrime(r.value) ? ctx.color('--gold-bg') : ctx.color('--soft-2');
      g.fill();
      g.strokeStyle = ctx.color('--edge');
      g.stroke();
      g.fillStyle = ink;
      g.font = `900 ${Math.round(12 + r.r * 0.45)}px system-ui, sans-serif`;
      g.fillText(String(r.value), r.x, r.y + 1);
    }
    g.fillStyle = ctx.color('--accent');
    for (const b of bullets) {
      g.beginPath();
      g.arc(b.x, b.y, 4, 0, Math.PI * 2);
      g.fill();
    }
    // ship (blinks while safe)
    if (ship.inv > 0 && Math.floor(t / 120) % 2) return;
    g.save();
    g.translate(ship.x, ship.y);
    g.rotate(ship.angle);
    if (ship.thrust && !over) {
      g.fillStyle = '#f2c14e';
      g.beginPath();
      g.moveTo(-10, -6);
      g.lineTo(-22 - Math.random() * 6, 0);
      g.lineTo(-10, 6);
      g.fill();
    }
    g.fillStyle = ctx.color('--accent');
    g.strokeStyle = ctx.color('--edge');
    g.beginPath();
    g.moveTo(18, 0);
    g.lineTo(-12, -12);
    g.lineTo(-6, 0);
    g.lineTo(-12, 12);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }

  return {
    state: () => ({
      hearts,
      score,
      splits,
      over,
      ship: { x: ship.x, y: ship.y, angle: ship.angle, inv: ship.inv },
      rocks: rocks.map((r) => ({ x: r.x, y: r.y, r: r.r, value: r.value, prime: ctx.isPrime(r.value) })),
      bullets: bullets.length,
    }),
  };
}

function addStyle() {
  if (document.getElementById('asteroids-style')) return;
  const s = document.createElement('style');
  s.id = 'asteroids-style';
  s.textContent = `
    .asteroids-pad { gap: 10px; user-select: none; -webkit-user-select: none; }
    .asteroids-pad .btn { min-width: 64px; min-height: 52px; font-size: 1.4rem; font-weight: 900; touch-action: none; }
    .asteroids-pad .asteroids-fire { background: var(--accent); color: var(--accent-ink); min-width: 110px; }
  `;
  document.head.append(s);
}
