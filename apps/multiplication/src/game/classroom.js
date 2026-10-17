// Classroom: part of the multiplication game (split from the old js/game.js).

import * as Auth from '@blockout/auth';
import { askTeacherSignIn } from '../accounts.js';
import * as Classroom from '@blockout/classroom';
import * as Core from '@blockout/engine';
import * as Progress from '@blockout/progress';
import * as Stats from '@blockout/progress/stats';
import * as Live from '@blockout/progress/classroom';
import * as Hosting from '@blockout/progress/hosting';
import { AUTO_ROLL_MS, el } from './base.js';
import { celebrate, celebrateWin, grantStickers, progress, saveProgress, toast } from './wallet.js';
import { settings } from './settings.js';
import { icon, syncBoardLocks } from './wardrobe.js';
import { currentPlayer, game, gameId, humanRoll, make, renderStats, resetTurn, rollDice, setGame, setGameId, showRewards, startGame, startPlacing, statsName, stopTimer, waitInGame } from './play.js';
import { loadHistory, saveHistory } from './stats.js';
import { refreshNudges, tap } from './shop.js';
import { drawQr } from './invites.js';
import { dragRect, humanPreview, setDetailsOpen, toMenu } from './input.js';
import { render, renderDie, resizeBoard, setMsg } from './render.js';

const HOST_SETTINGS = Hosting.HOST_SETTINGS; // the lobby's settings ([value, label, detail]; `only`: some game types)

// Your Wardrobe look, sent when you join so classmates see your avatar and title
const myLook = () => ({ avatar: settings.cosmetics.avatar, title: settings.cosmetics.title });

// A player's name with their avatar and title (from the server)
function lookName(p, cls, text = p.name) {
  const span = make('span', cls, p.avatar ? `${p.avatar} ${text}` : text);
  if (p.title) span.append(make('span', 'player-title', p.title));
  return span;
}

// A small picture of a board: rects are [x, y, w, h]
function miniBoard(rects, size, color, px = 84) {
  const c = document.createElement('canvas');
  const dpr = window.devicePixelRatio || 1;
  c.width = c.height = px * dpr;
  c.style.width = c.style.height = `${px}px`;
  c.className = 'mini-board';
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  const cell = px / size;
  const css = getComputedStyle(document.documentElement);
  g.fillStyle = css.getPropertyValue('--surface').trim() || '#fff';
  g.fillRect(0, 0, px, px);
  g.fillStyle = color;
  g.strokeStyle = css.getPropertyValue('--paper').trim() || '#fff';
  g.lineWidth = 1;
  for (const [x, y, w, h] of rects) {
    g.globalAlpha = 0.85;
    g.fillRect(x * cell, y * cell, w * cell, h * cell);
    g.globalAlpha = 1;
    g.strokeRect(x * cell + 0.5, y * cell + 0.5, w * cell - 1, h * cell - 1);
  }
  return c;
}

// Whole class: classmates near you on the leaderboard, with their boards (live as they place)
function renderClassmates(view) {
  const box = el.classmates;
  if (!box) return;
  const list = view.classmates || [];
  box.hidden = !list.length;
  if (!list.length) return;
  box.replaceChildren(make('h3', 'classmates-title', 'Classmates'));
  const grid = make('div', 'classmates-grid');
  for (const c of list) {
    const card = make('div', 'classmate' + (c.done ? ' done' : ''));
    card.append(miniBoard(c.rects, view.settings.size, '#2e86de', 64));
    const who = make('div', 'classmate-who');
    who.append(lookName(c, 'classmate-name'), make('span', 'classmate-score', `${ordinal(c.rank)} · ${c.score}`));
    card.append(who);
    grid.append(card);
  }
  box.append(grid);
}


const ordinal = Stats.ordinal;

// Can this page reach the classroom server? Shown in the Classroom menu.
async function checkClassroom() {
  const reason = await Classroom.check();
  el.classOffline.hidden = !reason;
  el.classJoinOpen.disabled = el.classHostOpen.disabled = Boolean(reason);
  if (reason) {
    el.classOffline.innerHTML =
      reason === 'file'
        ? 'Classroom games run through the Blockout server. On the teacher’s computer run <code>node server/classroom.js</code>, then open the address it shows (like <code>http://localhost:8080</code>).'
        : 'Can’t reach the classroom server. Run <code>node server/classroom.js</code> and open this page from the address it prints (like <code>http://localhost:8080</code>), not from another web server.';
  }
  return !reason;
}

// ---- students

let classSession = null; // { code, id, key, name }

let classStop = null; // closes the live updates

let classSeen = false; // got at least one update since connecting

// The first name used in the last class on this device, to fill in next time
const CLASS_NAME_KEY = 'blockout.className';

function lastClassName() {
  try {
    return localStorage.getItem(CLASS_NAME_KEY) || '';
  } catch (e) {
    return '';
  }
}

// fromLink: opened from a join link (QR code or a link posted in the class chat)
async function openClassJoin(code = '', fromLink = false) {
  el.classCodeInput.value = code || '';
  // Signed-in students play under their account's first name
  const account = Auth && Auth.role() === 'student' ? Auth.user() : null;
  el.classNameInput.value = account ? account.firstName : lastClassName();
  el.classNameInput.readOnly = Boolean(account);
  el.classJoinError.hidden = true;
  el.classJoinForm.hidden = false;
  el.classWait.hidden = true;
  el.classJoin.hidden = false;
  // With the code and your name filled in, joining is one tap
  (!code ? el.classCodeInput : el.classNameInput.value ? el.classJoinBtn : el.classNameInput).focus();
  if (fromLink && code) {
    try {
      await Classroom.roomInfo(code);
    } catch (err) {
      if (err.code !== 'room') return;
      el.classJoinError.textContent = 'This class has finished. Ask your teacher for a new link.';
      el.classJoinError.hidden = false;
      el.classCodeInput.value = '';
      el.classCodeInput.focus();
    }
  }
}

function connectClass(session) {
  if (classStop) classStop();
  classSession = session;
  classSeen = false;
  Classroom.saveSession(session);
  classStop = Classroom.listenStudent(session, {
    view: (v) => {
      classSeen = true;
      onClassView(v);
    },
    gone: onClassGone,
  });
}

