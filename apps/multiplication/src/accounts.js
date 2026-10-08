// Account screens: signing in (dev sign-in for now), a student's homework and
// classes, a teacher's classes (roster, stats, homework, scheduled tournaments)
// and a parent's view of their children. Talks to apps/server through
// @blockout/auth and borrows a few helpers from the game (./game/api.js).
// Guests never see any of it except "Sign in".

import * as Auth from '@blockout/auth';
import * as Game from './game/api.js';
import * as Progress from '@blockout/progress';

let el, account, homework, classes, kids;

const { make, toast } = Game;

const $ = (id) => document.getElementById(id);

const ROLE = {
  student: { emoji: '🎒', label: 'Student' },
  teacher: { emoji: '🍎', label: 'Teacher' },
  parent: { emoji: '👪', label: 'Parent' },
};

const DIFFICULTY_NAMES = Progress.DIFFICULTY_NAMES;

const FORMAT_NAMES = { knockout: 'Knockout', double: 'Double elimination', roundrobin: 'Round robin', swiss: 'Swiss', koth: 'King of the hill' };

const LIVE_POLL_MS = 20 * 1000;

const SCHEDULE_POLL_MS = 15 * 1000;

function button(text, cls = 'btn', onClick = null) {
  const b = make('button', cls, text);
  b.type = 'button';
  if (onClick) b.addEventListener('click', onClick);
  return b;
}

function field(label, input) {
  const f = make('label', 'field');
  f.append(make('span', null, label), input);
  return f;
}

function input(attrs = {}) {
  const i = document.createElement('input');
  for (const [k, v] of Object.entries(attrs)) i.setAttribute(k, v);
  return i;
}

function select(options, value) {
  const s = document.createElement('select');
  for (const [v, text] of options) {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = text;
    s.append(o);
  }
  if (value !== undefined) s.value = String(value);
  return s;
}

// A row of choice buttons (the game's .segmented look); returns { el, value() }
function segmented(options, value, onChange) {
  const wrap = make('div', 'segmented');
  let current = value;
  for (const [v, text] of options) {
    const b = button(text);
    b.dataset.value = v;
    b.classList.toggle('selected', v === value);
    b.addEventListener('click', () => {
      current = v;
      for (const x of wrap.children) x.classList.toggle('selected', x === b);
      if (onChange) onChange(v);
    });
    wrap.append(b);
  }
  return { el: wrap, value: () => current };
}

const errorLine = () => {
  const p = make('p', 'invite-error');
  p.setAttribute('role', 'alert');
  p.hidden = true;
  return p;
};

const showError = (p, err) => {
  p.textContent = err.message || String(err);
  p.hidden = false;
};

