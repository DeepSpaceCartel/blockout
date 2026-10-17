// A game on the phone, played turn by turn with @blockout/engine/match. Each
// turn moves through three screens, sized to the phone so nothing scrolls:
//
//   roll    big dice and a Roll button; then "Draw it ›" (or on by itself)
//   board   the board, as big as it fits: drawing the rectangle, the CPU's
//           turn and its explanation, and the results
//   answer  the question and the keypad
//   help    "Help me count": the rectangle on its own, its rows lighting up
//           one by one with the running total, then back to the answer
//
// The screen animates between the match's steps; a game left half-way just
// stops (every wait checks it's still the same game).
//
// A live class's game (live) plays the same turns, but the server rolls (the
// teacher's roll for the whole class, or yours on your turn in pairs), hears
// each answer, and ends the game. Pairs: your partner's moves show as they
// make them. The words, the board's catching up and the rewards are shared
// with the web game (@blockout/progress/classroom).
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Match from '@blockout/engine/match';
import * as Core from '@blockout/engine';
import * as Progress from '@blockout/progress';
import * as Settings from '@blockout/progress/settings';
import * as Stats from '@blockout/progress/stats';
import Board, { RectPicture } from './Board';
import { dragRect, drawnMessage } from './boardMath';
import * as Rewards from './rewards';
import * as Live from '@blockout/progress/classroom';
import * as Daily from '@blockout/progress/daily';
import { addToHistory, recordGame } from './history';
import { useTheme } from './theme';
import { usePlayerColors } from './looks';
import { Celebration, Rolling, Streak } from './effects';
import { Button, Die, Keypad } from './ui';

// For automated checks of the web build: BLOCKOUT_FAST (set before the page
// loads) makes every wait 20 times shorter, and BlockoutMobile.match is the game
const testing = Platform.OS === 'web' && typeof window !== 'undefined';
const pace = testing && window.BLOCKOUT_FAST ? 0.05 : 1;
const AUTO_ROLL_MS = 700 * pace; // before an auto roll, so "Your turn" can be read first
const AUTO_PLACE_MS = 900 * pace; // how long an auto-placed rectangle shows before the question
const INSTANT_CPU_MS = 600 * pace; // an instant CPU turn: just long enough to see it
const COUNT_STEP_MS = 850 * pace; // between skip-counting steps when helping
const PASS_MS = 1600 * pace;
const SCORED_MS = 1400 * pace;
const DRAW_IT_MS = 2500 * pace; // after a roll, on to the board by itself
const TRY_AGAIN = ['Not quite — try again!', 'Almost! Have another go.', 'Hmm, not that one. Try again!'];
const BONUS_ICONS = { first: '✨', speedy: '⚡', streak: '🔥', timer: '⏱️' };
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
// "an 8", "an 11", "an 18", but "a 7"
const article = (n) => (/^(8|11|18)$/.test(String(n)) || /^8\d$/.test(String(n)) ? 'an' : 'a');