function leaveClass() {
  if (!classSession) return;
  Classroom.leave(classSession).catch(() => {});
  if (classStop) classStop();
  classStop = null;
  classSession = null;
  Classroom.saveSession(null);
}

function onClassGone(reason) {
  const wasIn = classSeen;
  const wasHost = classSession && classSession.host;
  classStop = null;
  classSession = null;
  Classroom.saveSession(null);
  el.classJoin.hidden = true;
  if (wasHost) {
    // the teacher's own player on the projector page: the host screen handles the rest
    if (game && game.mode === 'pair') setGame(null);
    return;
  }
  if (game && (game.mode === 'class' || game.mode === 'pair') && game.phase !== 'over') toMenu();
  const said = Live.goneToast(reason, wasIn); // (null: an old class from last time, just forgotten)
  if (said) toast(...said);
}

function showClassWaiting(view) {
  el.classWaitName.textContent = classSession.name;
  el.classWaitText.textContent = Live.waitingText(view, classSession);
  el.classJoinForm.hidden = true;
  el.classWait.hidden = false;
  el.classJoin.hidden = false;
}

function onClassView(view) {
  if (view.type === 'pairs' || view.type === 'tournament') return onPairView(view);
  if (view.you.benched) return showClassWaiting(view); // joined after this game started
  const mine = game && game.mode === 'class' && game.classroom.game === view.game;
  if (view.state === 'playing') {
    if (!mine) startClassGame(view);
    else syncClassGame(view);
    return;
  }
  if (view.state === 'ended' && mine) {
    if (game.phase !== 'over') finishClassGame(view);
    return;
  }
  // Lobby (or a game that finished before we got here): wait for the next one.
  // Results stay on screen until the next game starts.
  if (game && game.mode === 'class' && game.phase === 'over') return;
  if (game && game.mode === 'class') toMenu();
  showClassWaiting(view);
}

// The teacher's settings for everyone in the class (Live.classCfg); placing is
// the student's own choice unless the teacher picked one.
const classCfg = (s) => Live.classCfg(s, settings.placeMode);

function startClassGame(view) {
  el.classJoin.hidden = true;
  for (const d of document.querySelectorAll('.overlay')) if (d !== el.gameOver) d.hidden = true;
  const you = view.you;
  const { size, difficulty } = view.settings;
  startGame([{ name: you.name, statsName: el.singleName.value.trim() || 'You', cpu: false }], size, 'class', null, {
    cfg: { ...classCfg(view.settings), difficulty, autoRoll: 'off', fitRolls: 'never' }, // the teacher rolls
    classroom: { session: classSession, game: view.game, round: 0, reported: true, view },
  });
  // Rejoining mid-game: put your rectangles back and pick up your score.
  if (Live.rejoinClass(game, you)) toast(`🏫 Back in class ${view.code}`, `You have ${you.score} points.`);
  syncClassGame(view);
}

// A new roll from the teacher. If you were still working on the last one, it's gone.
function syncClassGame(view) {
  const c = game.classroom;
  c.view = view;
  renderClassmates(view);
  if (view.round > c.round) {
    if (!['wait', 'over'].includes(game.phase)) {
      setGameId(gameId + 1); // stop whatever the last roll was still doing
      if (!c.reported) {
        Live.skipUnfinished(game);
        toast('⏭️ Next roll!', 'Your teacher moved on before you finished that one.');
      }
    }
    resetTurn();
    c.round = view.round;
    const [a, b] = view.roll;
    if (view.you.done) {
      // No room for this roll (the server checks), or you'd already answered it
      c.reported = true;
      game.dice = [a, b];
      renderDie(el.dieA, a);
      renderDie(el.dieB, b);
      game.phase = 'wait';
      if (view.you.result === 'pass') {
        currentPlayer().log.push({ pass: true, a, b });
        setMsg(`No room for a ${a} × ${b} anywhere. You pass this time.`);
      } else setMsg('Waiting for the next roll…');
    } else {
      c.reported = false;
      classTurn(a, b);
    }
  }
  render();
}

async function classTurn(a, b) {
  setMsg('');
  await rollDice([a, b]);
  await startPlacing(a, b);
}

// Tell the server how this roll went (once per roll).
function reportClass(result) {
  const c = game.classroom;
  if (!c || c.reported) return;
  c.reported = true;
  c.doneTurn = c.round;
  Classroom.sendResult(c.session, { round: c.round, ...result }).catch((err) => {
    if (err.code !== 'stale' && err.code !== 'done') toast('⚠️ Couldn’t send your answer', err.message);
  });
}

// ---- pairs: head to head on a shared board, taking turns

function onPairView(view) {
  const host = classSession.host; // the teacher playing from the projector screen
  // (a tournament plays many games: each has its own match id)
  const sameGame = game && game.mode === 'pair' && game.classroom.game === view.game;
  const mine = sameGame && (!view.match || game.classroom.matchId === view.match.id);
  if (view.type === 'tournament') tournamentUpdate(view, sameGame);
  if (view.match && view.state !== 'lobby') {
    if (!mine) {
      if (view.match.over) return host ? updateMyGameButton() : showClassWaiting(view); // joined after it finished
      startPairGame(view);
    } else syncPairGame(view);
    return;
  }
  if (sameGame && game.phase === 'over') return; // results stay up until the next game starts
  if (game && game.mode === 'pair') {
    if (host) setGame(null);
    else toMenu();
  }
  if (host) return updateMyGameButton();
  showClassWaiting(view);
}

function startPairGame(view) {
  const m = view.match;
  const me = m.players.findIndex((p) => p.id === view.you.id);
  if (!classSession.host) {
    el.classJoin.hidden = true;
    for (const d of document.querySelectorAll('.overlay')) if (d !== el.gameOver) d.hidden = true;
  }
  const defs = m.players.map((p, i) => ({
    name: p.name,
    cpu: p.isCpu,
    avatar: p.avatar, // your partner's look (yours comes from your Wardrobe)
    title: p.title,
    ...(i === me ? { statsName: el.singleName.value.trim() || 'You' } : {}),
  }));
  const { size, difficulty } = view.settings;
  startGame(defs, size, 'pair', null, {
    cfg: { ...classCfg(view.settings), difficulty, autoRoll: view.settings.autoRoll ? 'auto' : 'off' },
    classroom: { session: classSession, game: view.game, matchId: m.id, me, round: 0, reported: true, doneTurn: 0, synced: 0, passSeen: 0, view },
  });
  if (classSession.host && !hostOnGame) showHostView(); // the projector keeps showing the class
  syncPairGame(view);
}

