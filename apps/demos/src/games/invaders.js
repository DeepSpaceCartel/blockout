// Fact Invaders (like Space Invaders): the cannon carries a question; shoot the
// alien carrying its answer. Every alien is the answer to a real fact, so each
// one gets asked in turn. Wrong alien: a heart. Aliens landing: a heart, and
// they're pushed back up (forgiving). Clear the waves to win.

const W = 640;
const H = 480;
const ALIENS = { easy: 6, medium: 8, hard: 10 };
const MARCH = { easy: 26, medium: 34, hard: 44 }; // px per second, sideways
const SINK = { easy: 3, medium: 4.5, hard: 6 }; // px per second, down (easy lands in ~90 s)
const WAVES = 2;
const AW = 76; // alien size
const AH = 40;
const GROUND = 420; // aliens touching this have landed
const CANNON_Y = 446;

export function mount(stage, ctx) {
  addStyle();
  document.activeElement?.blur?.(); // so Space doesn't press a focused button
  const { canvas, ctx: g, point } = ctx.canvas(stage, W, H);
  const held = new Set(); // on-screen ◀ ▶ held down
  // the question again in big type: on a phone the canvas is scaled right down
  const qEl = document.createElement('div');
  qEl.className = 'demo-big';
  qEl.setAttribute('aria-live', 'polite');
  stage.append(qEl);
  const bar = document.createElement('div');
  bar.className = 'invaders-pad';
  stage.append(bar);
  const button = (label, title, onPress, holdKey) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `btn invaders-btn${onPress ? ' btn-primary' : ''}`;
    b.textContent = label;
    b.setAttribute('aria-label', title);
    b.tabIndex = -1;
    ctx.listen(b, 'pointerdown', (e) => {
      e.preventDefault();
      if (onPress) onPress();
      if (holdKey) held.add(holdKey);
    });
    for (const t of ['pointerup', 'pointerleave', 'pointercancel']) ctx.listen(b, t, () => holdKey && held.delete(holdKey));
    bar.append(b);
  };
  button('◀', 'Move left', null, 'left');
  button('Fire', 'Fire', () => fire());
  button('▶', 'Move right', null, 'right');

  let aliens = [];
  let q = null; // the current question: a fact whose answer an alien carries
  let wave = 0;
  let score = 0;
  let hearts = 3;
  let right = 0;
  let wrong = 0;
  let over = false;
  const cannon = { x: W / 2, w: 96 };
  let bullet = null;
  let fx = 0; // formation offset and direction
  let fy = 0;
  let dir = 1;
  let booms = []; // short-lived hit effects

  // a wave of aliens with different answers, in two rows
  function newWave() {
    wave++;
    const n = ALIENS[ctx.level];
    const facts = [];
    const seen = new Set();
    for (let i = 0; facts.length < n && i < 500; i++) {
      const f = ctx.fact();
      if (f.a === 1 || f.b === 1 || seen.has(f.answer)) continue;
      seen.add(f.answer);
      facts.push(f);
    }
    const perRow = Math.ceil(facts.length / 2);
    aliens = facts.map((fact, i) => ({ fact, n: fact.answer, col: i % perRow, row: Math.floor(i / perRow), alive: true, flash: 0 }));
    fx = 0;
    fy = 0;
    dir = 1;
    ctx.hud.info(`Wave ${wave}/${WAVES}`);
    ask();
  }
  const spanW = () => Math.ceil(aliens.length / 2) * (AW + 16) - 16;
  const alienPos = (a) => ({ x: (W - spanW()) / 2 + fx + a.col * (AW + 16), y: 40 + fy + a.row * (AH + 18) });
  const alive = () => aliens.filter((a) => a.alive);

  // ask about an alien in front (nothing alive below it), so it can be hit
  // without shooting through another alien first
  function ask() {
    const front = alive().filter((a) => !aliens.some((b) => b.alive && b.col === a.col && b.row > a.row));
    const pool = front.filter((a) => !q || a.n !== q.answer);
    const target = ctx.pick(pool.length ? pool : front);
    q = target.fact;
    qEl.textContent = `${q.text} = ?`;
  }

  function fire() {
    if (bullet || over) return;
    bullet = { x: cannon.x, y: CANNON_Y - 20 };
  }

  function hit(a) {
    const p = alienPos(a);
    if (a.n === q.answer) {
      a.alive = false;
      right++;
      score += 10;
      ctx.hud.score(score);
      ctx.hud.msg(`${q.text} = ${q.answer} ✓`, 'good');
      booms.push({ x: p.x + AW / 2, y: p.y + AH / 2, t: 0.5 });
      if (alive().length) return ask();
      if (wave >= WAVES) return end(true, 'The invaders are gone!');
      ctx.toast('👾 Wave cleared!', '+25 bonus points');
      score += 25;
      ctx.hud.score(score);
      newWave();
    } else {
      wrong++;
      a.flash = 0.6;
      ctx.hud.msg(`${q.text} = ${q.answer}, not ${a.n}`, 'bad');
      loseHeart();
    }
  }
  function loseHeart() {
    hearts--;
    ctx.hud.hearts(hearts);
    if (hearts <= 0) end(false, 'Out of hearts!');
  }
  function end(won, title) {
    over = true;
    draw();
    ctx.finish({ title, won, lines: [`Score: ${score}`, `Aliens hit: ${right}`, `Wrong aliens: ${wrong}`, won ? 'Earth is safe!' : `Last question: ${q.text} = ${q.answer}`] });
  }

  ctx.listen(canvas, 'pointermove', (e) => (cannon.x = point(e).x));
  ctx.listen(canvas, 'pointerdown', (e) => (cannon.x = point(e).x));
  ctx.listen(window, 'keydown', (e) => {
    if (e.key === ' ' || e.key === 'ArrowUp') {
      e.preventDefault();
      fire();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') e.preventDefault();
  });

  ctx.hud.hearts(hearts);
  ctx.hud.score(0);
  ctx.hud.msg('Shoot the alien with the answer');
  newWave();

  ctx.loop((dt) => {
    if (over) return;
    // cannon
    if (ctx.keys.has('ArrowLeft') || held.has('left')) cannon.x -= 340 * dt;
    if (ctx.keys.has('ArrowRight') || held.has('right')) cannon.x += 340 * dt;
    cannon.x = Math.max(cannon.w / 2, Math.min(W - cannon.w / 2, cannon.x));
    // march sideways (turning at the edges) and sink slowly, at a steady pace
    fx += dir * MARCH[ctx.level] * dt;
    fy += SINK[ctx.level] * dt;
    const left = (W - spanW()) / 2 + fx;
    if ((dir > 0 && left + spanW() > W - 8) || (dir < 0 && left < 8)) dir *= -1;
    // landed: a heart, and the wave goes back to the top
    const low = Math.max(...alive().map((a) => alienPos(a).y + AH));
    if (low >= GROUND) {
      fy = 0;
      ctx.hud.msg(`They landed! ${q.text} = ${q.answer}`, 'bad');
      loseHeart();
      if (over) return;
    }
    // bullet
    if (bullet) {
      bullet.y -= 560 * dt;
      if (bullet.y < 0) bullet = null;
      else {
        for (const a of alive()) {
          const p = alienPos(a);
          if (bullet.x > p.x && bullet.x < p.x + AW && bullet.y > p.y && bullet.y < p.y + AH) {
            bullet = null;
            hit(a);
            break;
          }
        }
      }
    }
    for (const a of aliens) a.flash = Math.max(0, a.flash - dt);
    for (const b of booms) b.t -= dt;
    booms = booms.filter((b) => b.t > 0);
    if (!over) draw();
  });

  function draw() {
    g.fillStyle = ctx.color('--surface');
    g.fillRect(0, 0, W, H);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    // ground
    g.fillStyle = ctx.color('--soft-2');
    g.fillRect(0, GROUND + 2, W, 2);
    // aliens: the one a shot would hit now is highlighted, to help aim
    g.font = '900 22px system-ui, sans-serif';
    const inLine = alive().filter((a) => cannon.x > alienPos(a).x && cannon.x < alienPos(a).x + AW);
    const aimedAt = inLine.sort((a, b) => b.row - a.row)[0];
    for (const a of alive()) {
      const p = alienPos(a);
      const aimed = a === aimedAt;
      g.fillStyle = a.flash > 0 ? ctx.color('--bad') : aimed ? ctx.color('--gold-bg') : ctx.color('--soft-2');
      g.strokeStyle = ctx.color('--edge');
      g.lineWidth = 2;
      g.beginPath();
      g.roundRect(p.x, p.y, AW, AH, [16, 16, 6, 6]);
      g.fill();
      g.stroke();
      // little legs and eyes
      g.fillStyle = ctx.color('--edge');
      for (const lx of [12, AW / 2 - 3, AW - 18]) g.fillRect(p.x + lx, p.y + AH, 6, 6);
      g.fillRect(p.x + 10, p.y + 8, 5, 5);
      g.fillRect(p.x + AW - 15, p.y + 8, 5, 5);
      g.fillStyle = a.flash > 0 ? '#fff' : ctx.color('--ink');
      g.fillText(String(a.n), p.x + AW / 2, p.y + AH / 2 + 3);
    }
    for (const b of booms) {
      g.fillStyle = ctx.color('--good');
      g.globalAlpha = b.t * 2;
      g.beginPath();
      g.arc(b.x, b.y, 40 * (1 - b.t), 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
    }
    // bullet
    if (bullet) {
      g.fillStyle = ctx.color('--accent');
      g.fillRect(bullet.x - 3, bullet.y - 10, 6, 18);
    }
    // cannon with the question on it
    g.fillStyle = ctx.color('--accent');
    g.fillRect(cannon.x - 6, CANNON_Y - 26, 12, 12);
    g.beginPath();
    g.roundRect(cannon.x - cannon.w / 2, CANNON_Y - 16, cannon.w, 34, 10);
    g.fill();
    g.fillStyle = '#fff';
    g.font = '900 18px system-ui, sans-serif';
    g.fillText(q ? q.text : '', cannon.x, CANNON_Y + 2);
  }

  return {
    state: () => ({
      question: q && q.text,
      answer: q && q.answer,
      cannon: { x: cannon.x },
      bullet: bullet && { ...bullet },
      aliens: aliens.map((a) => {
        const p = alienPos(a);
        return { n: a.n, alive: a.alive, x: p.x, y: p.y, w: AW, h: AH, cx: p.x + AW / 2 };
      }),
      wave,
      waves: WAVES,
      score,
      hearts,
      width: W,
      height: H,
    }),
  };
}

function addStyle() {
  if (document.getElementById('invaders-style')) return;
  const s = document.createElement('style');
  s.id = 'invaders-style';
  s.textContent = `
    .invaders-pad { display: grid; grid-template-columns: 80px 120px 80px; gap: 10px; }
    .invaders-btn { font-size: 1.4rem; font-weight: 900; padding: 12px 0; touch-action: none; user-select: none; }
  `;
  document.head.append(s);
}