const dayString = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const niceDay = (s) => new Date(`${s}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

const niceTime = (t) => new Date(t).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function ago(t) {
  if (!t) return 'not yet';
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

// Our own dialogs, built like the game's: .overlay > .dialog with a bottom
// .dialog-actions panel. Escape or the backdrop closes them.
function dialog(id, title, cls = '') {
  let overlay = $(id);
  if (!overlay) {
    overlay = make('div', 'overlay');
    overlay.id = id;
    overlay.hidden = true;
    const box = make('div', `dialog acct-dialog ${cls}`);
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-labelledby', `${id}-title`);
    const h = make('h2', null, title);
    h.id = `${id}-title`;
    const body = make('div', 'acct-body');
    const actions = make('div', 'dialog-actions');
    box.append(h, body, actions);
    overlay.append(box);
    document.body.append(overlay);
    overlay.addEventListener('click', (e) => e.target === overlay && close());
    overlay.addEventListener('keydown', (e) => e.key === 'Escape' && close());
  }
  const d = {
    overlay,
    title: overlay.querySelector('h2'),
    body: overlay.querySelector('.acct-body'),
    actions: overlay.querySelector('.dialog-actions'),
    onClose: null,
  };
  function close() {
    overlay.hidden = true;
    if (overlay._onClose) overlay._onClose();
  }
  d.open = () => (overlay.hidden = false);
  d.close = close;
  d.setOnClose = (fn) => (overlay._onClose = fn);
  d.clear = (heading = title) => {
    d.title.textContent = heading;
    d.body.replaceChildren();
    d.actions.replaceChildren();
  };
  d.done = (text = 'Done') => {
    const b = button(text, 'btn btn-primary', close);
    d.actions.append(b);
    return b;
  };
  return d;
}

function renderMenu() {
  const served = Auth.served();
  el.accountBtn.hidden = !served;
  const u = Auth.user();
  el.accountBtn.replaceChildren(u ? `${ROLE[u.role].emoji} ${u.name}` : '👤 Sign in');
  el.accountBtn.title = u ? `${ROLE[u.role].label} account: tap for yours` : 'Sign in (you can always play as a guest)';
  const role = Auth.role();
  el.homeworkBtn.hidden = role !== 'student';
  el.classesBtn.hidden = role !== 'teacher';
  el.kidsBtn.hidden = role !== 'parent';
}

function setBadge(btn, count) {
  let badge = btn.querySelector('.badge');
  if (!count) return badge && badge.remove();
  if (!badge) {
    badge = make('span', 'badge');
    badge.setAttribute('aria-hidden', 'true');
    btn.append(badge);
  }
  badge.textContent = String(count);
}

async function openSignIn({ role = 'student', note = '' } = {}) {
  account.clear('Sign in');
  let config;
  try {
    config = await Auth.config();
  } catch (err) {
    account.body.append(make('p', 'setting-help', err.message));
    account.done('OK');
    return account.open();
  }
  if (note) account.body.append(make('p', 'acct-note', note));
  if (config.provider === 'keycloak') {
    account.body.append(make('p', 'setting-help', 'Sign in with your school or family account.'));
    account.actions.append(button('Play as a guest', 'btn', account.close), button('Sign in', 'btn btn-primary', () => Auth.signInKeycloak()));
    return account.open();
  }
  // Dev sign-in: pick who you are
  account.body.append(
    make('p', 'setting-help', 'Practice sign-in: pick who you are. (Signing in with a real school account comes later.) You can always play as a guest instead.')
  );
  const who = segmented(
    [
      ['student', '🎒 Student'],
      ['teacher', '🍎 Teacher'],
      ['parent', '👪 Parent'],
    ],
    role,
    () => showFields()
  );
  const first = input({ type: 'text', maxlength: '20', autocomplete: 'off', placeholder: 'e.g. Maya' });
  const initial = input({ type: 'text', maxlength: '1', autocomplete: 'off', placeholder: 'K', class: 'acct-initial' });
  const email = input({ type: 'email', autocomplete: 'off', placeholder: 'maya@iusd.org' });
  const school = select([...config.schools.map((s) => [s.id, `${s.name} (@${s.domain})`]), ['', 'No school']]);
  const emailField = field('School email', email);
  const schoolField = field('School', school);
  const names = make('div', 'acct-names');
  names.append(field('First name', first), field('Last initial', initial));
  const error = errorLine();
  const form = make('form', 'acct-form');
  form.append(who.el, names, emailField, schoolField, make('p', 'setting-help acct-privacy', 'We only keep your first name and last initial.'), error);
  let emailTouched = false;
  email.addEventListener('input', () => (emailTouched = true));
  first.addEventListener('input', () => {
    if (!emailTouched && config.schools[0]) email.value = first.value.trim() ? `${first.value.trim().toLowerCase()}@${config.schools[0].domain}` : '';
  });
  function showFields() {
    emailField.hidden = who.value() !== 'student';
    schoolField.hidden = who.value() !== 'teacher';
  }
  showFields();
  const submit = async (e) => {
    if (e) e.preventDefault();
    error.hidden = true;
    go.disabled = true;
    try {
      const r = who.value();
      await Auth.signInDev({
        role: r,
        firstName: first.value,
        lastInitial: initial.value,
        email: r === 'student' ? email.value : r === 'parent' ? '' : undefined,
        schoolId: r === 'teacher' ? school.value : undefined,
      });
      location.reload(); // the page picks up the account's save
    } catch (err) {
      showError(error, err);
      go.disabled = false;
    }
  };
  form.addEventListener('submit', submit);
  account.body.append(form);
  const go = button('Sign in', 'btn btn-primary', submit);
  account.actions.append(button('Play as a guest', 'btn', account.close), go);
  account.open();
  first.focus();
}

async function openAccount() {
  const u = Auth.user();
  if (!u) return openSignIn();
  account.clear('Your account');
  const card = make('div', 'acct-card');
  card.append(make('div', 'acct-big', `${ROLE[u.role].emoji} ${u.name}`), make('div', 'acct-sub', `${ROLE[u.role].label}${u.school ? ` · ${u.school.name}` : ''}`));
  account.body.append(card);
  if (u.role === 'student') await studentAccount();
  if (u.role === 'teacher') account.body.append(make('p', 'setting-help', 'Your classes, homework and tournaments are under 🏫 My classes on the main menu.'));
  if (u.role === 'parent') account.body.append(make('p', 'setting-help', 'Follow your children under 👪 My kids on the main menu.'));
  account.actions.append(button('Sign out', 'btn', () => Auth.signOut()));
  account.done();
  account.open();
}

// Back from signing out of an account that came from Google. Blockout and
// Keycloak are signed out; Google isn't, and only Google can do that, for all of
// Google in this browser at once. So it's offered, not done.
function signedOutOfGoogle() {
  account.clear('Signed out');
  account.body.append(
    make('p', null, 'You’re signed out of Blockout.'),
    make('p', 'setting-help', 'On a shared computer? This browser is still signed in to Google. Signing out of Google signs you out of all of it here: Gmail, Classroom, YouTube and the rest.'),
  );
  const google = make('a', 'btn', 'Also sign out of Google');
  google.href = 'https://accounts.google.com/Logout';
  google.target = '_blank';
  google.rel = 'noopener';
  account.actions.append(google);
  account.done();
  account.open();
}

// A student's classes, joining one with a code, and the code for a grown-up
async function studentAccount() {
  const classes = make('div', 'acct-section');
  classes.append(make('h3', 'stats-heading', 'Your classes'));
  const list = make('div', 'acct-list');
  classes.append(list);
  const code = input({ type: 'text', maxlength: '8', autocomplete: 'off', placeholder: 'Class code', class: 'acct-code-input' });
  const error = errorLine();
  const row = make('form', 'acct-inline');
  const join = button('Join', 'btn btn-small btn-primary');
  join.type = 'submit';
  row.append(code, join);
  row.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.hidden = true;
    try {
      const r = await Auth.api('POST', '/api/me/classes', { code: code.value });
      toast('🏫 Joined!', r.class.name);
      code.value = '';
      await fill();
    } catch (err) {
      showError(error, err);
    }
  });
  classes.append(row, error);
  const parent = make('div', 'acct-section');
  account.body.append(classes, parent);
  async function fill() {
    list.replaceChildren();
    try {
      const { classes: mine } = await Auth.api('GET', '/api/me/classes');
      if (!mine.length) list.append(make('p', 'setting-help', 'Not in a class yet. Type the code your teacher gives you.'));
      for (const c of mine) list.append(make('div', 'acct-item', `🏫 ${c.name}`));
    } catch (err) {
      list.append(make('p', 'setting-help', err.message));
    }
  }
  await fill();
  try {
    const { code: pc } = await Auth.api('GET', '/api/me/parent-code');
    parent.append(make('h3', 'stats-heading', 'For a grown-up'), make('p', 'setting-help', 'Give this code to your mom, dad or another grown-up so they can see how you’re doing and add homework.'), make('div', 'acct-code', pc.replace(/(.{4})/, '$1 ')));
  } catch (_) {
    // not fatal
  }
}

function askTeacherSignIn() {
  openSignIn({ role: 'teacher', note: '🍎 Teachers: sign in to host a class. Students join with the code (no sign-in needed).' });
}

const STATUS_ORDER = [
  ['mastered', 'Mastered'],
  ['learning', 'Learning'],
  ['practice', 'Needs practice'],
  ['unseen', 'Not seen yet'],
];

// A thin bar: mastered / learning / needs practice / not seen, out of 144
function masteryBar(summary) {
  const bar = make('div', 'acct-mastery');
  bar.title = STATUS_ORDER.map(([k, label]) => `${label}: ${summary[k]}`).join(' · ');
  for (const [k] of STATUS_ORDER) {
    const seg = make('span', `seg is-${k}`);
    seg.style.width = `${(summary[k] / summary.total) * 100}%`;
    bar.append(seg);
  }
  return bar;
}

function activityText(e) {
  const diff = e.difficulty ? `${DIFFICULTY_NAMES[e.difficulty] || e.difficulty} ` : '';
  if (e.kind === 'practice') return `📝 ${diff}practice, ${e.count} questions${e.expert ? ' (Expert)' : ''}`;
  if (e.kind === 'class') return e.type === 'tournament' ? `🏆 Class tournament game${e.won ? ' (won)' : ''}` : e.type === 'pairs' ? `🤝 Class pairs game${e.won ? ' (won)' : ''}` : `🏫 Class game${e.rank ? ` (${e.rank}${['st', 'nd', 'rd'][e.rank - 1] || 'th'})` : ''}`;
  return `🎲 ${diff}${e.size}×${e.size} ${e.mode === 'multi' ? 'game at home' : e.won ? 'game, beat the CPU' : 'game vs the CPU'}`;
}

// onPlay(goal): the student's list, where each open homework starts its game
function homeworkList(items, { onRemove = null, mine = () => false, onPlay = null } = {}) {
  const list = make('div', 'acct-list');
  if (!items.length) list.append(make('p', 'setting-help', 'No homework.'));
  for (const h of items) {
    const row = make('div', `acct-hw ${h.status}`);
    const top = make('div', 'acct-hw-top');
    top.append(make('strong', null, h.label || Progress.describeGoal(h.goal)));
    const state = h.status === 'done' ? '✅ Done' : h.status === 'late' ? `⏰ Was due ${niceDay(h.due)}` : h.due ? `Due ${niceDay(h.due)}` : 'Any time';
    top.append(make('span', 'acct-hw-state', state));
    row.append(top);
    const bar = make('div', 'practice-bar');
    const fill = make('span');
    fill.style.width = `${(h.have / h.need) * 100}%`;
    bar.append(fill);
    const meta = make('div', 'acct-hw-meta');
    meta.append(make('span', null, `${h.have} of ${h.need}`), make('span', null, h.from === 'parent' ? `from ${h.fromName || 'a grown-up'} 👪` : `from ${h.fromName || 'your teacher'} 🍎`));
    if (onRemove && mine(h)) meta.append(button('Remove', 'btn btn-small', () => onRemove(h)));
    if (onPlay && h.status !== 'done') {
      row.classList.add('playable');
      const play = button('Play ›', 'btn btn-small btn-primary', () => onPlay(h.goal));
      play.setAttribute('aria-label', `Play: ${h.label || Progress.describeGoal(h.goal)}`);
      meta.append(play);
    }
    row.append(bar, meta);
    list.append(row);
  }
  return list;
}

// What a teacher or parent sees for one student
function studentDetail(s, { onAddHomework, onRemoveHomework, mine }) {
  const box = make('div', 'acct-detail');
  const head = make('div', 'acct-card');
  head.append(make('div', 'acct-sub', `Last played ${ago(s.lastPlayed)}`)); // (the dialog title is the name)
  box.append(head);
  // Times Table
  const tt = make('div', 'acct-section');
  tt.append(make('h3', 'stats-heading', 'Times Table'));
  const counts = make('div', 'acct-counts');
  for (const [k, label] of STATUS_ORDER) counts.append(make('span', `acct-count is-${k}`, `${s.summary[k]} ${label.toLowerCase()}`));
  tt.append(counts, masteryBar(s.summary));
  if (s.facts) {
    tt.append(Game.renderFactLegend());
    tt.append(Game.renderFactGrid(null, s.facts, 12));
  }
  if (s.summary.needsPractice.length) {
    tt.append(make('p', 'setting-help', 'Needs practice:'));
    const chips = make('div', 'acct-chips');
    for (const f of s.summary.needsPractice) chips.append(make('span', 'acct-chip is-practice', f));
    tt.append(chips);
  }
  box.append(tt);
  // Homework
  const hw = make('div', 'acct-section');
  hw.append(make('h3', 'stats-heading', 'Homework'), homeworkList(s.assignments, { onRemove: onRemoveHomework, mine }));
  if (onAddHomework) hw.append(homeworkForm(onAddHomework, s.options, s.name));
  box.append(hw);
  // Recent activity
  const act = make('div', 'acct-section');
  act.append(make('h3', 'stats-heading', 'Recently'));
  if (!s.recent.length) act.append(make('p', 'setting-help', 'Nothing played yet.'));
  for (const e of s.recent) {
    const row = make('div', 'acct-activity');
    row.append(make('span', null, activityText(e)), make('span', 'acct-when', ago(e.t)));
    act.append(row);
  }
  box.append(act);
  return box;
}

// Set homework: the goal, its details and a due date. onSubmit({ goal, due })
// Only offers what the child (or every child in the class) can already play:
// options = { practice, difficulties, boards, tables } from the server.
function homeworkForm(onSubmit, options, who) {
  const form = make('form', 'acct-hw-form');
  form.append(make('h4', null, 'Add homework'));
  const kinds = [];
  if (options.practice && options.tables.length) kinds.push(['master', 'Master a times table']);
  if (options.practice) kinds.push(['practice', 'Finish practice rounds']);
  kinds.push(['win', 'Beat the CPU on a board'], ['games', 'Play games']);
  const type = select(kinds);
  const table = select(options.tables.map((n) => [n, `×${n}`]), options.tables.includes(7) ? 7 : options.tables[options.tables.length - 1]);
  const rounds = select([1, 2, 3, 4, 5, 6, 8, 10].map((n) => [n, String(n)]), 3);
  const games = select([1, 2, 3, 4, 5, 6, 8, 10].map((n) => [n, String(n)]), 3);
  const size = select(options.boards.map((n) => [n, `${n}×${n}`]), options.boards.includes(8) ? 8 : options.boards[options.boards.length - 1]);
  const difficulty = select([['any', 'Any difficulty'], ...options.difficulties.map((d) => [d, DIFFICULTY_NAMES[d]])], 'any');
  const week = new Date(Date.now() + 7 * 86400000);
  const due = input({ type: 'date', value: dayString(week), min: dayString(new Date()) });
  const f = {
    table: field('Table', table),
    rounds: field('Rounds', rounds),
    games: field('Games', games),
    size: field('Board', size),
    difficulty: field('Difficulty', difficulty),
  };
  const grid = make('div', 'acct-grid');
  grid.append(field('Homework', type), f.table, f.rounds, f.games, f.size, f.difficulty, field('Due', due));
  const show = () => {
    const t = type.value;
    f.table.hidden = t !== 'master';
    f.rounds.hidden = t !== 'practice';
    f.games.hidden = t !== 'games';
    f.size.hidden = t !== 'win';
    f.difficulty.hidden = t !== 'practice' && t !== 'win';
  };
  type.addEventListener('change', show);
  show();
  const error = errorLine();
  const go = button('Set homework', 'btn btn-small btn-primary');
  go.type = 'submit';
  const note = make('p', 'setting-help', `Only what ${who} has unlocked, so it can be played straight away. More kinds of homework show up as they unlock practice, times tables, difficulties and boards.`);
  form.append(grid, note, error, go);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.hidden = true;
    const t = type.value;
    const goal =
      t === 'master'
        ? { type: t, table: Number(table.value) }
        : t === 'practice'
          ? { type: t, rounds: Number(rounds.value), difficulty: difficulty.value }
          : t === 'win'
            ? { type: t, size: Number(size.value), difficulty: difficulty.value }
            : { type: t, games: Number(games.value) };
    go.disabled = true;
    try {
      await onSubmit({ goal, due: due.value || null });
      toast('📚 Homework set', Progress.describeGoal(goal));
    } catch (err) {
      showError(error, err);
    } finally {
      go.disabled = false;
    }
  });
  return form;
}

async function openHomework() {
  homework.clear();
  homework.done();
  homework.open();
  try {
    const { homework: items } = await Auth.api('GET', '/api/me/homework');
    const open = items.filter((h) => h.status !== 'done');
    homework.body.append(make('p', 'setting-help', open.length ? 'Play and practice as usual: homework ticks itself off.' : items.length ? 'All done. Great work! 🎉' : 'No homework right now.'));
    const order = { late: 0, open: 1, done: 2 };
    homework.body.append(homeworkList([...items].sort((a, b) => order[a.status] - order[b.status]), { onPlay: playHomework }));
  } catch (err) {
    homework.body.append(make('p', 'setting-help', err.message));
  }
}

// Tapping a homework: set the menu up for it (mode, difficulty, board, table) and start.
// Homework only asks for what the student has unlocked, so nothing here should be locked.
function playHomework(goal) {
  homework.close();
  const tap = (selector) => {
    const b = document.querySelector(selector);
    if (b && !b.dataset.unlock) b.click();
    return b && !b.dataset.unlock;
  };
  const setDifficulty = (d) => d && d !== 'any' && tap(`[data-setting="difficulty"] [data-value="${d}"]`);
  if (goal.type === 'master' || goal.type === 'practice') {
    tap('[data-mode="practice"]');
    if (goal.type === 'practice') setDifficulty(goal.difficulty);
    else {
      // a difficulty whose practice tables include this one, then just that table
      const chip = () => document.querySelector(`#practice-tables [data-table="${goal.table}"]`);
      for (const d of Progress.DIFFICULTIES) {
        if (chip()) break;
        setDifficulty(d);
      }
      for (const on of document.querySelectorAll('#practice-tables [aria-pressed="true"]')) on.click();
      tap(`#practice-tables [data-table="${goal.table}"]`);
    }
  } else {
    tap('[data-mode="single"]');
    setDifficulty(goal.difficulty);
    if (goal.type === 'win') tap(`#board-size [data-size="${goal.size}"]`);
  }
  const start = document.getElementById('start-btn');
  if (!start.disabled) start.click();
}

