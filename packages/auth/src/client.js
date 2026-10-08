// Blockout sign-in, in the browser: who's playing, their token, and keeping a
// signed-in player's progress in step with the server (server/accounts.js).
// Guests never need any of this: they play exactly as before.
//
// Providers (the server says which, GET /api/auth/config):
//   dev       a "dev sign-in" form: pick a name and a role (for now)
//   keycloak  OpenID Connect with PKCE against a Keycloak realm (later; Keycloak
//             can broker Google sign-in for @iusd.org students)
//
// Progress: a signed-in player's save lives under its own localStorage key
// (blockout.progress.<user id>), so the guest save on a shared Chromebook is
// untouched. The first time an account is used on a device, that device's guest
// progress is merged into the account; after that the server copy wins and the
// local one is just a cache.

import * as Progress from '@blockout/progress';
const AUTH_KEY = 'blockout.auth'; // { token, user, refresh?, idToken?, expires? }
const GUEST_KEY = 'blockout.progress';
const MERGED_KEY = 'blockout.mergedInto'; // user ids this device's guest save went into
const PUSH_DELAY_MS = 1500;
const PKCE_KEY = 'blockout.pkce';
const SIGNED_OUT_KEY = 'blockout.signedOut'; // sessionStorage: the provider a Keycloak sign-out came from

const read = (key, fallback = null) => {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v === null ? fallback : v;
  } catch (_) {
    return fallback;
  }
};
const write = (key, value) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch (_) {
    // private window etc.: signing in just won't stick
  }
};

let session = read(AUTH_KEY); // { token, user }
const served = () => location.protocol === 'http:' || location.protocol === 'https:';

class AuthError extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

// A JSON request with the signed-in user's token.
async function api(method, path, body) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(session ? { Authorization: `Bearer ${session.token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      keepalive: method !== 'GET' && JSON.stringify(body || {}).length < 60000,
    });
  } catch (e) {
    throw new AuthError('offline', 'Can’t reach the server.');
  }
  let data;
  try {
    data = await res.json();
  } catch (e) {
    throw new AuthError('offline', 'The server isn’t running here.');
  }
  if (res.status === 401 && session && data.error === 'auth') {
    // the token expired or the server's key changed: back to guest
    signOut(false);
  }
  if (!res.ok) throw new AuthError(data.error || 'server', data.message || 'Something went wrong.', res.status);
  return data;
}

let configCache = null;
async function config() {
  if (!configCache) configCache = await api('GET', '/api/auth/config');
  return configCache;
}

function saveSession(s) {
  session = s;
  write(AUTH_KEY, s);
}

// ---- dev provider
async function signInDev(person) {
  const { token, user } = await api('POST', '/api/auth/dev', person);
  saveSession({ token, user });
  return user;
}

// ---- keycloak provider (OIDC authorization code + PKCE)
// A JWT's claims, unchecked: only for what the page shows (the server checks tokens)
const claims = (jwt) => {
  try {
    return JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  } catch (_) {
    return {};
  }
};
const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
async function signInKeycloak() {
  const c = await config();
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const state = b64url(crypto.getRandomValues(new Uint8Array(16)));
  sessionStorage.setItem(PKCE_KEY, JSON.stringify({ verifier, state, back: location.hash }));
  const url = new URL(`${c.issuer}/protocol/openid-connect/auth`);
  url.search = new URLSearchParams({
    client_id: c.clientId,
    redirect_uri: location.origin + location.pathname,
    response_type: 'code',
    scope: 'openid profile email',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  });
  location.assign(url.toString());
}

// Back from Keycloak with ?code=…&state=…: swap the code for tokens.
async function finishKeycloak() {
  const q = new URLSearchParams(location.search);
  if (!q.has('code') || !q.has('state')) return false;
  const saved = JSON.parse(sessionStorage.getItem(PKCE_KEY) || 'null');
  sessionStorage.removeItem(PKCE_KEY);
  history.replaceState(null, '', location.pathname + ((saved && saved.back) || ''));
  if (!saved || saved.state !== q.get('state')) return false;
  const c = await config();
  const res = await fetch(`${c.issuer}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', client_id: c.clientId, code: q.get('code'), redirect_uri: location.origin + location.pathname, code_verifier: saved.verifier }),
  });
  if (!res.ok) throw new AuthError('auth', 'Signing in didn’t work. Please try again.');
  const t = await res.json();
  // the ID token is only kept to end the Keycloak session on sign out
  saveSession({ token: t.access_token, refresh: t.refresh_token, idToken: t.id_token, user: null });
  const { user } = await api('GET', '/api/me');
  saveSession({ ...session, user });
  return true;
}

