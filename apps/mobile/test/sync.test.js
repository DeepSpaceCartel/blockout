import test from 'node:test';
import assert from 'node:assert';
import * as Progress from '@blockout/progress';
import { claims, expiresSoon, mergeOnSignIn, progressKey } from '../src/sync.js';

const jwt = (payload) => `x.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.y`;

test('the token says who it is and when it runs out', () => {
  assert.deepEqual(claims(jwt({ sub: 'u1', name: 'Zoë' })), { sub: 'u1', name: 'Zoë' });
  assert.deepEqual(claims('not a token'), {});
  const now = Date.UTC(2026, 9, 17);
  assert.equal(expiresSoon(jwt({ exp: now / 1000 + 30 }), now), true);
  assert.equal(expiresSoon(jwt({ exp: now / 1000 + 600 }), now), false);
});

test('saves are kept per account, apart from the guest save', () => {
  assert.equal(progressKey(null), 'blockout.progress');
  assert.equal(progressKey({ id: 'u1' }), 'blockout.progress.u1');
});

test('first time on this device: the guest save goes into the account, and is sent', () => {
  const remote = Progress.createProgress();
  Progress.addPoints(remote, 100);
  const guest = Progress.createProgress();
  Progress.addPoints(guest, 40);
  const { progress, push } = mergeOnSignIn({ remote, guest, local: null, firstTimeHere: true });
  assert.ok(progress.wallet >= 100);
  assert.equal(push, true);
});

test('after that the account wins, and an empty account gets this device’s save', () => {
  const remote = Progress.createProgress();
  Progress.addPoints(remote, 100);
  const guest = Progress.createProgress();
  Progress.addPoints(guest, 999);
  const later = mergeOnSignIn({ remote, guest, local: null, firstTimeHere: false });
  assert.equal(later.progress.wallet, 100);
  assert.equal(later.push, false);
  const local = Progress.createProgress();
  Progress.addPoints(local, 7);
  const empty = mergeOnSignIn({ remote: null, guest, local, firstTimeHere: false });
  assert.equal(empty.progress.wallet, 7);
  assert.equal(empty.push, true);
});