// setup: { mode, difficulty, size, players }; progress: the save (changed in
// place); onSave() after every change to it; toast(title, text) for bonuses;
// onEarned(achievements) for their banners and stickers; onExit() back to the
// menu; onAgain() a new game.
// settings: the Settings (read once: they don't change mid-game, as on the web).
// live: a live class's game: { kind: 'class' | 'pair', view (the server's,
// updated as it changes), session, client, me (pairs: your player), onOver()
// when its results are up }; onExit then leaves the class.
export default function Game({ setup, settings = Settings.DEFAULT_SETTINGS, progress, onSave, toast, onEarned, onExit, onAgain, live = null }) {
  const t = useTheme();
  const PLAYER_COLORS = usePlayerColors(); // (the Wardrobe's colours)
  const [, setTick] = useState(0);
  const redraw = () => setTick((n) => n + 1);
  const alive = useRef(true);
  const m = useRef(null);
  const cfg = useRef(settings).current;
  const CPU_STEP_MS = (Settings.CPU_STEP_MS[cfg.cpuSpeed] || 1000) * pace;
  const placeMode = cfg.placeMode; // 'draw', 'click' (tap to place) or 'auto'
  // Real dice: rolled at the table and tapped in (not for the paired dice of Tricky and up)
  const realDice = cfg.diceMode === 'real' && !Core.usesPairDice(setup.difficulty);
  if (!m.current) m.current = Match.createMatch({ ...setup, firstInCorner: cfg.firstInCorner === true || cfg.firstInCorner === 'true', fitMode: cfg.fitRolls, answerBonus: Progress.answerBonus });
  const match = m.current;
  if (testing) window.BlockoutMobile = { match, Match, live };
  // a live game: the round (or pairs turn) it's at, whether this one's answer
  // went to the server, and what of the server's match is on the board
  const lc = useRef(null);
  if (!lc.current) {
    lc.current = { round: 0, reported: true, doneTurn: 0, synced: 0, passSeen: 0, rollShown: null, note: '' };
    match.teacherPlayer = Boolean(live && live.session.teacher);
    if (live && live.kind === 'class' && Live.rejoinClass(match, live.view.you)) toast(`🏫 Back in class ${live.view.code}`, `You have ${live.view.you.score} points.`);
  }
  const gen = useRef(0); // a new roll from the teacher stops whatever the last one was still doing

  const [area, setArea] = useState(null); // { width, height } below the header
  const [view, setView] = useState('roll'); // 'roll' | 'board' | 'answer' | 'help'
  const [msg, setMsg] = useState('');
  const [oops, setOops] = useState(false);
  const [dice, setDice] = useState([null, null]);
  const [rolling, setRolling] = useState(false); // (the dice are spinning, in the Wardrobe's roll look)
  const [rolled, setRolled] = useState(false); // the roll is in: "Draw it ›"
  const [drag, setDrag] = useState(null);
  const [preview, setPreview] = useState(null);
  const [hide, setHide] = useState(null);
  const [counting, setCounting] = useState(null);
  const [steps, setSteps] = useState([]);
  const [entry, setEntry] = useState('');
  const [feedback, setFeedback] = useState(null); // { text, kind: 'good' | 'try' | 'help' }
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(null); // { results }
  const [helpDone, setHelpDone] = useState(false); // counted: "I know it! ›"
  const [goOn, setGoOn] = useState(null); // after a CPU turn: the "My turn ›" button's label
  const [picked, setPicked] = useState([null, null]); // real dice: what was tapped in
  const [tapped, setTapped] = useState(null); // tap to place: the rectangle shown, with valid
  const [rotated, setRotated] = useState(false);
  const lastTap = useRef(null);
  const goOnPressed = useRef(null);
  const helpStarted = useRef(0);
  const answerStart = useRef(0);
  const pausedMs = useRef(0);
  const turnId = useRef(0); // (so a late "on by itself" doesn't skip a turn)

  useEffect(
    () => () => {
      alive.current = false;
      stopClock();
    },
    []
  );

  // ---- the answer timer (Expert's, or Home multiplayer's from Settings). It
  // pauses while counting; when it runs out the rectangle comes off.
  const clock = useRef(null); // { total, remaining, last, paused, interval }
  const [timeLeft, setTimeLeft] = useState(null);
  const [answering, setAnswering] = useState(null); // the rectangle on the answer screen
  function startClock() {
    stopClock();
    if (!setup.timerMs) return;
    const c = { total: setup.timerMs, remaining: setup.timerMs, last: Date.now(), paused: false };
    c.interval = setInterval(() => {
      const now = Date.now();
      if (!c.paused) c.remaining -= now - c.last;
      c.last = now;
      setTimeLeft(Math.max(0, c.remaining));
      if (c.remaining <= 0) {
        stopClock();
        answerTimeout();
      }
    }, 100);
    clock.current = c;
    setTimeLeft(c.total);
  }
  function stopClock() {
    if (clock.current) clearInterval(clock.current.interval);
    clock.current = null;
  }
  function pauseClock(paused) {
    if (!clock.current) return;
    clock.current.paused = paused;
    clock.current.last = Date.now();
  }

  // Out of time: the answer shows, the rectangle comes off, no points
  async function answerTimeout() {
    if (!alive.current || match.phase !== 'answer') return;
    const res = Match.timeout(match);
    report({ kind: 'timeout' });
    Rewards.onTimeout(progress, match, res);
    onSave();
    setBusy(true);
    setView('answer');
    setEntry(String(res.rect.area));
    setFeedback({ kind: 'try', text: `⏰ Time's up! ${res.rect.a} × ${res.rect.b} = ${res.rect.area}. No points this turn.` });
    redraw();
    await wait(3000 * pace);
    setBusy(false);
    setTimeLeft(null);
    return nextTurn();
  }
  // Resolves after ms, or never once the game is left
  const wait = useCallback((ms) => {
    const g = gen.current;
    return new Promise((resolve) => setTimeout(() => alive.current && g === gen.current && resolve(), ms));
  }, []);

  const who = (p) => (match.mode === 'single' && !p.cpu ? 'You' : p.name);
  const mine = () => !Match.currentPlayer(match).cpu;
  const award = (earned) => onEarned(earned);

  // ---- turns

  async function rollAnimation() {
    const face = (list) => list[Math.floor(Math.random() * list.length)];
    setRolling(true);
    for (let i = 0; i < 10; i++) {
      setDice([face(match.faces.a), face(match.faces.b)]);
      await wait(60 * Math.max(pace, 0.5));
    }
    setRolling(false);
  }

  function startTurn() {
    turnId.current++;
    helpPlan.current = null;
    setView('roll');
    setDice([null, null]);
    setRolled(false);
    setSteps([]);
    setFeedback(null);
    setEntry('');
    setOops(false);
    if (live) return liveTurn();
    if (match.phase === 'cpu') return runCpu();
    const p = Match.currentPlayer(match);
    const first = Match.mustUseCorner(match) ? ' Your first rectangle goes in the top-left corner.' : '';
    setPicked([null, null]);
    setTapped(null);
    if (realDice) {
      setMsg(`${match.mode === 'multi' ? `${p.name}: roll` : 'Roll'} your two dice, then tap the numbers you got.${first}`);
      redraw();
      return;
    }
    if (cfg.autoRoll === 'auto') {
      // Auto roll: the dice roll by themselves, after a moment to read whose turn it is
      setMsg(match.mode === 'multi' ? `${p.name}: rolling the dice…${first}` : `Rolling the dice…${first}`);
      redraw();
      const turn = turnId.current;
      wait(AUTO_ROLL_MS).then(() => turn === turnId.current && humanRoll());
      return;
    }
    setMsg(match.mode === 'multi' ? `${p.name}, roll the dice!${first}` : `Roll the dice!${first}`);
    redraw();
  }

  function nextTurn() {
    if (live) return startTurn(); // (the server ends these games)
    const results = Match.endTurn(match);
    if (results) return finish(results);
    startTurn();
  }

  async function humanRoll() {
    if (match.phase !== 'roll' || busy) return;
    if (live) return pairRoll(); // (the server rolls for a pairs game)
    setBusy(true);
    setMsg('');
    await rollAnimation();
    const [a, b] = Match.roll(match);
    setBusy(false);
    return rolledDice(a, b);
  }

  // Real dice: the numbers rolled at the table
  function useRealDice() {
    if (match.phase !== 'roll' || !picked[0] || !picked[1]) return;
    const [a, b] = Match.roll(match, picked);
    return rolledDice(a, b);
  }

  async function rolledDice(a, b) {
    setDice([a, b]);
    if (match.phase === 'stuck') {
      report({ kind: 'pass' }); // (whole class: the server checks it; pairs: it passes for you)
      setMsg(`No room for a ${a} × ${b} anywhere. ${match.mode === 'multi' ? `${Match.currentPlayer(match).name} passes` : 'You pass'}.`);
      redraw();
      await wait(PASS_MS);
      Match.pass(match);
      return nextTurn();
    }
    setMsg(`You rolled ${a} and ${b}!`);
    setRolled(true);
    const turn = turnId.current;
    wait(DRAW_IT_MS).then(() => turn === turnId.current && match.phase === 'place' && toBoard());
  }

  // From the roll to placing it: drawing it, tapping where it goes, or auto
  async function toBoard() {
    if (match.phase !== 'place') return;
    const [a, b] = match.dice;
    const corner = Match.mustUseCorner(match);
    setRolled(false);
    setView('board');
    if (placeMode === 'auto') {
      // placed snugly for you, shown a moment, then the math
      const spot = Match.autoSpot(match);
      setMsg(`Placing your ${a} by ${b} rectangle…`);
      setTapped({ ...spot, valid: true });
      await wait(AUTO_PLACE_MS);
      setTapped(null);
      return onDraw(spot);
    }
    if (placeMode === 'click') {
      setRotated(Match.startRotated(match));
      lastTap.current = null;
      setMsg(corner ? `Tap the board to put your ${a} by ${b} rectangle in the top-left corner, then tap it again.` : `Tap where your ${a} by ${b} rectangle goes, then tap it again to place it.`);
      return;
    }
    setMsg(`Draw a ${a} by ${b} rectangle: ${corner ? 'start on the top-left square and drag.' : 'press on a square and drag.'}`);
  }

  // Tap to place: the first tap shows it there; tapping it again places it
  function onTap(cell) {
    if (match.phase !== 'place') return;
    const inside = tapped && cell.c >= tapped.x && cell.c < tapped.x + tapped.w && cell.r >= tapped.y && cell.r < tapped.y + tapped.h;
    if (inside && tapped.valid) {
      const { x, y, w, h } = tapped;
      setTapped(null);
      return onDraw({ x, y, w, h });
    }
    lastTap.current = cell;
    const p = Match.previewAt(match, cell, rotated);
    setTapped(p);
    showPartner('place', p);
    setOops(!p.valid);
    if (!p.valid) setMsg('It bumps into another rectangle there. Tap another spot!');
    else setMsg('Tap it again to place it here, or tap somewhere else.');
  }

  function rotate() {
    const next = !rotated;
    setRotated(next);
    if (lastTap.current) setTapped(Match.previewAt(match, lastTap.current, next));
  }

  function onDrag(d) {
    if (!d || match.phase !== 'place') return setDrag(null);
    setDrag({ ...d, verdict: Match.judge(match, dragRect(d)) });
    showPartner('place', dragRect(d));
  }

  function onDraw(rect) {
    setDrag(null);
    if (match.phase !== 'place') return;
    const res = Match.place(match, rect);
    if (!res.ok) {
      setMsg(drawnMessage(rect, match.dice, res.verdict));
      setOops(true);
      return;
    }
    setOops(false);
    setEntry('');
    setFeedback(null);
    answerStart.current = Date.now();
    pausedMs.current = 0;
    setAnswering(res.rect);
    setView('answer');
    showPartner('answer', res.rect);
    startClock();
  }

  // ---- answering

  function onKey(key) {
    if (match.phase !== 'answer' || busy) return;
    if (key === 'check') return check(entry);
    let next = entry;
    if (key === 'back') next = entry.slice(0, -1);
    else if (entry.length < 3) next = (entry === '0' ? '' : entry) + key;
    setEntry(next);
    if (Match.answerDecided(next, match.pending.rect.area)) check(next);
  }

  async function check(value) {
    if (value === '' || match.phase !== 'answer') return;
    const ms = Date.now() - answerStart.current - pausedMs.current;
    // the timer bonus goes by how much time was left
    const c = clock.current;
    const timer = c && setup.timer ? { secs: setup.timer, left: c.remaining / c.total } : null;
    const res = Match.answer(match, value, { ms, timer });
    if (res.correct) {
      stopClock();
      setBusy(true);
      const squares = `+${res.rect.area} ${res.rect.area === 1 ? 'square' : 'squares'}`;
      setFeedback({ text: res.firstTry ? `Correct! ${squares} 🎉` : `You got it! ${squares}`, kind: 'good' });
      report({ kind: 'placed', rect: { x: res.rect.x, y: res.rect.y, w: res.rect.w, h: res.rect.h }, firstTry: res.firstTry, ms: Math.round(ms) });
      for (const part of res.bonus.parts) toast(`${BONUS_ICONS[part.label.split(' ')[0]] || '⭐'} ${capitalize(part.label)}`, `+${part.points} bonus points`);
      award(Rewards.onAnswer(progress, match, res, ms));
      onSave();
      redraw();
      await wait(SCORED_MS);
      setBusy(false);
      setCounting(null);
      setTimeLeft(null);
      return nextTurn();
    }
    setEntry('');
    setFeedback({ text: TRY_AGAIN[(res.attempts - 1) % TRY_AGAIN.length], kind: 'try' });
    if (res.helpNow) {
      setBusy(true);
      await wait(900 * Math.max(pace, 0.2)); // ("Not quite" first)
      setBusy(false);
      helpCount("Let's count them together!");
    }
  }

  // The first time a turn: the help counts (fact stats, achievements). After
  // that, "Count again" replays the same counting (again: the plan kept here).
  const helpPlan = useRef(null);
  async function helpCount(intro = null, again = false) {
    if (match.phase !== 'answer') return;
    const rect = match.pending.rect;
    let h = helpPlan.current;
    if (!again) {
      h = Match.help(match);
      if (!h) return;
      helpPlan.current = h;
      award(Rewards.onHelp(progress, match, rect));
      onSave();
    }
    if (!h) return;
    helpStarted.current = Date.now();
    pauseClock(true);
    setHelpDone(false);
    setCounting(null);
    setView('help');
    if (h.split) {
      const s = h.split;
      setFeedback({ kind: 'help', text: `Split ${s.teen} into 10 and ${s.ones}: 10 × ${s.other} = ${s.tens}, and ${s.ones} × ${s.other} = ${s.rest}. Now add them up!` });
      setHelpDone(true);
      return;
    }
    const plan = h.count;
    const units = plan.steps === 1 ? plan.unit : `${plan.unit}s`;
    setFeedback({ kind: 'help', text: intro || `${plan.steps} ${units} of ${plan.group}. Let's count${again ? ' again' : ''}!` });
    await wait(COUNT_STEP_MS);
    for (let i = 1; i <= plan.steps; i++) {
      setFeedback({ kind: 'help', text: `${plan.steps} ${units} of ${plan.group}: ${plan.totals.slice(0, i).join(', ')}` });
      setCounting({ byRows: plan.byRows, group: plan.group, shown: i });
      await wait(COUNT_STEP_MS);
    }
    setFeedback({ kind: 'help', text: `${plan.totals.join(', ')}. So what is ${rect.a} × ${rect.b}?` });
    setHelpDone(true);
  }

  // From counting back to the answer (the time spent counting doesn't count against them)
  function backToAnswer() {
    pausedMs.current += Date.now() - helpStarted.current;
    pauseClock(false);
    setFeedback(null);
    setEntry('');
    setView('answer');
  }

  // ---- the CPU's turn: roll, then on the board: draw it growing, explain the counting

  // After a CPU turn: on by itself, or (Settings › After a CPU turn) a button
  // to press, unless the game is over anyway
  async function afterCpu(delay) {
    if (cfg.cpuEnd !== 'button' || Match.isOver(match)) return wait(delay);
    const next = match.players[(match.current + 1) % match.players.length];
    setGoOn(match.mode === 'single' ? 'My turn ›' : next.cpu ? `${next.name} ›` : `${next.name}'s turn ›`);
    await new Promise((resolve) => (goOnPressed.current = resolve));
    setGoOn(null);
  }

  // Instant CPU turns: roll, place and score straight away, no explanation
  async function runInstantCpu() {
    const p = Match.currentPlayer(match);
    const { dice: [a, b], rect } = Match.cpuTurn(match);
    setDice([a, b]);
    setView('board');
    setMsg(rect ? `${p.name} rolled ${a} and ${b}: ${a} × ${b} = ${rect.area}.` : `${p.name} rolled ${a} and ${b}: no room, so it passes.`);
    redraw();
    await wait(INSTANT_CPU_MS);
    return nextTurn();
  }

  async function runCpu() {
    if (cfg.cpuSteps === 'instant') return runInstantCpu();
    const p = Match.currentPlayer(match);
    setMsg(`${p.name} is rolling…`);
    redraw();
    await wait(CPU_STEP_MS);
    await rollAnimation();
    const firstOnBoard = match.board.rects.length === 0;
    const { dice: [a, b], rect } = Match.cpuTurn(match);
    setDice([a, b]);
    if (!rect) {
      setMsg(`No room for a ${a} × ${b} anywhere. ${p.name} passes.`);
      redraw();
      await afterCpu(PASS_MS);
      return nextTurn();
    }
    setMsg(`${p.hello ? `${p.hello} ` : ''}${p.name} rolled ${a} and ${b}.`); // (with the CPU character's greeting)
    setHide(rect);
    await wait(CPU_STEP_MS * 1.2);
    setMsg('');
    setView('board');
    const lines = [`I rolled ${article(a)} ${a} and ${article(b)} ${b}. I'll draw it ${firstOnBoard ? 'in a corner' : 'snug against the others'}: ${rect.w} across and ${rect.h} down.`];
    setSteps([...lines]);
    for (let w = 1; w <= rect.w; w++) {
      setPreview({ ...rect, w, h: 1 });
      await wait(CPU_STEP_MS / 2);
    }
    for (let h = 2; h <= rect.h; h++) {
      setPreview({ ...rect, h });
      await wait(CPU_STEP_MS);
    }
    setPreview(null);
    setHide(null);
    const split = Match.legendSplit(rect, match.difficulty);
    if (split) {
      const s = split.split;
      lines.push(`Split ${s.teen} into 10 and ${s.ones}: ${s.tens} + ${s.rest} = ${rect.area}.`);
      setSteps([...lines]);
      await wait(CPU_STEP_MS * 2);
    } else if (a === 1 || b === 1) {
      lines.push(`It's just 1 ${a === 1 ? 'row' : 'column'} of ${a === 1 ? b : a}, so that's ${rect.area}.`);
      setSteps([...lines]);
      await wait(CPU_STEP_MS);
    } else {
      const plan = Match.countPlan(rect);
      const intro = `That's ${plan.steps} ${plan.unit}s of ${plan.group}. Let's count by ${plan.group}s:`;
      for (let i = 1; i <= plan.steps; i++) {
        setSteps([...lines, `${intro} ${plan.totals.slice(0, i).join(', ')}`]);
        setCounting({ rect, byRows: plan.byRows, group: plan.group, shown: i });
        await wait(CPU_STEP_MS);
      }
      lines.push(`${intro} ${plan.totals.join(', ')}`);
      setCounting(null);
    }
    lines.push(`${a} × ${b} = ${rect.area}`);
    setSteps([...lines]);
    redraw();
    await afterCpu(CPU_STEP_MS * 1.5);
    return nextTurn();
  }

  // ✕ in the middle of a game asks first: the game's points only count once it's finished
  function leave() {
    if (over) return onExit();
    const title = live ? 'Leave the class?' : 'Leave this game?';
    const text = live ? 'You can join again with the class code.' : "The points from this game won't count. (Your answers and achievements are kept.)";
    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n\n${text}`)) onExit();
      return;
    }
    Alert.alert(title, text, [
      { text: 'Keep playing', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: onExit },
    ]);
  }

  // ---- a live class's game

  const opponent = () => match.players[1 - live.me];

  // A turn in a live game: wait for the teacher's roll (whole class), or in
  // pairs roll on your turn and watch your partner's
  function liveTurn() {
    const c = lc.current;
    if (live.kind === 'class') {
      match.phase = 'wait';
      setMsg(c.round ? 'Waiting for the next roll…' : 'Get ready! Waiting for the first roll…');
      return redraw();
    }
    const m = live.view.match;
    if (m && !m.over && m.current === live.me && m.turn === c.round && m.turn !== c.doneTurn) {
      c.reported = false;
      match.phase = 'roll';
      const auto = live.view.settings.autoRoll;
      setMsg(`${c.note} ${auto ? 'Your turn! Rolling…' : 'Your turn: roll the dice!'}`.trim());
      c.note = '';
      redraw();
      const turn = turnId.current;
      if (auto) wait(AUTO_ROLL_MS).then(() => turn === turnId.current && humanRoll());
      return;
    }
    match.phase = 'wait';
    setView('board'); // (watch your partner's move)
    setMsg(m && m.current !== live.me ? `${opponent().name}'s turn…` : 'Waiting…');
    redraw();
  }

  // Tell the server how this roll went (once per roll)
  function report(result) {
    const c = lc.current;
    if (!live || c.reported) return;
    c.reported = true;
    c.doneTurn = c.round;
    live.client.sendResult(live.session, { round: c.round, ...result }).catch((err) => {
      if (err.code !== 'stale' && err.code !== 'done') toast('⚠️ Couldn’t send your answer', err.message);
    });
  }

  // Pairs: your roll, from the server (it passes for you when nothing fits)
  async function pairRoll() {
    const c = lc.current;
    setBusy(true);
    setMsg('');
    match.phase = 'rolling';
    let res;
    try {
      res = await live.client.roll(live.session);
    } catch (err) {
      match.phase = 'roll';
      setBusy(false);
      if (err.code !== 'turn' && err.code !== 'stale') toast('⚠️ Couldn’t roll', err.message);
      return redraw();
    }
    await rollAnimation();
    setBusy(false);
    const [a, b] = res.roll;
    setDice([a, b]);
    if (res.passed) {
      c.reported = true;
      c.doneTurn = c.round;
      match.phase = 'wait';
      return setMsg(`No room for a ${a} × ${b} anywhere. You pass.`);
    }
    match.phase = 'roll';
    Match.roll(match, [a, b]);
    return rolledDice(a, b);
  }

  // Pairs: what you're doing on your turn (the rectangle you're dragging or
  // aiming, then the one you're answering) for your partner to watch: when it
  // changes, a few times a second at most. Only a preview: misses don't matter.
  const partnerFeed = useRef({ sent: '', timer: null });
  function showPartner(phase, rect) {
    if (!live || live.kind !== 'pair' || match.current !== live.me) return;
    const f = partnerFeed.current;
    const key = JSON.stringify({ phase, rect: rect ? { x: rect.x, y: rect.y, w: rect.w, h: rect.h } : null });
    if (key === f.sent) return;
    f.sent = key;
    if (f.timer) return; // (the latest goes out when the timer fires)
    const send = () => {
      f.timer = null;
      if (alive.current) live.client.live(live.session, JSON.parse(f.sent)).catch(() => {});
    };
    send();
    f.timer = setTimeout(send, 120);
  }

  // Whole class: a new roll from the teacher. If you were still working on the
  // last one, it's gone.
  async function classView(view) {
    const c = lc.current;
    if (view.state === 'ended') return over ? null : finishClass(view);
    if (view.state !== 'playing' || view.round <= c.round) {
      if (!c.round && match.phase === 'roll') startTurn(); // (no roll yet: get ready)
      return;
    }
    if (!['wait', 'over'].includes(match.phase)) {
      gen.current++; // (stop whatever the last roll was still doing)
      stopClock();
      if (!c.reported) {
        Live.skipUnfinished(match);
        toast('⏭️ Next roll!', 'Your teacher moved on before you finished that one.');
      }
    }
    c.round = view.round;
    startTurn();
    setBusy(false);
    setTimeLeft(null);
    setCounting(null);
    const [a, b] = view.roll;
    if (view.you.done) {
      // no room for this roll (the server checks), or you'd answered it already
      c.reported = true;
      setDice([a, b]);
      if (view.you.result === 'pass') setMsg(`No room for a ${a} × ${b} anywhere. You pass this time.`);
      return;
    }
    c.reported = false;
    await rollAnimation();
    match.phase = 'roll';
    Match.roll(match, [a, b]);
    rolledDice(a, b);
  }

  // Pairs: bring the board and the turn up to date
  async function pairView(view) {
    if (over) return;
    const c = lc.current;
    const m = view.match;
    if (!m) return;
    const note = Live.syncPair(match, m, live.me, c);
    if (m.over) return finishPair(view);
    const myTurn = m.current === live.me;
    const newTurn = m.turn !== c.round;
    if (newTurn) c.round = m.turn;
    if (newTurn && myTurn && ['wait', 'roll'].includes(match.phase)) {
      c.note = note;
      return startTurn();
    }
    // your partner's move as they make it: dragging, then answering
    const partner = !myTurn && m.live && m.live.by !== view.you.id ? m.live : null;
    setPreview(partner && partner.rect ? partner.rect : null);
    if (!myTurn && match.phase === 'wait') {
      if (m.roll) {
        setMsg(Live.partnerLine(opponent().name, m.roll, partner));
        if (c.rollShown !== m.turn) {
          c.rollShown = m.turn;
          await rollAnimation();
          setDice(m.roll);
        }
      } else if (newTurn || note) {
        setDice([null, null]);
        setMsg(`${note} ${opponent().name}'s turn…`.trim());
      }
    }
    redraw();
  }

  useEffect(() => {
    if (!live) return;
    if (live.kind === 'class') classView(live.view);
    else pairView(live.view);
  }, [live && live.view]);

  function finishLive() {
    if (live.onOver) live.onOver();
    gen.current++;
    stopClock();
    match.phase = 'over';
    match.pending = null;
    setPreview(null);
    setTimeLeft(null);
    setView('board');
  }

  function finishClass(view) {
    finishLive();
    const p = match.players[0];
    Object.assign(p, { score: view.you.score, squares: view.you.squares, bonus: view.you.bonus });
    if (!match.teacherPlayer) {
      const { earned, entry } = Live.classRewards(progress, view, p, { startedAt: match.startedAt, statsName: Rewards.STATS_NAME });
      award(earned);
      onSave();
      addToHistory(entry);
    }
    const result = Live.classResult(view);
    setOver({ live: result, celebrate: result.celebrate });
  }

  function finishPair(view) {
    finishLive();
    if (match.teacherPlayer) {
      // (the teacher's games don't count)
    } else if (view.type === 'tournament') {
      Live.tournamentGamePoints(progress, view, live.me); // (the tournament's own rewards come at the end)
      onSave();
    } else {
      const { earned, entry } = Live.pairRewards(progress, view, live.me, match.players[live.me], { startedAt: match.startedAt, statsName: Rewards.STATS_NAME });
      award(earned);
      onSave();
      addToHistory(entry);
    }
    const result = Live.pairResult(view, live.me, Core.emptyCount(match.board));
    setOver({ live: result, celebrate: result.won });
  }

  // ---- the end

  function finish(results) {
    const rewards = Rewards.onGameOver(progress, match, results);
    if (Rewards.countsForStats(match)) recordGame(match, results); // (two players on one phone: just for fun)
    if (rewards.boardBonus) toast(`🏁 Finished ${article(match.size)} ${match.size}×${match.size} game!`, `+${rewards.boardBonus} bonus points`);
    award(rewards.earned);
    const daily = match.mode === 'single' && Daily.complete(progress, { kind: 'game', size: match.size, difficulty: match.difficulty, won: results.humanWon }); // (today's practice?)
    if (daily) {
      toast(...daily.toast);
      award(daily.earned);
    }
    onSave();
    setOver({ results });
    setView('board');
    redraw();
  }

  useEffect(() => {
    if (!live || live.kind !== 'class') startTurn(); // (once, for the match this screen was made with; a class's waits for its view)
  }, []);

  // ---- the screens

  const side = (reserve) => (area ? Math.max(120, Math.min(area.width - 32, area.height - reserve, 620)) : 0);
  const current = match.current;

  return (
    <View style={[styles.fill, { backgroundColor: t.bg }]}>
      <Header match={match} who={who} over={over} onExit={leave} showProgress={cfg.showProgress === true || cfg.showProgress === 'true'} />
      <View style={styles.fill} onLayout={(e) => setArea(e.nativeEvent.layout)}>
        {!area ? null : view === 'roll' ? (
          <View style={styles.rollScreen}>
            <View style={styles.bigDice}>
              <Rolling rolling={rolling}>
                <Die value={realDice && match.phase === 'roll' ? picked[0] : dice[0]} size={Math.min(realDice ? 90 : 130, area.width * 0.32)} />
              </Rolling>
              <Text style={[styles.bigTimes, { color: t.muted }]}>×</Text>
              <Rolling rolling={rolling}>
                <Die value={realDice && match.phase === 'roll' ? picked[1] : dice[1]} size={Math.min(realDice ? 90 : 130, area.width * 0.32)} />
              </Rolling>
            </View>
            <Text testID="turn-msg" style={[styles.rollMsg, { color: t.ink }]}>
              {msg || ' '}
            </Text>
            {match.phase === 'roll' && mine() && realDice ? (
              <View style={styles.picks}>
                {[0, 1].map((i) => (
                  <View key={i} style={styles.pickRow} accessibilityRole="radiogroup" accessibilityLabel={i ? 'Second die' : 'First die'}>
                    {Array.from({ length: Core.DIFFICULTY_SIDES[match.difficulty] || 6 }, (_, k) => k + 1).map((n) => (
                      <Pressable
                        key={n}
                        testID={`pick-${i}-${n}`}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: picked[i] === n }}
                        onPress={() => setPicked(i ? [picked[0], n] : [n, picked[1]])}
                        style={[styles.pick, { backgroundColor: picked[i] === n ? t.accentSoft : t.surface, borderColor: picked[i] === n ? t.accent : t.line }]}
                      >
                        <Text style={[styles.pickText, { color: t.ink }]}>{n}</Text>
                      </Pressable>
                    ))}
                  </View>
                ))}
                <Button testID="use-dice" title="Use these dice ›" onPress={useRealDice} disabled={!picked[0] || !picked[1]} />
              </View>
            ) : null}
            {match.phase === 'roll' && mine() && !realDice && cfg.autoRoll !== 'auto' ? <Button testID="roll" title="Roll the dice" onPress={humanRoll} disabled={busy} style={styles.wide} /> : null}
            {rolled ? <Button testID="draw-it" title="Draw it ›" onPress={toBoard} style={styles.wide} /> : null}
          </View>
        ) : view === 'board' ? (
          <View style={styles.boardScreen}>
            <Board
              match={match}
              width={side((over ? 300 : steps.length ? 214 : 150) + (goOn ? 64 : 0) + (placeMode === 'click' && match.phase === 'place' ? 64 : 0))}
              drag={drag}
              preview={preview}
              hide={hide}
              counting={counting}
              canDraw={match.phase === 'place' && mine() && placeMode === 'draw'}
              onDrag={onDrag}
              onDraw={onDraw}
              canTap={match.phase === 'place' && mine() && placeMode === 'click'}
              onTap={onTap}
              tapped={tapped}
            />
            {match.phase === 'place' && mine() && placeMode === 'click' && match.dice && match.dice[0] !== match.dice[1] && !Match.mustUseCorner(match) ? (
              <Button testID="rotate" kind="secondary" title="↻ Turn it" onPress={rotate} style={styles.wide} />
            ) : null}
            {over ? null : (
              <View style={styles.diceRow} accessibilityLabel={dice[0] ? `Rolled ${dice[0]} and ${dice[1]}` : undefined}>
                <Die value={dice[0]} size={52} />
                <Text style={[styles.times, { color: t.muted }]}>×</Text>
                <Die value={dice[1]} size={52} />
              </View>
            )}
            {goOn ? <Button testID="go-on" title={goOn} onPress={() => goOnPressed.current && goOnPressed.current()} style={styles.wide} /> : null}
            {over && over.live ? (
              <LiveResults over={over} tournament={live.view.tournament ? Live.tournamentLine(live.view.tournament) : null} teacherPlayer={match.teacherPlayer} onLeave={onExit} />
            ) : over ? (
              <Results over={over} match={match} who={who} onAgain={onAgain} onExit={onExit} />
            ) : steps.length ? (
              <View style={[styles.steps, { backgroundColor: t.surface, borderColor: t.line }]}>
                {steps.slice(-3).map((s, i, shown) => (
                  <Text key={i} style={[styles.step, { color: t.ink }, i === shown.length - 1 && /^\d+ × \d+ = \d+$/.test(s) ? styles.stepBig : null]}>
                    {s}
                  </Text>
                ))}
              </View>
            ) : (
              <Text testID="turn-msg" style={[styles.msg, { color: oops ? t.bad : t.ink }]}>
                {msg}
              </Text>
            )}
          </View>
        ) : view === 'help' ? (
          <HelpScreen area={area} rect={match.pending.rect} color={PLAYER_COLORS[current % PLAYER_COLORS.length]} counting={counting} text={feedback ? feedback.text : ''} done={helpDone} onBack={backToAnswer} />
        ) : (
          <AnswerScreen
            rect={answering}
            timeLeft={timeLeft}
            timeTotal={setup.timerMs}
            entry={entry}
            feedback={feedback}
            busy={busy}
            streak={Match.currentPlayer(match).streak}
            help={!match.pending || match.expert ? null : match.pending.helped ? 'again' : 'first'}
            onKey={onKey}
            onHelp={() => helpCount(null, Boolean(match.pending && match.pending.helped))}
          />
        )}
      </View>
      {over && (over.live ? over.celebrate : over.results.winners.length === 1 && !over.results.winners[0].cpu) ? <Celebration /> : null}
    </View>
  );
}

