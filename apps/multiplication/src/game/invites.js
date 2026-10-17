// Invites: part of the multiplication game (split from the old js/game.js).

import qrcode from 'qrcode-generator';
import * as Invite from '../invite.js';
import { $, DEFAULT_NAMES, DEFAULT_SETTINGS, el, setup } from './base.js';
import { toast } from './wallet.js';
import { clampCustom, saveNameInputs } from './wardrobe.js';
import { make, startGame } from './play.js';

// Settings an invite can set from the "Make an invite" form (select id = invite-<key>).
const INVITE_FORM_SETTINGS = ['difficulty', 'placeMode', 'answerTime', 'autoRoll', 'cpuSteps'];

const INVITE_LABELS = {
  difficulty: {
    easy: 'Easy (6-sided dice)',
    medium: 'Medium (8-sided dice)',
    hard: 'Hard (12-sided dice)',
    tricky: 'Tricky (no easy facts)',
    master: 'Master (your weakest facts)',
    legend: 'Legend (teens × 2–9)',
  },
  placeMode: { draw: 'You draw each rectangle', auto: 'Rectangles are placed for you' },
  cpuSteps: { show: null, instant: 'CPU plays instantly' },
  autoRoll: { manual: null, auto: 'Dice roll by themselves' },
};

// Players from the main-menu setup, in invite form.
function invitePlayersFromSetup() {
  if (setup.mode === 'single') return [{ n: el.singleName.value.trim(), c: false }];
  saveNameInputs();
  return setup.names.slice(0, setup.count).map((name, i) => ({ n: setup.types[i] === 'cpu' ? '' : name.trim(), c: setup.types[i] === 'cpu' }));
}

function invitePlayerNames(inv) {
  let cpu = 0;
  return inv.p.map((p, i) => (p.c ? `CPU ${++cpu}` : p.n || DEFAULT_NAMES[i]));
}

function describeInvite(inv) {
  const s = { ...DEFAULT_SETTINGS, ...inv.s };
  const lines = [
    inv.m === 'single' ? 'You vs the CPU' : `Players: ${invitePlayerNames(inv).join(', ')}`,
    `Board: ${inv.b}×${inv.b}`,
    INVITE_LABELS.difficulty[s.difficulty],
    INVITE_LABELS.placeMode[s.placeMode],
  ];
  if (s.answerTime !== '0') lines.push(`${s.answerTime} seconds to answer each question`);
  for (const key of ['autoRoll', 'cpuSteps']) if (INVITE_LABELS[key][s[key]]) lines.push(INVITE_LABELS[key][s[key]]);
  if (inv.r !== undefined) lines.push('Same dice rolls as everyone else with this invite');
  return lines;
}

function openInviteMaker() {
  const names = invitePlayersFromSetup();
  el.invitePlayers.textContent =
    setup.mode === 'single'
      ? `Single player: ${names[0].n || 'You'} vs the CPU`
      : `Multiplayer: ${invitePlayerNames({ p: names }).join(', ')}`;
  el.inviteCodeError.hidden = true;
  el.inviteResult.hidden = true;
  el.inviteMake.hidden = false;
  el.inviteMake.querySelector('.dialog').scrollTop = 0;
  el.inviteCodeInput.focus();
}

function closeInviteMaker() {
  el.inviteMake.hidden = true;
}

function buildInvite() {
  const board = el.inviteBoard.value === 'custom' ? clampCustom(el.inviteCustom.value) : Number(el.inviteBoard.value);
  const s = {};
  for (const key of INVITE_FORM_SETTINGS) {
    const value = $(`invite-${key}`).value;
    if (value !== String(DEFAULT_SETTINGS[key])) s[key] = value; // only what differs, to keep links short
  }
  const inv = { v: Invite.VERSION, m: setup.mode, b: board, p: invitePlayersFromSetup(), s };
  if (el.inviteNote.value.trim()) inv.t = el.inviteNote.value.trim();
  if (el.inviteSeed.checked) inv.r = Invite.newSeed();
  return Invite.validate(inv);
}

let madeInvite = null;

// Black-on-white QR code, 8px per module with the standard 4-module quiet zone.
function drawQr(canvas, text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const modules = qr.getModuleCount();
  const cell = 8;
  const quiet = 4;
  const size = (modules + quiet * 2) * cell;
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, size, size);
  g.fillStyle = '#000000';
  for (let r = 0; r < modules; r++) {
    for (let c = 0; c < modules; c++) {
      if (qr.isDark(r, c)) g.fillRect((c + quiet) * cell, (r + quiet) * cell, cell, cell);
    }
  }
}

// ---- a child opens an invite

let openedInvite = null;

function showInvite(inv) {
  openedInvite = inv;
  el.inviteOpenNote.hidden = !inv.t;
  el.inviteOpenNote.textContent = inv.t ? `“${inv.t}”` : '';
  el.inviteOpenSummary.innerHTML = '';
  for (const line of describeInvite(inv)) el.inviteOpenSummary.append(make('li', null, line));
  el.inviteOpenNameField.hidden = inv.m !== 'single';
  el.inviteOpenName.value = inv.m === 'single' ? inv.p[0].n || el.singleName.value.trim() || '' : '';
  for (const d of document.querySelectorAll('.overlay')) if (d !== el.inviteOpen) d.hidden = true;
  el.inviteOpen.hidden = false;
  el.inviteStart.focus();
}

