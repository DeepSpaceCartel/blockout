// The Journey, for every client (the web game, the phone app): which level a
// player is on, what game it is, what it takes to move up and what to say
// about it. Pure functions of the save; the rules that change it are in
// progress.js (recordLevelGame), the levels themselves in levels.js.
import * as Progress from './progress.js';
import { DIFFICULTY_NAMES } from './setup.js';
import { LEVELS, DONE } from './levels.js';

export { LEVELS, DONE };
export const { journeyLevel, levelResult, recordLevelGame, LEVEL_GOAL, levelUpReward } = Progress;

// Free play (choosing your own board and difficulty) opens at Level 6: the
// 6×6 board with 6-sided dice that used to be where everyone started.
export const FREE_PLAY_LEVEL = 6;
export const freePlayOpen = (state) => journeyLevel(state) >= FREE_PLAY_LEVEL;

export const levelInfo = (level) => LEVELS[Math.min(level, LEVELS.length) - 1];
export const isDone = (state) => journeyLevel(state) >= DONE;

// Single player plays the Journey unless Free play is picked (once it's open),
// and plays Free play once every level is done. play: 'journey' | 'free'.
export const onJourney = (state, play) => !isDone(state) && (play !== 'free' || !freePlayOpen(state));

// What a level's game is: { size, difficulty, sides } (sides: numbered dice;
// none for Tricky, Master and Legend, which roll pairs)
export function levelSetup(level) {
  const l = levelInfo(level);
  return { size: l.size, difficulty: l.difficulty, ...(l.sides ? { sides: l.sides } : {}) };
}

// "7-sided dice", or the difficulty's own dice ("Tricky dice")
export const levelDice = (level) => {
  const l = levelInfo(level);
  return l.sides ? `${l.sides}-sided ${l.sides === 1 ? 'die' : 'dice'}` : `${DIFFICULTY_NAMES[l.difficulty]} dice`;
};

// "7×7 board, 7-sided dice"
export const levelLine = (level) => `${levelInfo(level).size}×${levelInfo(level).size} board, ${levelDice(level)}`;

// "Level 7", or the last level's name once the Journey is done
export const levelName = (level) => (level >= DONE ? 'Journey done!' : `Level ${level}`);

// The goal, in a child's words: "Beat the CPU with 4 out of 5 answers right first try"
export const goalLine = () => `Beat the CPU with ${Math.round(LEVEL_GOAL.firstTry * 5)} out of 5 answers right first try`;

// The dots under the card: one per level, reached or not
export const steps = (state) => LEVELS.map((l) => ({ level: l.level, done: l.level < journeyLevel(state), current: l.level === journeyLevel(state) }));

// What the results screen says about a Journey game (recordLevelGame's result):
// { title, text } or null when it wasn't the current level.
export function resultMessage(r) {
  if (r.advanced) {
    const next = r.to >= DONE ? 'Every level done: you can play any board in Free play!' : `Next: ${levelLine(r.to)}.`;
    return { title: r.to >= DONE ? '🏔️ Journey done!' : `🎉 Level ${r.to} unlocked!`, text: `${next} +${r.reward} points` };
  }
  if (!r.current) return null;
  if (r.missing === 'win') return { title: 'Almost!', text: `Beat the CPU to move up to Level ${r.from + 1}.` };
  return { title: 'So close!', text: `You won! Now get ${Math.round(LEVEL_GOAL.firstTry * 5)} out of 5 answers right first try to move up.` };
}
