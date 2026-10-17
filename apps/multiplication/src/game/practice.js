// Practice mode: part of the multiplication game (split from the old js/game.js).

import * as Core from '@blockout/engine';
import * as Progress from '@blockout/progress';
import * as Shop from '@blockout/progress/shop';
import * as Setup from '@blockout/progress/setup';
import { COUNT_STEP, TRY_AGAIN, el } from './base.js';
import { BONUS_TOASTS, capitalize, celebrate, progress, saveProgress, toast } from './wallet.js';
import { settings } from './settings.js';
import { icon, openSettings, selectIn, setLockBadge } from './wardrobe.js';
import { FACT_STATUS, answerDecided, cancelContinue, gameId, make, renderFactGrid, renderFactLegend, setGame, setGameId, showStreak, stopTimer, unlockedTableSize, waitInGame } from './play.js';
import { recordPracticeRound } from './stats.js';
import { confirmUnlock, refreshNudges } from './shop.js';

let practiceTables;

const PRACTICE_BASE_POINTS = 1; // per correct answer, before bonuses

// For "what changed": moving right is progress (so a new fact landing in
// "needs practice" shows as a step down, not an improvement).
const STATUS_ORDER = { practice: 0, unseen: 1, learning: 2, mastered: 3 };

let practiceRoundSize = 5;

// 5 comes with Practice mode; 10 and 20 are unlocked for each difficulty
const countUnlock = (count) => Progress.practiceCountId(Number(count), settings.difficulty);

let practiceLevel = 'learn'; // 'expert' (shop unlock): no picture, no help button until 2 misses, ×2 bonus

const EXPERT_BONUS = 2;

const LEVEL_HELP = {
  learn: 'Learn: see each fact as a rectangle and get help counting.',
  expert: 'Expert: no picture and no help. First-try bonus points are doubled!',
};

