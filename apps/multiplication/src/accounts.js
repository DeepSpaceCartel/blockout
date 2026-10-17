// Account screens: signing in (dev sign-in or Keycloak), a student's homework and
// classes, a teacher's classes (roster, stats, homework, scheduled tournaments,
// inviting teachers and grown-ups), a parent's view of their children, and
// one-time codes (#code=…) that make someone a teacher or a child's grown-up. Talks to apps/server through
// @blockout/auth and borrows a few helpers from the game (./game/api.js).
// Guests never see any of it except "Sign in".

import * as Auth from '@blockout/auth';
import * as Game from './game/api.js';
import * as Progress from '@blockout/progress';
import * as Homework from '@blockout/progress/homework';
import * as Grownups from '@blockout/progress/grownups';

let el, account, homework, classes, kids;

const { make, toast } = Game;

const $ = (id) => document.getElementById(id);

const { ROLE, FORMAT_NAMES, STATUS_ORDER, ago, activityText, dayString, niceTime, shortDay } = Grownups;

const DIFFICULTY_NAMES = Progress.DIFFICULTY_NAMES;


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

// "Tue, Oct 29"
const codeLink = (code) => `${location.origin}${location.pathname}#code=${code}`;

// A one-time code to hand over: big, with when it stops working, a QR code of
// its link (for a phone) and a button to copy the link
function codeCard(invite, who) {
  const card = make('div', 'acct-invite');
  const qr = document.createElement('canvas');
  qr.className = 'acct-qr';
  Game.drawQr(qr, codeLink(invite.code));
  const text = make('div', 'acct-invite-text');
  const copy = button('Copy link', 'btn btn-small', async () => {
    try {
      await navigator.clipboard.writeText(codeLink(invite.code));
      copy.textContent = 'Copied!';
    } catch (_) {
      prompt('Copy this link:', codeLink(invite.code));
    }
  });
  text.append(make('div', 'acct-code', invite.code.replace(/(.{4})/, '$1 ')), make('p', 'setting-help', `${who} Works once, until ${shortDay(invite.expiresAt)}.`), copy);
  card.append(qr, text);
  return card;
}

// "I have a code": a teacher's or a grown-up's one-time code. The account
// changes (a new role, a linked child), so the page starts again.
function redeemForm(placeholder = 'Code') {
  const form = make('form', 'acct-inline');
  const code = input({ type: 'text', maxlength: '9', autocomplete: 'off', placeholder, class: 'acct-code-input' });
  const go = button('Use code', 'btn btn-small btn-primary');
  go.type = 'submit';
  form.append(code, go);
  const error = errorLine();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.hidden = true;
    try {
      await redeem(code.value);
    } catch (err) {
      showError(error, err);
    }
  });
  const wrap = make('div');
  wrap.append(form, error);
  return wrap;
}

async function redeem(code) {
  const r = await Auth.api('POST', '/api/invites/redeem', { code });
  await Auth.refreshUser();
  toast(r.child ? '👪 Linked' : `${ROLE[r.user.role].emoji} Welcome`, r.child ? r.child.name : `You’re a ${ROLE[r.user.role].label.toLowerCase()} now.`);
  setTimeout(() => location.reload(), 1200); // (the menu changes with the role)
}

