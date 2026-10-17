// What the account screens (../accounts.js) use from the game.
import { el } from './base.js';
import { progress as state } from './wallet.js';
import { connectHost, openClassJoin } from './classroom.js';

export { replaceProgress, saveProgress, toast, celebrate } from './wallet.js';
export { openHostSetup } from './classroom.js';
export { renderFactGrid, renderFactLegend, make } from './play.js';
export { icon } from './wardrobe.js';
export { startPractice } from './practice.js';
export { drawQr } from './invites.js';
export { dailyCard, dailyOpen } from './daily.js';

export const progress = () => state;
export const startHost = (h) => connectHost(h);
export const joinClass = (code) => openClassJoin(code, true);
export const menuShowing = () => !el.startScreen.hidden;
