// The classroom server from the phone (@blockout/classroom/core): the
// server's address, the account's token when signed in, long polling (no
// event streams here), and which class you're in kept on the phone, so the
// app can rejoin after it was closed.
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { createClient } from '@blockout/classroom/core';
import * as Account from './account';

const SESSION_KEY = 'blockout.class';
const NAME_KEY = 'blockout.className'; // a guest's name last time (like the web game's)

// (the client reads its storage synchronously: a copy in memory, written through)
const kept = new Map();
const storage = {
  get: (k) => (kept.has(k) ? kept.get(k) : null),
  set: (k, v) => {
    if (v === null) {
      kept.delete(k);
      AsyncStorage.removeItem(k).catch(() => {});
    } else {
      kept.set(k, v);
      AsyncStorage.setItem(k, v).catch(() => {});
    }
  },
};

export const client = createClient({ base: Constants.expoConfig.extra.server, token: Account.freshToken, EventSource: null, storage });

// At start: the class this phone was in, if any
export async function loadSession() {
  try {
    const v = await AsyncStorage.getItem(SESSION_KEY);
    if (v) kept.set(SESSION_KEY, v);
  } catch (_) {}
  return client.session();
}

export const lastName = async () => (await AsyncStorage.getItem(NAME_KEY).catch(() => null)) || '';
export const saveName = (name) => AsyncStorage.setItem(NAME_KEY, name).catch(() => {});
