// Jump the Answer (like a platformer): each room asks a question and has a few
// floating platforms with numbers. Run and jump onto the answer. A wrong
// platform crumbles under you (a heart); the right one opens the next room.
// Platforms are one-way (you jump up through them), so a jump from right
// underneath always lands on top.

const W = 640;
const H = 340;
const GROUND = 292; // top of the grass
const GRAVITY = 1500;
const JUMP = 650; // take-off speed: about 140 px high
const RUN = 220;
const PLATFORMS = { easy: 3, medium: 3, hard: 4 };
const ROOMS = 8;
const PW = 28; // player size
const PH = 36;

export function mount(stage, ctx) {
  addStyle();
  document.activeElement?.blur?.();
  const { ctx: g } = ctx.canvas(stage, W, H);
  const held = new Set(); // on-screen ◀ ▶ held down

  let q = null;
  let plats = []; // { n, x (centre), top, w, state: 'ok' | 'crumble' | 'gone' | 'good', t }
  let room = 0;
  let score = 0;
  let hearts = 3;
  let right = 0;
  let wrong = 0;
  let phase = 'play'; // 'play' | 'done' (landed on the answer) | 'over'
  const p = { x: 50, y: GROUND, vx: 0, vy: 0, onGround: true, on: null, face: 1 };

  function newRoom() {
    room++;
    q = ctx.fact();
    const n = PLATFORMS[ctx.level];
    const nums = ctx.shuffle([q.answer, ...ctx.nearMisses(q.answer, n - 1, q)]);
    const w = n > 3 ? 92 : 104;
    const gap = (W - 170) / n;
    let lastTop = 0;
    plats = nums.map((num, i) => {
      // heights vary, but neighbours differ so it looks like steps
      let top = GROUND - ctx.randInt(62, 116); // a jump reaches about 140 px up
      if (Math.abs(top - lastTop) < 20) top = top > GROUND - 89 ? top - 30 : top + 30;
      lastTop = top;
      return { n: num, x: 150 + gap * (i + 0.5), top, w, state: 'ok', t: 0 };
    });
    Object.assign(p, { x: 50, y: GROUND, vx: 0, vy: 0, onGround: true, on: null });
    phase = 'play';
    ctx.hud.info(`Room ${room}/${ROOMS}`);
    ctx.hud.msg(`Land on ${q.text}`);
  }

  function jump() {
    if (phase !== 'play' || !p.onGround) return;
    p.vy = -JUMP;
    p.onGround = false;
    p.on = null;
  }

  function land(pl) {
    if (pl.n === q.answer) {
      right++;
      score += 10;
      ctx.hud.score(score);
      ctx.hud.msg(`${q.text} = ${q.answer} ✓`, 'good');
      pl.state = 'good';
      phase = 'done';
      ctx.after(900, () => {
        if (room >= ROOMS) end(true, 'You jumped every answer!');
        else newRoom();
      });
    } else {
      wrong++;
      hearts--;
      ctx.hud.hearts(hearts);
      ctx.hud.msg(`${q.text} = ${q.answer}, not ${pl.n}`, 'bad');
      pl.state = 'crumble'; // holds you for a moment, then drops you
      pl.t = 0.4;
      if (hearts <= 0) ctx.after(500, () => end(false, 'Out of hearts!'));
    }
  }
  function end(won, title) {
    phase = 'over';
    draw();
    ctx.finish({ title, won, lines: [`Score: ${score}`, `Right landings: ${right}`, `Crumbles: ${wrong}`, won ? `All ${ROOMS} rooms!` : `${q.text} = ${q.answer}`] });
  }

  ctx.listen(window, 'keydown', (e) => {
    const k = e.key;
    if (k === 'ArrowUp' || k === ' ' || k === 'w' || k === 'W') {
      e.preventDefault();
      if (!e.repeat) jump();
    } else if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowDown') e.preventDefault();
  });
  const pad = document.createElement('div');
  pad.className = 'platformer-pad';
  for (const [label, name, holdKey] of [['◀', 'Run left', 'left'], ['Jump', 'Jump', null], ['▶', 'Run right', 'right']]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `btn platformer-btn${holdKey ? '' : ' btn-primary'}`;
    b.textContent = label;
    b.setAttribute('aria-label', name);
    b.tabIndex = -1;
    ctx.listen(b, 'pointerdown', (e) => {
      e.preventDefault();
      if (holdKey) held.add(holdKey);
      else jump();
    });
    for (const t of ['pointerup', 'pointerleave', 'pointercancel']) ctx.listen(b, t, () => holdKey && held.delete(holdKey));
    pad.append(b);
  }
  stage.append(pad);

  ctx.hud.hearts(hearts);
  ctx.hud.score(0);
  newRoom();

  ctx.loop((dt) => {
    if (phase === 'over') return;
    const L = ctx.keys.has('ArrowLeft') || ctx.keys.has('a') || held.has('left');
    const R = ctx.keys.has('ArrowRight') || ctx.keys.has('d') || held.has('right');
    p.vx = phase === 'play' ? (R - L) * RUN : 0;
    if (p.vx) p.face = Math.sign(p.vx);
    p.x = Math.max(PW / 2, Math.min(W - PW / 2, p.x + p.vx * dt));
    // crumbling platforms give way
    for (const pl of plats) {
      if (pl.state !== 'crumble') continue;
      pl.t -= dt;
      if (pl.t <= 0) {
        pl.state = 'gone';
        if (p.on === pl) Object.assign(p, { on: null, onGround: false });
      }
    }
    // walked off the edge of a platform
    if (p.on && Math.abs(p.x - p.on.x) > p.on.w / 2 + PW / 2) Object.assign(p, { on: null, onGround: false });
    if (!p.onGround) {
      const before = p.y;
      p.vy += GRAVITY * dt;
      p.y += p.vy * dt;
      // one-way platforms: only land when coming down through the top
      if (p.vy > 0) {
        for (const pl of plats) {
          if (pl.state === 'gone' || before > pl.top || p.y < pl.top || Math.abs(p.x - pl.x) > pl.w / 2 + PW / 2 - 4) continue;
          Object.assign(p, { y: pl.top, vy: 0, onGround: true, on: pl });
          if (pl.state === 'ok') land(pl);
          break;
        }
      }
      if (p.y >= GROUND) Object.assign(p, { y: GROUND, vy: 0, onGround: true, on: null });
    }
    draw();
  });

  function draw() {
    g.fillStyle = ctx.color('--surface');
    g.fillRect(0, 0, W, H);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    // the question
    g.fillStyle = ctx.color('--ink');
    g.font = '900 34px system-ui, sans-serif';
    g.fillText(q ? `${q.text} = ?` : '', W / 2, 40);
    // ground
    g.fillStyle = ctx.color('--good');
    g.fillRect(0, GROUND, W, 10);
    g.fillStyle = ctx.color('--soft-2');
    g.fillRect(0, GROUND + 10, W, H - GROUND - 10);
    // platforms
    g.font = '900 24px system-ui, sans-serif';
    for (const pl of plats) {
      if (pl.state === 'gone') continue;
      const shake = pl.state === 'crumble' ? (ctx.rng() - 0.5) * 6 : 0;
      const x = pl.x - pl.w / 2 + shake;
      g.globalAlpha = pl.state === 'crumble' ? Math.max(0.3, pl.t / 0.4) : 1;
      g.fillStyle = pl.state === 'good' ? ctx.color('--good') : pl.state === 'crumble' ? ctx.color('--bad') : ctx.color('--gold-bg');
      g.strokeStyle = ctx.color('--edge');
      g.lineWidth = 2;
      g.beginPath();
      g.roundRect(x, pl.top, pl.w, 30, 8);
      g.fill();
      g.stroke();
      g.fillStyle = pl.state === 'ok' ? ctx.color('--ink') : '#fff';
      g.fillText(String(pl.n), x + pl.w / 2, pl.top + 16);
      g.globalAlpha = 1;
    }
    // the runner
    const x = p.x - PW / 2;
    const y = p.y - PH;
    g.fillStyle = ctx.color('--accent');
    g.beginPath();
    g.roundRect(x, y, PW, PH, 8);
    g.fill();
    g.fillStyle = '#fff';
    g.fillRect(p.x + p.face * 5 - 3, y + 9, 6, 7);
  }

  return {
    state: () => ({
      question: q && q.text,
      answer: q && q.answer,
      phase,
      player: { x: p.x, y: p.y, vx: p.vx, vy: p.vy, onGround: p.onGround, on: p.on ? p.on.n : null },
      platforms: plats.map((pl) => ({ n: pl.n, x: pl.x, top: pl.top, w: pl.w, state: pl.state })),
      room,
      rooms: ROOMS,
      score,
      hearts,
    }),
  };
}

function addStyle() {
  if (document.getElementById('platformer-style')) return;
  const s = document.createElement('style');
  s.id = 'platformer-style';
  s.textContent = `
    .platformer-pad { display: grid; grid-template-columns: 80px 120px 80px; gap: 10px; }
    .platformer-btn { font-size: 1.4rem; font-weight: 900; padding: 12px 0; touch-action: none; user-select: none; }
  `;
  document.head.append(s);
}