async function refreshHomeworkBadge() {
  if (Auth.role() !== 'student') return;
  try {
    const { homework: items } = await Auth.api('GET', '/api/me/homework');
    setBadge(el.homeworkBtn, items.filter((h) => h.status !== 'done').length);
  } catch (_) {
    // offline: no badge
  }
}

let currentClass = null;

let schedulePoll = null;

async function openClasses() {
  classes.open();
  await renderClasses();
  clearInterval(schedulePoll);
  schedulePoll = setInterval(() => !classes.overlay.hidden && renderSchedules(), SCHEDULE_POLL_MS);
}

async function renderClasses() {
  classes.clear('🏫 My classes');
  classes.actions.append(button('Host a live game', 'btn', () => (classes.close(), Game.openHostSetup())));
  classes.done();
  let list;
  try {
    list = (await Auth.api('GET', '/api/classes')).classes;
  } catch (err) {
    classes.body.append(make('p', 'setting-help', err.message));
    return;
  }
  if (list.length && !list.some((c) => c.id === currentClass)) currentClass = list[0].id;
  // class tabs + a new class
  const tabs = make('div', 'acct-tabs');
  for (const c of list) {
    const t = button(`${c.name} (${c.students})`, 'btn btn-small');
    t.classList.toggle('btn-primary', c.id === currentClass);
    t.addEventListener('click', () => ((currentClass = c.id), renderClasses()));
    tabs.append(t);
  }
  const name = input({ type: 'text', maxlength: '40', placeholder: list.length ? 'New class name' : 'Class name, like “Room 12”' });
  const add = make('form', 'acct-inline');
  const addBtn = button('+ New class', 'btn btn-small');
  addBtn.type = 'submit';
  add.append(name, addBtn);
  const error = errorLine();
  add.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const c = await Auth.api('POST', '/api/classes', { name: name.value });
      currentClass = c.id;
      await renderClasses();
    } catch (err) {
      showError(error, err);
    }
  });
  classes.body.append(tabs, add, error);
  if (!list.length) {
    classes.body.append(make('p', 'setting-help', 'Make a class, then give your students its code. Any student with a school account (@iusd.org) can join with it.'));
    name.focus();
    return;
  }
  const slot = make('div', 'acct-class');
  classes.body.append(slot);
  await renderClass(slot);
}