// Signing out of a Keycloak account also ends the Keycloak session; otherwise
// the next "Sign in" on a shared Chromebook would quietly be the same child.
// reload = false (an expired token) only forgets the token here.
function signOut(reload = true) {
  flushProgress(); // keepalive: it survives leaving the page
  const idToken = session && session.idToken;
  saveSession(null);
  if (!reload) return;
  if (!idToken) {
    location.reload();
    return;
  }
  try {
    // Keycloak names the identity provider ("google") when the account came from one
    sessionStorage.setItem(SIGNED_OUT_KEY, claims(idToken).identity_provider || 'keycloak');
  } catch (_) {
    // private window: no "signed out" message
  }
  config().then((c) => {
    const url = new URL(`${c.issuer}/protocol/openid-connect/logout`);
    url.search = new URLSearchParams({ id_token_hint: idToken, post_logout_redirect_uri: location.origin + location.pathname, client_id: c.clientId });
    location.assign(url.toString());
  }, () => location.reload());
}

// Once, after coming back from a Keycloak sign-out: which provider the account
// came from ('google', or 'keycloak' for a Keycloak password), else null.
function takeSignedOut() {
  try {
    const from = sessionStorage.getItem(SIGNED_OUT_KEY);
    sessionStorage.removeItem(SIGNED_OUT_KEY);
    return from;
  } catch (_) {
    return null;
  }
}

// ---- progress
const user = () => (session && session.user) || null;
const progressKey = () => (user() ? `${GUEST_KEY}.${user().id}` : GUEST_KEY);

let pushTimer = null;
let pushState = null;
// Called after every local save: sends it to the server shortly after.
function queueProgress(state) {
  if (!user()) return;
  pushState = state;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(flushProgress, PUSH_DELAY_MS);
}
function flushProgress() {
  clearTimeout(pushTimer);
  if (!pushState || !user()) return;
  const state = pushState;
  pushState = null;
  api('PUT', '/api/me/progress', { progress: state }).catch(() => {
    pushState = pushState || state; // try again with the next save
  });
}
window.addEventListener('pagehide', flushProgress);

// After signing in (and on every page load while signed in): bring the
// account's save and this device together. Returns the save to use, or null
// when the local cache is already right.
async function syncProgress(localState) {
  if (!user()) return null;
  const { progress: remote } = await api('GET', '/api/me/progress');
  const merged = read(MERGED_KEY, []);
  const firstTimeHere = !merged.includes(user().id);
  let result;
  if (firstTimeHere) {
    // this device's guest progress goes into the account, once
    const guest = read(GUEST_KEY);
    result = [remote, guest, localState].filter(Boolean).reduce((a, b) => Progress.mergeProgress(b, a));
    write(MERGED_KEY, [...merged, user().id]);
  } else {
    result = remote ? Progress.normalize(remote) : null;
  }
  if (!result) return null;
  // Cheats belong to the device: switch this device's back on
  for (const code of Object.keys((localState && localState.cheats) || {})) Progress.cheatOn(result, code);
  if (firstTimeHere || !remote) await api('PUT', '/api/me/progress', { progress: Progress.withoutCheats(result) });
  return result;
}

export const signedIn = () => Boolean(user());
export const token = () => (session ? session.token : null);
export const role = () => (user() ? user().role : 'guest');

export {
  served,
  api,
  config,
  user,
  signInDev,
  signInKeycloak,
  finishKeycloak,
  signOut,
  takeSignedOut,
  progressKey,
  queueProgress,
  flushProgress,
  syncProgress,
  AuthError,
};
