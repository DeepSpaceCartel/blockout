// Skip-Count Beats (like a rhythm game): a row of numbers falls on every beat.
// Tap the lane holding the next number in the skip-count (4, 8, 12, …) as the
// row reaches the line. Two tables per game; a miss shows the right fact and
// the count carries on, so the beat never stops.

const W = 480;
const H = 400;
const HIT_Y = H - 64; // the line
const TOP = 74; // rows appear here (the count is shown above)
const FALL_BEATS = 3; // beats from appearing to reaching the line
const BEAT = { easy: 1.6, medium: 1.35, hard: 1.15 }; // seconds per beat
const LANES = { easy: 3, medium: 4, hard: 4 };
const KEYS = { 1: 0, 2: 1, 3: 2, 4: 3, d: 0, f: 1, j: 2, k: 3 };

export function mount(stage, ctx) {
  const beat = BEAT[ctx.level];
  const nLanes = LANES[ctx.level];
  const laneW = W / nLanes;
  const speed = (HIT_Y - TOP) / (FALL_BEATS * beat); // px per second
  const spacing = speed * beat; // px between rows
  const { canvas, ctx: g, point } = ctx.canvas(stage, W, H);
  const pads = document.createElement('div');
  pads.className = 'demo-choices';
  for (let i = 0; i < nLanes; i++) pads.insertAdjacentHTML('beforeend', `<button type="button" class="btn" data-lane="${i}" style="min-width:${Math.floor(300 / nLanes)}px">${i + 1}</button>`);
  stage.append(pads);

  // the whole song: two tables, each counted from ×1 up to the level's top
  const tables = ctx.shuffle(ctx.L.tables.filter((n) => n > 1)).slice(0, 2);
  const song = [];
  for (const n of tables) for (let k = 1; k <= ctx.L.upTo; k++) song.push({ n, k, target: n * k });

  const decoys = (n, target) => {
    const out = [];
    for (const v of ctx.shuffle([target + 1, target - 1, target + n, target - n, target + 2, target - 2, target + 10])) {
      if (v > 0 && v !== target && !out.includes(v)) out.push(v);
    }
    return out;
  };

  let rows = []; // on screen: { i, n, k, target, values, lane, y, state }
  let spawned = 0;
  let clock = 0; // seconds to the next beat
  let pulse = 0;
  let hits = 0;
  let misses = 0;
  let streak = 0;
  let best = 0;
  let score = 0;
  let done = false;
  let banner = { text: `Count by ${tables[0]}s!`, t: 2.5 };
  const said = []; // numbers counted so far in this table (shown at the top)

  function spawn() {
    const s = song[spawned];
    const lane = ctx.randInt(0, nLanes - 1);
    const d = decoys(s.n, s.target);
    const values = [];
    for (let i = 0; i < nLanes; i++) values.push(i === lane ? s.target : d.shift());
    rows.push({ i: spawned, ...s, values, lane, y: TOP, state: 'falling' });
    spawned++;
    hud();
  }

  // the next row to answer, if it's close enough to the line (up to a beat early)
  const current = () => rows.find((r) => r.state === 'falling' && r.y >= HIT_Y - spacing);

  function counted(r) {
    if (r.k === 1) said.length = 0;
    said.push(r.target);
  }

  function tap(lane) {
    if (done) return;
    const r = current();
    if (!r) return ctx.hud.msg('Wait for the row to reach the line');
    counted(r);
    if (lane === r.lane) {
      r.state = 'hit';
      hits++;
      streak++;
      best = Math.max(best, streak);
      const perfect = Math.abs(r.y - HIT_Y) < spacing * 0.25;
      score += (perfect ? 15 : 10) + Math.min(streak, 10);
      ctx.hud.msg(`${perfect ? 'Perfect!' : 'Good!'} ${r.n} × ${r.k} = ${r.target}`, 'good');
    } else {
      r.state = 'wrong';
      r.picked = lane;
      misses++;
      streak = 0;
      ctx.hud.msg(`${r.n} × ${r.k} = ${r.target} comes next, not ${r.values[lane]}`, 'bad');
    }
    hud();
  }

  function hud() {
    ctx.hud.score(score);
    ctx.hud.info(streak > 1 ? `Streak ${streak} 🔥` : `Count by ${(current() || rows.find((r) => r.state === 'falling') || song[Math.min(spawned, song.length - 1)]).n}s`);
  }

  ctx.listen(canvas, 'pointerdown', (e) => tap(Math.min(nLanes - 1, Math.floor(point(e).x / laneW))));
  ctx.listen(pads, 'pointerdown', (e) => {
    const b = e.target.closest('[data-lane]');
    if (!b) return;
    e.preventDefault();
    tap(Number(b.dataset.lane));
  });
  ctx.listen(window, 'keydown', (e) => {
    const lane = KEYS[e.key.toLowerCase()];
    if (lane === undefined || lane >= nLanes || e.repeat) return;
    e.preventDefault();
    tap(lane);
  });

  ctx.loop((dt) => {
    if (!done) {
      clock -= dt;
      if (clock <= 0) {
        clock += beat;
        pulse = 1;
        // a short rest between the two tables, with a banner
        const s = song[spawned];
        if (s && s.k === 1 && spawned > 0 && !s.rested) {
          s.rested = true;
          banner = { text: `Now count by ${s.n}s!`, t: beat * 2 };
        } else if (s) spawn();
      }
      for (const r of rows) r.y += speed * dt;
      for (const r of rows) {
        if (r.state === 'falling' && r.y > HIT_Y + spacing * 0.5) {
          r.state = 'missed';
          counted(r);
          misses++;
          streak = 0;
          ctx.hud.msg(`Missed! ${r.n} × ${r.k} = ${r.target} came next`, 'bad');
          hud();
        }
      }
      rows = rows.filter((r) => r.y < H + 40);
      if (spawned === song.length && rows.every((r) => r.state !== 'falling')) finish();
    }
    pulse = Math.max(0, pulse - dt * 3);
    if (banner) banner.t -= dt;
    if (banner && banner.t <= 0) banner = null;
    draw();
  });

  function finish() {
    done = true;
    const won = hits >= song.length * 0.7;
    ctx.after(600, () =>
      ctx.finish({
        title: won ? 'Great counting! 🥁' : 'Keep practising the beat',
        won,
        lines: [`Counted by ${tables.join(' and ')}`, `On the beat: ${hits} of ${song.length}`, `Best streak: ${best}`, `Score: ${score}`],
      })
    );
  }

  function draw() {
    const c = (n, fb) => ctx.color(n) || fb;
    g.fillStyle = c('--surface', '#fff');
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < nLanes; i++) {
      g.fillStyle = i % 2 ? c('--soft', '#f4efe4') : c('--surface', '#fff');
      g.fillRect(i * laneW, 52, laneW, H);
    }
    // the count so far, and the gap to fill
    g.fillStyle = c('--ink', '#222');
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '900 22px system-ui, sans-serif';
    const r0 = current() || rows.find((r) => r.state === 'falling');
    const n = r0 ? r0.n : tables[0];
    g.fillText(banner ? banner.text : `${said.slice(-4).join(', ')}${said.length ? ', ' : ''}?`, W / 2, 16);
    g.font = '800 13px system-ui, sans-serif';
    g.fillStyle = c('--muted', '#777');
    g.fillText(`counting by ${n}s`, W / 2, 38);
    // the line, pulsing on the beat
    g.fillStyle = c('--accent', '#e4572e');
    g.globalAlpha = 0.35 + pulse * 0.65;
    g.fillRect(0, HIT_Y - 3 - pulse * 3, W, 6 + pulse * 6);
    g.globalAlpha = 1;
    // the falling rows
    g.font = '900 22px system-ui, sans-serif';
    for (const r of rows) {
      r.values.forEach((v, i) => {
        const x = i * laneW + laneW / 2;
        let fill = c('--paper', '#fff');
        if (r.state === 'hit' && i === r.lane) fill = c('--good', '#2e7d32');
        else if (r.state !== 'falling' && r.state !== 'hit' && i === r.lane) fill = c('--good-bg', '#dff3e4');
        else if (r.state === 'wrong' && i === r.picked) fill = c('--bad', '#c62828');
        g.globalAlpha = r.state === 'falling' || i === r.lane || i === r.picked ? 1 : 0.35;
        g.fillStyle = fill;
        g.strokeStyle = c('--edge', '#333');
        g.lineWidth = 2;
        g.beginPath();
        g.roundRect(x - 36, r.y - 20, 72, 40, 12);
        g.fill();
        g.stroke();
        g.fillStyle = (r.state === 'hit' && i === r.lane) || (r.state === 'wrong' && i === r.picked) ? '#fff' : c('--ink', '#222');
        g.fillText(String(v), x, r.y + 1);
      });
      g.globalAlpha = 1;
    }
    g.font = '800 14px system-ui, sans-serif';
    g.fillStyle = c('--muted', '#777');
    for (let i = 0; i < nLanes; i++) g.fillText(`${i + 1}`, i * laneW + laneW / 2, H - 20);
  }

  hud();
  ctx.hud.msg('Tap the lane with the next number');

  return {
    state: () => ({
      lanes: nLanes,
      tables,
      hitY: HIT_Y,
      spacing,
      rows: rows.map((r) => ({ i: r.i, n: r.n, k: r.k, target: r.target, values: [...r.values], lane: r.lane, y: r.y, state: r.state })),
      current: current() ? current().i : null,
      total: song.length,
      spawned,
      hits,
      misses,
      streak,
      score,
      done,
    }),
  };
}
