// Shared constants, elements and helpers: part of the multiplication game (split from the old js/game.js).

import * as Auth from '@blockout/auth';
import * as Invite from '../invite.js';

let PROGRESS_KEY, el, ctx;

const seededRandom = Invite.seededRandom;

const DEFAULT_NAMES = ['Player 1', 'Player 2', 'Player 3', 'Player 4'];

const PIPS = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

// How long each computer action takes (ms): every explanation step,
// every square it draws and every number it counts.
const CPU_STEP_MS = { slow: 2000, normal: 1000, fast: 500 };

const COUNT_STEP = 850; // ms between skip-counting steps when helping a human

const SETTINGS_KEY = 'blockout.settings';

const DEFAULT_SETTINGS = {
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

// Board sizes other than the small one are bought in the shop.
// Only the smallest board is free; every other size is bought in the shop.
const BOARD_UNLOCK = { 6: null, 8: 'board8', 10: 'board10', 12: 'board12', 16: 'board16', 20: 'board20', 24: 'board24', custom: 'boardCustom' };

const PASS_DELAY = 1600;

const AUTO_PLACE_MS = 900; // how long an auto-placed rectangle is previewed

const AUTO_ROLL_MS = 700; // pause before auto roll, so "Your turn" can be read first

const TRY_AGAIN = ['Not quite — try again!', 'Almost! Have another go.', 'Hmm, not that one. Try again!'];

const $ = (id) => document.getElementById(id);

// types[i] is 'human' or 'cpu' for each multiplayer slot.
// names start empty: multiplayer players type their own ("Player N" is only a placeholder)
// multiKind: 'local' (one screen) or 'classroom' (not built yet)
// level/timer: single player's Learn / Expert and Expert's answer timer (seconds)
const setup = { mode: 'single', multiKind: 'local', level: 'learn', timer: 0, count: 2, size: 6, names: ['', '', '', ''], types: ['human', 'human', 'human', 'human'] };

// What this part does when the page loads (main.js runs every part in order)
export function run() {
  // A signed-in player's save is kept apart from the guest one (see js/auth.js)
  PROGRESS_KEY = Auth ? Auth.progressKey() : 'blockout.progress';

  el = {
    startScreen: $('start-screen'),
    gameScreen: $('game-screen'),
    modeCards: document.querySelectorAll('.mode-card'),
    singleSetup: $('single-setup'),
    multiSetup: $('multi-setup'),
    multiKind: $('multi-kind'),
    localSetup: $('local-setup'),
    classroomSetup: $('classroom-setup'),
    classJoinOpen: $('class-join-open'),
    classHostOpen: $('class-host-open'),
    classOffline: $('class-offline'),
    classJoin: $('class-join'),
    classJoinForm: $('class-join-form'),
    classCodeInput: $('class-code-input'),
    classNameInput: $('class-name-input'),
    classJoinError: $('class-join-error'),
    classJoinBtn: $('class-join-btn'),
    classJoinCancel: $('class-join-cancel'),
    classWait: $('class-wait'),
    classWaitName: $('class-wait-name'),
    classWaitText: $('class-wait-text'),
    classLeaveBtn: $('class-leave-btn'),
    hostSetup: $('class-host-setup'),
    hostSetupTitle: $('class-host-title'),
    hostSize: $('host-size'),
    hostTypeField: $('host-type-field'),
    hostType: $('host-type'),
    hostTypeHelp: $('host-type-help'),
    hostDifficulty: $('host-difficulty'),
    hostRounds: $('host-rounds'),
    hostError: $('host-error'),
    hostCancel: $('host-cancel'),
    hostCreate: $('host-create'),
    hostScreen: $('class-host-screen'),
    hostCodeSmall: $('host-code-small'),
    hostLobby: $('host-lobby'),
    hostQr: $('host-qr'),
    hostUrl: $('host-url'),
    hostCode: $('host-code'),
    hostSettingsGrid: $('host-settings-grid'),
    hostQuick: $('host-quick'),
    hostStartBtn: $('host-start-btn'),
    hostLocalHelp: $('host-local-help'),
    hostPlay: $('host-play'),
    hostRound: $('host-round'),
    hostDieA: $('host-die-a'),
    hostDieB: $('host-die-b'),
    hostRollText: $('host-roll-text'),
    hostDoneFill: $('host-done-fill'),
    hostDoneText: $('host-done-text'),
    hostNextBtn: $('host-next-btn'),
    hostEndBtn: $('host-end-btn'),
    hostAuto: $('host-auto'),
    hostEnded: $('host-ended'),
    hostPodium: $('host-podium'),
    hostReport: $('host-report'),
    hostHardest: $('host-hardest'),
    hostAgainBtn: $('host-again-btn'),
    hostClose2Btn: $('host-close2-btn'),
    hostCloseBtn: $('host-close-btn'),
    hostRosterTitle: $('host-roster-title'),
    hostRoster: $('host-roster'),
    hostPairs: $('host-pairs'),
    hostMatching: $('host-matching'),
    hostOdd: $('host-odd'),
    hostPairsHelp: $('host-pairs-help'),
    hostPairList: $('host-pair-list'),
    hostTeacherDevice: $('host-teacher-device'),
    hostTeacherQr: $('host-teacher-qr'),
    hostTeacherUrl: $('host-teacher-url'),
    hostTeacherStatus: $('host-teacher-status'),
    hostMyGameBtn: $('host-mygame-btn'),
    hostCopyLink: $('host-copy-link'),
    hostCopyMsg: $('host-copy-msg'),
    hostShareBtn: $('host-share-btn'),
    hostCopyTeacher: $('host-copy-teacher'),
    hostMatches: $('host-matches'),
    hostDice: $('host-dice'),
    hostProgress: $('host-progress'),
    hostAutoLabel: $('host-auto-label'),
    hostMatchResults: $('host-match-results'),
    hostTournament: $('host-tournament'),
    hostTournamentFinal: $('host-tournament-final'),
    resultTournament: $('result-tournament'),
    singleName: $('single-name'),
    playerCount: $('player-count'),
    nameInputs: $('name-inputs'),
    namesError: $('names-error'),
    boardSize: $('board-size'),
    gameLevel: $('game-level'),
    gameLevelHelp: $('game-level-help'),
    gameTimerField: $('game-timer-field'),
    gameTimer: $('game-timer'),
    gameTimerHelp: $('game-timer-help'),
    boardSizeHelp: $('board-size-help'),
    customSize: $('custom-size'),
    customSizeInput: $('custom-size-input'),
    customSizeEcho: $('custom-size-echo'),
    setupForm: $('setup-form'),
    menuBtn: $('menu-btn'),
    progress: $('progress'),
    progressText: $('progress-text'),
    progressBar: $('progress-bar'),
    boardWrap: $('board-wrap'),
    canvas: $('board'),
    turnPanel: $('turn-panel'),
    turnLabel: $('turn-label'),
    dieA: $('die-a'),
    dieB: $('die-b'),
    turnMsg: $('turn-msg'),
    rollBtn: $('roll-btn'),
    rotateBtn: $('rotate-btn'),
    math: $('math'),
    mathQ: $('math-q'),
    answerBox: $('answer-box'),
    countTrail: $('count-trail'),
    mathFeedback: $('math-feedback'),
    keypad: $('keypad'),
    helpBtn: $('help-btn'),
    steps: $('steps'),
    diceEntry: $('dice-entry'),
    diePicks: document.querySelectorAll('.die-pick'),
    useDiceBtn: $('use-dice'),
    continueBtn: $('continue-btn'),
    timer: $('timer'),
    timerFill: $('timer-fill'),
    timerNum: $('timer-num'),
    stats: $('stats'),
    detailsBtn: $('details-btn'),
    scores: $('scores'),
    classmates: $('classmates'),
    hostBoards: $('host-boards'),
    gameOver: $('game-over'),
    resultTitle: $('result-title'),
    resultSub: $('result-sub'),
    resultList: $('result-list'),
    againBtn: $('again-btn'),
    toMenuBtn: $('to-menu-btn'),
    settingsBtn: $('settings-btn'),
    historyBtn: $('history-btn'),
    historyDialog: $('history'),
    historyBody: $('history-body'),
    historyDone: $('history-done'),
    resetHistory: $('reset-history'),
    settingsDialog: $('settings'),
    walletAmount: $('wallet-amount'),
    wardrobeBtn: $('wardrobe-btn'),
    unlockDialog: $('unlock'),
    unlockTitle: $('unlock-title'),
    unlockPrice: $('unlock-price'),
    unlockMessage: $('unlock-message'),
    unlockYes: $('unlock-yes'),
    unlockNo: $('unlock-no'),
    wardrobeDialog: $('wardrobe'),
    wardrobeBody: $('wardrobe-body'),
    wardrobeDone: $('wardrobe-done'),
    stickersBtn: $('stickers-btn'),
    stickersDialog: $('stickers'),
    stickersBody: $('stickers-body'),
    stickersTrade: $('stickers-trade'),
    stickersDone: $('stickers-done'),
    gameSettingsBtn: $('game-settings-btn'),
    practiceSetup: $('practice-setup'),
    practiceName: $('practice-name'),
    practiceCount: $('practice-count'),
    practiceCountHelp: $('practice-count-help'),
    practiceTimerField: $('practice-timer-field'),
    practiceTimer: $('practice-timer'),
    practiceTimerHelp: $('practice-timer-help'),
    practicePreview: $('practice-preview'),
    practiceTables: $('practice-tables'),
    practiceLevel: $('practice-level'),
    practiceLevelHelp: $('practice-level-help'),
    difficultyField: $('difficulty-field'),
    boardSizeField: $('board-size-field'),
    startBtn: $('start-btn'),
    practiceScreen: $('practice-screen'),
    practiceMenuBtn: $('practice-menu-btn'),
    practiceSettingsBtn: $('practice-settings-btn'),
    prCounter: $('pr-counter'),
    prStreak: $('pr-streak'),
    streakBadge: $('streak-badge'),
    prBar: $('pr-bar'),
    prArray: $('pr-array'),
    prTimer: $('pr-timer'),
    prTimerFill: $('pr-timer-fill'),
    prTimerNum: $('pr-timer-num'),
    prQ: $('pr-q'),
    prAnswer: $('pr-answer'),
    prTrail: $('pr-trail'),
    prFeedback: $('pr-feedback'),
    prKeypad: $('pr-keypad'),
    prHelp: $('pr-help'),
    practiceDone: $('practice-done'),
    pdSub: $('pd-sub'),
    pdBody: $('pd-body'),
    pdDetailsBtn: $('pd-details-btn'),
    pdShopBtn: $('pd-shop-btn'),
    resultsShopBtn: $('results-shop-btn'),
    pdAgain: $('pd-again'),
    pdMenu: $('pd-menu'),
    settingsNote: $('settings-note'),
    toasts: $('toasts'),
    shopBtn: $('shop-btn'),
    shopDialog: $('shop'),
    shopBody: $('shop-body'),
    shopDone: $('shop-done'),
    achievementsBtn: $('achievements-btn'),
    achievementsDialog: $('achievements'),
    achievementsBody: $('achievements-body'),
    achievementsDone: $('achievements-done'),
    rewards: $('rewards'),
    inviteBtn: $('invite-btn'),
    inviteMake: $('invite-make'),
    inviteCodeInput: $('invite-code-input'),
    inviteCodeOpen: $('invite-code-open'),
    inviteCodeError: $('invite-code-error'),
    invitePlayers: $('invite-players'),
    inviteNote: $('invite-note'),
    inviteBoard: $('invite-board'),
    inviteCustomField: $('invite-custom-field'),
    inviteCustom: $('invite-custom'),
    inviteSeed: $('invite-seed'),
    inviteCreate: $('invite-create'),
    inviteResult: $('invite-result'),
    inviteLink: $('invite-link'),
    inviteCode: $('invite-code'),
    inviteLocalWarning: $('invite-local-warning'),
    inviteTry: $('invite-try'),
    inviteQrWrap: $('invite-qr-wrap'),
    inviteQr: $('invite-qr'),
    inviteQrSave: $('invite-qr-save'),
    inviteQrPrint: $('invite-qr-print'),
    inviteDone: $('invite-done'),
    inviteOpen: $('invite-open'),
    inviteOpenNote: $('invite-open-note'),
    inviteOpenSummary: $('invite-open-summary'),
    inviteOpenNameField: $('invite-open-name-field'),
    inviteOpenName: $('invite-open-name'),
    inviteStart: $('invite-start'),
    inviteCancel: $('invite-cancel'),
    settingsDone: $('settings-done'),
    cornerRuleHint: $('corner-rule-hint'),
  };

  ctx = el.canvas.getContext('2d');
}

export { $, AUTO_PLACE_MS, AUTO_ROLL_MS, BOARD_UNLOCK, COUNT_STEP, CPU_STEP_MS, DEFAULT_NAMES, DEFAULT_SETTINGS, PASS_DELAY, PIPS, PROGRESS_KEY, SETTINGS_KEY, TRY_AGAIN, ctx, el, seededRandom, setup };