// Everything Blockout keeps about an account, as a file to keep
async function downloadData(path, name) {
  const data = await Auth.api('GET', path);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.download = `blockout-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

// Deleting an account: typed, because it can't be undone
async function confirmDelete(what, typed) {
  const answer = prompt(`${what} This can’t be undone. Type ${typed} to go ahead.`);
  return answer !== null && answer.trim().toLowerCase() === typed.toLowerCase();
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


const { niceDay } = Homework;


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
  el.homeworkBtn.hidden = !['guest', 'student'].includes(role); // (guests too: today's practice)
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
  const admin = input({ type: 'checkbox' });
  const adminField = make('label', 'acct-check');
  adminField.append(admin, make('span', null, 'Admin (manage accounts at /admin/)'));
  const emailField = field('School email', email);
  const schoolField = field('School', school);
  const names = make('div', 'acct-names');
  names.append(field('First name', first), field('Last initial', initial));
  const error = errorLine();
  const form = make('form', 'acct-form');
  form.append(who.el, names, emailField, schoolField, adminField, make('p', 'setting-help acct-privacy', 'We only keep your first name and last initial.'), error);
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
        admin: admin.checked,
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
  card.append(make('div', 'acct-big', `${ROLE[u.role].emoji} ${u.name}`), make('div', 'acct-sub', `${ROLE[u.role].label}${u.isAdmin ? ' · Admin' : ''}${u.school ? ` · ${u.school.name}` : ''}`));
  account.body.append(card);
  if (u.role === 'student') await studentAccount();
  if (u.role === 'teacher') account.body.append(make('p', 'setting-help', 'Your classes, homework, tournaments and codes for other teachers are under 🏫 My classes on the main menu.'));
  if (u.role === 'parent') account.body.append(make('p', 'setting-help', 'Follow your children under 👪 My kids on the main menu.'));
  if (u.role === 'student') {
    // Everyone starts as a student: a teacher's or a grown-up's code changes that
    const grownUps = make('div', 'acct-section');
    grownUps.append(make('h3', 'stats-heading', 'Teachers and grown-ups'), make('p', 'setting-help', 'Got a code to become a teacher, or to follow a child? Type it here.'), redeemForm());
    account.body.append(grownUps);
  }
  if (u.isAdmin) account.actions.append(button('Admin', 'btn', () => location.assign('/admin/')));
  if (u.role !== 'student') account.actions.append(button('Download my data', 'btn', () => downloadData('/api/me/export', u.name).catch((err) => alert(err.message))));
  if (u.role === 'teacher' || u.role === 'parent') {
    account.actions.append(
      button('Delete my account', 'btn btn-danger', async () => {
        if (!(await confirmDelete('Delete your Blockout account and everything in it?', 'delete'))) return;
        try {
          await Auth.api('DELETE', '/api/me');
          Auth.signOut();
        } catch (err) {
          alert(err.message);
        }
      })
    );
  }
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
  parent.append(make('h3', 'stats-heading', 'For a grown-up'), make('p', 'setting-help', 'Make a code for your mom, dad or another grown-up, so they can see how you’re doing and add homework.'));
  const slot = make('div');
  const codeError = errorLine();
  parent.append(
    button('Make a grown-up code', 'btn btn-small', async () => {
      codeError.hidden = true;
      try {
        slot.replaceChildren(codeCard(await Auth.api('POST', '/api/me/parent-invites'), 'Give it to one grown-up.'));
      } catch (err) {
        showError(codeError, err);
      }
    }),
    slot,
    codeError
  );
}

function askTeacherSignIn() {
  openSignIn({ role: 'teacher', note: '🍎 Teachers: sign in to host a class. Students join with the code (no sign-in needed).' });
}



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

// onPlay(goal): the student's list, where each open homework starts its game
function homeworkList(items, { onRemove = null, mine = () => false, onPlay = null } = {}) {
  const list = make('div', 'acct-list');
  if (!items.length) list.append(make('p', 'setting-help', 'No homework.'));
  for (const h of items) {
    const words = Homework.homeworkRow(h);
    const row = make('div', `acct-hw ${h.status}`);
    const top = make('div', 'acct-hw-top');
    top.append(make('strong', null, words.label));
    top.append(make('span', 'acct-hw-state', words.state));
    row.append(top);
    const bar = make('div', 'practice-bar');
    const fill = make('span');
    fill.style.width = `${(h.have / h.need) * 100}%`;
    bar.append(fill);
    const meta = make('div', 'acct-hw-meta');
    meta.append(make('span', null, `${h.have} of ${h.need}`), make('span', null, words.from));
    if (onRemove && mine(h)) meta.append(button('Remove', 'btn btn-small', () => onRemove(h)));
    if (onPlay && words.playable) {
      row.classList.add('playable');
      const play = button('Play ›', 'btn btn-small btn-primary', () => onPlay(h.goal));
      play.setAttribute('aria-label', `Play: ${words.label}`);
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
  const c = Grownups.homeworkChoices(options);
  const type = select(c.kinds);
  const table = select(c.tables.map((n) => [n, `×${n}`]), c.start.table);
  const rounds = select(Grownups.HOMEWORK_COUNTS.map((n) => [n, String(n)]), c.start.rounds);
  const games = select(Grownups.HOMEWORK_COUNTS.map((n) => [n, String(n)]), c.start.games);
  const size = select(c.boards.map((n) => [n, `${n}×${n}`]), c.start.size);
  const difficulty = select(c.difficulties, c.start.difficulty);
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
    const uses = Grownups.homeworkFields(type.value);
    for (const k of Object.keys(f)) f[k].hidden = !uses[k];
  };
  type.addEventListener('change', show);
  show();
  const error = errorLine();
  const go = button('Set homework', 'btn btn-small btn-primary');
  go.type = 'submit';
  const note = make('p', 'setting-help', Grownups.homeworkNote(who));
  form.append(grid, note, error, go);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.hidden = true;
    const goal = Grownups.goalFrom({ type: type.value, table: table.value, rounds: rounds.value, games: games.value, size: size.value, difficulty: difficulty.value });
    go.disabled = true;
    try {
      await onSubmit({ goal, due: due.value || null });
      toast(...Grownups.homeworkSet(goal));
    } catch (err) {
      showError(error, err);
    } finally {
      go.disabled = false;
    }
  });
  return form;
}

// Today's practice first (everyone), then the homework set by a teacher or grown-up
async function openHomework() {
  homework.clear();
  homework.done();
  homework.open();
  homework.body.append(make('h3', 'stats-heading', '⭐ Today’s practice'), Game.dailyCard(() => homework.close()));
  homework.body.append(make('h3', 'stats-heading', 'From your teacher'));
  if (Auth.role() !== 'student') {
    homework.body.append(make('p', 'setting-help', 'Sign in with your school account to see homework from your teacher or a grown-up.'));
    return;
  }
  try {
    const { homework: items } = await Auth.api('GET', '/api/me/homework');
    homework.body.append(make('p', 'setting-help', Homework.homeworkIntro(items)));
    homework.body.append(homeworkList(Homework.sortHomework(items), { onPlay: playHomework }));
  } catch (err) {
    homework.body.append(make('p', 'setting-help', err.message));
  }
}

// Tapping a homework: set the menu up for it (Homework.homeworkChoice: mode,
// difficulty, board, table) and start. Homework only asks for what the
// student has unlocked, so nothing here should be locked.
function playHomework(goal) {
  homework.close();
  const tap = (selector) => {
    const b = document.querySelector(selector);
    if (b && !b.dataset.unlock) b.click();
  };
  const choice = Homework.homeworkChoice(Game.progress(), goal);
  tap(`[data-mode="${choice.mode}"]`);
  if (choice.difficulty) tap(`[data-setting="difficulty"] [data-value="${choice.difficulty}"]`);
  if (choice.size) tap(`#board-size [data-size="${choice.size}"]`);
  if (choice.tables) {
    // just these tables
    for (const on of document.querySelectorAll('#practice-tables [aria-pressed="true"]')) on.click();
    for (const n of choice.tables) tap(`#practice-tables [data-table="${n}"]`);
  }
  const start = document.getElementById('start-btn');
  if (!start.disabled) start.click();
}

