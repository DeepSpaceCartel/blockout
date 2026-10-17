// Game state: part of the multiplication game (split from the old js/game.js).

import * as Core from '@blockout/engine';
import * as Match from '@blockout/engine/match';
import * as Progress from '@blockout/progress';
import * as Views from '@blockout/progress/views';
import * as Stats from '@blockout/progress/stats';
import * as Journey from '@blockout/progress/journey';
import * as Wardrobe from '@blockout/progress/wardrobe';
import { AUTO_PLACE_MS, AUTO_ROLL_MS, COUNT_STEP, PASS_DELAY, TRY_AGAIN, el, seededRandom, setup } from './base.js';
import { BONUS_TOASTS, capitalize, celebrate, celebrateWin, grantStickers, progress, queueAchievements, saveProgress, toast } from './wallet.js';
import { cpuStep, settings } from './settings.js';
import { GAME_EXPERT_BONUS, applySettingsForTurn, icon, look, syncBoardLocks, syncSettingsUI } from './wardrobe.js';
import { recordGame } from './stats.js';
import { refreshNudges } from './shop.js';
import { completeDaily } from './daily.js';
import { journeyGame, renderJourney } from './journey.js';
import { playerFacts, setPractice, stopPracticeTimer, timerText, weakFactWeight } from './practice.js';
import { pairRoll, pairTurnOrWait, reportClass } from './classroom.js';
import { buildDicePicks, setDetailsOpen } from './input.js';
import { PLACE_FX_MS, animateBoard, render, renderDie, resizeBoard, setMsg } from './render.js';

let game = null;

let gameId = 0; // bumped on every new game so pending timers from an old game do nothing

// Wardrobe on players: the CPU character's name and avatar; in single player,
// your avatar and title. "CPU 2" in multiplayer becomes e.g. "Owl 2".
// (avatar and title for the player on this device: in single player, class games
// and their own side of a pair; not in home multiplayer or for a pair partner)
const wardrobeLook = (p, mode) => Wardrobe.playerLook(settings.cosmetics, p, mode === 'multi' || (mode === 'pair' && !p.statsName) ? 'multi' : 'single');

