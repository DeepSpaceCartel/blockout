// Finished games, kept on this phone only (like the web game's blockout.history),
// newest last. What an entry holds and the report built from it are shared
// (@blockout/progress/stats).
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Stats from '@blockout/progress/stats';

const HISTORY_KEY = 'blockout.history';

export async function loadHistory() {
  try {
    const saved = JSON.parse(await AsyncStorage.getItem(HISTORY_KEY));
    return Array.isArray(saved) ? saved : [];
  } catch (_) {
    return [];
  }
}

// A finished game: the match and its results (winners: the ranked players with their index)
export async function recordGame(match, results) {
  const entry = Stats.gameRecord(match, new Set(results.winners.map((p) => p.index)));
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(Stats.addToHistory(await loadHistory(), entry)));
}
