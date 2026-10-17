// All-time stats: part of the multiplication game (split from the old js/game.js).

import * as Stats from '@blockout/progress/stats';
import { $, el } from './base.js';
import { progress, saveProgress } from './wallet.js';
import { game, make, renderFactGrid, renderFactLegend, renderPractice } from './play.js';
import { playerFacts } from './practice.js';

let howto;

// Finished games are kept in this browser only, newest last.
const HISTORY_KEY = 'blockout.history';


function loadHistory() {
  try {
    const saved = JSON.parse(localStorage.getItem(HISTORY_KEY));
    return Array.isArray(saved) ? saved : [];
  } catch (_) {
    return [];
  }
}

function saveHistory(history) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-Stats.HISTORY_LIMIT)));
  } catch (_) {
    // not fatal: stats just won't persist
  }
}

function recordGame(winnerIndexes) {
  saveHistory(Stats.addToHistory(loadHistory(), Stats.gameRecord(game, winnerIndexes)));
}

// Practice rounds share the history list, marked kind: 'practice'.
function recordPracticeRound(pr) {
  const history = loadHistory();
  history.push({
    kind: 'practice',
    at: Date.now(),
    duration: Date.now() - pr.startedAt,
    name: pr.name,
    size: pr.max,
    level: pr.expert ? 'expert' : 'learn',
    tables: pr.tables,
    count: pr.count,
    firstTry: pr.firstTry,
    times: pr.times,
    points: pr.points,
  });
  saveHistory(history);
}

function renderHistory() {
  const history = loadHistory();
  const body = el.historyBody;
  body.innerHTML = '';
  const report = Stats.statsReport(history, progress);
  el.resetHistory.hidden = report.empty;
  if (report.empty) {
    body.append(make('p', 'history-empty', 'No games or practice yet. Play one and your stats will show up here!'));
    return;
  }
  if (report.tiles.length) {
    const tiles = make('div', 'tiles');
    for (const t of report.tiles) {
      const tile = make('div', 'tile');
      tile.append(make('span', 'tile-value', t.value), make('span', 'tile-label', t.label));
      tiles.append(tile);
    }
    body.append(tiles);
  }
  for (const table of report.tables) {
    body.append(make('h3', 'stats-heading', table.heading));
    body.append(statsTable(['', ...table.columns], table.rows));
  }

  // Lifetime times tables for everyone who has answered anything, in games or practice
  body.append(make('h3', 'stats-heading centered', 'Times Table'));
  body.append(renderFactLegend());
  for (const { name, label } of report.players) {
    const facts = playerFacts(name);
    body.append(renderFactGrid(label, facts));
    const none = Object.keys(facts).length ? 'Nothing missed so far! 🌟' : 'No answers yet.';
    body.append(renderPractice(label ? `${label}: facts to practice` : 'Facts to practice', 'var(--line)', Stats.factsToPractice(facts), none));
  }

  if (report.recent.length) {
    body.append(make('h3', 'stats-heading', 'Recent games'));
    const recent = make('ol', 'recent');
    for (const line of report.recent) {
      const li = make('li');
      li.append(make('span', 'meta', line.meta), document.createTextNode(`${line.text} · `), make('span', 'winner', line.winner));
      recent.append(li);
    }
    body.append(recent);
  }
}

// A table whose first column is a two-line label (bold title, muted details).
function statsTable(headings, rows) {
  const wrap = make('div', 'stats-table-wrap');
  const table = make('table', 'stats-table by-type');
  const head = table.createTHead().insertRow();
  for (const label of headings) head.append(make('th', null, label));
  const tbody = table.createTBody();
  for (const row of rows) {
    const tr = tbody.insertRow();
    const th = make('th');
    th.append(make('span', 'row-title', row.title), make('span', 'row-sub', row.sub));
    tr.append(th);
    for (const v of row.values) tr.append(make('td', null, String(v)));
  }
  wrap.append(table);
  return wrap;
}

function openHistory() {
  renderHistory();
  el.historyDialog.hidden = false;
  el.historyDialog.querySelector('.dialog').scrollTop = 0;
  el.historyDone.focus();
}

function closeHistory() {
  el.historyDialog.hidden = true;
  el.historyBtn.focus();
}

// What this part does when the page loads (main.js runs every part in order)
export function run() {
  el.historyBtn.addEventListener('click', openHistory);

  // How to play popup
  howto = $('howto');

  $('howto-btn').addEventListener('click', () => {
    howto.hidden = false;
    howto.querySelector('.dialog').scrollTop = 0;
    $('howto-done').focus();
  });

  $('howto-done').addEventListener('click', () => {
    howto.hidden = true;
    $('howto-btn').focus();
  });

  howto.addEventListener('click', (e) => {
    if (e.target === howto) howto.hidden = true;
  });

  howto.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') howto.hidden = true;
  });

  el.historyDone.addEventListener('click', closeHistory);

  el.historyDialog.addEventListener('click', (e) => {
    if (e.target === el.historyDialog) closeHistory();
  });

  el.historyDialog.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeHistory();
  });

  el.resetHistory.addEventListener('click', () => {
    if (!confirm('Delete all game history and times-table stats on this device? Points, unlocks and achievements are kept. This cannot be undone.')) return;
    try {
      localStorage.removeItem(HISTORY_KEY);
    } catch (_) {
      // nothing saved anyway
    }
    progress.facts = {};
    saveProgress();
    renderHistory();
  });
}

export { loadHistory, recordGame, recordPracticeRound, saveHistory };
