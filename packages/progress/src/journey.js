// The Journeys, for every client (the web game, the phone app): which level a
// player is on, what game or round it is, what it takes to move up and what
// to say about it. Pure functions of the save; the rules that change it are
// in progress.js (recordLevelGame, recordPracticeLevel), the levels in levels.js.
import * as Progress from './progress.js';
import { DIFFICULTY_NAMES } from './setup.js';
import { LEVELS, STEPS, DONE, PRACTICE_LEVELS, PRACTICE_DONE, PRACTICE_ROUNDS, levelOfStep, practiceLevelOfTable } from './levels.js';

export { LEVELS, STEPS, DONE, PRACTICE_LEVELS, PRACTICE_DONE };
export const { journeyLevel, levelResult, recordLevelGame, LEVEL_GOAL, levelUpReward } = Progress;

const fiveOf = () => `${Math.round(LEVEL_GOAL.firstTry * 5)} out of 5`;

// Free play (choosing your own board and difficulty) opens on the 6×6 board
// with 6-sided dice, where everyone used to start.
export const FREE_PLAY_LEVEL = levelOfStep(6);
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

// "7×7 board, 7-sided dice · stage 2 of 3"
export const levelLine = (level) => {
  const l = levelInfo(level);
  return `${l.size}×${l.size} board, ${levelDice(level)}${l.stages > 1 ? ` · stage ${l.stage} of ${l.stages}` : ''}`;
};

// "Level 7", or the last level's name once the Journey is done
export const levelName = (level) => (level >= DONE ? 'Journey done!' : `Level ${level}`);

// The goal of a level's stage, in a child's words (each stage adds to the one before)
export function goalLine(level = 1) {
  const stage = levelInfo(level).stage;
  const base = `Beat the CPU with ${fiveOf()} answers right first try`;
  if (stage === 2) return `${base}, without “Help me count”`;
  if (stage === 3) return 'Beat the CPU with every answer right first try';
  return base;
}

// The dots under the card: one per board (its stages are inside it).
// label: the board's size, or the challenge's difficulty initial (T, M, L).
export const steps = (state) => {
  const done = isDone(state);
  const here = levelInfo(journeyLevel(state));
  return STEPS.map((s) => ({ level: s.step, label: s.sides ? `${s.size}` : DIFFICULTY_NAMES[s.difficulty][0], done: done || s.step < here.step, current: !done && s.step === here.step }));
};

const MISSING = {
  win: 'Beat the CPU to move up.',
  accuracy: `You won! Now get FIVE answers right first try to move up.`,
  help: 'You won! Now do it without “Help me count” to move up.',
  perfect: 'You won! Now get every answer right first try to move up.',
};

// What the results screen says about a Journey game (recordLevelGame's result):
// { title, text } or null when it wasn't the current level.
export function resultMessage(r) {
  if (r.advanced) {
    const next = r.to >= DONE ? 'Every level done: you can play any board in Free play!' : `Next: ${levelLine(r.to)}.`;
    return { title: r.to >= DONE ? '🏔️ Journey done!' : `🎉 Level ${r.to} unlocked!`, text: `${next} +${r.reward} points` };
  }
  if (!r.current) return null;
  return { title: r.missing === 'win' ? 'Almost!' : 'So close!', text: MISSING[r.missing].replace('FIVE', fiveOf()) };
}

// ---- Practice's Journey: each ×n table in five rounds (5, 10, 20, Expert, Expert with a timer)

export const { practiceLevel, recordPracticeLevel } = Progress;

const practiceInfo = (level) => PRACTICE_LEVELS[Math.min(level, PRACTICE_LEVELS.length) - 1];

// Auto practice (the game picks the facts you need from every table you've
// reached, see Practice.autoQueue) opens on the ×2 table, once there's more
// than one table. play: 'journey' or 'free' (Auto; the name it had as Free practice).
export const AUTO_PRACTICE_LEVEL = practiceLevelOfTable(2);
export const autoPracticeOpen = (state) => practiceLevel(state) >= AUTO_PRACTICE_LEVEL;
export const practiceDone = (state) => practiceLevel(state) >= PRACTICE_DONE;
export const onPracticeJourney = (state, play) => !practiceDone(state) && (play !== 'free' || !autoPracticeOpen(state));

// What a Practice level's round is: { table, count, expert, timer (s, 0: none) }
export const practiceSetup = (level) => {
  const l = practiceInfo(level);
  return { table: l.table, count: l.count, expert: l.expert, timer: l.timer };
};

// The difficulty a Practice level's round belongs to (its dice, its records):
// Easy up to ×6, Medium ×7–×8, Hard from ×9
export const practiceTier = (level) => practiceInfo(level).difficulty;

// "10 questions, Expert, 10 s timer"
export const practiceRound = (level) => {
  const l = practiceInfo(level);
  return `${l.count} questions${l.expert ? ', Expert' : ''}${l.timer ? `, ${l.timer} s timer` : ''}`;
};

export const practiceName = (level) => (level >= PRACTICE_DONE ? 'Every table done!' : `Practice Level ${level}`);

// "The ×7 table up to 7 × 8 · round 4 of 5: 10 questions, Expert"
export const practiceLine = (level) => {
  const l = practiceInfo(level);
  return `The ×${l.table} table up to ${l.table} × ${l.upTo} · round ${l.stage} of ${PRACTICE_ROUNDS}: ${practiceRound(level)}`;
};

// The button to the next round: "×4 ›", "10 questions ›", "Expert ›", "Expert + timer ›"
export const practiceNextLabel = (level) => {
  const l = practiceInfo(level);
  return l.stage === 1 ? `×${l.table} ›` : l.timer ? 'Expert + timer ›' : l.expert ? 'Expert ›' : `${l.count} questions ›`;
};

export const practiceGoalLine = () => `Get ${fiveOf()} answers right first try`;

// The dots under the card: one per table (its rounds are inside it)
export const practiceSteps = (state) => {
  const done = practiceDone(state);
  const here = practiceInfo(practiceLevel(state));
  return Array.from({ length: 12 }, (_, i) => ({ level: i + 1, label: `×${i + 1}`, done: done || i + 1 < here.table, current: !done && i + 1 === here.table }));
};

// What the practice results say about a Journey round (recordPracticeLevel's
// result): { title, text } or null when it wasn't the current level.
export function practiceResultMessage(r) {
  if (r.advanced) {
    if (r.to >= PRACTICE_DONE) return { title: '📚 Every table done!', text: `You finished every times table. Pick any of them in Free practice! +${r.reward} points` };
    const next = practiceInfo(r.to);
    if (next.stage === 1) return { title: `🎉 ×${next.table} unlocked!`, text: `Next: the ×${next.table} table. +${r.reward} points` };
    return { title: `🎉 Round ${next.stage} of ×${next.table}!`, text: `Next: ${practiceRound(r.to)}. +${r.reward} points` };
  }
  if (!r.current) return null;
  return { title: 'So close!', text: `Get ${fiveOf()} right first try to move up.` };
}
