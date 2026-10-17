// Daily check-in: part of the multiplication game (split from the old js/game.js).

import * as Views from '@blockout/progress/views';
import { celebrate, progress, renderWallet, saveProgress, toast } from './wallet.js';
import { checkUrlForInvite } from './invites.js';

// What this part does when the page loads (main.js runs every part in order)
export function run() {
  renderWallet();

  const visit = Views.dailyCheckIn(progress);
  if (visit) {
    toast(...visit.toast);
    celebrate(visit.earned);
    saveProgress();
  }

  checkUrlForInvite();
}
