// Signing in on a phone: Keycloak (and Google behind it) in the system
// browser, with PKCE, as the public client blockout-mobile. Its tokens carry
// "blockout" as an audience, so the server takes them like the web game's.
// Tokens are kept in the device's secure store; the save syncs with the
// account like on the web (src/sync.js).
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AuthSession from 'expo-auth-session';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import * as Progress from '@blockout/progress';
import { MERGED_KEY, GUEST_KEY, claims, expiresSoon, mergeOnSignIn, progressKey } from './sync';

WebBrowser.maybeCompleteAuthSession(); // (web: closes the sign-in popup)

const { server: SERVER, keycloakClientId: CLIENT_ID } = Constants.expoConfig.extra;
const USER_KEY = 'blockout.user';
const PUSH_DELAY_MS = 1500;

// SecureStore is native only; the web build (for testing) keeps them in AsyncStorage
const secret = Platform.OS === 'web'
  ? { get: (k) => AsyncStorage.getItem(k), set: (k, v) => AsyncStorage.setItem(k, v), remove: (k) => AsyncStorage.removeItem(k) }
  : { get: (k) => SecureStore.getItemAsync(k), set: (k, v) => SecureStore.setItemAsync(k, v), remove: (k) => SecureStore.deleteItemAsync(k) };
const TOKENS = ['blockout.token', 'blockout.refresh', 'blockout.idToken']; // (one value each: SecureStore's are small)

let session = null; // { token, refresh, idToken, user }

export class AccountError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

async function readJson(key) {
  try {
    return JSON.parse(await AsyncStorage.getItem(key));
  } catch (_) {
    return null;
  }
}
const writeJson = (key, value) => (value === null ? AsyncStorage.removeItem(key) : AsyncStorage.setItem(key, JSON.stringify(value)));

async function saveSession(next) {
  session = next;
  const values = next ? [next.token, next.refresh, next.idToken] : [];
  await Promise.all(TOKENS.map((k, i) => (values[i] ? secret.set(k, values[i]) : secret.remove(k))));
  await writeJson(USER_KEY, next ? next.user : null);
}

// At start: whoever signed in last time
export async function loadSession() {
  const [token, refresh, idToken] = await Promise.all(TOKENS.map((k) => secret.get(k)));
  const who = await readJson(USER_KEY);
  session = token && who ? { token, refresh, idToken, user: who } : null;
  return user();
}

export const user = () => (session ? session.user : null);

let configCache = null;
async function discovery() {
  if (!configCache) {
    let c;
    try {
      c = await (await fetch(`${SERVER}/api/auth/config`)).json();
    } catch (_) {
      throw new AccountError('offline', 'Can’t reach Blockout. Are you online?');
    }
    if (c.provider !== 'keycloak') throw new AccountError('server', 'This Blockout doesn’t have accounts.');
    configCache = { issuer: c.issuer, discovery: await AuthSession.fetchDiscoveryAsync(c.issuer) };
  }
  return configCache;
}

// Where Keycloak sends the browser back to: blockout://auth in the app, an
// exp:// address in Expo Go, this page on the web
export const redirectUri = () => AuthSession.makeRedirectUri({ scheme: 'blockout', path: 'auth' });

// Opens Keycloak in the system browser. Resolves to the user, or null when
// they closed it.
export async function signIn() {
  const { discovery: d } = await discovery();
  const request = new AuthSession.AuthRequest({ clientId: CLIENT_ID, redirectUri: redirectUri(), scopes: ['openid', 'profile', 'email'], usePKCE: true });
  // (iOS: a private browser session, so a shared iPad never stays signed in)
  const result = await request.promptAsync(d, { preferEphemeralSession: true });
  if (result.type !== 'success') return null;
  let t;
  try {
    t = await AuthSession.exchangeCodeAsync({ clientId: CLIENT_ID, code: result.params.code, redirectUri: redirectUri(), extraParams: { code_verifier: request.codeVerifier } }, d);
  } catch (_) {
    throw new AccountError('auth', 'Signing in didn’t work. Please try again.');
  }
  await saveSession({ token: t.accessToken, refresh: t.refreshToken, idToken: t.idToken, user: null });
  const { user: me } = await api('GET', '/api/me');
  await saveSession({ ...session, user: me });
  return me;
}

