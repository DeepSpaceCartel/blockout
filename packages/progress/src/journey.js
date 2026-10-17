// The Journey, for every client (the web game, the phone app): which level a
// player is on, what game it is, what it takes to move up and what to say
// about it. Pure functions of the save; the rules that change it are in
// progress.js (recordLevelGame), the levels themselves in levels.js.
import * as Progress from './progress.js';
import { DIFFICULTY_NAMES } from './setup.js';
import { LEVELS, DONE, PRACTICE_LEVELS, PRACTICE_DONE } from './levels.js';

export { LEVELS, DONE, PRACTICE_LEVELS, PRACTICE_DONE };
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

// ---- Practice's Journey: level n is the ×n table

export const { practiceLevel, recordPracticeLevel } = Progress;

// Free practice (picking your own tables and difficulty) opens at Level 2,
// once there's more than one table to pick from
export const FREE_PRACTICE_LEVEL = 2;
export const freePracticeOpen = (state) => practiceLevel(state) >= FREE_PRACTICE_LEVEL;
export const practiceDone = (state) => practiceLevel(state) >= PRACTICE_DONE;
export const onPracticeJourney = (state, play) => !practiceDone(state) && (play !== 'free' || !freePracticeOpen(state));

// The difficulty a Practice level's Expert, timers and question counts go by:
// the table's (Easy up to ×6, Medium ×7–×8, Hard from ×9), once the game's
// Journey has opened it; Easy until then
export function practiceTier(state, level) {
  const tier = PRACTICE_LEVELS[Math.min(level, PRACTICE_LEVELS.length) - 1].difficulty;
  return tier === 'easy' || Progress.isUnlocked(state, `difficulty.${tier}`) ? tier : 'easy';
}

export const practiceName = (level) => (level >= PRACTICE_DONE ? 'Every table done!' : `Practice Level ${level}`);

// "The ×7 table, with some review"
export const practiceLine = (level) => `The ×${level} table${level > 1 ? ', with a little review' : ''}`;

export const practiceGoalLine = () => `Get ${Math.round(LEVEL_GOAL.firstTry * 5)} out of 5 answers right first try`;

export const practiceSteps = (state) => PRACTICE_LEVELS.map((l) => ({ level: l.level, label: `×${l.table}`, done: l.level < practiceLevel(state), current: l.level === practiceLevel(state) }));

// What the practice results say about a Journey round (recordPracticeLevel's
// result): { title, text } or null when it wasn't the current level.
export function practiceResultMessage(r) {
  if (r.advanced) {
    const next = r.to >= PRACTICE_DONE ? 'You finished every times table. Pick any of them in Free practice!' : `Next: the ×${r.to} table.`;
    return { title: r.to >= PRACTICE_DONE ? '📚 Every table done!' : `🎉 ×${r.to} unlocked!`, text: `${next} +${r.reward} points` };
  }
  if (!r.current) return null;
  return { title: 'So close!', text: `Get ${Math.round(LEVEL_GOAL.firstTry * 5)} out of 5 right first try to move up to ×${r.from + 1}.` };
}