async function renderClass(slot) {
  let d;
  try {
    d = await Auth.api('GET', `/api/classes/${currentClass}`);
  } catch (err) {
    slot.append(make('p', 'setting-help', err.message));
    return;
  }
  const c = d.class;
  // join code and link
  const join = make('div', 'acct-join');
  const link = `${location.origin}${location.pathname}#roster=${c.code}`;
  join.append(make('div', 'acct-sub', 'Students join with'), make('div', 'acct-code', c.code));
  const copy = button('Copy join link', 'btn btn-small', async () => {
    try {
      await navigator.clipboard.writeText(link);
      copy.textContent = 'Copied!';
    } catch (_) {
      prompt('Copy this link:', link);
    }
  });
  join.append(copy, make('p', 'setting-help', `Students sign in with their school account${c.school ? ` (${c.school})` : ''}, then type the code or open the link.`));
  slot.append(join);

  // roster
  const roster = make('div', 'acct-section');
  roster.append(make('h3', 'stats-heading', `Students · ${d.students.length}`));
  if (!d.students.length) roster.append(make('p', 'setting-help', 'Nobody has joined yet.'));
  else {
    const table = make('table', 'stats-table acct-roster');
    const head = make('tr');
    for (const h of ['Name', 'Times Table', 'Needs practice', 'Last played', 'Homework', 'Parent code']) head.append(make('th', null, h));
    const thead = make('thead');
    thead.append(head);
    const tbody = make('tbody');
    for (const s of d.students) {
      const tr = make('tr');
      const nameCell = make('td');
      nameCell.append(button(s.name, 'acct-link', () => openStudent(s.id, classes, renderClasses)));
      const tt = make('td');
      tt.append(masteryBar(s.summary), make('span', 'acct-small', `${s.summary.mastered} of ${s.summary.total} mastered`));
      const hw = s.homework.total ? `${s.homework.done} of ${s.homework.total}${s.homework.late ? ` · ${s.homework.late} late` : ''}` : '—';
      tr.append(nameCell, tt, make('td', null, s.summary.needsPractice.length ? s.summary.needsPractice.slice(0, 4).join(', ') + (s.summary.needsPractice.length > 4 ? '…' : '') : '—'), make('td', null, ago(s.lastPlayed)), make('td', null, hw), make('td', 'acct-mono', s.parentCode || ''));
      const remove = button('×', 'acct-remove', async () => {
        if (!confirm(`Take ${s.name} out of ${c.name}?`)) return;
        await Auth.api('DELETE', `/api/classes/${c.id}/students/${s.id}`);
        renderClasses();
      });
      remove.title = `Take ${s.name} out of the class`;
      tr.lastChild.append(remove);
      tbody.append(tr);
    }
    table.append(thead, tbody);
    const wrap = make('div', 'acct-table-wrap');
    wrap.append(table);
    roster.append(wrap);
  }
  slot.append(roster);

  // homework
  const hw = make('div', 'acct-section');
  hw.append(make('h3', 'stats-heading', 'Class homework'));
  if (!d.assignments.length) hw.append(make('p', 'setting-help', 'No homework set.'));
  for (const a of d.assignments) {
    const row = make('div', 'acct-item');
    row.append(make('strong', null, a.label), make('span', 'acct-small', `${a.due ? `due ${niceDay(a.due)} · ` : ''}${a.done} of ${a.of} done`));
    row.append(
      button('Remove', 'btn btn-small', async () => {
        if (!confirm(`Remove “${a.label}” for the whole class?`)) return;
        await Auth.api('DELETE', `/api/homework/${a.id}`);
        renderClasses();
      })
    );
    hw.append(row);
  }
  hw.append(
    homeworkForm(
      async ({ goal, due }) => {
        await Auth.api('POST', '/api/homework', { classId: c.id, goal, due });
        renderClasses();
      },
      d.options,
      d.students.length ? `every student in ${c.name}` : 'a new student'
    )
  );
  slot.append(hw);

  // scheduled tournaments
  const tour = make('div', 'acct-section');
  tour.id = 'acct-schedules';
  slot.append(tour);
  await renderSchedules();
}

