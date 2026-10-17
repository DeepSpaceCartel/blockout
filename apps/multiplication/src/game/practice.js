// Practice mode: part of the multiplication game (split from the old js/game.js).

import * as Progress from '@blockout/progress';
import * as Shop from '@blockout/progress/shop';
import * as Setup from '@blockout/progress/setup';
import * as Practice from '@blockout/progress/practice';
import * as Journey from '@blockout/progress/journey';
import { COUNT_STEP, TRY_AGAIN, el } from './base.js';
import { BONUS_TOASTS, capitalize, celebrate, progress, saveProgress, toast } from './wallet.js';
import { settings } from './settings.js';
import { icon, openSettings, selectIn, setLockBadge } from './wardrobe.js';
import { FACT_STATUS, answerDecided, cancelContinue, gameId, make, renderFactGrid, renderFactLegend, setGame, setGameId, showStreak, stopTimer, waitInGame } from './play.js';
import { recordPracticeRound } from './stats.js';
import { confirmUnlock, refreshNudges } from './shop.js';
import { completeDaily } from './daily.js';
import { practiceJourneyDifficulty, practiceJourneyOn, renderJourney } from './journey.js';

let practiceTables;

// (a round's rules, words and setup are shared with the phone app: @blockout/progress/practice)

let practiceRoundSize = 5;

// Whose unlocks Practice's Expert, timers and lengths go by: on the Journey
// the table's difficulty, else the menu's
const practiceDifficulty = () => practiceJourneyDifficulty() || settings.difficulty;

// 5 comes with Practice mode; 10 and 20 are unlocked for each difficulty
const countUnlock = (count) => Practice.countItem(practiceDifficulty(), count);

let practiceLevel = 'learn'; // 'expert' (shop unlock): no picture, no help button until 2 misses, ×2 bonus

const EXPERT_BONUS = Practice.PRACTICE_EXPERT_BONUS;

const LEVEL_HELP = Practice.LEVEL_HELP;

function renderPracticeLevel() {
  // Expert is unlocked for each difficulty
  const expertId = Practice.levelItem(practiceDifficulty(), 'expert');
  if (!Progress.isUnlocked(progress, expertId) && practiceLevel === 'expert') practiceLevel = 'learn';
  for (const btn of el.practiceLevel.querySelectorAll('button')) {
    btn.classList.toggle('selected', btn.dataset.level === practiceLevel);
    setLockBadge(btn, btn.dataset.level === 'expert' ? expertId : null);
  }
  el.practiceLevelHelp.textContent = LEVEL_HELP[practiceLevel];
  renderPracticeTimer();
}

// Expert practice's own timer (Off, then 30 s → 10 s → 5 s from the shop),
// unlocked separately for each difficulty
let practiceTimerSecs = 0;

const timerUnlock = (secs) => Practice.timerItem(practiceDifficulty(), secs);

function renderPracticeTimer() {
  el.practiceTimerField.hidden = practiceLevel !== 'expert';
  if (!Progress.isUnlocked(progress, timerUnlock(practiceTimerSecs))) practiceTimerSecs = 0;
  for (const btn of el.practiceTimer.querySelectorAll('button')) {
    btn.classList.toggle('selected', Number(btn.dataset.secs) === practiceTimerSecs);
    setLockBadge(btn, timerUnlock(btn.dataset.secs));
  }
  // The timer bonus (Expert doubles it): all of it for an instant answer, none when time runs out
  el.practiceTimerHelp.textContent = Practice.timerHelp(practiceTimerSecs);
}

let practice = null;

let prTimer = null;

function playerFacts(name) {
  return (progress.facts[Progress.playerKey(name)] || { facts: {} }).facts;
}

// Master difficulty's dice: how often each fact comes up, from the player's
// record. Like practice, but mastered facts are rarer still: whoever reaches
// Master has mastered most of the table, and with practice's weights only
// about a third of the rolls would be weak facts (this makes it ~70%).
const weakFactWeight = (player) => Setup.masterWeight(progress, player ? player.name : 'You');

// Practice table size follows Difficulty: Easy 6, Medium 8, Hard 12 (and

// The difficulty's table chips: ×1 … ×max, Tricky's hard tables, Legend's ×2 … ×9
const practiceChips = () => Practice.tableChoices(settings.difficulty);