// Ends the Keycloak session too, so the next sign-in asks again
export async function signOut() {
  await flushProgress();
  const ended = session;
  await saveSession(null);
  if (!ended || !ended.refresh) return;
  try {
    const { discovery: d } = await discovery();
    await fetch(d.endSessionEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `client_id=${encodeURIComponent(CLIENT_ID)}&refresh_token=${encodeURIComponent(ended.refresh)}`,
    });
  } catch (_) {
    // offline: the Keycloak session just runs out by itself
  }
}

let refreshing = null;
async function refresh() {
  if (!refreshing) {
    refreshing = (async () => {
      if (!session || !session.refresh) return false;
      try {
        const { discovery: d } = await discovery();
        const t = await AuthSession.refreshAsync({ clientId: CLIENT_ID, refreshToken: session.refresh }, d);
        await saveSession({ ...session, token: t.accessToken, refresh: t.refreshToken || session.refresh, idToken: t.idToken || session.idToken });
        return true;
      } catch (_) {
        return false; // the Keycloak session is over: sign in again
      }
    })().finally(() => (refreshing = null));
  }
  return refreshing;
}

// The Blockout API as the signed-in player. A token that can't be renewed
// signs them out here (their save stays on the phone).
export async function api(method, path, body) {
  if (session && expiresSoon(session.token) && !(await refresh())) {
    await saveSession(null);
    throw new AccountError('expired', 'Please sign in again.');
  }
  let res;
  try {
    res = await fetch(`${SERVER}${path}`, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(session ? { Authorization: `Bearer ${session.token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (_) {
    throw new AccountError('offline', 'Can’t reach Blockout. Are you online?');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new AccountError(data.error || 'server', data.message || 'Something went wrong.');
  return data;
}

// ---- the save

export async function loadProgress() {
  return Progress.normalize(await readJson(progressKey(user())));
}

export async function saveProgress(progress) {
  await writeJson(progressKey(user()), progress);
  if (user()) queueProgress(progress);
}

let pushState = null;
let pushTimer = null;
function queueProgress(progress) {
  pushState = Progress.withoutCheats(progress);
  clearTimeout(pushTimer);
  pushTimer = setTimeout(flushProgress, PUSH_DELAY_MS);
}

export async function flushProgress() {
  clearTimeout(pushTimer);
  if (!pushState || !user()) return;
  const state = pushState;
  pushState = null;
  await api('PUT', '/api/me/progress', { progress: state }).catch(() => {
    pushState = pushState || state; // try again with the next save
  });
}

// After signing in, and at start while signed in: the account's save and this
// phone's, together. Returns the save to play with.
export async function syncProgress() {
  const local = await readJson(progressKey(user()));
  if (!user()) return Progress.normalize(local);
  const { progress: remote } = await api('GET', '/api/me/progress');
  const merged = (await readJson(MERGED_KEY)) || [];
  const firstTimeHere = !merged.includes(user().id);
  const { progress, push } = mergeOnSignIn({ remote, guest: await readJson(GUEST_KEY), local, firstTimeHere });
  if (firstTimeHere) await writeJson(MERGED_KEY, [...merged, user().id]);
  const result = progress || Progress.createProgress();
  await writeJson(progressKey(user()), result);
  if (push) await api('PUT', '/api/me/progress', { progress: Progress.withoutCheats(result) });
  return result;
}

// Which Google (or other) sign-in the account came from, for the account screen
export const signedInWith = () => (session && session.idToken ? claims(session.idToken).identity_provider || null : null);