function renderPracticeLevel() {
  // Expert is unlocked for each difficulty
  const expertId = Progress.practiceExpertId(settings.difficulty);
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

const timerUnlock = (secs) => (Number(secs) ? Progress.practiceTimerId(Number(secs), settings.difficulty) : null);

function renderPracticeTimer() {
  el.practiceTimerField.hidden = practiceLevel !== 'expert';
  if (!Progress.isUnlocked(progress, timerUnlock(practiceTimerSecs))) practiceTimerSecs = 0;
  for (const btn of el.practiceTimer.querySelectorAll('button')) {
    btn.classList.toggle('selected', Number(btn.dataset.secs) === practiceTimerSecs);
    setLockBadge(btn, timerUnlock(btn.dataset.secs));
  }
  // The timer bonus (Expert doubles it): all of it for an instant answer, none when time runs out
  const top = (secs) => Progress.TIMER_BONUS_MAX[secs] * EXPERT_BONUS;
  el.practiceTimerHelp.textContent = practiceTimerSecs
    ? `⏱️ Answer fast for a timer bonus of up to +${top(practiceTimerSecs)} a question: the quicker, the more. If time runs out, it counts as missed.`
    : `⏱️ A timer earns a bonus for quick answers: up to +${top(30)} a question with 30 s, +${top(10)} with 10 s, +${top(5)} with 5 s.`;
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
// Tricky, Master and Legend, whose facts are within 12 or one teen × 2–9).
function practiceMax() {
  return Math.min(Core.DIFFICULTY_SIDES[settings.difficulty] || 6, 12);
}

// The difficulty's table chips: ×1 … ×max, Tricky's hard tables, Legend's ×2 … ×9
const practiceChips = () => Progress.practiceSet(settings.difficulty).tables.filter((n) => n <= 12);

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
  if (practiceTables.size) return [...practiceTables];
  return practiceChips().filter(tableUnlocked);
}

function updatePracticePreview() {
  if (el.practiceSetup.hidden) return;
  renderPracticeLevel();
  renderPracticeCount();
  renderPracticeTables();
  const tables = practiceTableList();
  el.startBtn.disabled = !tables.length;
  if (!tables.length) {
    el.practicePreview.textContent = 'Unlock a times table to practice: tap ×1 to start.';
    return;
  }
  const facts = playerFacts(el.practiceName.value.trim() || 'You');
  const set = Progress.practiceSet(settings.difficulty);
  const upTo = settings.difficulty === 'legend' ? '11–19' : `up to ${practiceMax()}`;
  const counts = { practice: 0, learning: 0, unseen: 0, mastered: 0 };
  let total = 0;
  for (const [a, b] of set.pairs) {
    if (!(set.bSideOnly ? tables.includes(b) : tables.includes(a) || tables.includes(b))) continue;
    counts[Progress.factStatus(facts[Progress.factKey(a, b)])]++;
    total++;
  }
  const what = practiceTables.size ? `${tablesLabel(practiceTables)} ${upTo} (${total} facts)` : `All your unlocked tables (${tablesLabel(tables)}), ${upTo}`;
  el.practicePreview.textContent =
    `${what}: ${counts.practice} need practice, ${counts.learning} learning, ` +
    `${counts.unseen} not seen yet, ${counts.mastered} mastered.`;
}

function renderPracticeCount() {
  if (!Progress.isUnlocked(progress, countUnlock(practiceRoundSize))) practiceRoundSize = 5;
  for (const btn of el.practiceCount.querySelectorAll('button')) {
    btn.classList.toggle('selected', Number(btn.dataset.count) === practiceRoundSize);
    setLockBadge(btn, countUnlock(btn.dataset.count));
  }
  // The finishing bonus for the chosen length (doubled on Expert)
  const expert = practiceLevel === 'expert';
  const bonus = Progress.practiceFinishBonus(practiceRoundSize, expert);
  const next = practiceRoundSize === 5 ? Progress.practiceFinishBonus(10, expert) : 0;
  el.practiceCountHelp.textContent = bonus
    ? `🏁 Finish all ${practiceRoundSize} for +${bonus} bonus points${expert ? ' (doubled on Expert)' : ''}.`
    : `🏁 Longer rounds earn a finishing bonus: +${next} for 10 questions, +${Progress.practiceFinishBonus(20, expert)} for 20.`;
}

// Times tables are unlocked one by one (×1, then ×2, …)
const tableUnlocked = (n) => Progress.isUnlocked(progress, `table${n}`);

function startPractice(name, count, tables = [], expert = false, timer = 0) {
  stopPracticeTimer();
  cancelContinue();
  stopTimer();
  setGameId(gameId + 1); // cancels anything still waiting from a game
  setGame(null);
  const max = practiceMax();
  const facts = playerFacts(name);
  const queue = Progress.pickPracticeFacts(facts, Progress.practiceSet(settings.difficulty), count, Math.random, tables);
  const before = {};
  for (const [a, b] of queue) before[Progress.factKey(a, b)] = Progress.factStatus(facts[Progress.factKey(a, b)]);
  practice = { name, max, count, tables, expert, timer, difficulty: settings.difficulty, startedAt: Date.now(), times: [], queue, index: 0, requeued: new Set(), before, firstTry: 0, answered: 0, streak: 0, bestStreak: 0, points: 0, earned: [], current: null };
  el.startScreen.hidden = true;
  el.gameScreen.hidden = true;
  el.practiceDone.hidden = true;
  el.practiceScreen.hidden = false;
  nextPracticeQuestion();
}

function nextPracticeQuestion() {
  stopPracticeTimer();
  if (practice.index >= practice.queue.length) return finishPractice();
  const [a, b] = practice.queue[practice.index];
  // retry: a missed fact asked again at the end; it doesn't count towards the score
  practice.current = { a, b, area: a * b, retry: practice.index >= practice.count, entry: '', attempts: 0, wrong: [], helped: false, counting: false, startedAt: performance.now(), pausedMs: 0, done: false };
  const focus =
    (practice.tables.length ? ` · ${practice.tables.sort((x, y) => x - y).map((n) => `×${n}`).join(' ')}` : '') +
    (practice.expert ? ' · 🧠 Expert' : '');
  el.prCounter.textContent = `Question ${practice.index + 1} of ${practice.queue.length}${focus}`;
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

// A missed fact comes back once, later in the round.
function requeue(q) {
  const key = Progress.factKey(q.a, q.b);
  if (practice.requeued.has(key)) return;
  practice.requeued.add(key);
  practice.queue.push([q.a, q.b]);
}

async function checkPractice() {
  const q = practice.current;
  if (!q || q.done || q.entry === '') return;
  if (Number(q.entry) === q.area) {
    q.done = true;
    const timerLeft = prTimer && practice.timer ? { secs: practice.timer, left: prTimer.remaining / prTimer.total } : null;
    stopPracticeTimer();
    practiceLocked(true);
    const ms = performance.now() - q.startedAt - q.pausedMs;
    const firstTry = q.attempts === 0;
    practice.answered++;
    if (firstTry && !q.retry) practice.firstTry++;
    practice.times.push(Math.round(ms));
    practice.streak = firstTry ? practice.streak + 1 : 0;
    practice.bestStreak = Math.max(practice.bestStreak, practice.streak);
    const bonus = Progress.answerBonus({ firstTry, ms, streak: practice.streak, timer: timerLeft });
    const multiplier = practice.expert ? EXPERT_BONUS : 1;
    const points = PRACTICE_BASE_POINTS + bonus.total * multiplier;
    practice.points += points;
    Progress.addPoints(progress, points);
    for (const part of bonus.parts) {
      const extra = practice.expert ? ` (×${EXPERT_BONUS} Expert)` : '';
      toast(`${BONUS_TOASTS[part.label.split(' ')[0]]} ${capitalize(part.label)}`, `+${part.points * multiplier} bonus points${extra}`);
    }
    Progress.recordAnswer(progress, practice.name, { a: q.a, b: q.b, firstTry, correct: true, wrongAnswers: q.wrong, ms });
    const learned = Progress.learnedAfterHelp(progress, q.a, q.b, firstTry);
    practice.earned.push(...celebrate(Progress.awardAchievements(progress, { event: 'answer', correct: true, firstTry, ms, streak: practice.streak, a: q.a, b: q.b, facts: playerFacts(practice.name), size: unlockedTableSize(), learned })));
    saveProgress();
    el.prAnswer.className = 'answer-box right';
    el.prFeedback.className = 'math-feedback good';
    el.prFeedback.textContent = firstTry ? `Correct! +${points} points 🎉` : `You got it! +${points} point${points === 1 ? '' : 's'}`;
    showStreak(el.prStreak, practice.streak);
    await waitInGame(1100);
    practice.index++;
    nextPracticeQuestion();
    return;
  }
  q.attempts++;
  q.wrong.push(Number(q.entry));
  q.entry = '';
  practice.streak = 0;
  showStreak(el.prStreak, 0);
  requeue(q);
  el.prAnswer.className = 'answer-box';
  void el.prAnswer.offsetWidth; // restart the shake
  el.prAnswer.className = 'answer-box wrong';
  el.prAnswer.textContent = '';
  el.prFeedback.className = 'math-feedback try';
  el.prFeedback.textContent = TRY_AGAIN[(q.attempts - 1) % TRY_AGAIN.length];
  // Learn: count it out after two misses. Expert: no help at all.
  if (q.attempts >= 2 && !q.helped && !practice.expert) {
    el.prFeedback.textContent = "Let's count them together!";
    practiceHelp();
  }
}

// Light up the rectangle one row at a time with running totals.
async function practiceHelp() {
  const q = practice && practice.current;
  if (!q || q.done || q.helped || practice.expert) return; // Expert gets no help
  q.helped = true;
  Progress.noteHelp(progress, q.a, q.b);
  practice.earned.push(...celebrate(Progress.awardAchievements(progress, { event: 'help' })));
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
  if (!q || q.done) return;
  q.done = true;
  practiceLocked(true);
  practice.streak = 0;
  Progress.recordAnswer(progress, practice.name, { a: q.a, b: q.b, firstTry: false, correct: false, wrongAnswers: q.wrong, timeout: true });
  saveProgress();
  requeue(q);
  el.prAnswer.textContent = q.area;
  el.prAnswer.className = 'answer-box timeout';
  el.prFeedback.className = 'math-feedback try';
  el.prFeedback.textContent = `⏰ Time's up! ${q.a} × ${q.b} = ${q.area}. It'll come back later.`;
  await waitInGame(2200);
  practice.index++;
  nextPracticeQuestion();
}

function finishPractice() {
  stopPracticeTimer();
  el.prBar.style.width = '100%';
  const pr = practice;
  progress.counters.practiceRounds = (progress.counters.practiceRounds || 0) + 1;
  // Longer rounds earn a finishing bonus (doubled on Expert, like the other bonuses)
  const finish = Progress.practiceFinishBonus(pr.count, pr.expert);
  if (finish) {
    pr.points += finish;
    Progress.addPoints(progress, finish);
    toast(`🏁 Finished all ${pr.count} questions!`, `+${finish} bonus points${pr.expert ? ` (×${EXPERT_BONUS} Expert)` : ''}`);
  }
  recordPracticeRound(pr);
  Progress.noteActivity(progress, { kind: 'practice', difficulty: pr.difficulty, count: pr.count, expert: pr.expert, finished: true, firstTry: pr.firstTry });
  pr.earned.push(...celebrate(Progress.awardAchievements(progress, { event: 'practice' })));
  saveProgress();

  const retries = pr.queue.length - pr.count; // missed facts asked again
  el.pdSub.textContent =
    (pr.expert ? '🧠 Expert · ' : '') +
    `${pr.firstTry} of ${pr.count} right first time` +
    (retries ? ` · ${retries} ${retries === 1 ? 'fact' : 'facts'} retried` : '') +
    (pr.bestStreak >= 3 ? ` · best streak ${pr.bestStreak} 🔥` : '');

  // Which facts moved, e.g. "3 × 4: Needs practice → Learning"
  el.pdBody.innerHTML = '';
  const facts = playerFacts(pr.name);
  const changes = Object.entries(pr.before)
    .map(([fact, was]) => ({ fact, was, now: Progress.factStatus(facts[fact]) }))
    .filter((c) => c.was !== c.now)
    .sort((x, y) => STATUS_ORDER[y.now] - STATUS_ORDER[y.was] - (STATUS_ORDER[x.now] - STATUS_ORDER[x.was]));
  el.pdBody.append(make('h3', 'stats-heading', 'What changed'));
  if (!changes.length) el.pdBody.append(make('p', 'practice-none', 'No changes this time. Keep practicing and your facts will move up!'));
  for (const c of changes) {
    const row = make('div', 'practice-change');
    const up = STATUS_ORDER[c.now] > STATUS_ORDER[c.was];
    row.append(make('span', null, c.fact), make('span', up ? 'up' : 'down', `${FACT_STATUS[c.was].label} → ${FACT_STATUS[c.now].label}`));
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

  el.pdAgain.addEventListener('click', () => startPractice(practice.name, practice.count, practice.tables, practice.expert, practice.timer));

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

export { playerFacts, practiceLevel, practiceRoundSize, practiceTableList, practiceTimerSecs, setPractice, startPractice, stopPracticeTimer, tablesLabel, timerText, updatePracticePreview, weakFactWeight };
