// Signing in and keeping saves in step, the parts with no React Native in
// them (tested in test/sync.test.js). The rules are the web game's
// (packages/auth/src/client.js): a signed-in player's save lives under its own
// key, and the first time an account is used on this device, the device's
// guest save goes into the account, once. After that the server's copy wins.
import * as Progress from '@blockout/progress';

export const GUEST_KEY = 'blockout.progress';
export const MERGED_KEY = 'blockout.mergedInto';
export const progressKey = (user) => (user ? `${GUEST_KEY}.${user.id}` : GUEST_KEY);

// The token's claims (no checking here: the server checks every request)
export function claims(token) {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(escape(atob(part.padEnd(part.length + ((4 - (part.length % 4)) % 4), '=')))));
  } catch (_) {
    return {};
  }
}

// Renew a minute before the access token runs out
export const REFRESH_EARLY_S = 60;
export function expiresSoon(token, now = Date.now()) {
  const { exp } = claims(token);
  return Boolean(exp) && exp - now / 1000 < REFRESH_EARLY_S;
}

// The save to use after signing in, and whether to send it to the account.
// remote: the account's save (or null); guest: this device's guest save;
// local: the account's cached save on this device; firstTimeHere: this account
// hasn't been used on this device before.
export function mergeOnSignIn({ remote, guest, local, firstTimeHere }) {
  let result;
  if (firstTimeHere) result = [remote, guest, local].filter(Boolean).reduce((a, b) => Progress.mergeProgress(b, a), null);
  else result = remote ? Progress.normalize(remote) : local ? Progress.normalize(local) : null;
  if (!result) return { progress: null, push: false };
  // Cheats belong to the device: switch this device's back on
  for (const code of Object.keys((local && local.cheats) || {})) Progress.cheatOn(result, code);
  return { progress: result, push: firstTimeHere || !remote };
}