// Homework's badge: what's still to do, today's practice too. localOnly: just
// today's practice changed (no need to ask the server again)
let homeworkOpen = 0;
async function refreshHomeworkBadge(localOnly = false) {
  if (!localOnly && Auth.role() === 'student') {
    try {
      homeworkOpen = Homework.openCount((await Auth.api('GET', '/api/me/homework')).homework);
    } catch (_) {
      // offline: just today's practice
    }
  }
  if (!['guest', 'student'].includes(Auth.role())) return;
  setBadge(el.homeworkBtn, homeworkOpen + (Game.dailyOpen() ? 1 : 0));
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
  classes.body.append(await teacherInvites());
}

// A student's grown-ups, for their teacher: who's linked (take off a wrong
// one), and a code for a new one
async function openGrownUps(student, d, back) {
  d.clear(`${student.name}’s grown-ups`);
  d.actions.append(button('← Back', 'btn', back));
  d.done();
  const list = make('div', 'acct-list');
  const error = errorLine();
  async function fill() {
    list.replaceChildren();
    try {
      const { parents } = await Auth.api('GET', `/api/students/${student.id}/parents`);
      if (!parents.length) list.append(make('p', 'setting-help', 'No grown-up is following yet.'));
      for (const p of parents) {
        const row = make('div', 'acct-item');
        row.append(
          make('span', null, `👪 ${p.name}`),
          button('Remove', 'btn btn-small', async () => {
            if (!confirm(`Stop ${p.name} following ${student.name}?`)) return;
            await Auth.api('DELETE', `/api/students/${student.id}/parents/${p.id}`);
            fill();
          })
        );
        list.append(row);
      }
    } catch (err) {
      showError(error, err);
    }
  }
  const slot = make('div');
  d.body.append(
    list,
    make('p', 'setting-help', `A code lets one grown-up follow ${student.name}: their Times Table, homework, and setting homework of their own.`),
    button('Make a grown-up code', 'btn btn-small', async () => {
      try {
        slot.replaceChildren(codeCard(await Auth.api('POST', `/api/students/${student.id}/parent-invites`), `For ${student.name}’s grown-up.`));
      } catch (err) {
        showError(error, err);
      }
    }),
    slot,
    error
  );
  await fill();
}

