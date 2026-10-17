// Achievements: part of the multiplication game (split from the old js/game.js).

import * as Views from '@blockout/progress/views';
import { el } from './base.js';
import { progress } from './wallet.js';
import { icon } from './wardrobe.js';
import { make } from './play.js';

function renderAchievements() {
  el.achievementsBody.innerHTML = '';
  const list = Views.achievementGroups(progress);
  el.achievementsBody.append(make('p', 'stats-summary', `${list.earned} of ${list.total} earned`));
  for (const g of list.groups) {
    el.achievementsBody.append(make('h3', 'stats-heading', `${g.name} · ${g.earned} of ${g.total}`));
    if (g.note) el.achievementsBody.append(make('p', 'setting-help', g.note));
    const box = make('div', 'achievement-list');
    for (const r of g.rows) {
      const row = make('div', 'achievement' + (r.earned ? ' earned' : ''));
      const badge = make('span', 'achievement-icon', r.icon || undefined);
      if (!r.icon) badge.append(icon('lock'));
      const text = make('div', 'achievement-text');
      text.append(make('strong', null, r.name), make('span', null, r.desc));
      row.append(badge, text, make('span', 'achievement-reward', r.right));
      box.append(row);
    }
    el.achievementsBody.append(box);
  }
  el.achievementsBody.append(renderFactSpeed());
}

// Fact speed: one cell per fact with the best tier earned (10, 5 or 1 seconds).
function renderFactSpeed() {
  const box = make('div', 'fact-speed');
  const fs = Views.factSpeed(progress);
  box.append(make('h3', 'stats-heading', `Fact speed · ${fs.earned} of ${fs.total}`));
  box.append(make('p', 'setting-help', fs.note));
  const counts = make('div', 'fact-legend');
  for (const t of fs.tiers) {
    const item = make('span', 'fact-legend-item');
    item.append(make('span', `fact-cell speed-${t.secs}`, String(t.secs)), document.createTextNode(`Under ${t.secs} s: ${t.count}`));
    counts.append(item);
  }
  box.append(counts);
  const grid = make('div', 'fact-grid');
  grid.style.setProperty('--n', fs.size + 1);
  grid.append(make('span', 'fact-head', '×'));
  for (let c = 1; c <= fs.size; c++) grid.append(make('span', 'fact-head', String(c)));
  fs.cells.forEach((row, r) => {
    grid.append(make('span', 'fact-head', String(r + 1)));
    for (const { a, b, best } of row) {
      const cell = make('span', `fact-cell ${best ? `speed-${best}` : 'unseen'}`, best ? String(best) : '');
      cell.title = best ? `${a} × ${b}: under ${best} s` : `${a} × ${b}: not earned yet`;
      grid.append(cell);
    }
  });
  box.append(grid);
  return box;
}

// What this part does when the page loads (main.js runs every part in order)
export function run() {
  el.achievementsBtn.addEventListener('click', () => {
    renderAchievements();
    el.achievementsDialog.hidden = false;
    el.achievementsDialog.querySelector('.dialog').scrollTop = 0;
    el.achievementsDone.focus();
  });

  el.achievementsDone.addEventListener('click', () => (el.achievementsDialog.hidden = true));

  el.achievementsDialog.addEventListener('click', (e) => {
    if (e.target === el.achievementsDialog) el.achievementsDialog.hidden = true;
  });

  el.achievementsDialog.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') el.achievementsDialog.hidden = true;
  });
}