const opponent = () => game.players[1 - game.classroom.me];

// Bring the shared board and the turn up to date with the server.
function syncPairGame(view) {
  if (game.phase === 'over') return; // finished (and rewarded) once already
  const c = game.classroom;
  const m = view.match;
  c.view = view;
  const note = Live.syncPair(game, m, c.me, c);
  if (m.over) return finishPairGame(view);
  const myTurn = m.current === c.me;
  const newTurn = m.turn !== c.round;
  if (newTurn) c.round = m.turn;
  if (newTurn && myTurn && ['wait', 'roll'].includes(game.phase)) startPairTurn(note);
  // your partner's move as they make it: dragging, then answering
  game.partnerLive = !myTurn && m.live && m.live.by !== game.classroom.view.you.id ? m.live : null;
  if (!myTurn && game.phase === 'wait') {
    if (m.roll) {
      if (c.rollShown !== m.turn) {
        c.rollShown = m.turn;
        animatePartnerRoll(m.roll);
      }
      setMsg(Live.partnerLine(opponent().name, m.roll, game.partnerLive));
    } else if (newTurn || note) {
      renderDie(el.dieA, null);
      renderDie(el.dieB, null);
      setMsg(`${note} ${opponent().name}'s turn…`.trim());
    }
  }
  render();
  updateMyGameButton();
}

// Your partner rolled: tumble the dice for a moment, like your own roll
async function animatePartnerRoll([a, b]) {
  const my = gameId;
  const sides = game.sides;
  for (let i = 0; i < 7; i++) {
    renderDie(el.dieA, 1 + Math.floor(Math.random() * sides));
    renderDie(el.dieB, 1 + Math.floor(Math.random() * sides));
    await waitInGame(55);
    if (my !== gameId || !game) return;
  }
  renderDie(el.dieA, a);
  renderDie(el.dieB, b);
}

// Your turn in pairs: tell your partner what you're doing (the rectangle you're
// dragging or aiming, then the one you're answering), when it changes, a few
// times a second at most. Called from render().
const LIVE_EVERY_MS = 120;
let liveSent = '';
let liveTimer = null;
function pairLiveTick() {
  if (!game || game.mode !== 'pair' || game.phase === 'over') return;
  const c = game.classroom;
  if (game.current !== c.me || !['place', 'answer'].includes(game.phase)) return;
  const rect = game.phase === 'answer' ? game.pending && game.pending.rect : game.drag ? dragRect() : humanPreview();
  const payload = { phase: game.phase === 'answer' ? 'answer' : 'place', rect: rect ? { x: rect.x, y: rect.y, w: rect.w, h: rect.h } : null };
  const key = JSON.stringify(payload);
  if (key === liveSent) return;
  liveSent = key;
  if (liveTimer) return; // the latest goes out when the timer fires
  const send = () => {
    liveTimer = null;
    if (!game || game.mode !== 'pair' || game.classroom !== c) return;
    Classroom.live(c.session, JSON.parse(liveSent)).catch(() => {}); // only a preview: never mind if it misses
  };
  send();
  liveTimer = setTimeout(send, LIVE_EVERY_MS);
}

function startPairTurn(note = '') {
  resetTurn();
  game.classroom.reported = false;
  game.phase = 'roll';
  setMsg(`${note} ${game.autoRoll ? 'Your turn! Rolling…' : 'Your turn: roll the dice!'}`.trim());
  render();
  if (classSession.host && !hostOnGame) toast('🎲 Your turn', `in your game with ${opponent().name}`);
  if (game.autoRoll) waitInGame(AUTO_ROLL_MS).then(humanRoll);
}

// After your turn (or at the start): your turn again, or wait for your partner.
function pairTurnOrWait() {
  const c = game.classroom;
  const m = c.view && c.view.match;
  if (m && !m.over && m.current === c.me && m.turn === c.round && m.turn !== c.doneTurn) return startPairTurn();
  game.phase = 'wait';
  setMsg(m && m.current !== c.me ? `${opponent().name}'s turn…` : 'Waiting…');
  render();
}

async function pairRoll() {
  const c = game.classroom;
  game.phase = 'rolling';
  render();
  let res;
  try {
    res = await Classroom.roll(c.session);
  } catch (err) {
    if (game && game.classroom === c) {
      game.phase = 'roll';
      render();
    }
    if (err.code !== 'turn' && err.code !== 'stale') toast('⚠️ Couldn’t roll', err.message);
    return;
  }
  if (!game || game.classroom !== c) return;
  const [a, b] = await rollDice(res.roll);
  if (res.passed) {
    c.reported = true;
    c.doneTurn = c.round;
    game.phase = 'wait';
    setMsg(`No room for a ${a} × ${b} anywhere. You pass.`);
    render();
    return;
  }
  await startPlacing(a, b);
}

function finishPairGame(view) {
  setGameId(gameId + 1);
  stopTimer();
  const c = game.classroom;
  const m = view.match;
  game.phase = 'over';
  game.dice = null;
  game.pending = null;
  el.math.hidden = true;
  setMsg('');
  render();
  updateMyGameButton();
  const me = m.players[c.me];
  const opp = m.players[1 - c.me];
  const result = Live.pairResult(view, c.me, Core.emptyCount(game.board));
  el.resultTitle.textContent = result.title;
  el.resultSub.textContent = result.sub;
  el.resultList.innerHTML = '';
  const top = Math.max(1, me.score, opp.score);
  for (const p of result.rows) {
    const li = make('li', p.you ? 'result-you' : '');
    li.style.setProperty('--c', game.players[p.index].color);
    const bar = make('span', 'result-bar');
    const fill = make('span');
    fill.style.width = `${(p.score / top) * 100}%`;
    bar.append(fill);
    li.append(lookName(p, 'result-name'), make('span', 'result-pts', `${p.score} pts`), bar);
    el.resultList.append(li);
  }
  el.rewards.innerHTML = '';
  if (c.session.teacher) el.rewards.append(make('p', 'setting-help', 'Thanks for playing! Teacher games don’t count towards stats.'));
  else if (view.type === 'tournament') {
    // each tournament game earns its points; the tournament's own rewards come at the end
    Live.tournamentGamePoints(progress, view, c.me);
    saveProgress();
    showRewards([]);
  } else renderPairRewards(view);
  tournamentUpdate(view, true);
  if (result.won) celebrateWin();
  renderStats();
  setDetailsOpen(false);
  if (c.session.host && !hostOnGame) {
    toast('🏁 Your game is over', `${me.score} – ${opp.score} against ${opp.name}`);
    return; // the projector keeps showing the class; the results wait in "My game"
  }
  el.gameOver.hidden = false;
  el.gameOver.querySelector('.dialog').scrollTop = 0;
}