// Bringing in another teacher: a one-time code, and the codes still out there
async function teacherInvites() {
  const section = make('div', 'acct-section');
  section.append(make('h3', 'stats-heading', 'Invite a teacher'), make('p', 'setting-help', 'A colleague signs in, then types the code (or opens its link) to get their own classes.'));
  const slot = make('div');
  const list = make('div', 'acct-list');
  const error = errorLine();
  async function fill() {
    list.replaceChildren();
    try {
      const { invites } = await Auth.api('GET', '/api/me/teacher-invites');
      for (const i of invites) {
        const row = make('div', 'acct-item');
        row.append(make('span', null, `🍎 Code from ${shortDay(i.createdAt)}`), make('span', 'acct-small', Grownups.inviteState(i)));
        if (!i.usedAt) {
          row.append(
            button('Remove', 'btn btn-small', async () => {
              await Auth.api('DELETE', `/api/me/invites/${i.id}`);
              fill();
            })
          );
        }
        list.append(row);
      }
    } catch (err) {
      showError(error, err);
    }
  }
  section.append(
    button('Make a teacher code', 'btn btn-small', async () => {
      error.hidden = true;
      try {
        slot.replaceChildren(codeCard(await Auth.api('POST', '/api/me/teacher-invites', {}), 'For one teacher.'));
        fill();
      } catch (err) {
        showError(error, err);
      }
    }),
    slot,
    list,
    error
  );
  await fill();
  return section;
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
    for (const h of ['Name', 'Times Table', 'Needs practice', 'Last played', 'Homework', 'Grown-ups']) head.append(make('th', null, h));
    const thead = make('thead');
    thead.append(head);
    const tbody = make('tbody');
    for (const s of d.students) {
      const tr = make('tr');
      const nameCell = make('td');
      nameCell.append(button(s.name, 'acct-link', () => openStudent(s.id, classes, renderClasses)));
      const tt = make('td');
      tt.append(masteryBar(s.summary), make('span', 'acct-small', `${s.summary.mastered} of ${s.summary.total} mastered`));
      tr.append(nameCell, tt, make('td', null, Grownups.needsPracticeShort(s.summary.needsPractice)), make('td', null, ago(s.lastPlayed)), make('td', null, Grownups.homeworkCount(s.homework)), make('td'));
      tr.lastChild.append(button('Grown-ups', 'btn btn-small', () => openGrownUps(s, classes, renderClasses)));
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
    row.append(make('strong', null, a.label), make('span', 'acct-small', Grownups.classHomeworkLine(a, niceDay)));
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
  const mine = Grownups.schedulesFor(list, currentClass);
  if (!mine.length) box.append(make('p', 'setting-help', 'Plan a tournament and its lobby opens by itself at that time.'));
  for (const s of mine) {
    const row = make('div', `acct-item${s.open ? ' live' : ''}`);
    row.append(
      make('strong', null, s.title),
      make('span', 'acct-small', Grownups.scheduleLine(s))
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
  const size = select(Grownups.SCHEDULE_SIZES.map((n) => [n, `${n}×${n}`]), 8);
  const difficulty = select(Grownups.SCHEDULE_DIFFICULTIES.map((d) => [d, DIFFICULTY_NAMES[d]]), 'easy');
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
      mine: (h) => Grownups.canRemove(h, me),
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
  if (me.role === 'parent') {
    d.actions.prepend(button(`Download ${s.name}’s data`, 'btn', () => downloadData(`/api/students/${s.id}/export`, s.name).catch((err) => alert(err.message))));
    d.actions.prepend(
      button(`Delete ${s.name}’s account`, 'btn btn-danger', async () => {
        if (!(await confirmDelete(`Delete ${s.name}’s Blockout account, with their progress, classes and homework?`, s.name.split(' ')[0]))) return;
        try {
          await Auth.api('DELETE', `/api/students/${s.id}`);
          back();
        } catch (err) {
          alert(err.message);
        }
      })
    );
  }
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
  if (!list.length) kids.body.append(make('p', 'setting-help', 'Link your child’s account with a code: your child makes one on their Blockout account page (tap their name at the top of the menu), or their teacher can.'));
  const cards = make('div', 'acct-kids');
  for (const c of list) {
    const card = button('', 'acct-kid', () => openStudent(c.id, kids, renderKids));
    card.append(make('strong', null, `🎒 ${c.name}`), masteryBar(c.summary), make('span', 'acct-small', `${c.summary.mastered} of ${c.summary.total} facts mastered · played ${ago(c.lastPlayed)}`), make('span', 'acct-small', Grownups.kidHomework(c.homework)));
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

// #code=CODE: a one-time code's link (a teacher's or a grown-up's)
async function codeFromLink() {
  const m = /^#code=([A-Za-z0-9]+)$/.exec(location.hash);
  if (!m) return;
  const code = m[1].toUpperCase();
  if (!Auth.signedIn()) return openSignIn({ note: '🔑 Sign in first, then the code is used for your account.' });
  history.replaceState(null, '', location.pathname);
  try {
    await redeem(code);
  } catch (err) {
    toast('🔑 That code didn’t work', err.message);
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
  await codeFromLink();
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