// "Help me count": the rectangle as big as it fits, its rows lighting up
function HelpScreen({ area, rect, color, counting, text, done, onBack }) {
  const t = useTheme();
  const below = 120 + 72; // the words and the button
  return (
    <View style={styles.helpScreen}>
      <RectPicture rect={rect} color={color} counting={counting} maxWidth={area.width - 32} maxHeight={Math.max(80, area.height - below - 32)} />
      <Text testID="help-text" style={[styles.helpText, { color: t.ink }]}>
        {text}
      </Text>
      <Button testID="help-done" title="I know it! ›" onPress={onBack} disabled={!done} style={styles.wide} />
    </View>
  );
}

// Scores, and ✕ back to the menu; with Settings › Board progress, how full the board is
function Header({ match, who, over, onExit, showProgress }) {
  const t = useTheme();
  const PLAYER_COLORS = usePlayerColors(); // (the Wardrobe's colours)
  const total = match.size * match.size;
  const filled = total - Core.emptyCount(match.board);
  return (
    <View>
    <View style={styles.header}>
      <Pressable onPress={onExit} accessibilityRole="button" accessibilityLabel="Main menu" hitSlop={10} style={[styles.close, { borderColor: t.line, backgroundColor: t.surface }]}>
        <Text style={[styles.closeText, { color: t.ink }]}>✕</Text>
      </Pressable>
      {match.players.map((p, i) => (
        <View key={i} style={[styles.score, { borderColor: i === match.current && !over ? PLAYER_COLORS[i] : t.line, backgroundColor: t.surface }]}>
          <View style={[styles.swatch, { backgroundColor: PLAYER_COLORS[i] }]} />
          <View style={styles.scoreWho}>
            <Text style={[styles.scoreName, { color: t.ink }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} accessibilityLabel={who(p)}>
              {p.avatar ? `${p.avatar} ` : ''}
              {match.players.length > 2 ? who(p).replace(/^Player /, 'P') : who(p)}
            </Text>
            {p.title ? (
              <Text testID="player-title" style={[styles.scoreTitle, { color: t.muted }]} numberOfLines={1}>
                {p.title}
              </Text>
            ) : null}
          </View>
          <Text style={[styles.scorePts, { color: t.ink }]}>{p.score}</Text>
        </View>
      ))}
    </View>
    {showProgress ? (
      <View style={styles.progress} accessibilityLabel={`Board: ${filled} of ${total} filled`}>
        <Text testID="board-progress" style={[styles.progressText, { color: t.muted }]}>
          Board: {filled} of {total} filled
        </Text>
        <View style={[styles.progressBar, { backgroundColor: t.soft }]}>
          <View style={{ width: `${(filled / total) * 100}%`, height: '100%', backgroundColor: PLAYER_COLORS[match.current % PLAYER_COLORS.length], borderRadius: 4 }} />
        </View>
      </View>
    ) : null}
    </View>
  );
}

// The question and the keypad
// help: 'first' ("Help me count"), 'again' ("Count again") or null (Expert)
// timeLeft / timeTotal (ms): the answer timer, when there is one
function AnswerScreen({ rect, entry, feedback, busy, help, onKey, onHelp, streak = 0, timeLeft = null, timeTotal = 0 }) {
  const t = useTheme();
  if (!rect) return null;
  const low = timeLeft !== null && timeLeft <= 5000;
  return (
    <View style={styles.answerScreen}>
      {timeLeft !== null && timeTotal ? (
        <View style={styles.timer} accessibilityLabel={`${Math.ceil(timeLeft / 1000)} seconds left`}>
          <Text testID="timer" style={[styles.timerText, { color: low ? t.bad : t.ink }]}>
            ⏱️ {Math.ceil(timeLeft / 1000)} s
          </Text>
          <View style={[styles.timerBar, { backgroundColor: t.soft }]}>
            <View style={{ width: `${(timeLeft / timeTotal) * 100}%`, height: '100%', backgroundColor: low ? t.bad : t.good, borderRadius: 5 }} />
          </View>
        </View>
      ) : null}
      <Streak n={streak} color={t.goldInk} />
      <View style={styles.questionRow}>
        <Text style={[styles.question, { color: t.ink }]}>
          {rect.a} × {rect.b} =
        </Text>
        <View testID="answer-box" style={[styles.answerBox, { borderColor: feedback && feedback.kind === 'good' ? t.good : t.edge, backgroundColor: t.surface }]}>
          <Text style={[styles.answerText, { color: t.ink }]}>{entry || ' '}</Text>
        </View>
      </View>
      <Text testID="feedback" numberOfLines={2} style={[styles.feedback, { color: !feedback ? t.muted : feedback.kind === 'good' ? t.goodInk : feedback.kind === 'try' ? t.bad : t.ink }]}>
        {feedback ? feedback.text : 'How many squares did you just draw?'}
      </Text>
      <Keypad onKey={onKey} disabled={busy} />
      {help ? <Button testID="help" kind="secondary" title={help === 'again' ? 'Count again' : 'Help me count'} onPress={onHelp} disabled={busy} /> : null}
    </View>
  );
}

function Results({ over, match, who, onAgain, onExit }) {
  const t = useTheme();
  const PLAYER_COLORS = usePlayerColors(); // (the Wardrobe's colours)
  const { results } = over;
  const winner = results.winners[0];
  const title = results.tie ? "It's a tie!" : match.mode === 'single' ? (winner.cpu ? `${winner.name} wins!` : 'You win! 🎉') : `${winner.name} wins! 🎉`;
  const top = results.ranked[0].score;
  return (
    <View testID="results" style={[styles.results, { backgroundColor: t.paper, borderColor: t.line }]}>
      <Text style={[styles.resultTitle, { color: t.ink }]}>{title}</Text>
      <Text style={[styles.resultSub, { color: t.muted }]}>{results.empty === 0 ? 'The board is completely full!' : `Nobody could fit a rectangle. ${results.empty} squares left empty.`}</Text>
      {results.ranked.map((p) => (
        <View key={p.index} style={styles.resultRow}>
          <View style={styles.resultLine}>
            <Text style={[styles.resultName, { color: t.ink }]}>{who(p)}</Text>
            <Text style={[styles.resultName, { color: t.ink }]}>{p.score} pts</Text>
          </View>
          <View style={[styles.bar, { backgroundColor: t.soft }]}>
            <View style={{ width: `${top ? (p.score / top) * 100 : 0}%`, height: '100%', backgroundColor: PLAYER_COLORS[p.index], borderRadius: 6 }} />
          </View>
        </View>
      ))}
      {match.mode === 'multi' ? <Text style={[styles.resultSub, { color: t.muted }]}>Multiplayer games are just for fun: they don’t count towards Stats or achievements.</Text> : null}
      <View style={styles.resultActions}>
        <Button title="Play Again" onPress={onAgain} style={styles.flex} testID="again" />
        <Button kind="secondary" title="Menu" onPress={onExit} style={styles.flex} />
      </View>
    </View>
  );
}

// A live class's results: the server's (Live.classResult / pairResult). The
// next game is the teacher's to start, so it's stay, or leave the class.
// tournament: where you stand now (it changes as the other games finish)
function LiveResults({ over, tournament, teacherPlayer, onLeave }) {
  const t = useTheme();
  const PLAYER_COLORS = usePlayerColors();
  const r = over.live;
  const top = Math.max(1, ...r.rows.filter((x) => !x.gap).map((x) => x.score));
  return (
    <View testID="results" style={[styles.results, { backgroundColor: t.paper, borderColor: t.line }]}>
      <Text testID="result-title" style={[styles.resultTitle, { color: t.ink }]}>
        {r.title}
      </Text>
      <Text style={[styles.resultSub, { color: t.muted }]}>{r.sub}</Text>
      {r.rows.map((p, i) =>
        p.gap ? (
          <Text key={i} style={[styles.resultSub, { color: t.muted }]}>
            ⋯
          </Text>
        ) : (
          <View key={i} style={styles.resultRow}>
            <View style={styles.resultLine}>
              <Text style={[styles.resultName, { color: t.ink, fontWeight: p.you ? '900' : '700' }]} numberOfLines={1}>
                {p.rank ? `${Stats.ordinal(p.rank)} ` : ''}
                {p.avatar ? `${p.avatar} ` : ''}
                {p.name}
              </Text>
              <Text style={[styles.resultName, { color: t.ink }]}>{p.score} pts</Text>
            </View>
            <View style={[styles.bar, { backgroundColor: t.soft }]}>
              <View style={{ width: `${(p.score / top) * 100}%`, height: '100%', backgroundColor: p.you ? PLAYER_COLORS[p.index || 0] : PLAYER_COLORS[p.index === undefined ? 1 : p.index] + '99', borderRadius: 6 }} />
            </View>
          </View>
        )
      )}
      {tournament ? (
        <Text testID="result-tournament" style={[styles.resultSub, { color: t.ink }]}>
          {tournament}
        </Text>
      ) : null}
      <Text style={[styles.resultSub, { color: t.muted }]}>{teacherPlayer ? 'Thanks for playing! Teacher games don’t count towards stats.' : 'Stay on this screen: your teacher can start another game.'}</Text>
      <View style={styles.resultActions}>
        <Button kind="secondary" title="Leave class" onPress={onLeave} style={styles.flex} testID="leave-class" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  close: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 18, fontWeight: '800' },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 6 },
  progressText: { fontSize: 13, fontWeight: '600' },
  progressBar: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  score: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 12, borderWidth: 3 },
  swatch: { width: 12, height: 12, borderRadius: 6 },
  scoreWho: { flex: 1 },
  scoreName: { fontSize: 15, fontWeight: '600' },
  scoreTitle: { fontSize: 11, fontWeight: '700' },
  scorePts: { fontSize: 18, fontWeight: '800' },
  diceRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  times: { fontSize: 24, fontWeight: '800' },
  rollScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20, padding: 16 },
  bigDice: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  bigTimes: { fontSize: 40, fontWeight: '800' },
  rollMsg: { fontSize: 24, fontWeight: '700', textAlign: 'center', lineHeight: 32 },
  wide: { alignSelf: 'stretch' },
  boardScreen: { flex: 1, alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 4 },
  msg: { fontSize: 18, textAlign: 'center', lineHeight: 24 },
  steps: { alignSelf: 'stretch', padding: 12, borderRadius: 12, borderWidth: 2, gap: 4 },
  step: { fontSize: 16, lineHeight: 22 },
  stepBig: { fontSize: 22, fontWeight: '800' },
  timer: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  picks: { alignSelf: 'stretch', gap: 10 },
  pickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  pick: { width: 44, height: 44, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  pickText: { fontSize: 18, fontWeight: '800' },
  timerText: { fontSize: 18, fontWeight: '800', minWidth: 70 },
  timerBar: { flex: 1, height: 10, borderRadius: 5, overflow: 'hidden' },
  answerScreen: { flex: 1, justifyContent: 'center', gap: 14, paddingHorizontal: 16, paddingBottom: 16 },
  questionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  question: { fontSize: 44, fontWeight: '800' },
  answerBox: { minWidth: 130, borderWidth: 3, borderRadius: 14, paddingVertical: 6, alignItems: 'center' },
  answerText: { fontSize: 44, fontWeight: '800' },
  helpScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20, paddingHorizontal: 16, paddingBottom: 16 },
  helpText: { fontSize: 22, fontWeight: '700', textAlign: 'center', lineHeight: 30, minHeight: 60 },
  feedback: { fontSize: 17, textAlign: 'center', fontWeight: '600', lineHeight: 23, minHeight: 46 },
  results: { alignSelf: 'stretch', padding: 14, borderRadius: 16, borderWidth: 2, gap: 8 },
  resultTitle: { fontSize: 26, fontWeight: '800', textAlign: 'center' },
  resultSub: { fontSize: 15, textAlign: 'center' },
  resultRow: { gap: 4 },
  resultLine: { flexDirection: 'row', justifyContent: 'space-between' },
  resultName: { fontSize: 17, fontWeight: '700' },
  bar: { height: 10, borderRadius: 5, overflow: 'hidden' },
  resultActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
});
