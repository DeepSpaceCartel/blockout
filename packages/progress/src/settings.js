// Settings, for every client (the web game, the phone app): the defaults,
// which Shop item unlocks a choice, and what each setting says. Settings stay
// on the device (they're not part of the save); the unlocks are the save's.
import * as Progress from './progress.js';

export const DEFAULT_SETTINGS = {
  firstInCorner: false,
  cpuSpeed: 'normal',
  placeMode: 'draw',
  diceMode: 'virtual',
  cpuEnd: 'auto', // 'auto': next turn starts by itself; 'button': wait for "My turn"
  showProgress: false, // "Board: X of Y filled" meter in the header
  answerTime: '0', // seconds to answer the multiplication; '0' = no timer
  difficulty: 'easy', // easy d6, medium d8, hard d12
  cpuSteps: 'show', // 'show': CPU explains step by step; 'instant': CPU plays straight away
  autoRoll: 'manual', // 'manual': press Roll dice; 'auto': the dice roll by themselves
  fitRolls: 'end', // "no room": only roll what fits 'end' (near the end), 'always' or 'never'
  // Times-table grid cells: 'icon' (✓ ~ !) or 'time' (best time), per status
  timesMastered: 'icon',
  timesLearning: 'icon',
  timesPractice: 'icon',
  theme: 'auto', // 'auto' follows the device; 'light' or 'dark' forces one (free, not in the shop)
};

// How long each step of a CPU turn takes (cpuSpeed)
export const CPU_STEP_MS = { slow: 2000, normal: 1000, fast: 500 };

// The Shop item that unlocks a setting's choice; null when it's free (the default)
export function unlockFor(key, value) {
  if (key === 'theme' || String(value) === String(DEFAULT_SETTINGS[key])) return null;
  if (key === 'difficulty') return `difficulty.${value}`;
  if (key === 'cpuSteps') return 'cpuInstant';
  if (key === 'answerTime') return `answerTime${value}`; // each length is its own unlock
  if (key === 'placeMode') return value === 'auto' ? 'placeAuto' : 'placeMode'; // Click, then Auto
  return key;
}

export const allowed = (state, key, value) => Progress.isUnlocked(state, unlockFor(key, value));

// The settings with anything not unlocked (saved before it was locked, or a
// save swapped by signing in) back to the default
export function enforce(settings, state) {
  const out = { ...DEFAULT_SETTINGS, ...settings };
  for (const key of Object.keys(DEFAULT_SETTINGS)) if (!allowed(state, key, out[key])) out[key] = DEFAULT_SETTINGS[key];
  return out;
}

// What each setting says, in the Settings screen's order. options' values are
// the stored ones (booleans for the yes/no settings).
export const SETTINGS = [
  { key: 'theme', label: 'Theme', help: '"Auto" follows your device\'s light or dark mode.', options: [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']] },
  { key: 'firstInCorner', label: 'First rectangle', help: '"Top-left corner" is the original rule: it stops Player 1 from grabbing the best spot.', options: [[false, 'Anywhere'], [true, 'Top-left corner']] },
  { key: 'diceMode', label: 'Dice', help: '"Real dice": roll your own dice at the table and tap the numbers you got. CPU players still roll their own dice in the app.', options: [['virtual', 'Roll in the app'], ['real', 'Real dice']] },
  { key: 'autoRoll', label: 'Rolling', help: '"Auto roll": your dice roll by themselves at the start of each turn. (With real dice you still roll at the table.)', options: [['manual', 'Press to roll'], ['auto', 'Auto roll']] },
  { key: 'fitRolls', label: 'Only roll what fits', help: '"No room" means your roll doesn\'t fit anywhere, so you pass. Near the end: when the board is nearly full, only rolls that fit (adjusts to board size and difficulty). Always: nobody ever passes. Never: the original rules.', options: [['end', 'Near the end'], ['always', 'Always'], ['never', 'Never']] },
  { key: 'placeMode', label: 'Placing rectangles', help: '"Draw it": press and drag to draw a rectangle of the right size. "Click to place": the rectangle is made for you, you pick the spot. "Auto": the game places it for you, so you only do the math.', options: [['draw', 'Draw it'], ['click', 'Click to place'], ['auto', 'Auto']] },
  { key: 'cpuSpeed', label: 'CPU explanations', help: 'How long each step of a CPU turn takes — every message, every square it draws and every number it counts. Slow: 2 seconds · Normal: 1 second · Fast: ½ second.', options: [['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast']] },
  { key: 'cpuSteps', label: 'CPU turns', help: '"Instant": the CPU plays its turn straight away without explaining, and it\'s your go again.', options: [['show', 'Show steps'], ['instant', 'Instant']] },
  { key: 'cpuEnd', label: 'After a CPU turn', help: '"Press a button" keeps the CPU\'s explanation on screen until you press the button to go on.', options: [['auto', 'Continue automatically'], ['button', 'Press a button']] },
  { key: 'answerTime', label: 'Answer timer (Home multiplayer)', help: 'Time to answer the multiplication in Home multiplayer games. Run out and you lose your turn: the rectangle comes off the board and scores nothing. The clock pauses during "Help me count". (Single player has its own timers under Expert.)', options: [['0', 'Off'], ['30', '30 s'], ['10', '10 s'], ['5', '5 s']] },
  { key: 'timesMastered', label: 'Times-table grid: Mastered', help: 'Each cell can show its icon or your best time for that fact. Cells with no right answer yet keep the icon.', options: [['icon', 'Icon'], ['time', 'Best time']] },
  { key: 'timesLearning', label: 'Times-table grid: Learning', options: [['icon', 'Icon'], ['time', 'Best time']] },
  { key: 'timesPractice', label: 'Times-table grid: Needs practice', options: [['icon', 'Icon'], ['time', 'Best time']] },
  { key: 'showProgress', label: 'Board progress', help: 'Shows "Board: 24 of 144 filled" with a colored bar at the top of the game.', options: [[false, 'Hide'], [true, 'Show']] },
].map((s) => ({ ...s, options: s.options.map(([value, label]) => ({ value, label })) }));

// Which statuses the Times Table shows as a best time (for Stats.factGrid's showTime)
export const showsTime = (settings) => (status) => ({ mastered: settings.timesMastered, learning: settings.timesLearning, practice: settings.timesPractice })[status] === 'time';
