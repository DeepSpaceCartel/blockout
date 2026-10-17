// Product Breakout (like Breakout): the paddle shows a number; the ball only
// breaks bricks whose fact equals it (other bricks just bounce it).
// A reference demo for a canvas game: ctx.canvas for drawing, ctx.loop for the
// frame loop, ctx.keys for held keys, ctx.listen for the pointer.

const W = 640;
const H = 480;
const COLS = 8;
const ROWS = 5;
const SPEED = { easy: 240, medium: 300, hard: 360 }; // ball, px per second

export function mount(stage, ctx) {
  const { ctx: g, point } = ctx.canvas(stage, W, H);
  const bw = W / COLS;
  const bh = 34;
  let target = 0;
  let bricks = [];
  let score = 0;
  let hearts = 3;
  const paddle = { x: W / 2, w: 110, h: 16, y: H - 34 };
  const ball = { x: W / 2, y: H - 60, vx: 0, vy: 0, r: 8, stuck: true };

  // a new target number and a wall where some bricks equal it
  function newWall() {
    const f = ctx.fact();
    target = f.answer;
    bricks = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        let fact;
        if (ctx.rng() < 0.3) fact = factFor(target) || ctx.fact();
        else fact = ctx.fact();
        bricks.push({ x: c * bw, y: 50 + r * bh, fact, alive: true });
      }
    }
    if (!bricks.some((b) => b.fact.answer === target)) bricks[ctx.randInt(0, bricks.length - 1)].fact = factFor(target);
    ctx.hud.info(`Break the bricks that equal ${target}`);
  }
  // a fact for this number from the level's tables (e.g. 24 → 4 × 6)
  function factFor(n) {
    const pairs = [];
    for (const a of ctx.L.tables) if (n % a === 0 && n / a >= 1 && n / a <= ctx.L.upTo) pairs.push([a, n / a]);
    if (!pairs.length) return null;
    const [a, b] = ctx.pick(pairs);
    return ctx.rng() < 0.5 ? { a, b, answer: n, text: `${a} × ${b}` } : { a: b, b: a, answer: n, text: `${b} × ${a}` };
  }
  const left = () => bricks.filter((b) => b.alive && b.fact.answer === target).length;

  function launch() {
    if (!ball.stuck) return;
    ball.stuck = false;
    const a = (-Math.PI / 2) + (ctx.rng() - 0.5) * 0.8;
    ball.vx = Math.cos(a) * SPEED[ctx.level];
    ball.vy = Math.sin(a) * SPEED[ctx.level];
  }

  ctx.listen(stage.querySelector('canvas'), 'pointermove', (e) => (paddle.x = point(e).x));
  ctx.listen(stage.querySelector('canvas'), 'pointerdown', (e) => ((paddle.x = point(e).x), launch()));
  ctx.listen(window, 'keydown', (e) => {
    if (e.key === ' ' || e.key === 'ArrowUp') {
      e.preventDefault();
      launch();
    }
  });

  newWall();
  ctx.hud.hearts(hearts);
  ctx.hud.msg('Click or press Space to launch');

  ctx.loop((dt) => {
    // paddle
    if (ctx.keys.has('ArrowLeft')) paddle.x -= 480 * dt;
    if (ctx.keys.has('ArrowRight')) paddle.x += 480 * dt;
    paddle.x = Math.max(paddle.w / 2, Math.min(W - paddle.w / 2, paddle.x));
    // ball
    if (ball.stuck) {
      ball.x = paddle.x;
      ball.y = paddle.y - ball.r - 2;
    } else {
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      if (ball.x < ball.r || ball.x > W - ball.r) ball.vx *= -1;
      if (ball.y < ball.r) ball.vy = Math.abs(ball.vy);
      // paddle: angle depends on where it hits
      if (ball.vy > 0 && ball.y + ball.r >= paddle.y && ball.y < paddle.y + paddle.h && Math.abs(ball.x - paddle.x) < paddle.w / 2 + ball.r) {
        const off = (ball.x - paddle.x) / (paddle.w / 2);
        const sp = Math.hypot(ball.vx, ball.vy);
        const a = -Math.PI / 2 + off * 1.0;
        ball.vx = Math.cos(a) * sp;
        ball.vy = Math.sin(a) * sp;
      }
      // bricks
      for (const b of bricks) {
        if (!b.alive || ball.x + ball.r < b.x || ball.x - ball.r > b.x + bw || ball.y + ball.r < b.y || ball.y - ball.r > b.y + bh) continue;
        ball.vy *= -1;
        if (b.fact.answer === target) {
          b.alive = false;
          score += 10;
          ctx.hud.score(score);
          ctx.hud.msg(`${b.fact.text} = ${target} ✓`, 'good');
          if (!left()) {
            ctx.toast(`🧱 Every ${target} broken!`, '+25 bonus points');
            score += 25;
            ctx.hud.score(score);
            newWall();
            ball.stuck = true;
          }
        } else ctx.hud.msg(`${b.fact.text} = ${b.fact.answer}, not ${target}`, 'bad');
        break;
      }
      // missed
      if (ball.y > H + ball.r) {
        hearts--;
        ctx.hud.hearts(hearts);
        if (hearts <= 0) return ctx.finish({ title: 'Out of balls!', lines: [`Score: ${score}`, `Last number: ${target}`] });
        ball.stuck = true;
        ctx.hud.msg('Missed! Click or Space to launch again', 'bad');
      }
    }
    draw();
  });

  function draw() {
    g.fillStyle = ctx.color('--surface') || '#fff';
    g.fillRect(0, 0, W, H);
    g.fillStyle = ctx.color('--ink') || '#222';
    g.font = '900 22px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(`Break: ${target}`, W / 2, 24);
    g.font = '800 15px system-ui, sans-serif';
    for (const b of bricks) {
      if (!b.alive) continue;
      g.fillStyle = b.fact.answer === target && ctx.level === 'easy' ? ctx.color('--gold-bg') : ctx.color('--soft-2');
      g.fillRect(b.x + 2, b.y + 2, bw - 4, bh - 4);
      g.strokeStyle = ctx.color('--edge');
      g.strokeRect(b.x + 2, b.y + 2, bw - 4, bh - 4);
      g.fillStyle = ctx.color('--ink');
      g.fillText(b.fact.text, b.x + bw / 2, b.y + bh / 2 + 1);
    }
    // paddle with the number
    g.fillStyle = ctx.color('--accent') || '#e4572e';
    g.beginPath();
    g.roundRect(paddle.x - paddle.w / 2, paddle.y, paddle.w, paddle.h + 6, 8);
    g.fill();
    g.fillStyle = '#fff';
    g.fillText(String(target), paddle.x, paddle.y + 11);
    // ball
    g.fillStyle = ctx.color('--ink');
    g.beginPath();
    g.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    g.fill();
  }

  return { state: () => ({ target, left: left(), score, hearts, stuck: ball.stuck, ball: { ...ball }, paddle: { ...paddle } }) };
}