// Chips for the difficulty's tables; choices it doesn't have are dropped.
function renderPracticeTables() {
  const chips = practiceChips();
  for (const n of [...practiceTables]) if (!chips.includes(n) || !tableUnlocked(n)) practiceTables.delete(n);
  el.practiceTables.innerHTML = '';
  for (const n of chips) {
    const btn = make('button', null, `×${n}`);
    btn.type = 'button';
    btn.dataset.table = n;
    btn.setAttribute('aria-pressed', String(practiceTables.has(n)));
    btn.setAttribute('aria-label', `${n} times table`);
    setLockBadge(btn, `table${n}`);
    el.practiceTables.append(btn);
  }
}

// "×3 and ×4 (11 facts): 2 need practice, 5 learning, 4 not seen yet, 0 mastered."
const tablesLabel = Shop.tablesLabel;

// The tables a round asks about: the ones picked, or else every unlocked one.
function practiceTableList() {
  return Practice.roundTables(progress, settings.difficulty, [...practiceTables]);
}

function updatePracticePreview() {
  if (el.practiceSetup.hidden) return;
  renderPracticeLevel();
  renderPracticeCount();
  renderPracticeTables();
  if (practiceJourneyOn()) return renderJourney(); // (the level picks the table)
  const text = Practice.preview(progress, settings.difficulty, [...practiceTables], el.practiceName.value.trim() || 'You');
  el.startBtn.disabled = !text;
  el.practicePreview.textContent = text || 'Unlock a times table to practice: tap ×1 to start.';
}

function renderPracticeCount() {
  if (!Progress.isUnlocked(progress, countUnlock(practiceRoundSize))) practiceRoundSize = 5;
  for (const btn of el.practiceCount.querySelectorAll('button')) {
    btn.classList.toggle('selected', Number(btn.dataset.count) === practiceRoundSize);
    setLockBadge(btn, countUnlock(btn.dataset.count));
  }
  // The finishing bonus for the chosen length (doubled on Expert)
  el.practiceCountHelp.textContent = Practice.countHelp(practiceRoundSize, practiceLevel === 'expert');
}

// Times tables are unlocked one by one (×1, then ×2, …)
const tableUnlocked = (n) => Practice.tableOpen(progress, n);

// A Practice Journey round: the ×n table of the level reached, with the
// menu's Level, timer and length (if they're open on its difficulty)
function startPracticeJourney(name) {
  const level = Journey.practiceLevel(progress);
  const d = Journey.practiceTier(progress, level);
  const c = Practice.practiceChoice(progress, d, { level: practiceLevel, timer: practiceTimerSecs, count: practiceRoundSize });
  startPractice(name, c.count, [], c.level === 'expert', c.timer, d, level);
}

// difficulty: whose dice the questions come from (today's practice may pick one)
// journeyLevel: a Practice Journey round on the ×n table
function startPractice(name, count, tables = [], expert = false, timer = 0, difficulty = settings.difficulty, journeyLevel = null) {
  stopPracticeTimer();
  cancelContinue();
  stopTimer();
  setGameId(gameId + 1); // cancels anything still waiting from a game
  setGame(null);
  practice = Practice.createRound(progress, { name, difficulty, count, tables, level: expert ? 'expert' : 'learn', timer, journeyLevel });
  practice.earned = [];
  el.startScreen.hidden = true;
  el.gameScreen.hidden = true;
  el.practiceDone.hidden = true;
  el.practiceScreen.hidden = false;
  nextPracticeQuestion();
}

function nextPracticeQuestion() {
  stopPracticeTimer();
  if (!practice.current) return finishPractice();
  const { a, b } = practice.current;
  // (what only the screen needs: the typing, the clock, the counting)
  Object.assign(practice.current, { entry: '', counting: false, startedAt: performance.now(), pausedMs: 0 });
  el.prCounter.textContent = Practice.counter(practice);
  showStreak(el.prStreak, practice.streak);
  el.prBar.style.width = `${(practice.index / practice.queue.length) * 100}%`;
  el.prQ.textContent = `${a} × ${b}`;
  el.prAnswer.textContent = '';
  el.prAnswer.className = 'answer-box';
  el.prTrail.textContent = '';
  el.prFeedback.textContent = '';
  el.prFeedback.className = 'math-feedback';
  el.prHelp.disabled = false;
  el.prHelp.hidden = practice.expert; // Expert: no help button (the picture still helps after 2 misses)
  el.prKeypad.querySelectorAll('button').forEach((btn) => (btn.disabled = false));
  renderPracticeArray(a, b);
  el.prArray.hidden = practice.expert; // Expert: no picture to count
  startPracticeTimer();
}