// invite: a decoded invite, whose settings and dice seed apply to this game only.
// extra: { cfg, classroom } for a class game: fixed settings, dice from the teacher.
function startGame(playerDefs, size, mode, invite = null, extra = null) {
  cancelContinue();
  stopTimer();
  stopPracticeTimer();
  setPractice(null);
  el.practiceScreen.hidden = true;
  el.practiceDone.hidden = true;
  gameId++;
  // On the Journey the level decides the board and the dice
  const level = mode === 'single' && !invite && !extra ? journeyGame() : null;
  const journey = level ? Journey.levelSetup(level) : null;
  if (journey) size = journey.size;
  const cfg = { ...settings, ...(invite ? invite.s : {}), ...(extra ? extra.cfg : {}), ...(journey ? { difficulty: journey.difficulty } : {}) };
  const rng = invite && invite.r !== undefined ? seededRandom(invite.r) : Math.random;
  game = {
    invite,
    fixed: Boolean(extra), // settings don't change mid-game
    classroom: extra ? extra.classroom : null, // { session, game, round, reported, view }
    rng,
    cpuSpeed: cfg.cpuSpeed,
    cpuEnd: cfg.cpuEnd,
    showProgress: cfg.showProgress,
    id: gameId,
    size,
    level, // the Journey level this game is (null: Free play, multiplayer, class)
    mode, // 'single' (you vs the CPU), 'multi' (one screen) or 'class' (dice from the teacher)
    board: Core.createBoard(size, { firstInCorner: cfg.firstInCorner }),
    difficulty: cfg.difficulty,
    sides: (journey && journey.sides) || Core.DIFFICULTY_SIDES[cfg.difficulty] || 6,
    cpuInstant: cfg.cpuSteps === 'instant',
    autoRoll: cfg.autoRoll === 'auto',
    fitMode: cfg.fitRolls,
    players: playerDefs.map((p, i) => ({
      ...p,
      ...wardrobeLook(p, mode),
      color: look('colors').colors[i],
      score: 0, // squares + bonus
      squares: 0,
      bonus: 0,
      streak: 0, // first-try answers in a row
      bestStreak: 0,
      log: [],
      answered: 0,
      firstTry: 0,
      stats: { placed: 0, biggest: null, wrong: 0, helped: 0, timeouts: 0, passes: 0, times: [], missed: [] },
    })),
    answerTime: Number(cfg.answerTime) || 0, // seconds, 0 = untimed
    startedAt: Date.now(),
    turns: 0,
    current: 0,
    passes: 0,
    dice: null,
    rotated: false,
    phase: 'roll', // roll | rolling | place | answer | cpu | over
    hover: null, // { c, r } cell under pointer
    cpuPreview: null,
    lastRect: null,
    placeMode: cfg.placeMode, // 'draw': drag out the rectangle; 'click': click to drop it
    // 'virtual': the app rolls; 'real': players roll real dice and enter them
    // (not after Hard: those dice can't be rolled at the table)
    diceMode: Core.usesPairDice(cfg.difficulty) ? 'virtual' : cfg.diceMode,
    picked: [null, null], // real-dice values entered so far
    drag: null, // { c0, r0, c1, r1 } while a human is drawing
    pending: null, // human rectangle waiting for its points to be worked out
    counting: null, // { rect, byRows, shown, group } while skip-counting on the board
  };
  // Loaded to suit board and difficulty. After Hard, the dice deal chosen
  // pairs: Tricky skips the easy facts, Master leans on your weakest facts,
  // Legend deals a teen × a one-digit number.
  game.faces = Core.diceFaces(cfg.difficulty, game.sides);
  game.diceBag = Core.usesPairDice(cfg.difficulty)
    ? Core.createPairDice(size, rng, cfg.difficulty, cfg.difficulty === 'master' ? weakFactWeight(playerDefs.find((p) => !p.cpu)) : null)
    : Core.createDice(size, rng, game.sides);
  // Single player's Level: Expert has no "Help me count", doubles bonus points,
  // and can have an answer timer (its own, not the Settings one)
  const levelled = mode === 'single' && !invite && !extra;
  game.expert = levelled && setup.level === 'expert';
  game.levelTimer = game.expert ? setup.timer : 0;
  if (levelled) game.answerTime = game.levelTimer;
  buildDicePicks(game.sides);
  el.resultTournament.hidden = true;
  const classroomGame = mode === 'class' || mode === 'pair';
  el.againBtn.hidden = classroomGame; // the teacher starts the next class game
  el.againBtn.textContent = 'Play again';
  el.toMenuBtn.textContent = !classroomGame ? 'Main menu' : extra.classroom.session.host ? 'Back to the class' : 'Leave class';
  el.startScreen.hidden = true;
  el.gameOver.hidden = true;
  el.gameScreen.hidden = false;
  renderDie(el.dieA, null);
  renderDie(el.dieB, null);
  resizeBoard();
  beginTurn();
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Resolves after ms, or never if the game has changed in the meantime.
function waitInGame(ms) {
  const id = gameId;
  return wait(ms).then(() => (id === gameId ? true : new Promise(() => {})));
}

function currentPlayer() {
  return game.players[game.current];
}

function currentDims() {
  if (!game.dice) return null;
  const [a, b] = game.dice;
  return game.rotated ? [b, a] : [a, b];
}

function resetTurn() {
  stopTimer();
  game.dice = null;
  game.rotated = false;
  game.hover = null;
  game.cpuPreview = null;
  game.drag = null;
  game.pending = null;
  game.counting = null;
  el.math.hidden = true;
  el.steps.hidden = true;
  el.steps.innerHTML = '';
  renderDie(el.dieA, null);
  renderDie(el.dieB, null);
}

function beginTurn() {
  applySettingsForTurn();
  const p = currentPlayer();
  game.turns++;
  resetTurn();
  if (game.mode === 'class') {
    game.phase = 'wait';
    setMsg(game.classroom.round ? 'Waiting for the next roll…' : 'Get ready! Waiting for the first roll…');
    render();
    return;
  }
  if (game.mode === 'pair') return pairTurnOrWait();
  if (p.cpu) {
    game.phase = 'cpu';
    setMsg(`${p.name} is rolling…`);
    render();
    runComputerTurn();
  } else {
    game.phase = 'roll';
    const first = Core.mustUseCorner(game.board);
    const corner = first ? ' Your first rectangle goes in the top-left corner.' : '';
    if (game.diceMode === 'real') {
      game.picked = [null, null];
      renderDicePicks();
      setMsg(`Roll your two dice, then tap the numbers you got.${corner}`);
    } else if (game.autoRoll) {
      setMsg(`Rolling the dice…${corner}`);
    } else {
      setMsg(first ? `Roll the dice!${corner}` : 'Roll the dice!');
    }
    render();
    // Real dice are rolled at the table, so auto roll only applies to app dice.
    if (game.autoRoll && game.diceMode !== 'real') waitInGame(AUTO_ROLL_MS).then(humanRoll);
  }
}

// forced: the class game's roll, from the teacher
async function rollDice(forced = null) {
  game.phase = 'rolling';
  render();
  const rollStyle = `roll-${settings.cosmetics.roll}`; // Wardrobe: wobble, tumble, bounce, sparkle
  el.dieA.classList.add('rolling', rollStyle);
  el.dieB.classList.add('rolling', rollStyle);
  const face = (list) => list[Math.floor(Math.random() * list.length)];
  for (let i = 0; i < 8; i++) {
    renderDie(el.dieA, face(game.faces.a));
    renderDie(el.dieB, face(game.faces.b));
    await waitInGame(55);
  }
  el.dieA.classList.remove('rolling', rollStyle);
  el.dieB.classList.remove('rolling', rollStyle);
  game.dice = forced ? [...forced] : Core.rollForBoard(game.board, game.diceBag, game.rng, game.fitMode);
  renderDie(el.dieA, game.dice[0]);
  renderDie(el.dieB, game.dice[1]);
  return game.dice;
}

async function humanRoll() {
  if (!game || game.phase !== 'roll' || currentPlayer().cpu || game.diceMode === 'real') return;
  if (game.mode === 'pair') return pairRoll(); // the server rolls for a pairs game
  const [a, b] = await rollDice();
  await startPlacing(a, b);
}

// ---- real dice: the player enters what they rolled

function pickDie(index, value) {
  if (!game || game.phase !== 'roll' || game.diceMode !== 'real') return;
  game.picked[index] = value;
  renderDicePicks();
}

// Keyboard entry: a digit fills the first empty die (or the second if both are set).
function typeDie(value) {
  const i = game.picked[0] === null ? 0 : 1;
  pickDie(i, value);
}

function clearLastDie() {
  if (game.picked[1] !== null) pickDie(1, null);
  else pickDie(0, null);
}

async function useRealDice() {
  if (!game || game.phase !== 'roll' || game.diceMode !== 'real') return;
  const [a, b] = game.picked;
  if (!a || !b) return;
  game.dice = [a, b];
  await startPlacing(a, b);
}

function renderDicePicks() {
  el.diePicks.forEach((row, i) => {
    for (const btn of row.querySelectorAll('button')) {
      const on = Number(btn.dataset.value) === game.picked[i];
      btn.classList.toggle('selected', on);
      btn.setAttribute('aria-pressed', String(on));
    }
  });
  renderDie(el.dieA, game.picked[0]);
  renderDie(el.dieB, game.picked[1]);
  el.useDiceBtn.disabled = !(game.picked[0] && game.picked[1]);
}

async function startPlacing(a, b) {
  const options = Core.validPlacements(game.board, a, b);
  if (options.length === 0) {
    await pass(a, b);
    return;
  }
  if (game.placeMode === 'auto') {
    await autoPlace(a, b);
    return;
  }
  // Start in an orientation that actually fits somewhere.
  if (!options.some((o) => o.w === a && o.h === b)) game.rotated = true;
  game.phase = 'place';
  setMsg(placeInstructions());
  render();
}

// Auto mode: put the rectangle in a snug spot (same strategy as the
// computer), show it briefly, then go straight to the maths.
async function autoPlace(a, b) {
  game.phase = 'busy';
  const move = Core.chooseComputerMove(game.board, a, b);
  setMsg(`You rolled ${a} and ${b}. Placing your ${a} by ${b} rectangle…`);
  game.cpuPreview = move;
  render();
  await waitInGame(AUTO_PLACE_MS);
  game.cpuPreview = null;
  startAnswer(placeRect(move.x, move.y, move.w, move.h));
}

function placeInstructions() {
  const [a, b] = game.dice;
  const shape = `a ${a} by ${b} rectangle`;
  const corner = Core.mustUseCorner(game.board);
  if (game.placeMode === 'draw') {
    return corner
      ? `You rolled ${a} and ${b}. Draw ${shape}: start on the top-left square and drag.`
      : `You rolled ${a} and ${b}. Draw ${shape}: press on a square and drag.`;
  }
  return corner
    ? `You rolled ${a} and ${b}. Click the board to draw ${shape} in the corner.`
    : `You rolled ${a} and ${b}. Click the board to draw ${shape}.${a !== b ? ' Press R to rotate.' : ''}`;
}

async function pass(a, b) {
  const p = currentPlayer();
  game.phase = p.cpu ? 'cpu' : 'rolling';
  p.log.push({ pass: true, a, b });
  p.stats.passes++;
  game.passes++;
  const who = game.mode !== 'multi' && !p.cpu ? 'You pass' : `${p.name} passes`;
  setMsg(`No room for a ${a} × ${b} anywhere. ${who}.`);
  if (game.mode === 'class') reportClass({ kind: 'pass' }); // (pairs: the server passes for you)
  render();
  if (p.cpu) await finishComputerTurn(cpuStep());
  else await waitInGame(PASS_DELAY);
  endTurn();
}

// Draw the rectangle on the board. Its points are awarded once the maths is done.
function placeRect(x, y, w, h) {
  const [a, b] = game.dice;
  const rect = Core.place(game.board, x, y, w, h, game.current);
  rect.a = a;
  rect.b = b;
  rect.solved = false;
  // Wardrobe placing effect (the player who placed it chose it; CPUs use yours too)
  rect.fx = settings.cosmetics.place !== 'none' ? settings.cosmetics.place : null;
  rect.placedAt = performance.now();
  if (rect.fx) animateBoard(PLACE_FX_MS + 50);
  game.lastRect = rect;
  game.passes = 0;
  return rect;
}


// Points for a solved rectangle, as the shared rules count them
const awardPoints = (rect, firstTry, bonus = 0) => Match.award(game, rect, firstTry, bonus);

// ---- human: work out the points

function startAnswer(rect) {
  game.pending = { rect, entry: '', attempts: 0, helped: false, miss: null, startedAt: performance.now(), pausedMs: 0 };
  game.phase = 'answer';
  setMsg('How many squares did you just draw?');
  el.mathQ.textContent = `${rect.a} × ${rect.b}`;
  el.answerBox.textContent = '';
  el.answerBox.className = 'answer-box';
  el.countTrail.textContent = '';
  el.mathFeedback.textContent = '';
  el.mathFeedback.className = 'math-feedback';
  el.math.hidden = false;
  showStreak(el.streakBadge, currentPlayer().streak);
  setKeypadEnabled(true);
  el.helpBtn.disabled = false;
  el.helpBtn.hidden = Boolean(game.expert); // Expert: no help counting
  render();
  startTimer();
  if (window.innerWidth <= 820) el.math.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function setKeypadEnabled(on) {
  el.keypad.querySelectorAll('button').forEach((b) => (b.disabled = !on));
}

// Can more typing still change the outcome? No once it matches, overshoots,
// or has as many digits as the answer.
// "🔥 5 in a row"; with the Wardrobe's growing flames it gets bigger at 5, 10 and 20.
function showStreak(node, n) {
  node.textContent = n >= 2 ? `🔥 ${n} in a row` : '';
  const level = n >= 20 ? 3 : n >= 10 ? 2 : n >= 5 ? 1 : 0;
  node.classList.toggle('flames', settings.cosmetics.streak === 'flames' && level > 0);
  node.dataset.level = level;
}


const answerDecided = Match.answerDecided;

function typeKey(key) {
  const pend = game && game.phase === 'answer' && game.pending;
  if (!pend) return;
  if (key === 'check') return checkAnswer();
  if (key === 'clear') pend.entry = '';
  else if (key === 'back') pend.entry = pend.entry.slice(0, -1);
  else if (pend.entry.length < 3) pend.entry = (pend.entry === '0' ? '' : pend.entry) + key;
  el.answerBox.textContent = pend.entry;
  el.answerBox.className = 'answer-box';
  // Submit by itself once the answer is decided: it's right, it's bigger than
  // the answer, or it has as many digits as the answer. Shorter entries wait
  // for ✓, since you might not be done typing.
  if (answerDecided(pend.entry, pend.rect.area)) checkAnswer();
}

async function checkAnswer() {
  const pend = game.pending;
  if (!pend || pend.entry === '') return;
  const { rect } = pend;
  if (Number(pend.entry) === rect.area) {
    // the timer bonus goes by how much time was left (not in class games: the server scores those)
    const timerLeft = timer && game.answerTime && game.mode !== 'class' && game.mode !== 'pair' ? { secs: game.answerTime, left: timer.remaining / timer.total } : null;
    stopTimer();
    const p = currentPlayer();
    const ms = performance.now() - pend.startedAt - pend.pausedMs;
    const firstTry = Match.firstTry(pend); // (no wrong answer and no "Help me count")
    p.stats.times.push(ms);
    p.streak = firstTry ? p.streak + 1 : 0;
    p.bestStreak = Math.max(p.bestStreak, p.streak);
    const bonus = Progress.answerBonus({ firstTry, ms, streak: p.streak, timer: timerLeft });
    game.phase = 'busy';
    setKeypadEnabled(false);
    el.helpBtn.disabled = true;
    el.answerBox.className = 'answer-box right';
    el.mathFeedback.className = 'math-feedback good';
    const squares = `+${rect.area} ${rect.area === 1 ? 'square' : 'squares'}`;
    el.mathFeedback.textContent = firstTry ? `Correct! ${squares} 🎉` : `You got it! ${squares}`;
    // Each bonus pops up on its own, like an achievement.
    const mult = game.expert ? GAME_EXPERT_BONUS : 1; // Expert doubles bonus points
    for (const part of bonus.parts) toast(`${BONUS_TOASTS[part.label.split(' ')[0]]} ${capitalize(part.label)}`, `+${part.points * mult} bonus points${mult > 1 ? ' (×2 Expert)' : ''}`);
    awardPoints(rect, firstTry, bonus.total * mult);
    showStreak(el.streakBadge, p.streak);
    if (game.mode === 'class' || game.mode === 'pair') reportClass({ kind: 'placed', rect: { x: rect.x, y: rect.y, w: rect.w, h: rect.h }, firstTry, ms: Math.round(ms) });
    if (countsForStats()) {
      Progress.recordAnswer(progress, statsName(p), {
        a: rect.a,
        b: rect.b,
        firstTry,
        correct: true,
        wrongAnswers: pend.miss ? pend.miss.answers : [],
        ms,
      });
      const learned = Progress.learnedAfterHelp(progress, rect.a, rect.b, firstTry);
      celebrate(Progress.awardAchievements(progress, { event: 'answer', correct: true, firstTry, ms, streak: p.streak, a: rect.a, b: rect.b, facts: playerFacts(statsName(p)), size: unlockedTableSize(), learned }));
      saveProgress();
    }
    game.pending = null;
    render();
    await waitInGame(1400);
    endTurn();
    return;
  }
  currentPlayer().streak = 0;
  pend.attempts++;
  noteMiss(pend, { answer: Number(pend.entry) });
  pend.entry = '';
  currentPlayer().stats.wrong++;
  el.answerBox.className = 'answer-box';
  void el.answerBox.offsetWidth; // restart the shake animation
  el.answerBox.className = 'answer-box wrong';
  el.answerBox.textContent = '';
  el.mathFeedback.className = 'math-feedback try';
  el.mathFeedback.textContent = TRY_AGAIN[(pend.attempts - 1) % TRY_AGAIN.length];
  if (pend.attempts >= 2 && !pend.helped && !game.expert) {
    el.mathFeedback.textContent = "Let's count them together!";
    helpCount();
  }
}

// Legend: a teen times a one-digit number, split into tens and ones
// (14 × 7 = 10 × 7 + 4 × 7). Null for anything else.

// Legend: a teen times a one-digit number, split into tens and ones; null for anything else
const legendSplit = (rect) => (game ? (Match.legendSplit(rect, game.difficulty) || {}).split || null : null);

async function helpCount() {
  const pend = game.pending;
  if (!pend || pend.helped || game.counting || game.expert) return; // Expert: no help
  pend.helped = true;
  currentPlayer().stats.helped++;
  if (countsForStats()) {
    Progress.noteHelp(progress, pend.rect.a, pend.rect.b);
    celebrate(Progress.awardAchievements(progress, { event: 'help' }));
    saveProgress();
  }
  el.helpBtn.disabled = true;
  const { rect } = pend;
  const split = legendSplit(rect);
  if (split) {
    // Too many to skip-count: split it, and leave the adding to the player
    el.countTrail.textContent =
      `Split ${split.teen} into 10 and ${split.ones}: 10 × ${split.other} = ${split.tens}, ` +
      `${split.ones} × ${split.other} = ${split.rest}. Now add them up!`;
    return;
  }
  const plan = countPlan(rect);
  const totals = [];
  const helpStarted = performance.now(); // the timer is paused while counting
  await skipCount(rect, plan, COUNT_STEP, (total) => {
    totals.push(total);
    const units = plan.steps === 1 ? plan.unit : `${plan.unit}s`;
    el.countTrail.textContent = `${plan.steps} ${units} of ${plan.group}: ${totals.join(', ')}`;
  });
  pend.pausedMs += performance.now() - helpStarted;
  if (game.pending === pend) {
    el.mathFeedback.className = 'math-feedback';
    el.mathFeedback.textContent = `So what is ${rect.a} × ${rect.b}?`;
  }
}

// A fact goes on the "to practise" list the first time it's missed in a turn.
// Record a missed fact once per turn, with every wrong answer given for it.
// Entries look like { fact: '6 × 7', answers: [48, 36], timeout: false }.

// Record a missed fact once per turn, with every wrong answer given for it.
// (The shared rule reads the pending answer from the game; a timeout has
// already cleared it, so it's handed over.)
const noteMiss = (pend, how) => Match.noteMiss({ ...game, pending: pend }, how);

// ---- answer timer (paused while "Help me count" is animating)

let timer = null; // { total, remaining, last, interval }

function startTimer() {
  stopTimer();
  el.timer.hidden = !game.answerTime;
  if (!game.answerTime) return;
  const id = gameId;
  const total = Progress.timerLength(progress, game.answerTime) * 1000; // (the bonus still follows answerTime)
  timer = { total, remaining: total, last: performance.now() };
  renderTimer();
  timer.interval = setInterval(() => {
    if (!timer || id !== gameId) return stopTimer();
    const now = performance.now();
    // Paused while "Help me count" is animating or Settings is open.
    if (!game.counting && el.settingsDialog.hidden) timer.remaining -= now - timer.last;
    timer.last = now;
    renderTimer();
    if (timer.remaining <= 0) answerTimeout();
  }, 100);
}

function stopTimer() {
  if (timer) clearInterval(timer.interval);
  timer = null;
}

function renderTimer() {
  const left = Math.max(0, timer.remaining);
  el.timerNum.textContent = timerText(left);
  el.timerFill.style.width = `${(left / timer.total) * 100}%`;
  el.timer.classList.toggle('low', left <= 5000);
}

// Out of time: show the answer, take the rectangle back off the board, no points.
async function answerTimeout() {
  stopTimer();
  const pend = game.pending;
  if (!pend || game.phase !== 'answer') return;
  const p = currentPlayer();
  const { rect } = pend;
  game.phase = 'busy';
  game.pending = null;
  setKeypadEnabled(false);
  el.helpBtn.disabled = true;
  noteMiss(pend, { timeout: true });
  p.stats.timeouts++;
  p.streak = 0;
  if (game.mode === 'class' || game.mode === 'pair') reportClass({ kind: 'timeout' });
  if (countsForStats()) {
    Progress.recordAnswer(progress, statsName(p), { a: rect.a, b: rect.b, firstTry: false, correct: false, wrongAnswers: pend.miss.answers, timeout: true });
    saveProgress();
  }
  p.log.push({ timeout: true, a: rect.a, b: rect.b });
  el.answerBox.textContent = rect.area;
  el.answerBox.className = 'answer-box timeout';
  el.mathFeedback.className = 'math-feedback try';
  el.mathFeedback.textContent = `⏰ Time's up! ${rect.a} × ${rect.b} = ${rect.area}. No points this turn.`;
  Core.removeRect(game.board, rect);
  game.lastRect = null;
  game.passes = 0; // the roll did fit, so this isn't a pass
  render();
  await waitInGame(3000);
  endTurn();
}

// ---- skip counting, shared by the help button and the computer's explanation

// Count a × b as "a rows (or columns) of b", matching the order of the dice.

// Count a × b as "a rows (or columns) of b", matching the order of the dice
const countPlan = Match.countPlan;

async function skipCount(rect, plan, stepMs, onStep) {
  game.counting = { rect, byRows: plan.byRows, group: plan.group, shown: 0 };
  render();
  for (let i = 1; i <= plan.steps; i++) {
    await waitInGame(stepMs);
    game.counting.shown = i;
    onStep(i * plan.group, i);
    render();
  }
  await waitInGame(stepMs);
}

// ---- computer: show the working step by step

// "an 8", "an 11", "an 18", but "a 7"
const article = (n) => (/^(8|11|18)$/.test(String(n)) || /^8\d$/.test(String(n)) ? 'an' : 'a');

function addStep(html, big = false) {
  const li = document.createElement('li');
  li.innerHTML = html;
  if (big) li.className = 'big';
  el.steps.append(li);
  return li;
}

async function explainComputerMove(rect) {
  const plan = countPlan(rect);
  const { a, b, area } = rect;
  addStep(`I drew ${article(a)} <span class="num">${a}</span> by <span class="num">${b}</span> rectangle. How many squares is that?`);
  await waitInGame(cpuStep());
  const split = legendSplit(rect);
  if (split) {
    addStep(`Split <span class="num">${split.teen}</span> into 10 and <span class="num">${split.ones}</span>.`);
    await waitInGame(cpuStep());
    addStep(`10 × ${split.other} = <span class="num">${split.tens}</span> and ${split.ones} × ${split.other} = <span class="num">${split.rest}</span>.`);
    await waitInGame(cpuStep());
    addStep(`${split.tens} + ${split.rest} = <span class="num">${area}</span>.`);
    await waitInGame(cpuStep());
  } else if (a === 1 || b === 1) {
    const n = a === 1 ? b : a;
    addStep(`It's just 1 ${a === 1 ? 'row' : 'column'} of <span class="num">${n}</span>, so that's ${n}.`);
    await waitInGame(cpuStep());
  } else {
    addStep(
      `That's <span class="num">${plan.steps}</span> ${plan.unit}s of <span class="num">${plan.group}</span>. ` +
        `Let's count by ${plan.group}s:`
    );
    let trail = null; // created with its first number so it never shows up empty
    const totals = [];
    await skipCount(rect, plan, cpuStep(), (total) => {
      totals.push(total);
      trail = trail || addStep('');
      trail.innerHTML = totals.map((t) => `<span class="num">${t}</span>`).join(', ');
    });
  }
  game.counting = null;
  addStep(`${a} × ${b} = ${area}`, true);
  awardPoints(rect, true);
  render();
}

// ---- end of the computer's turn: carry on by itself, or wait for "My turn"

let continueResolve = null;


const gameEndsAfterThisTurn = () => Match.isOver(game);

async function finishComputerTurn(autoDelay) {
  if (game.cpuEnd !== 'button' || gameEndsAfterThisTurn()) {
    await waitInGame(autoDelay);
    return;
  }
  const next = game.players[(game.current + 1) % game.players.length];
  el.continueBtn.replaceChildren(
    game.mode === 'single' ? 'My turn ' : next.cpu ? `${next.name} ` : `${next.name}'s turn `,
    icon('chevron-right')
  );
  el.continueBtn.hidden = false;
  el.continueBtn.focus({ preventScroll: true });
  await new Promise((resolve) => (continueResolve = resolve));
}

function pressContinue() {
  if (!continueResolve) return;
  const resolve = continueResolve;
  continueResolve = null;
  el.continueBtn.hidden = true;
  resolve();
}

function cancelContinue() {
  continueResolve = null; // the abandoned turn just never resumes
  el.continueBtn.hidden = true;
}

function endTurn() {
  if (game.mode === 'class' || game.mode === 'pair') return beginTurn(); // the server ends these games
  if (Match.isOver(game)) {
    finishGame();
    return;
  }
  game.current = (game.current + 1) % game.players.length;
  beginTurn();
}

// Instant CPU turns: roll, place and score straight away, no explanation.
const INSTANT_CPU_MS = 250; // just long enough for the board to redraw between turns

async function runInstantComputerTurn() {
  const p = currentPlayer();
  const [a, b] = (game.dice = Core.rollForBoard(game.board, game.diceBag, game.rng, game.fitMode));
  renderDie(el.dieA, a);
  renderDie(el.dieB, b);
  const move = Core.chooseComputerMove(game.board, a, b);
  if (move) {
    const rect = placeRect(move.x, move.y, move.w, move.h);
    awardPoints(rect, true);
    setMsg(`${p.name} rolled ${a} and ${b}: ${a} × ${b} = ${rect.area}.`);
  } else {
    p.log.push({ pass: true, a, b });
    p.stats.passes++;
    game.passes++;
    setMsg(`${p.name} rolled ${a} and ${b}: no room, so it passes.`);
  }
  render();
  await waitInGame(INSTANT_CPU_MS);
  endTurn();
}

async function runComputerTurn() {
  if (game.cpuInstant) return runInstantComputerTurn();
  await waitInGame(cpuStep());
  const [a, b] = await rollDice();
  const move = Core.chooseComputerMove(game.board, a, b);
  if (!move) {
    await pass(a, b);
    return;
  }
  setMsg('');
  el.steps.hidden = false;
  const hello = currentPlayer().hello ? `${currentPlayer().hello} ` : ''; // CPU character's greeting
  addStep(`${hello}I rolled ${article(a)} <span class="num">${a}</span> and ${article(b)} <span class="num">${b}</span>.`);
  await waitInGame(cpuStep());
  if (game.placeMode === 'draw') {
    const where = game.board.rects.length ? 'snug against the others' : 'in a corner';
    addStep(
      `I’ll draw it ${where}: <span class="num">${move.w}</span> across ` +
        `and <span class="num">${move.h}</span> down.`
    );
    await drawComputerRect(move);
  } else {
    addStep(`I’ll put my rectangle here, ${game.board.rects.length ? 'snug against the others' : 'in a corner'}…`);
    game.cpuPreview = move;
    render();
  }
  await waitInGame(cpuStep());
  game.cpuPreview = null;
  const rect = placeRect(move.x, move.y, move.w, move.h);
  render();
  await explainComputerMove(rect);
  await finishComputerTurn(cpuStep());
  endTurn();
}

// Grow the computer's rectangle: the first row one square at a time (at
// double speed), then one whole row per step.
async function drawComputerRect(move) {
  for (let w = 1; w <= move.w; w++) {
    game.cpuPreview = { ...move, w, h: 1 };
    render();
    await waitInGame(cpuStep() / 2);
  }
  for (let h = 2; h <= move.h; h++) {
    game.cpuPreview = { ...move, h };
    render();
    await waitInGame(cpuStep());
  }
}

function finishGame() {
  game.phase = 'over';
  game.dice = null;
  render();
  const ranked = game.players
    .map((p, i) => ({ ...p, index: i }))
    .sort((p, q) => q.score - p.score);
  const top = ranked[0].score;
  const winners = ranked.filter((p) => p.score === top);
  const isSingle = game.mode === 'single';
  if (countsForStats()) recordGame(new Set(winners.map((p) => p.index)));

  if (winners.length > 1) el.resultTitle.textContent = "It's a tie!";
  else if (isSingle) el.resultTitle.textContent = winners[0].cpu ? `${winners[0].name} wins!` : 'You win! 🎉';
  else el.resultTitle.textContent = `${winners[0].name} wins!${winners[0].cpu ? '' : ' 🎉'}`;

  const empty = Core.emptyCount(game.board);
  el.resultSub.textContent =
    empty === 0 ? 'The board is completely full!' : `Nobody could fit a rectangle. ${empty} squares left empty.`;

  el.resultList.innerHTML = '';
  for (const p of ranked) {
    const li = document.createElement('li');
    li.style.setProperty('--c', p.color);
    const name = document.createElement('span');
    name.className = 'result-name';
    name.textContent = p.avatar ? `${p.avatar} ${p.name}` : p.name;
    if (p.title) name.append(make('span', 'player-title', p.title));
    const pts = document.createElement('span');
    pts.className = 'result-pts';
    pts.textContent = `${p.score} pts`;
    // Bar length relative to the top score, so the gap is easy to see.
    const bar = document.createElement('span');
    bar.className = 'result-bar';
    const fill = document.createElement('span');
    fill.style.width = `${top ? (p.score / top) * 100 : 0}%`;
    bar.append(fill);
    li.append(name, pts, bar);
    el.resultList.append(li);
  }
  renderRewards(winners, empty);
  refreshNudges('results');
  if (winners.length === 1 && !winners[0].cpu) celebrateWin();
  renderStats();
  setDetailsOpen(false);
  el.gameOver.hidden = false;
  el.gameOver.querySelector('.dialog').scrollTop = 0;
  el.againBtn.focus();
}

// Human players' points go into the shared wallet, and game achievements are
// checked. Shows "+N points" and any new achievements on the end screen.
function renderRewards(winners, empty) {
  el.rewards.innerHTML = '';
  const humans = game.players.filter((p) => !p.cpu);
  if (!humans.length) return;
  const points = humans.reduce((sum, p) => sum + p.score, 0);
  Progress.addPoints(progress, points);
  if (!countsForStats()) {
    // local multiplayer: points only, nothing permanent
    saveProgress();
    el.rewards.append(make('p', 'setting-help', 'Multiplayer games are just for fun: they don’t count towards Stats or achievements.'));
    return;
  }
  progress.counters.games++;
  // Finishing bonus for bigger boards (single player against the CPU)
  const boardBonus = game.mode === 'single' ? Progress.boardFinishBonus(game.size) : 0;
  if (boardBonus) {
    Progress.addPoints(progress, boardBonus);
    const an = [8, 11, 18].includes(game.size) ? 'an' : 'a'; // "an 8×8", "an 11×11", "an 18×18"
    toast(`🏁 Finished ${an} ${game.size}×${game.size} game!`, `+${boardBonus} bonus points`);
  }
  const humanWon = winners.length === 1 && !winners[0].cpu;
  // for class stats and homework ("beat the CPU on 8×8", "finish 5 games")
  Progress.noteActivity(progress, { kind: 'game', mode: game.mode, difficulty: game.difficulty, size: game.size, won: game.mode === 'single' && humanWon });
  if (humanWon && game.mode === 'single') Progress.recordBoardWin(progress, game.size);
  if (game.mode === 'single') completeDaily({ kind: 'game', size: game.size, difficulty: game.difficulty, won: humanWon }); // (today's practice?)
  const asked = (p) => p.answered + p.stats.timeouts;
  const perfect = humans.some((p) => asked(p) >= 5 && p.firstTry === asked(p));
  const noHelp = humans.some((p) => asked(p) >= 5 && p.stats.helped === 0);
  const earned = Progress.awardAchievements(progress, {
    event: 'game',
    noHelp,
    games: progress.counters.games,
    wonVsCpu: game.mode === 'single' && humanWon,
    humanWon,
    full: empty === 0,
    perfect,
    difficulty: game.difficulty,
    bestScore: Math.max(...humans.map((p) => p.score)),
  });
  if (game.level) earned.push(...renderLevelResult(humanWon));
  grantStickers(earned); // they show up behind the Stickers button
  saveProgress();
  showRewards(earned);
}

// A Journey game: moving up a level (its boards and dice unlock), or what it
// still takes. Returns the achievements it earned.
function renderLevelResult(humanWon) {
  const you = game.players.find((p) => !p.cpu);
  const r = Progress.recordLevelGame(progress, game.level, { won: humanWon, answered: you.answered + you.stats.timeouts, firstTry: you.firstTry });
  const message = Journey.resultMessage(r);
  if (message) {
    const line = make('p', 'journey-result' + (r.advanced ? ' up' : ''));
    line.append(make('strong', null, message.title), ' ', message.text);
    el.rewards.append(line);
  }
  if (r.advanced) {
    el.againBtn.textContent = r.to >= Journey.DONE ? 'Play again' : `Level ${r.to} ›`;
    syncSettingsUI();
    syncBoardLocks();
    renderJourney();
  }
  return r.earned;
}

// End of a game: new achievements get their banners. Points and stickers go
// in quietly: the Shop / Wardrobe / Stickers buttons below show what's new.
function showRewards(earned) {
  queueAchievements(earned);
}

// Single-player and class games (and practice) count towards Stats and achievements.
function countsForStats() {
  if (game && game.classroom && game.classroom.session.teacher) return false; // the teacher playing an odd one out
  return game && ['single', 'class', 'pair'].includes(game.mode);
}

// Whose times tables an answer counts towards. In a class game you play under
// your first name, but it's still you on this device.
function statsName(p) {
  return p.statsName || p.name;
}

// ---- end-of-game stats

function make(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Games saved before wrong answers were recorded store plain '6 × 7' strings.
function normalizeMiss(miss) {
  return typeof miss === 'string' ? { fact: miss, answers: [], timeout: false } : miss;
}

// Merge misses of the same fact: how often, which wrong answers, how many time-outs.
function groupMisses(misses, keyOf) {
  const groups = new Map();
  for (const raw of misses) {
    const miss = normalizeMiss(raw);
    const key = keyOf(miss.fact);
    const g = groups.get(key) || { fact: key, count: 0, answers: [], timeouts: 0 };
    g.count++;
    g.answers.push(...miss.answers);
    if (miss.timeout) g.timeouts++;
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
}

// "6 × 7 = 42 (×2)" with "said 48, 36 · ⏰ ran out of time" underneath.
function renderPractice(name, color, groups, noneText) {
  const block = make('div', 'practice');
  block.style.setProperty('--c', color);
  block.append(make('div', 'practice-name', name));
  if (!groups.length) {
    block.append(make('span', 'practice-none', noneText));
    return block;
  }
  const list = make('div', 'facts');
  for (const g of groups) {
    const [a, b] = g.fact.split('×').map((n) => Number(n.trim()));
    const item = make('div', 'fact');
    item.append(make('span', 'fact-eq', `${g.fact} = ${a * b}${g.count > 1 ? ` (×${g.count})` : ''}`));
    const details = [];
    const said = [...new Set(g.answers)].slice(0, 5);
    if (said.length) details.push(`said ${said.join(', ')}`);
    if (g.timeouts) details.push(g.timeouts > 1 ? `⏰ ran out of time ×${g.timeouts}` : '⏰ ran out of time');
    if (g.rate) details.push(g.rate);
    if (details.length) item.append(make('span', 'fact-said', details.join(' · ')));
    list.append(item);
  }
  block.append(list);
  return block;
}

// ---- lifetime times-table grid

// Biggest times table the player can reach: 6 (Easy), 8 (Medium) or 12 (Hard).
const unlockedTableSize = () => Views.tableSize(progress);


const FACT_STATUS = Stats.FACT_STATUS;

// Which statuses show a best time instead of the icon (Settings → Times-table grid).
const TIMES_SETTING = { mastered: 'timesMastered', learning: 'timesLearning', practice: 'timesPractice' };

function showsTime(status) {
  return TIMES_SETTING[status] && settings[TIMES_SETTING[status]] === 'time';
}

function renderFactLegend() {
  const legend = make('div', 'fact-legend');
  for (const [status, { mark, label }] of Object.entries(FACT_STATUS)) {
    const item = make('span', 'fact-legend-item');
    item.append(make('span', `fact-cell ${status}`, mark), document.createTextNode(label));
    legend.append(item);
  }
  return legend;
}

// Rows and columns 1..N (6, or up to 12 once bigger dice are in play); hover a cell for details.
// Single player and practice play as "You" (personal accounts will replace this).
const isDefaultPlayer = Stats.isDefaultPlayer;

// size: a fixed size (a teacher or parent looking at a student), else what this player reached
function renderFactGrid(name, facts, size = null) {
  const g = Stats.factGrid(facts, { size, unlocked: unlockedTableSize(), showTime: showsTime });
  const wrap = make('div', 'fact-grid-wrap');
  if (name) wrap.append(make('div', 'practice-name', name)); // no label for the default "You"
  const grid = make('div', 'fact-grid');
  grid.style.setProperty('--n', g.max + 1);
  // Mastery badge: a gold ★ on a line's header once the whole line is mastered (both orders)
  const head = ({ n, mastered }) => {
    const cell = make('span', 'fact-head' + (mastered ? ' line-mastered' : ''), mastered ? `★${n}` : String(n));
    if (mastered) cell.title = `Every ${n} times fact is mastered!`;
    return cell;
  };
  grid.append(make('span', 'fact-head', '×'));
  for (const h of g.heads) grid.append(head(h));
  g.cells.forEach((row, r) => {
    grid.append(head(g.heads[r]));
    for (const c of row) {
      const cell = make('span', `fact-cell ${c.status}${c.timed ? ' timed' : ''}`, c.mark);
      cell.title = c.detail;
      grid.append(cell);
    }
  });
  wrap.append(grid);
  return wrap;
}

function renderStats() {
  const dash = '—';
  const secs = (ms) => `${(ms / 1000).toFixed(1)} s`;
  const human = (fn) => (p) => (p.cpu ? dash : fn(p));
  const asked = (p) => p.answered + p.stats.timeouts;
  const rows = [
    ['Points', (p) => p.score],
    ['Squares', (p) => p.squares],
    ['Bonus points', human((p) => p.bonus)],
    ['Best streak', human((p) => p.bestStreak)],
    ['Rectangles drawn', (p) => p.stats.placed],
    ['Biggest rectangle', (p) => (p.stats.biggest ? `${p.stats.biggest.a} × ${p.stats.biggest.b} = ${p.stats.biggest.area}` : dash)],
    ['Right on first try', human((p) => (asked(p) ? `${p.firstTry} of ${asked(p)}` : dash))],
    ['Wrong answers', human((p) => p.stats.wrong)],
    ['Used “Help me count”', human((p) => p.stats.helped)],
    game.answerTime ? ['Ran out of time', human((p) => p.stats.timeouts)] : null,
    ['Average answer time', human((p) => (p.stats.times.length ? secs(p.stats.times.reduce((s, t) => s + t, 0) / p.stats.times.length) : dash))],
    ['Fastest answer', human((p) => (p.stats.times.length ? secs(Math.min(...p.stats.times)) : dash))],
    ['Passes', (p) => p.stats.passes],
  ].filter(Boolean);

  el.stats.innerHTML = '';

  // Game summary
  const total = game.size * game.size;
  const filled = total - Core.emptyCount(game.board);
  const elapsed = Math.round((Date.now() - game.startedAt) / 1000);
  const time = elapsed >= 60 ? `${Math.floor(elapsed / 60)} min ${elapsed % 60} s` : `${elapsed} s`;
  el.stats.append(
    make('p', 'stats-summary', `⏱ ${time} · ${game.turns} turns · ${filled} of ${total} squares filled (${Math.round((filled / total) * 100)}%)`)
  );

  // Per-player table
  const wrap = make('div', 'stats-table-wrap');
  const table = make('table', 'stats-table');
  const head = table.createTHead().insertRow();
  head.append(make('th'));
  for (const p of game.players) {
    const th = make('th');
    th.style.setProperty('--c', p.color);
    th.append(make('span', 'dot'), document.createTextNode(p.name));
    head.append(th);
  }
  const body = table.createTBody();
  for (const [label, value] of rows) {
    const tr = body.insertRow();
    tr.append(make('th', null, label));
    for (const p of game.players) tr.append(make('td', null, String(value(p))));
  }
  wrap.append(table);
  el.stats.append(wrap);

  // Facts to practise
  const humans = game.players.filter((p) => !p.cpu);
  if (humans.some((p) => asked(p) > 0)) {
    el.stats.append(make('h3', 'stats-heading', 'Facts to practice'));
    for (const p of humans) {
      const none = asked(p) ? 'Nothing to practice. Every answer right first time! 🌟' : 'No answers this game.';
      el.stats.append(renderPractice(p.name, p.color, groupMisses(p.stats.missed, (f) => f), none));
    }
  }
}

// (game is also changed from other sections)
function setGame(value) {
  return (game = value);
}

// (gameId is also changed from other sections)
function setGameId(value) {
  return (gameId = value);
}
export { FACT_STATUS, answerDecided, cancelContinue, clearLastDie, continueResolve, currentDims, currentPlayer, game, gameId, helpCount, humanRoll, isDefaultPlayer, make, pickDie, placeInstructions, placeRect, pressContinue, renderFactGrid, renderFactLegend, renderPractice, renderStats, resetTurn, rollDice, setGame, setGameId, showRewards, showStreak, startAnswer, startGame, startPlacing, statsName, stopTimer, typeDie, typeKey, unlockedTableSize, useRealDice, waitInGame };