function renderPairRewards(view) {
  const c = game.classroom;
  const p = game.players[c.me];
  const { earned, entry } = Live.pairRewards(progress, view, c.me, p, { startedAt: game.startedAt, statsName: statsName(p) });
  grantStickers(earned); // they show up behind the Stickers button
  saveProgress();
  saveHistory([...loadHistory(), entry]);
  showRewards(earned);
  el.rewards.append(make('p', 'setting-help', 'Stay on this screen: your teacher can start another game.'));
}

// ---- tournaments (students): where you stand between games, and the rewards at the end

const tournamentLine = Live.tournamentLine;

const tournamentRewarded = new Set(); // `${code}:${game}` once its rewards are given

// Every update: keep the line under your last result up to date, and give the
// tournament's rewards once it's over.
function tournamentUpdate(view, sameGame) {
  const t = view.tournament;
  if (!t) return;
  if (sameGame && game.phase === 'over') {
    el.resultTournament.textContent = tournamentLine(t);
    el.resultTournament.hidden = false;
  }
  if (!el.classWait.hidden && !el.classJoin.hidden) el.classWaitText.textContent = tournamentLine(t);
  if (classSession.teacher) return;
  const done = Live.tournamentRewards(progress, view, classSession.name, tournamentRewarded);
  if (!done) return;
  celebrate(done.earned);
  saveProgress();
  saveHistory([...loadHistory(), done.entry]);
  if (done.champion) celebrateWin();
}

function finishClassGame(view) {
  setGameId(gameId + 1);
  stopTimer();
  const you = view.you;
  const p = game.players[0];
  game.classroom.view = view;
  game.phase = 'over';
  game.dice = null;
  game.pending = null;
  el.math.hidden = true;
  setMsg('');
  Object.assign(p, { score: you.score, squares: you.squares, bonus: you.bonus });
  render();
  const result = Live.classResult(view);
  el.resultTitle.textContent = result.title;
  el.resultSub.textContent = result.sub;
  el.resultList.innerHTML = '';
  const top = Math.max(1, ...result.rows.filter((r) => !r.gap).map((r) => r.score));
  for (const r of result.rows) {
    const li = make('li', r.gap ? 'result-gap' : r.you ? 'result-you' : '');
    if (r.gap) {
      li.textContent = '⋯';
      el.resultList.append(li);
      continue;
    }
    li.style.setProperty('--c', r.you ? p.color : 'var(--muted)');
    const bar = make('span', 'result-bar');
    const fill = make('span');
    fill.style.width = `${(r.score / top) * 100}%`;
    bar.append(fill);
    li.append(lookName(r, 'result-name', `${ordinal(r.rank)} ${r.name}`), make('span', 'result-pts', `${r.score} pts`), bar);
    el.resultList.append(li);
  }
  renderClassRewards(view);
  refreshNudges('results');
  if (result.celebrate) celebrateWin();
  renderStats();
  setDetailsOpen(false);
  el.gameOver.hidden = false;
  el.gameOver.querySelector('.dialog').scrollTop = 0;
}

function renderClassRewards(view) {
  const p = game.players[0];
  el.rewards.innerHTML = '';
  const { earned, entry } = Live.classRewards(progress, view, p, { startedAt: game.startedAt, statsName: statsName(p) });
  grantStickers(earned); // they show up behind the Stickers button
  saveProgress();
  saveHistory([...loadHistory(), entry]);
  showRewards(earned);
  el.rewards.append(make('p', 'setting-help', 'Stay on this screen: your teacher can start another game.'));
}

// ---- teacher

let host = null; // { code, teacherKey, lan }

let hostStop = null;

let hostView = null;

function segValue(group) {
  return group.querySelector('.selected').dataset.value;
}

function setSeg(group, value) {
  for (const b of group.querySelectorAll('button')) b.classList.toggle('selected', b.dataset.value === String(value));
}

// Game type: the whole class on one leaderboard, or head to head in pairs.
const HOST_TYPE_HELP = Hosting.HOST_TYPE_HELP;

function renderHostType() {
  const type = segValue(el.hostType);
  for (const b of el.hostType.querySelectorAll('button')) b.setAttribute('aria-checked', String(b.dataset.value === type));
  el.hostTypeHelp.textContent = HOST_TYPE_HELP[type];
  el.hostRounds.closest('.field').hidden = type !== 'class'; // pairs and tournament games run by turns
  setSeg(el.hostSize, Hosting.setupSize(type, Number(segValue(el.hostSize)))); // (a tournament is many short games: a small board)
}

// Creating a class. Everything here (and more) can be changed in the lobby too.
function openHostSetup() {
  // Hosting a class needs a teacher account (the server checks too)
  if (Auth && Auth.served() && Auth.role() !== 'teacher') return askTeacherSignIn();
  renderHostType();
  el.hostError.hidden = true;
  el.hostSetup.hidden = false;
  el.hostCreate.focus();
}

function connectHost(h) {
  if (hostStop) hostStop();
  host = h;
  hostView = null;
  Classroom.saveHost(h);
  el.startScreen.hidden = true;
  el.gameScreen.hidden = true;
  el.hostScreen.hidden = false;
  el.hostCodeSmall.textContent = h.code;
  hostStop = Classroom.listenTeacher(h, { view: renderHost, gone: hostGone });
}

