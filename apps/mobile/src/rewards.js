// What a game puts in the save, as the web game does it (play.js): every
// answer goes into the player's fact record, achievements are checked, and a
// finished game adds its points to the wallet. Single-player games count
// towards stats and achievements; two players on one phone only earn points.
// Each function changes the save and returns the achievements it earned.
import * as Progress from '@blockout/progress';
import * as Views from '@blockout/progress/views';

export const STATS_NAME = 'You'; // whose times tables the single player's answers count towards

export const countsForStats = (match) => match.mode === 'single';

// The biggest times table this player has unlocked: achievements for
// "every fact up to…" only count facts in reach (shared with the web game)
export const tableSize = Views.tableSize;

const facts = (progress) => (progress.facts[Progress.playerKey(STATS_NAME)] || { facts: {} }).facts;

// result: match.answer's, when it was right
export function onAnswer(progress, match, result, ms) {
  if (!countsForStats(match)) return [];
  const { rect, firstTry, streak, wrongAnswers } = result;
  Progress.recordAnswer(progress, STATS_NAME, { a: rect.a, b: rect.b, firstTry, correct: true, wrongAnswers, ms });
  const learned = Progress.learnedAfterHelp(progress, rect.a, rect.b, firstTry);
  return Progress.awardAchievements(progress, { event: 'answer', correct: true, firstTry, ms, streak, a: rect.a, b: rect.b, facts: facts(progress), size: tableSize(progress), learned });
}

export function onHelp(progress, match, rect) {
  if (!countsForStats(match)) return [];
  Progress.noteHelp(progress, rect.a, rect.b);
  return Progress.awardAchievements(progress, { event: 'help' });
}

export function onTimeout(progress, match, { rect, wrongAnswers }) {
  if (!countsForStats(match)) return;
  Progress.recordAnswer(progress, STATS_NAME, { a: rect.a, b: rect.b, firstTry: false, correct: false, wrongAnswers, timeout: true });
}

// The end of a game: everyone's points into the wallet, then (single player)
// the finishing bonus, the board win and the game achievements.
// Returns { points, boardBonus, earned }.
export function onGameOver(progress, match, results) {
  const humans = match.players.filter((p) => !p.cpu);
  const points = humans.reduce((sum, p) => sum + p.score, 0);
  Progress.addPoints(progress, points);
  if (!countsForStats(match)) return { points, boardBonus: 0, earned: [] };
  progress.counters.games++;
  const boardBonus = Progress.boardFinishBonus(match.size);
  if (boardBonus) Progress.addPoints(progress, boardBonus);
  Progress.noteActivity(progress, { kind: 'game', mode: match.mode, difficulty: match.difficulty, size: match.size, won: results.humanWon });
  if (results.humanWon) Progress.recordBoardWin(progress, match.size);
  const earned = Progress.awardAchievements(progress, {
    event: 'game',
    noHelp: results.noHelp,
    games: progress.counters.games,
    wonVsCpu: results.humanWon,
    humanWon: results.humanWon,
    full: results.empty === 0,
    perfect: results.perfect,
    difficulty: match.difficulty,
    bestScore: results.bestScore,
  });
  return { points, boardBonus, earned };
}

// What can be played here: Easy and the 6×6 board always, the rest once
// unlocked (they're bought in the web game's Shop)
export const DIFFICULTIES = [
  { id: 'easy', name: 'Easy', dice: '6-sided dice' },
  { id: 'medium', name: 'Medium', dice: '8-sided dice' },
  { id: 'hard', name: 'Hard', dice: '12-sided dice' },
];
export const BOARDS = [6, 8, 10, 12, 16];

export const difficultyOpen = (progress, id) => id === 'easy' || Progress.isUnlocked(progress, `difficulty.${id}`);
export const boardOpen = (progress, size) => size === 6 || Progress.isUnlocked(progress, `board${size}`);
// Two players on one phone is the Shop's "Multiplayer", as on the web
export const modeOpen = (progress, mode) => mode === 'single' || Progress.isUnlocked(progress, 'multiplayer');

// The Shop item a locked menu choice stands for (to offer it when tapped)
export const itemFor = { mode: () => 'multiplayer', difficulty: (id) => `difficulty.${id}`, size: (n) => `board${n}` };