// The fact as a rectangle: a rows of b squares, with a slot for each row's running total.
function renderPracticeArray(a, b) {
  el.prArray.innerHTML = '';
  el.prArray.classList.remove('counting');
  el.prArray.style.setProperty('--cols', b);
  for (let r = 0; r < a; r++) {
    for (let c = 0; c < b; c++) {
      const cell = make('span', 'cell');
      cell.dataset.row = r;
      el.prArray.append(cell);
    }
    const total = make('span', 'row-total', String((r + 1) * b));
    total.dataset.row = r;
    el.prArray.append(total);
  }
}

function typePractice(key) {
  const q = practice && practice.current;
  if (!q || q.done || el.practiceScreen.hidden) return;
  if (key === 'check') return checkPractice();
  if (key === 'clear') q.entry = '';
  else if (key === 'back') q.entry = q.entry.slice(0, -1);
  else if (q.entry.length < 3) q.entry = (q.entry === '0' ? '' : q.entry) + key;
  el.prAnswer.textContent = q.entry;
  el.prAnswer.className = 'answer-box';
  if (answerDecided(q.entry, q.area)) checkPractice(); // right, too big, or all digits typed
}

function practiceLocked(on) {
  el.prKeypad.querySelectorAll('button').forEach((btn) => (btn.disabled = on));
  el.prHelp.disabled = on;
}

async function checkPractice() {
  const q = practice.current;
  if (!q || q.done || q.entry === '') return;
  const timerLeft = prTimer && practice.timer ? { secs: practice.timer, left: prTimer.remaining / prTimer.total } : null;
  const ms = performance.now() - q.startedAt - q.pausedMs;
  const res = Practice.answer(progress, practice, q.entry, { ms, timer: timerLeft });
  if (res.correct) {
    stopPracticeTimer();
    practiceLocked(true);
    for (const part of res.bonus.parts) {
      const extra = practice.expert ? ` (×${EXPERT_BONUS} Expert)` : '';
      toast(`${BONUS_TOASTS[part.label.split(' ')[0]]} ${capitalize(part.label)}`, `+${part.points} bonus points${extra}`);
    }
    practice.earned.push(...celebrate(res.earned));
    saveProgress();
    el.prAnswer.className = 'answer-box right';
    el.prFeedback.className = 'math-feedback good';
    el.prFeedback.textContent = res.text;
    showStreak(el.prStreak, practice.streak);
    await waitInGame(1100);
    Practice.next(practice);
    nextPracticeQuestion();
    return;
  }
  q.entry = '';
  showStreak(el.prStreak, 0);
  el.prAnswer.className = 'answer-box';
  void el.prAnswer.offsetWidth; // restart the shake
  el.prAnswer.className = 'answer-box wrong';
  el.prAnswer.textContent = '';
  el.prFeedback.className = 'math-feedback try';
  el.prFeedback.textContent = TRY_AGAIN[(res.attempts - 1) % TRY_AGAIN.length];
  // Learn: count it out after two misses. Expert: no help at all.
  if (res.helpNow) {
    el.prFeedback.textContent = "Let's count them together!";
    practiceHelp();
  }
}

