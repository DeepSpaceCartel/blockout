// The browser's classroom client (core.js, for this page's own server): the
// token from @blockout/auth, live updates by Server-Sent Events, and which
// class this tab is in kept per tab (sessionStorage), so a reload or a
// Chromebook that went to sleep can rejoin, and several tabs can be different
// students when testing. The screens themselves live in the games.

import * as Auth from '@blockout/auth';
import { ClassError, createClient } from './core.js';

// The classroom needs the page to come from the classroom server.
const served = () => location.protocol === 'http:' || location.protocol === 'https:';

// Reloading or closing the page drops the connection too; that isn't the class going away.
let unloading = false;
window.addEventListener('pagehide', () => (unloading = true));
window.addEventListener('beforeunload', () => (unloading = true));

const client = createClient({
  token: () => Auth.token(),
  storage: { get: (k) => sessionStorage.getItem(k), set: (k, v) => (v === null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v)) },
  EventSource: window.EventSource,
  unloading: () => unloading,
  served,
});

// Join links look like https://host/#class=ABCD; the teacher's other device
// gets #class=ABCD&play=KEY.
function linkFromHash(hash = location.hash) {
  const m = /^#class=([A-Za-z]{4})(?:&play=([0-9a-f]+))?$/.exec(hash || '');
  return m ? { code: m[1].toUpperCase(), play: m[2] || null } : null;
}

export const { check, health, roomInfo, createRoom, join, joinAsTeacher, joinWithPlayKey, live, roll, leave, sendResult, teacher, listenStudent, listenTeacher, session, saveSession, host, saveHost } = client;
export { ClassError, served, linkFromHash, createClient };
