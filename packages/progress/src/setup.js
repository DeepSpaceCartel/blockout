// The game menu's rules, for every client (the web game, the phone app): the
// difficulties, single player's Level (Learn or Expert) and Expert's timers,
// what each costs and says, which boards a difficulty fits, and Master's dice
// that go after the player's weakest facts. Pure functions of the save.
import * as Core from '@blockout/engine';
import * as Progress from './progress.js';

// Expert doubles bonus points
export const GAME_EXPERT_BONUS = 2;

export const DIFFICULTY_CHOICES = [
  { id: 'easy', name: 'Easy', dice: '6-sided dice' },
  { id: 'medium', name: 'Medium', dice: '8-sided dice' },
  { id: 'hard', name: 'Hard', dice: '12-sided dice' },
  { id: 'tricky', name: 'Tricky', dice: 'no easy facts' },
  { id: 'master', name: 'Master', dice: 'your weak facts' },
  { id: 'legend', name: 'Legend', dice: 'teens × 2–9' },
];
export const DIFFICULTY_NAMES = Object.fromEntries(DIFFICULTY_CHOICES.map((d) => [d.id, d.name]));

export const difficultyOpen = (state, id) => id === 'easy' || Progress.isUnlocked(state, `difficulty.${id}`);

// Legend rolls a teen (11–19), so it needs a board it fits on. Null when the
// board is fine, else what to say.
export function boardWarning(difficulty, size) {
  if (Core.fitsDifficulty(difficulty, size)) return null;
  return `⚠️ ${DIFFICULTY_NAMES[difficulty]} rolls numbers like 14 × 7, so it needs a board of 12×12 or bigger.`;
}

// ---- single player: Level and Expert's timer, per difficulty

export const GAME_LEVEL_HELP = {
  learn: 'Learn: “Help me count” is there whenever you need it.',
  expert: 'Expert: no help counting, and bonus points are doubled!',
};

export const GAME_TIMERS = [0, 30, 10, 5];

// The Shop item a level or a timer needs on this difficulty (null: free)
export const levelItem = (difficulty, level) => (level === 'expert' ? Progress.gameExpertId(difficulty) : null);
export const timerItem = (difficulty, secs) => (Number(secs) ? Progress.gameTimerId(Number(secs), difficulty) : null);

// The level and timer to play with: what's chosen, if it's unlocked on this difficulty
export function gameLevel(state, difficulty, { level = 'learn', timer = 0 } = {}) {
  const expert = level === 'expert' && Progress.isUnlocked(state, levelItem(difficulty, 'expert'));
  const secs = expert && Progress.isUnlocked(state, timerItem(difficulty, timer)) ? Number(timer) || 0 : 0;
  return { level: expert ? 'expert' : 'learn', timer: secs };
}

// What the timer choice says under it
export function timerHelp(timer) {
  const top = (secs) => Progress.TIMER_BONUS_MAX[secs] * GAME_EXPERT_BONUS;
  return timer
    ? `⏱️ Answer fast for a timer bonus of up to +${top(timer)} a question: the quicker, the more. If time runs out, the rectangle comes off and scores nothing.`
    : `⏱️ A timer earns a bonus for quick answers: up to +${top(30)} a question with 30 s, +${top(10)} with 10 s, +${top(5)} with 5 s.`;
}

// How long the answer timer really runs (a cheat can stretch it), in ms
export const timerMs = (state, secs) => Progress.timerLength(state, secs) * 1000;

// ---- Master's dice

// How often each fact comes up on Master: like practice, but mastered facts are
// rarer still (whoever reaches Master has mastered most of the table; with
// practice's weights only about a third of the rolls would be weak facts, this
// makes it ~70%). Easy ×1 facts count half unless they need practice.
const MASTER_WEIGHTS = { ...Progress.PRACTICE_WEIGHTS, mastered: 0.1 };

export function masterWeight(state, name = 'You') {
  const facts = (state.facts[Progress.playerKey(name)] || { facts: {} }).facts;
  return (a, b) => {
    const status = Progress.factStatus(facts[Progress.factKey(a, b)]);
    let weight = MASTER_WEIGHTS[status];
    if ((a === 1 || b === 1) && status !== 'practice') weight /= 2;
    return weight;
  };
}