// Light up the rectangle one row at a time with running totals.
async function practiceHelp() {
  const q = practice && practice.current;
  if (!q || q.done || q.helped || practice.expert) return; // Expert gets no help
  const h = Practice.help(progress, practice);
  if (!h) return;
  practice.earned.push(...celebrate(h.earned));
  saveProgress();
  q.counting = true;
  el.prHelp.disabled = true;
  el.prArray.hidden = false; // Expert hides it until now
  const started = performance.now();
  el.prArray.classList.add('counting');
  const totals = [];
  for (let r = 0; r < q.a; r++) {
    await waitInGame(COUNT_STEP);
    if (practice.current !== q) return;
    el.prArray.querySelectorAll(`.cell[data-row="${r}"]`).forEach((c) => c.classList.add('counted'));
    el.prArray.querySelector(`.row-total[data-row="${r}"]`).classList.add('shown');
    totals.push((r + 1) * q.b);
    el.prTrail.textContent = `${q.a} ${q.a === 1 ? 'row' : 'rows'} of ${q.b}: ${totals.join(', ')}`;
  }
  q.counting = false;
  q.pausedMs += performance.now() - started;
  if (!q.done) {
    el.prFeedback.className = 'math-feedback';
    el.prFeedback.textContent = `So what is ${q.a} × ${q.b}?`;
  }
}

// Answer timer from Settings; paused while counting or while Settings is open.
// Only Expert practice is timed; Learn never shows a clock.
// "7s", or "4:32" for a minute or more
function timerText(ms) {
  const secs = Math.ceil(ms / 1000);
  return secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}

function startPracticeTimer() {
  const secs = practice.expert ? practice.timer : 0; // Expert practice's own timer
  el.prTimer.hidden = !secs;
  if (!secs) return;
  const q = practice.current;
  const total = Progress.timerLength(progress, secs) * 1000;
  prTimer = { total, remaining: total, last: performance.now() };
  const draw = () => {
    const left = Math.max(0, prTimer.remaining);
    el.prTimerNum.textContent = timerText(left);
    el.prTimerFill.style.width = `${(left / total) * 100}%`;
    el.prTimer.classList.toggle('low', left <= 5000);
  };
  draw();
  prTimer.interval = setInterval(() => {
    if (!practice || practice.current !== q || q.done) return stopPracticeTimer();
    const now = performance.now();
    if (!q.counting && el.settingsDialog.hidden) prTimer.remaining -= now - prTimer.last;
    prTimer.last = now;
    draw();
    if (prTimer.remaining <= 0) practiceTimeout();
  }, 100);
}

function stopPracticeTimer() {
  if (prTimer) clearInterval(prTimer.interval);
  prTimer = null;
}

async function practiceTimeout() {
  stopPracticeTimer();
  const q = practice.current;
  const out = Practice.timeout(progress, practice);
  if (!out) return;
  practiceLocked(true);
  saveProgress();
  el.prAnswer.textContent = q.area;
  el.prAnswer.className = 'answer-box timeout';
  el.prFeedback.className = 'math-feedback try';
  el.prFeedback.textContent = out.text;
  await waitInGame(2200);
  Practice.next(practice);
  nextPracticeQuestion();
}

function finishPractice() {
  stopPracticeTimer();
  el.prBar.style.width = '100%';
  const pr = practice;
  const end = Practice.finish(progress, pr);
  if (end.finishToast) toast(...end.finishToast);
  recordPracticeRound(end.record);
  pr.earned.push(...celebrate(end.earned));
  pr.earned.push(...completeDaily({ kind: 'practice', tables: pr.tables, count: pr.count })); // (today's practice?)
  saveProgress();
  el.pdSub.textContent = end.sub;
  // a Journey round: on to the next table, or what it still takes
  const message = end.journey && Journey.practiceResultMessage(end.journey);
  el.pdJourney.hidden = !message;
  el.pdJourney.classList.toggle('up', Boolean(end.journey && end.journey.advanced));
  if (message) el.pdJourney.replaceChildren(make('strong', null, message.title), ' ', message.text);
  const next = end.journey && end.journey.advanced && !Journey.practiceDone(progress);
  el.pdAgain.textContent = next ? `×${end.journey.to} ›` : 'Practice again';
  if (end.journey && end.journey.advanced) renderJourney();

  // Which facts moved, e.g. "3 × 4: Needs practice → Learning"
  el.pdBody.innerHTML = '';
  const facts = playerFacts(pr.name);
  el.pdBody.append(make('h3', 'stats-heading', 'What changed'));
  if (!end.changes.length) el.pdBody.append(make('p', 'practice-none', 'No changes this time. Keep practicing and your facts will move up!'));
  for (const ch of end.changes) {
    const row = make('div', 'practice-change');
    row.append(make('span', null, ch.fact), make('span', ch.up ? 'up' : 'down', `${FACT_STATUS[ch.was].label} → ${FACT_STATUS[ch.now].label}`));
    el.pdBody.append(row);
  }
  el.pdBody.append(make('h3', 'stats-heading centered', 'Times table'));
  el.pdBody.append(renderFactLegend());
  el.pdBody.append(renderFactGrid('', facts));

  setPracticeDetailsOpen(false);
  refreshNudges('pd');
  el.practiceDone.hidden = false;
  el.practiceDone.querySelector('.dialog').scrollTop = 0;
  el.pdAgain.focus();
}

