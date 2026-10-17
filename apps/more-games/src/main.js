// More games: a card for each game built on @blockout/game-kit, and the other prototypes.
import '@blockout/game-kit/style.css';
import { VARIANTS } from '@blockout/engine/variants';

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const BOARD_KIND = { grid: 'Grid board', bars: 'Fraction bars' };

document.getElementById('hub-grid').innerHTML = VARIANTS.map((v) => {
  const kind = BOARD_KIND[v.newBoard('easy').kind];
  return `<article class="hub-card">
    <h2><span class="op-badge">${esc(v.op)}</span> ${esc(v.name)}</h2>
    <p class="grade">${esc(v.title)} · ${esc(v.grade)}</p>
    <p class="tag">${esc(v.tagline)}</p>
    <p class="idea">${esc(v.concept)}</p>
    <span class="kind">${kind}${v.answer === 'frac' ? ' · fraction answers' : ''}</span>
    <a class="btn btn-primary" href="/${v.id}/">Play ›</a>
  </article>`;
}).join('') + `<article class="hub-card">
    <h2><span class="op-badge">🐍</span> Number Snake</h2>
    <p class="grade">Times tables · Grades 2–4</p>
    <p class="tag">A snake game that eats numbers instead of apples.</p>
    <p class="idea">Steer the snake to the right number: the answer to 6 × 7, or every multiple of 4. Or eat any number you like and add it to your running total. The right numbers make it grow; a wrong one costs a heart and shows the fact to remember. It speeds up as you go.</p>
    <span class="kind">Arcade · arrows, swipe or on-screen buttons</span>
    <a class="btn btn-primary" href="/snake/">Play ›</a>
  </article>`;