async function renderSchedules() {
  const box = $('acct-schedules');
  if (!box) return;
  let list;
  try {
    list = (await Auth.api('GET', '/api/schedules')).schedules;
  } catch (err) {
    return;
  }
  box.replaceChildren(make('h3', 'stats-heading', 'Tournaments'));
  const mine = list.filter((s) => s.scope === 'school' || s.classId === currentClass);
  if (!mine.length) box.append(make('p', 'setting-help', 'Plan a tournament and its lobby opens by itself at that time.'));
  for (const s of mine) {
    const row = make('div', `acct-item${s.open ? ' live' : ''}`);
    row.append(
      make('strong', null, s.title),
      make('span', 'acct-small', `${niceTime(s.startsAt)} · ${FORMAT_NAMES[s.settings.format]} · ${s.settings.size}×${s.settings.size} · ${s.scope === 'school' ? 'whole school' : s.className}`)
    );
    if (s.open) {
      row.append(
        button('Open the lobby', 'btn btn-small btn-primary', async () => {
          const h = await Auth.api('GET', `/api/schedules/${s.id}/host`);
          classes.close();
          Game.startHost({ code: h.code, teacherKey: h.teacherKey });
        })
      );
    }
    row.append(
      button('Remove', 'btn btn-small', async () => {
        if (!confirm(`Remove “${s.title}”?`)) return;
        await Auth.api('DELETE', `/api/schedules/${s.id}`);
        renderSchedules();
      })
    );
    box.append(row);
  }
  box.append(scheduleForm());
}