function hostGone(reason) {
  const had = Boolean(hostView);
  if (classSession && classSession.host) {
    if (classStop) classStop();
    classStop = null;
    classSession = null;
    Classroom.saveSession(null);
    if (game && game.mode === 'pair') setGame(null);
  }
  hostOnGame = false;
  el.gameScreen.hidden = true;
  el.gameOver.hidden = true;
  hostStop = null;
  host = null;
  hostView = null;
  Classroom.saveHost(null);
  el.hostScreen.hidden = true;
  el.startScreen.hidden = false;
  if (had && reason !== 'closed') toast('⚠️ Lost the class', 'The classroom server may have restarted.');
}

async function hostAction(action, extra) {
  try {
    await Classroom.teacher(host, action, extra);
  } catch (err) {
    toast('⚠️ ' + err.message);
  }
}

// The address to show on the board. localhost only works on this computer,
// so use the network address the server found instead.
function joinUrl(code) {
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  const base = local && host.lan && host.lan.length ? host.lan[0] : `${location.origin}${location.pathname}`;
  return { base, full: `${base}#class=${code}`, local: local && !(host.lan && host.lan.length) };
}

// ---- teacher: links to post in the class chat

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    // Older browsers or no permission: copy from a hidden text box
    const box = document.createElement('textarea');
    box.value = text;
    box.setAttribute('readonly', '');
    box.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.append(box);
    box.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (err) {}
    box.remove();
    return ok;
  }
}

async function copyWithFeedback(btn, text) {
  const label = btn.innerHTML;
  const ok = await copyText(text);
  btn.classList.add('copied');
  btn.textContent = ok ? '✓ Copied!' : 'Couldn’t copy';
  setTimeout(() => {
    btn.classList.remove('copied');
    btn.innerHTML = label;
  }, 1600);
}

const joinMessage = (code) => Hosting.joinMessage(joinUrl(code).full, code);