function clearInviteFromUrl() {
  if (location.hash.includes('invite=')) history.replaceState(null, '', location.pathname + location.search);
}

// Links look like index.html#invite=CODE
function checkUrlForInvite() {
  const token = Invite.tokenFrom(location.hash);
  if (!token) return;
  const inv = Invite.decode(token);
  if (inv) showInvite(inv);
  else {
    clearInviteFromUrl();
    toast('⚠️ That invite link is broken', 'Ask for a new one, or paste the code in 🔗 Invite.');
  }
}

// What this part does when the page loads (main.js runs every part in order)
export function run() {
  el.inviteCreate.addEventListener('click', () => {
    if (setup.mode === 'multi' && invitePlayersFromSetup().some((p) => !p.c && !p.n)) {
      toast('✏️ Players need names', 'Type every player’s name on the main menu first.');
      return;
    }
    madeInvite = buildInvite();
    if (!madeInvite) return;
    const token = Invite.encode(madeInvite);
    el.inviteCode.value = token;
    el.inviteLink.value = `${location.href.split('#')[0]}#invite=${token}`;
    const local = location.protocol === 'file:';
    el.inviteLocalWarning.hidden = !local;
    el.inviteQrWrap.hidden = local; // a file:// link can't be opened from another device
    if (!local) drawQr(el.inviteQr, el.inviteLink.value);
    el.inviteResult.hidden = false;
    el.inviteResult.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });

  el.inviteQrSave.addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = el.inviteQr.toDataURL('image/png');
    a.download = 'blockout-invite.png';
    a.click();
  });

  // A printable hand-out: QR code, the note and what the game will be.
  el.inviteQrPrint.addEventListener('click', () => {
    if (!madeInvite) return;
    const win = window.open('', '_blank');
    if (!win) return toast('⚠️ Could not open the print page', 'Allow pop-ups for this page, or use Save QR image.');
    const doc = win.document;
    doc.title = 'Blockout invite';
    const style = doc.createElement('style');
    style.textContent =
      'body{font-family:system-ui,sans-serif;text-align:center;padding:32px;color:#2b2a33}' +
      'img{width:320px;height:320px;image-rendering:pixelated}' +
      '.note{font-size:1.4rem;font-weight:800;margin:16px auto;max-width:480px}' +
      'ul{display:inline-block;text-align:left;line-height:1.6}';
    doc.head.append(style);
    const add = (tag, text, cls) => {
      const node = doc.createElement(tag);
      if (text) node.textContent = text;
      if (cls) node.className = cls;
      doc.body.append(node);
      return node;
    };
    add('h1', 'Blockout');
    if (madeInvite.t) add('p', `“${madeInvite.t}”`, 'note');
    const img = add('img');
    img.src = el.inviteQr.toDataURL('image/png');
    img.alt = 'QR code for the Blockout invite';
    add('p', 'Scan with a phone or tablet camera to start the game.');
    const list = add('ul');
    for (const line of describeInvite(madeInvite)) {
      const li = doc.createElement('li');
      li.textContent = line;
      list.append(li);
    }
    img.onload = () => win.print();
  });

  el.inviteBoard.addEventListener('change', () => {
    el.inviteCustomField.hidden = el.inviteBoard.value !== 'custom';
  });

  el.inviteMake.addEventListener('click', async (e) => {
    if (e.target === el.inviteMake) return closeInviteMaker();
    const copy = e.target.closest('[data-copy]');
    if (!copy) return;
    const field = $(copy.dataset.copy);
    try {
      await navigator.clipboard.writeText(field.value);
    } catch (_) {
      field.select();
      document.execCommand('copy'); // older browsers / file:// pages
    }
    copy.textContent = 'Copied!';
    setTimeout(() => (copy.textContent = 'Copy'), 1500);
  });

  el.inviteCodeOpen.addEventListener('click', () => {
    const token = Invite.tokenFrom(el.inviteCodeInput.value);
    const inv = token && Invite.decode(token);
    el.inviteCodeError.hidden = Boolean(inv);
    if (!inv) return;
    closeInviteMaker();
    showInvite(inv);
  });

  el.inviteCodeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') el.inviteCodeOpen.click();
  });

  el.inviteTry.addEventListener('click', () => {
    if (!madeInvite) return;
    closeInviteMaker();
    showInvite(madeInvite);
  });

  el.inviteBtn.addEventListener('click', openInviteMaker);

  el.inviteDone.addEventListener('click', closeInviteMaker);

  el.inviteMake.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeInviteMaker();
  });

  el.inviteStart.addEventListener('click', () => {
    const inv = openedInvite;
    if (!inv) return;
    el.inviteOpen.hidden = true;
    clearInviteFromUrl();
    const names = invitePlayerNames(inv);
    const players =
      inv.m === 'single'
        ? [
            { name: el.inviteOpenName.value.trim() || 'You', cpu: false },
            { name: 'CPU', cpu: true },
          ]
        : inv.p.map((p, i) => ({ name: names[i], cpu: p.c }));
    startGame(players, inv.b, inv.m, inv);
  });

  el.inviteCancel.addEventListener('click', () => {
    el.inviteOpen.hidden = true;
    clearInviteFromUrl();
  });

  window.addEventListener('hashchange', checkUrlForInvite);
}

export { checkUrlForInvite, drawQr };