function leavePractice() {
  stopPracticeTimer();
  setGameId(gameId + 1);
  practice = null;
  el.practiceDone.hidden = true;
  el.practiceScreen.hidden = true;
  el.startScreen.hidden = false;
  updatePracticePreview();
}

// "What changed" and the times table sit behind Show details, like the game results.
function setPracticeDetailsOpen(open) {
  el.pdBody.hidden = !open;
  el.pdDetailsBtn.replaceChildren(icon('chart-column'), open ? ' Hide details' : ' Show details');
  el.pdDetailsBtn.setAttribute('aria-expanded', String(open));
}

// (practice is also changed from other sections)
function setPractice(value) {
  return (practice = value);
}

// What this part does when the page loads (main.js runs every part in order)
export function run() {
  el.practiceTimer.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.unlock) return confirmUnlock(btn.dataset.unlock, btn);
    practiceTimerSecs = Number(btn.dataset.secs);
    renderPracticeTimer();
  });

  el.practiceLevel.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.unlock) return confirmUnlock(btn.dataset.unlock, btn);
    practiceLevel = btn.dataset.level;
    renderPracticeLevel();
    renderPracticeCount(); // Expert doubles the finishing bonus
  });

  practiceTables = new Set();

  el.practiceTables.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-table]');
    if (!btn) return;
    if (btn.dataset.unlock) return confirmUnlock(btn.dataset.unlock, btn);
    const n = Number(btn.dataset.table);
    if (practiceTables.has(n)) practiceTables.delete(n);
    else practiceTables.add(n);
    updatePracticePreview();
  });

  el.practiceName.addEventListener('input', updatePracticePreview);

  el.practiceCount.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.unlock) return confirmUnlock(btn.dataset.unlock, btn);
    practiceRoundSize = Number(btn.dataset.count);
    selectIn(el.practiceCount, btn);
    renderPracticeCount();
  });

  el.prKeypad.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (btn) typePractice(btn.dataset.key);
  });

  el.prHelp.addEventListener('click', practiceHelp);

  el.pdAgain.addEventListener('click', () => {
    // a Journey round goes on with the level reached (the next table, after a good round)
    if (practice.journeyLevel && !Journey.practiceDone(progress)) return startPracticeJourney(practice.name);
    startPractice(practice.name, practice.count, practice.tables, practice.expert, practice.timer, practice.difficulty);
  });

  el.pdMenu.addEventListener('click', leavePractice);

  el.pdDetailsBtn.addEventListener('click', () => setPracticeDetailsOpen(el.pdBody.hidden));

  el.practiceMenuBtn.addEventListener('click', () => {
    if (practice && practice.index < practice.queue.length && !confirm('Stop practicing and go back to the menu?')) return;
    leavePractice();
  });

  el.practiceSettingsBtn.addEventListener('click', () => openSettings(el.practiceSettingsBtn));

  document.addEventListener('keydown', (e) => {
    if (!practice || el.practiceScreen.hidden || !el.practiceDone.hidden) return;
    if (!el.settingsDialog.hidden || !el.shopDialog.hidden) return;
    if (e.target.closest('.overlay, input')) return; // e.g. Esc that just closed a dialog
    if (/^[0-9]$/.test(e.key)) typePractice(e.key);
    else if (e.key === 'Backspace') typePractice('back');
    else if (e.key === 'Escape') typePractice('clear');
    else if (e.key === 'Enter') typePractice('check');
    else return;
    e.preventDefault();
  });
}

export { playerFacts, practiceLevel, practiceRoundSize, practiceTableList, practiceTimerSecs, setPractice, startPractice, startPracticeJourney, stopPracticeTimer, tablesLabel, timerText, updatePracticePreview, weakFactWeight };