function renderHost(view) {
  const first = !hostView;
  hostView = view;
  const s = view.settings;
  el.hostLobby.hidden = view.state !== 'lobby';
  el.hostPlay.hidden = view.state !== 'playing';
  el.hostEnded.hidden = view.state !== 'ended';

  if (view.state === 'lobby') {
    const url = joinUrl(view.code);
    el.hostCode.textContent = view.code;
    el.hostUrl.textContent = url.base.replace(/^https?:\/\//, '').replace(/\/$/, '');
    el.hostLocalHelp.hidden = !url.local;
    if (first || el.hostQr.dataset.url !== url.full) {
      drawQr(el.hostQr, url.full);
      el.hostQr.dataset.url = url.full;
    }
    const pairs = view.type === 'pairs';
    renderHostSettings(view);
    el.hostPairs.hidden = !pairs;
    const start = Hosting.startButton(view);
    el.hostStartBtn.disabled = start.disabled;
    el.hostStartBtn.textContent = start.text;
    if (pairs) renderHostPairsLobby(view);
  } else if (view.state === 'playing' && view.type === 'tournament') {
    renderHostMatches(view, el.hostMatches);
    renderTournament(view.tournament, el.hostTournament);
    el.hostRound.textContent = Hosting.roundLabel(view);
    const next = Hosting.nextButton(view);
    if (next) {
      el.hostNextBtn.replaceChildren(icon('chevron-right'), ` ${next.text}`);
      el.hostNextBtn.disabled = next.disabled;
    }
    el.hostAuto.checked = view.autoNext;
  } else if (view.state === 'playing' && view.type === 'pairs') {
    renderHostMatches(view, el.hostMatches);
    el.hostRound.textContent = Hosting.roundLabel(view);
  } else if (view.state === 'playing') {
    const [a, b] = view.roll;
    const sides = Core.DIFFICULTY_SIDES[s.difficulty];
    el.hostRound.textContent = Hosting.roundLabel(view);
    renderDie(el.hostDieA, a, sides);
    renderDie(el.hostDieB, b, sides);
    el.hostRollText.textContent = `Draw a ${a} by ${b} rectangle`;
    el.hostDoneFill.style.width = `${view.here ? (view.done / view.here) * 100 : 0}%`;
    el.hostDoneText.textContent = `${view.done} of ${view.here} done`;
    const next = Hosting.nextButton(view);
    el.hostNextBtn.replaceChildren(icon(next.finish ? 'flag' : 'dices'), ` ${next.text}`);
    el.hostAuto.checked = view.autoNext;
    renderHostBoards(view);
  } else {
    renderHostResults(view);
  }
  // whole class: dice and pacing; pairs: one card per pair; tournament: the bracket too
  const pairsPlaying = view.type !== 'class';
  const tourney = view.type === 'tournament';
  for (const node of [el.hostDice, el.hostRollText, el.hostProgress]) node.hidden = pairsPlaying;
  el.hostNextBtn.hidden = el.hostAutoLabel.hidden = !Hosting.nextButton(view);
  el.hostAutoLabel.lastChild.textContent = ` ${Hosting.autoLabel(view)}`;
  el.hostMatches.hidden = !pairsPlaying;
  el.hostBoards.hidden = view.type !== 'class' || view.state !== 'playing';
  el.hostTournament.hidden = !tourney || view.state !== 'playing';
  el.hostPodium.hidden = view.type === 'pairs';
  el.hostMatchResults.hidden = view.type !== 'pairs';
  el.hostTournamentFinal.hidden = !tourney || view.state !== 'ended';
  renderHostRoster(view);
  updateMyGameButton();
}

// "Make it quick": everything that saves time
const QUICK_SETTINGS = Hosting.QUICK_SETTINGS;

function renderHostSettings(view) {
  const grid = el.hostSettingsGrid;
  if (!grid.children.length) {
    for (const def of HOST_SETTINGS) {
      const field = make('div', 'field' + (def.wide ? ' wide' : ''));
      field.append(make('span', null, def.label));
      const seg = make('div', 'segmented');
      seg.dataset.key = def.key;
      for (const [value, label, detail] of def.options) {
        const b = make('button', null, label);
        b.type = 'button';
        b.dataset.value = JSON.stringify(value);
        if (detail) b.append(' ', make('small', null, detail));
        seg.append(b);
      }
      field.append(seg);
      grid.append(field);
    }
  }
  HOST_SETTINGS.forEach((def, i) => {
    grid.children[i].hidden = !Hosting.settingShown(def, view);
  });
  for (const seg of grid.querySelectorAll('.segmented')) {
    const current = JSON.stringify(view.settings[seg.dataset.key]);
    for (const b of seg.querySelectorAll('button')) b.classList.toggle('selected', b.dataset.value === current);
  }
  el.hostQuick.disabled = Hosting.isQuick(view);
}

// ---- teacher: tournaments on the projector

const TOURNAMENT_NAMES = Stats.TOURNAMENT_NAMES;

// Knockouts: the bracket, a column per round. Other formats: the standings
// table (and, for king of the hill, each hill's king and line).
function renderTournament(t, box) {
  box.innerHTML = '';
  if (t.format === 'koth') {
    const hills = make('div', 'koth-hills');
    for (const h of t.hills) {
      const card = make('div', 'koth-hill');
      card.append(make('div', 'koth-title', t.hills.length > 1 ? `Hill ${h.id}` : 'The hill'));
      card.append(make('div', 'koth-king', h.king ? `👑 ${h.king}` : '👑 …'));
      if (h.streak > 1) card.append(make('div', 'koth-streak', `🔥 ${h.streak} wins in a row`));
      card.append(make('div', 'koth-queue', h.queue.length ? `Next: ${h.queue.join(', ')}` : ''));
      card.append(make('div', 'koth-count', `${h.played} of ${h.limit} games`));
      hills.append(card);
    }
    box.append(hills);
  }
  if (t.format === 'knockout' || t.format === 'double') {
    const cols = make('div', 'bracket');
    for (const r of t.rounds) {
      const col = make('div', 'bracket-round');
      col.append(make('div', 'bracket-label', r.label));
      for (const m of r.matches) {
        const game = make('div', 'bracket-match');
        for (const name of [m.a, m.b]) game.append(make('div', 'bracket-name' + (name === m.winner ? ' winner' : ' loser'), name));
        col.append(game);
      }
      for (const name of r.byes) col.append(make('div', 'bracket-bye', `${name}: bye`));
      cols.append(col);
    }
    box.append(cols);
  }
  if (t.format !== 'knockout') {
    const table = make('table', 'standings');
    const head = table.createTHead().insertRow();
    for (const h of ['', 'Name', 'W', 'L', t.format === 'koth' ? 'Best streak' : 'Points']) head.append(make('th', null, h));
    const body = table.createTBody();
    for (const x of t.standings) {
      const tr = body.insertRow();
      if (x.out) tr.className = 'out';
      tr.append(make('td', null, ordinal(x.place)), make('td', null, x.name), make('td', null, String(x.wins)), make('td', null, String(x.losses)), make('td', null, String(t.format === 'koth' ? x.bestStreak : x.points)));
    }
    box.append(table);
  }
}

function renderPodium(view) {
  el.hostPodium.innerHTML = '';
  for (const x of Hosting.podium(view)) {
    const li = make('li', `podium-${x.place || x.rank}`);
    li.append(make('span', 'podium-medal', x.medal), lookName(x, 'podium-name'), make('span', 'podium-score', x.score));
    el.hostPodium.append(li);
  }
}

// The roster (Hosting.roster): standings in a tournament, else who's joined or the leaderboard
function renderRosterRows(view) {
  const r = Hosting.roster(view);
  el.hostRosterTitle.textContent = r.title;
  el.hostRoster.innerHTML = '';
  el.hostRoster.classList.toggle('ranked', r.ranked);
  if (!r.rows.length) el.hostRoster.append(make('li', 'host-empty', 'Nobody yet. Names show up here as students join.'));
  for (const p of r.rows) {
    if (p.waiting) {
      const li = make('li', 'waiting' + (p.offline ? ' offline' : ''));
      li.append(lookName(p, 'host-name'), make('span', 'host-waiting', p.waiting));
      li.title = 'Joined after this game started';
      el.hostRoster.append(li);
      continue;
    }
    const li = make('li', (p.offline ? 'offline ' : '') + (p.out ? 'knocked-out' : ''));
    if (p.rank) li.append(make('span', 'host-rank', p.rank));
    li.append(lookName(p, 'host-name'));
    if (p.removable) {
      const remove = make('button', 'host-remove', '×');
      remove.type = 'button';
      remove.title = `Remove ${p.name}`;
      remove.setAttribute('aria-label', `Remove ${p.name}`);
      remove.addEventListener('click', () => confirm(`Remove ${p.name} from the class?`) && hostAction('remove', { id: p.id }));
      li.append(remove);
    } else li.append(make('span', 'host-score', p.score), make('span', 'host-status', p.status));
    el.hostRoster.append(li);
  }
}

// ---- teacher: pairs

let swapPick = null; // arranging pairs: the first name tapped

function renderHostPairsLobby(view) {
  // Only "on this screen" plays from this page; otherwise let go of the teacher's
  // player here (another device or the CPU plays instead).
  if (view.pairOptions.odd !== 'screen' && classSession && classSession.host) {
    if (classStop) classStop();
    classStop = null;
    classSession = null;
    Classroom.saveSession(null);
    if (game && game.mode === 'pair') setGame(null);
  }
  setSeg(el.hostMatching, view.pairOptions.matching);
  setSeg(el.hostOdd, view.pairOptions.odd);
  const n = view.players.length;
  el.hostPairsHelp.textContent = Hosting.pairsHelp(view);
  // Pairs preview (shuffle mode draws new ones at the start)
  el.hostPairList.hidden = view.pairOptions.matching === 'shuffle' || !n;
  el.hostPairList.innerHTML = '';
  const arrange = view.pairOptions.matching === 'arrange';
  if (swapPick && !view.players.some((p) => p.id === swapPick)) swapPick = null;
  const nameChip = (p) => {
    if (!arrange) return lookName(p, 'pair-name');
    const b = make('button', 'pair-name' + (swapPick === p.id ? ' picked' : ''), p.name);
    b.type = 'button';
    b.addEventListener('click', () => {
      if (!swapPick) swapPick = p.id;
      else if (swapPick === p.id) swapPick = null;
      else {
        hostAction('swap', { a: swapPick, b: p.id });
        swapPick = null;
      }
      renderHostPairsLobby(hostView);
    });
    return b;
  };
  for (const [a, b] of view.pairs) {
    const li = make('li');
    li.append(nameChip(a), make('span', 'pair-vs', 'vs'));
    li.append(b ? nameChip(b) : make('span', 'pair-name other', view.pairOptions.odd === 'cpu' ? 'CPU' : 'You'));
    el.hostPairList.append(li);
  }
  // Playing the odd one out from another device: its link and whether it has joined
  const device = view.pairOptions.odd === 'device';
  el.hostTeacherDevice.hidden = !device;
  if (device) {
    const url = `${joinUrl(view.code).base}#class=${view.code}&play=${view.playKey}`;
    el.hostTeacherUrl.textContent = url.replace(/^https?:\/\//, '');
    if (el.hostTeacherQr.dataset.url !== url) {
      drawQr(el.hostTeacherQr, url);
      el.hostTeacherQr.dataset.url = url;
    }
    const joined = view.teacher && view.teacher.connected;
    el.hostTeacherStatus.textContent = joined ? '✓ Your other device has joined.' : 'Not joined yet.';
    el.hostTeacherStatus.classList.toggle('ok', Boolean(joined));
  }
}

// One card per pair: both names and scores, whose turn it is, and how it ended.
function renderHostMatches(view, list) {
  list.innerHTML = '';
  for (const m of view.matches) {
    const li = make('li', 'host-match' + (m.over ? ' over' : ''));
    const card = Hosting.matchCard(m);
    for (const p of card.rows) {
      const row = make('div', 'match-row' + (p.winner ? ' winner' : ''));
      row.append(make('span', 'match-turn', p.mark), lookName(p, 'match-name'), make('span', 'match-score', String(p.score)));
      li.append(row);
    }
    li.append(make('div', 'match-status', card.status));
    list.append(li);
  }
}

// ---- teacher: playing the odd one out on this screen

let hostOnGame = false; // showing the teacher's own game instead of the class

function showHostView() {
  hostOnGame = false;
  el.gameScreen.hidden = true;
  el.gameOver.hidden = true;
  el.hostScreen.hidden = !host;
  if (!host) el.startScreen.hidden = false;
  updateMyGameButton();
}

function showMyGame() {
  if (!game || game.mode !== 'pair') return;
  hostOnGame = true;
  el.hostScreen.hidden = true;
  el.gameScreen.hidden = false;
  resizeBoard();
  render();
  if (game.phase === 'over') {
    el.gameOver.hidden = false;
    el.gameOver.querySelector('.dialog').scrollTop = 0;
  }
}

function updateMyGameButton() {
  const btn = el.hostMyGameBtn;
  const mine = classSession && classSession.host && game && game.mode === 'pair';
  btn.hidden = !mine || !hostView || hostView.state === 'lobby';
  if (btn.hidden) return;
  const opp = opponent();
  const yourTurn = game.phase !== 'over' && game.current === game.classroom.me;
  btn.textContent = game.phase === 'over' ? `Your game with ${opp.name} is over: see the result` : yourTurn ? `🎲 Your turn! Play your game with ${opp.name}` : `Your game with ${opp.name}`;
  btn.classList.toggle('your-turn', yourTurn);
}

function renderHostRoster(view) {
  renderRosterRows(view);
}

// Whole class: every student's board, updating as they place their rectangles
function renderHostBoards(view) {
  const box = el.hostBoards;
  box.replaceChildren();
  for (const p of view.players) {
    const card = make('div', 'host-board' + (p.done ? ' done' : '') + (p.connected ? '' : ' offline'));
    card.append(miniBoard((view.boards && view.boards[p.id]) || [], view.settings.size, '#2e86de', 96));
    const who = make('div', 'classmate-who');
    who.append(lookName(p, 'classmate-name'), make('span', 'classmate-score', `${p.done ? '✓ ' : ''}${p.score}`));
    card.append(who);
    box.append(card);
  }
}

function renderHostResults(view) {
  if (view.type === 'pairs') renderHostMatches(view, el.hostMatchResults);
  if (view.type === 'tournament' && view.tournament) {
    renderTournament(view.tournament, el.hostTournamentFinal);
    renderPodium(view);
    renderHostReport(view);
    return;
  }
  renderPodium(view);
  renderHostReport(view);
}

function renderHostReport(view) {
  const r = view.report;
  el.hostReport.innerHTML = '';
  const tile = (value, label) => {
    const t = make('div', 'tile');
    t.append(make('span', 'tile-value', value), make('span', 'tile-label', label));
    return t;
  };
  el.hostReport.append(...Hosting.reportTiles(r).map(([value, label]) => tile(value, label)));
  el.hostHardest.innerHTML = '';
  if (!r.hardest.length) el.hostHardest.append(make('li', 'host-empty', 'Nothing missed. What a class! 🌟'));
  for (const f of r.hardest) {
    const li = make('li');
    li.append(make('span', 'host-fact', f.fact), make('span', 'host-missed', `missed ${f.missed} of ${f.asked}`));
    el.hostHardest.append(li);
  }
}

async function closeClass() {
  if (!confirm('Close the class? Everyone goes back to their menu.')) return;
  const h = host;
  if (hostStop) hostStop();
  await Classroom.teacher(h, 'close').catch(() => {});
  hostGone('closed');
}

// What this part does when the page loads (main.js runs every part in order)
export function run() {
  el.classJoinOpen.addEventListener('click', () => openClassJoin());

  el.classJoinCancel.addEventListener('click', () => (el.classJoin.hidden = true));

  el.classCodeInput.addEventListener('input', () => {
    el.classCodeInput.value = el.classCodeInput.value.toUpperCase().replace(/[^A-Z]/g, '');
  });

  el.classJoinForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = el.classCodeInput.value.trim().toUpperCase();
    const name = el.classNameInput.value.trim();
    const fail = (msg, input) => {
      el.classJoinError.textContent = msg;
      el.classJoinError.hidden = false;
      if (input) input.focus();
    };
    if (code.length !== 4) return fail('The class code has 4 letters.', el.classCodeInput);
    if (!name) return fail('Type your first name.', el.classNameInput);
    el.classJoinBtn.disabled = true;
    try {
      const joined = await Classroom.join(code, name, myLook());
      try {
        localStorage.setItem(CLASS_NAME_KEY, joined.name);
      } catch (e) {}
      connectClass({ code, id: joined.id, key: joined.key, name: joined.name });
      showClassWaiting(null);
    } catch (err) {
      fail(err.message, err.code === 'room' ? el.classCodeInput : el.classNameInput);
    } finally {
      el.classJoinBtn.disabled = false;
    }
  });

  el.classLeaveBtn.addEventListener('click', () => {
    leaveClass();
    el.classJoin.hidden = true;
  });

  for (const group of [el.hostType, el.hostSize, el.hostDifficulty, el.hostRounds]) {
    group.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      setSeg(group, b.dataset.value);
      if (group === el.hostType) renderHostType();
    });
  }

  el.classHostOpen.addEventListener('click', openHostSetup);

  el.hostCancel.addEventListener('click', () => (el.hostSetup.hidden = true));

  el.hostCreate.addEventListener('click', async () => {
    const chosen = { size: Number(segValue(el.hostSize)), difficulty: segValue(el.hostDifficulty), rounds: Number(segValue(el.hostRounds)) };
    el.hostCreate.disabled = true;
    try {
      const room = await Classroom.createRoom({ ...chosen, type: segValue(el.hostType) });
      connectHost({ code: room.code, teacherKey: room.teacherKey, lan: room.lan });
      el.hostSetup.hidden = true;
    } catch (err) {
      el.hostError.textContent = err.message;
      el.hostError.hidden = false;
    } finally {
      el.hostCreate.disabled = false;
    }
  });

  el.hostCopyLink.addEventListener('click', () => hostView && copyWithFeedback(el.hostCopyLink, joinUrl(hostView.code).full));

  el.hostCopyMsg.addEventListener('click', () => hostView && copyWithFeedback(el.hostCopyMsg, joinMessage(hostView.code)));

  el.hostShareBtn.hidden = !navigator.share;

  el.hostShareBtn.addEventListener('click', () => {
    if (!hostView) return;
    navigator.share({ title: 'Blockout class', text: joinMessage(hostView.code), url: joinUrl(hostView.code).full }).catch(() => {});
  });

  el.hostCopyTeacher.addEventListener('click', () => hostView && copyWithFeedback(el.hostCopyTeacher, `${joinUrl(hostView.code).base}#class=${hostView.code}&play=${hostView.playKey}`));

  // ---- teacher: game settings in the lobby, for the whole class and free of shop locks


  el.hostSettingsGrid.addEventListener('click', (e) => {
    const b = e.target.closest('.segmented button');
    if (!b) return;
    const key = b.closest('.segmented').dataset.key;
    hostAction('settings', { settings: { [key]: JSON.parse(b.dataset.value) } });
  });

  el.hostQuick.addEventListener('click', () => hostAction('settings', { settings: QUICK_SETTINGS }));

  for (const [group, key] of [
    [el.hostMatching, 'matching'],
    [el.hostOdd, 'odd'],
  ]) {
    group.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) hostAction('pairOptions', { options: { [key]: b.dataset.value } });
    });
  }

  el.hostMyGameBtn.addEventListener('click', showMyGame);

  el.hostStartBtn.addEventListener('click', async () => {
    const v = hostView;
    if (v && v.type === 'pairs' && v.odd.needed && v.odd.how === 'screen' && !(classSession && classSession.host)) {
      // The odd one out plays the teacher, here: join as a player first
      try {
        const me = await Classroom.joinAsTeacher(host, myLook());
        connectClass({ code: host.code, id: me.id, key: me.key, name: me.name, teacher: true, host: true });
      } catch (err) {
        return toast('⚠️ ' + err.message);
      }
    }
    hostAction('start');
  });

  el.hostNextBtn.addEventListener('click', () => hostAction('next'));

  el.hostEndBtn.addEventListener('click', () => confirm('End the game now? Scores so far are final.') && hostAction('end'));

  el.hostAuto.addEventListener('change', () => hostAction('autoNext', { on: el.hostAuto.checked }));

  el.hostAgainBtn.addEventListener('click', () => hostAction('lobby'));

  el.hostCloseBtn.addEventListener('click', closeClass);

  el.hostClose2Btn.addEventListener('click', closeClass);

  // Space rolls again on the teacher's screen
  document.addEventListener('keydown', (e) => {
    if (el.hostScreen.hidden || !hostView || e.target.closest('input, button, .overlay')) return;
    if ((e.key === ' ' || e.key === 'Enter') && hostView.state === 'playing' && hostView.type === 'class') {
      e.preventDefault();
      hostAction('next');
    }
  });

  // ---- after a reload: pick up where this browser left off

  if (Classroom.served()) {
    const savedHost = Classroom.host();
    const savedSession = Classroom.session();
    const link = Classroom.linkFromHash();
    if (link) {
      history.replaceState(null, '', location.pathname + location.search);
      tap('[data-mode="multi"]');
      tap('#multi-kind [data-kind="classroom"]');
      if (savedSession && savedSession.code === link.code) connectClass(savedSession);
      else if (link.play) {
        // the teacher's other device, for playing an odd one out
        Classroom.joinWithPlayKey(link.code, link.play, myLook())
          .then((me) => {
            connectClass({ code: link.code, id: me.id, key: me.key, name: me.name, teacher: true });
            showClassWaiting(null);
          })
          .catch((err) => toast('⚠️ ' + err.message));
      } else openClassJoin(link.code, true);
    } else {
      if (savedHost) connectHost(savedHost);
      if (savedSession && (!savedHost || savedSession.host)) connectClass(savedSession);
    }
  }

  // Board wins started being counted when winning a board revealed the next one:
  // give credit for wins already in the game history (once).
  if (!progress.boardWinsFromHistory) {
    for (const g of loadHistory()) {
      if (!g.kind && g.vsComputer && g.players.some((p) => !p.cpu && p.result === 'win')) Progress.recordBoardWin(progress, g.size);
    }
    progress.boardWinsFromHistory = true;
    saveProgress();
    syncBoardLocks();
  }
}

export { pairLiveTick, TOURNAMENT_NAMES, checkClassroom, classSession, connectHost, leaveClass, openClassJoin, openHostSetup, ordinal, pairRoll, pairTurnOrWait, reportClass, showHostView };