function scheduleForm() {
  const form = make('form', 'acct-hw-form');
  form.append(make('h4', null, 'Plan a tournament'));
  const soon = new Date(Date.now() + 24 * 3600 * 1000);
  soon.setMinutes(0, 0, 0);
  const local = (d) => `${dayString(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const title = input({ type: 'text', maxlength: '60', placeholder: 'e.g. Friday Cup' });
  const when = input({ type: 'datetime-local', value: local(soon) });
  const format = select(Object.entries(FORMAT_NAMES), 'knockout');
  const size = select([6, 8, 10, 12].map((n) => [n, `${n}×${n}`]), 8);
  const difficulty = select(['easy', 'medium', 'hard'].map((d) => [d, DIFFICULTY_NAMES[d]]), 'easy');
  const scope = select([
    ['class', 'This class'],
    ['school', 'Whole school'],
  ]);
  const grid = make('div', 'acct-grid');
  grid.append(field('Name', title), field('When', when), field('Format', format), field('Board', size), field('Difficulty', difficulty), field('Who', scope));
  const error = errorLine();
  const go = button('Plan it', 'btn btn-small btn-primary');
  go.type = 'submit';
  form.append(grid, error, go);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.hidden = true;
    try {
      await Auth.api('POST', '/api/schedules', {
        classId: currentClass,
        scope: scope.value,
        title: title.value,
        startsAt: new Date(when.value).getTime(),
        settings: { format: format.value, size: Number(size.value), difficulty: difficulty.value },
      });
      toast('🏆 Tournament planned', niceTime(new Date(when.value).getTime()));
      renderSchedules();
    } catch (err) {
      showError(error, err);
    }
  });
  return form;
}

// One student's page (teacher or parent), inside dialog d; back() returns
async function openStudent(id, d, back) {
  d.clear('Student');
  d.actions.append(button('← Back', 'btn', back));
  d.done();
  let s;
  try {
    s = await Auth.api('GET', `/api/students/${id}`);
  } catch (err) {
    d.body.append(make('p', 'setting-help', err.message));
    return;
  }
  d.title.textContent = s.name;
  const me = Auth.user();
  d.body.append(
    studentDetail(s, {
      mine: (h) => h.fromName === me.name && h.from === (me.role === 'teacher' ? 'teacher' : 'parent') && (me.role === 'parent' || !h.classId),
      onAddHomework: async ({ goal, due }) => {
        await Auth.api('POST', '/api/homework', { studentId: s.id, goal, due });
        openStudent(id, d, back);
      },
      onRemoveHomework: async (h) => {
        if (!confirm(`Remove “${h.label}”?`)) return;
        await Auth.api('DELETE', `/api/homework/${h.id}`);
        openStudent(id, d, back);
      },
    })
  );
}

async function openKids() {
  kids.open();
  await renderKids();
}

async function renderKids() {
  kids.clear('👪 My kids');
  kids.done();
  let list;
  try {
    list = (await Auth.api('GET', '/api/children')).children;
  } catch (err) {
    kids.body.append(make('p', 'setting-help', err.message));
    return;
  }
  if (!list.length) kids.body.append(make('p', 'setting-help', 'Link your child’s account with the code on their Blockout account page (tap their name at the top of the menu), or ask their teacher for it.'));
  const cards = make('div', 'acct-kids');
  for (const c of list) {
    const card = button('', 'acct-kid', () => openStudent(c.id, kids, renderKids));
    const hw = c.homework.total ? `📚 ${c.homework.done} of ${c.homework.total} homework done${c.homework.late ? ` · ${c.homework.late} late` : ''}` : '📚 No homework';
    card.append(make('strong', null, `🎒 ${c.name}`), masteryBar(c.summary), make('span', 'acct-small', `${c.summary.mastered} of ${c.summary.total} facts mastered · played ${ago(c.lastPlayed)}`), make('span', 'acct-small', hw));
    cards.append(card);
  }
  kids.body.append(cards);
  const form = make('form', 'acct-inline');
  const code = input({ type: 'text', maxlength: '9', autocomplete: 'off', placeholder: 'Child’s code', class: 'acct-code-input' });
  const go = button('Link', 'btn btn-small btn-primary');
  go.type = 'submit';
  form.append(code, go);
  const error = errorLine();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.hidden = true;
    try {
      const r = await Auth.api('POST', '/api/children', { code: code.value });
      toast('👪 Linked', r.child.name);
      renderKids();
    } catch (err) {
      showError(error, err);
    }
  });
  const section = make('div', 'acct-section');
  section.append(make('h3', 'stats-heading', 'Link a child'), form, error);
  kids.body.append(section);
}

async function pollLive() {
  if (Auth.role() !== 'student' || !Game.menuShowing()) return;
  try {
    const { live } = await Auth.api('GET', '/api/me/live');
    el.liveBanner.replaceChildren();
    el.liveBanner.hidden = !live.length;
    for (const l of live) {
      const row = make('div', 'live-row');
      row.append(make('span', null, `🏆 ${l.title} is open!`), button('Join', 'btn btn-small btn-primary', () => Game.joinClass(l.code)));
      el.liveBanner.append(row);
    }
  } catch (_) {
    // offline
  }
}

// #roster=CODE: a teacher's link to join their class roster
async function rosterLink() {
  const m = /^#roster=([A-Za-z0-9]+)$/.exec(location.hash);
  if (!m) return;
  const code = m[1].toUpperCase();
  if (Auth.role() !== 'student') return openSignIn({ role: 'student', note: `🏫 To join class ${code}, sign in with your school account.` });
  history.replaceState(null, '', location.pathname);
  try {
    const r = await Auth.api('POST', '/api/me/classes', { code });
    toast('🏫 You joined', r.class.name);
  } catch (err) {
    toast('🏫 Couldn’t join', err.message);
  }
}

async function start() {
  renderMenu();
  if (!Auth.served()) return;
  try {
    if (await Auth.finishKeycloak()) location.reload();
  } catch (err) {
    toast('Sign-in', err.message);
  }
  if (Auth.takeSignedOut() === 'google') signedOutOfGoogle();
  if (Auth.signedIn()) {
    try {
      const next = await Auth.syncProgress(Game.progress());
      if (next) Game.replaceProgress(next);
    } catch (_) {
      // offline: keep playing on the local copy; it syncs with the next save
    }
    renderMenu(); // (a stale sign-in may have been dropped)
  }
  await rosterLink();
  refreshHomeworkBadge();
  pollLive();
  setInterval(pollLive, LIVE_POLL_MS);
  setInterval(refreshHomeworkBadge, 60 * 1000);
}

// What the account screens do when the page loads (main.js runs this after the game)
export function run() {
  el = {
    accountBtn: $('account-btn'),
    homeworkBtn: $('homework-btn'),
    classesBtn: $('classes-btn'),
    kidsBtn: $('kids-btn'),
    liveBanner: $('live-banner'),
  };

  account = dialog('account', 'Sign in', 'account-dialog');

  el.accountBtn.addEventListener('click', openAccount);

  homework = dialog('homework-dialog', '📚 Homework', 'wide-dialog');

  el.homeworkBtn.addEventListener('click', openHomework);

  classes = dialog('classes-dialog', '🏫 My classes', 'wide-dialog');

  classes.setOnClose(() => clearInterval(schedulePoll));

  el.classesBtn.addEventListener('click', openClasses);

  kids = dialog('kids-dialog', '👪 My kids', 'wide-dialog');

  el.kidsBtn.addEventListener('click', openKids);


  start();
}

export { askTeacherSignIn, openSignIn, openAccount, refreshHomeworkBadge };
