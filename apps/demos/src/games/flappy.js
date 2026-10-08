// Flappy Facts (like Flappy Bird): each wall has gaps with numbers; flap
// through the gap with the answer to the question. One wall at a time, so
// there's always just one question to think about.

const W = 560;
const H = 440; // a bit tall, so it stays big on a phone
const WALLS = 10; // walls to fly through to win
const BIRD_X = 130;
const HIT_R = 9; // forgiving hitbox (the bird is drawn bigger)
const SET = {
  easy: { gaps: 2, gapH: 130, speed: 100 },
  medium: { gaps: 3, gapH: 108, speed: 120 },
  hard: { gaps: 3, gapH: 96, speed: 140 },
};
const GRAVITY = 760;
const FLAP = -260;

export function mount(stage, ctx) {
  const set = SET[ctx.level];
  const { canvas, ctx: g } = ctx.canvas(stage, W, H);
  const bird = { x: BIRD_X, y: H / 2, vy: 0 };
  let phase = 'ready'; // ready → fly → over
  let wall = null;
  let hearts = 3;
  let score = 0;
  let passed = 0; // walls resolved, right or wrong
  let right = 0;
  let ghost = 0; // seconds the bird can pass through walls after a bonk
  let t0 = 0;

  // a wall with one gap per band; one of the gaps carries the answer
  function newWall() {
    const fact = ctx.fact();
    const values = ctx.shuffle([fact.answer, ...ctx.nearMisses(fact.answer, set.gaps - 1, fact)]);
    const band = (H - 30) / set.gaps;
    const gaps = values.map((value, i) => {
      const slack = band - set.gapH;
      const top = 15 + i * band + slack / 2 + (ctx.rng() - 0.5) * slack * 0.7;
      return { top, bot: top + set.gapH, value };
    });
    wall = { x: W + 10, w: 64, fact, gaps, through: null, done: false };
    ctx.hud.info(`Wall ${passed + 1}/${WALLS}`);
  }

  function flap() {
    if (phase === 'over') return;
    if (phase === 'ready') {
      phase = 'fly';
      ctx.hud.msg(`Fly through ${wall.fact.text}`);
    }
    bird.vy = FLAP;
  }
  ctx.listen(canvas, 'pointerdown', (e) => {
    e.preventDefault();
    flap();
  });
  ctx.listen(window, 'keydown', (e) => {
    if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w') {
      e.preventDefault();
      if (!e.repeat) flap();
    }
  });

  // a wall is decided when the bird bonks it or comes out the other side
  function resolve(gap) {
    wall.done = true;
    passed++;
    const { text, answer } = wall.fact;
    if (gap && gap.value === answer) {
      right++;
      score += 10;
      ctx.hud.score(score);
      ctx.hud.msg(`${text} = ${answer} ✓`, 'good');
    } else {
      hearts--;
      ctx.hud.hearts(hearts);
      if (gap) ctx.hud.msg(`${text} = ${answer}, not ${gap.value}`, 'bad');
      else {
        ctx.hud.msg(`Bonk! ${text} = ${answer}`, 'bad');
        ghost = 1.4;
      }
    }
    if (hearts <= 0 || passed >= WALLS) {
      phase = 'over';
      const won = hearts > 0;
      ctx.after(700, () =>
        ctx.finish({
          title: won ? 'You made it!' : 'Out of hearts!',
          won,
          lines: [`Right gaps: ${right} of ${passed}`, `Score: ${score}`, won ? 'Great flying!' : `Last one: ${text} = ${answer}`],
        })
      );
    }
  }

  newWall();
  ctx.hud.hearts(hearts);
  ctx.hud.msg('Tap, click or Space to flap');

  ctx.loop((dt, t) => {
    if (!t0) t0 = t;
    if (phase === 'ready') {
      bird.y = H / 2 + Math.sin((t - t0) / 250) * 8; // bob until the first flap
    } else if (phase === 'fly') {
      bird.vy = Math.min(bird.vy + GRAVITY * dt, 360);
      bird.y += bird.vy * dt;
      if (bird.y < 12) (bird.y = 12), (bird.vy = 0);
      // the floor bounces rather than hurts: only walls cost hearts
      if (bird.y > H - 14) {
        bird.y = H - 14;
        bird.vy = FLAP * 0.8;
        if (!wall.done) ctx.hud.msg('Flap to stay up!');
      }
      ghost = Math.max(0, ghost - dt);
      wall.x -= set.speed * dt;
      const inside = bird.x + HIT_R > wall.x && bird.x - HIT_R < wall.x + wall.w;
      if (!wall.done && inside) {
        const gap = wall.gaps.find((gp) => bird.y - HIT_R >= gp.top && bird.y + HIT_R <= gp.bot);
        if (gap) wall.through = gap;
        else if (ghost <= 0) resolve(null);
      }
      if (!wall.done && bird.x - HIT_R > wall.x + wall.w) resolve(wall.through);
      if (wall.x + wall.w < bird.x - 40 && phase === 'fly') {
        newWall();
        ctx.hud.msg(`Next: ${wall.fact.text}`);
      }
    }
    draw(t);
  });

  function draw(t) {
    const ink = ctx.color('--ink');
    g.fillStyle = ctx.color('--surface');
    g.fillRect(0, 0, W, H);
    g.fillStyle = ctx.color('--soft-2');
    g.fillRect(0, H - 6, W, 6);
    // wall: solid pieces between the gaps
    const edges = [0, ...wall.gaps.flatMap((gp) => [gp.top, gp.bot]), H];
    g.lineWidth = 2;
    for (let i = 0; i < edges.length; i += 2) {
      g.fillStyle = ctx.color('--good');
      g.fillRect(wall.x, edges[i], wall.w, edges[i + 1] - edges[i]);
      g.strokeStyle = ctx.color('--edge');
      g.strokeRect(wall.x, edges[i], wall.w, edges[i + 1] - edges[i]);
    }
    // gap numbers; once decided, the answer's gap lights up
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '900 26px system-ui, sans-serif';
    for (const gp of wall.gaps) {
      const cy = (gp.top + gp.bot) / 2;
      const isAnswer = gp.value === wall.fact.answer;
      g.fillStyle = wall.done && isAnswer ? ctx.color('--good') : ctx.color('--gold-bg');
      g.strokeStyle = ctx.color('--edge');
      g.beginPath();
      g.roundRect(wall.x - 8, cy - 20, wall.w + 16, 40, 12);
      g.fill();
      g.stroke();
      g.fillStyle = wall.done && isAnswer ? '#fff' : ink;
      g.fillText(String(gp.value), wall.x + wall.w / 2, cy + 1);
    }
    // the question, big, top left
    g.fillStyle = ctx.color('--paper');
    g.strokeStyle = ctx.color('--edge');
    g.beginPath();
    g.roundRect(10, 10, 200, 50, 12);
    g.fill();
    g.stroke();
    g.fillStyle = ink;
    g.font = '900 30px system-ui, sans-serif';
    g.fillText(`${wall.fact.text} = ?`, 110, 36);
    // bird (blinks while it can pass through walls)
    if (ghost > 0 && Math.floor(t / 100) % 2) return;
    const tilt = Math.max(-0.5, Math.min(0.7, bird.vy / 500));
    g.save();
    g.translate(bird.x, bird.y);
    g.rotate(tilt);
    g.fillStyle = ctx.color('--accent');
    g.beginPath();
    g.arc(0, 0, 14, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = ctx.color('--edge');
    g.stroke();
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(5, -4, 5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#222';
    g.beginPath();
    g.arc(6.5, -4, 2.2, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#f2c14e';
    g.beginPath();
    g.moveTo(12, 0);
    g.lineTo(21, 3);
    g.lineTo(12, 6);
    g.fill();
    g.restore();
    if (phase === 'ready') {
      g.fillStyle = ink;
      g.font = '800 20px system-ui, sans-serif';
      g.fillText('Tap or press Space to fly!', W / 2, H - 40);
    }
  }

  return {
    state: () => ({
      phase,
      hearts,
      score,
      passed,
      right,
      total: WALLS,
      ghost,
      bird: { ...bird },
      wall: { x: wall.x, w: wall.w, done: wall.done, text: wall.fact.text, answer: wall.fact.answer, gaps: wall.gaps.map((gp) => ({ ...gp })) },
    }),
  };
}
