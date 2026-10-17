// Blockout on a phone: the menu and the game, the save, and signing in.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Progress from '@blockout/progress';
import * as Shop from '@blockout/progress/shop';
import * as Account from './account';
import Game from './Game';
import Home from './Home';
import { BOARDS, DIFFICULTIES, boardOpen, difficultyOpen, modeOpen } from './rewards';
import { ShopScreen, UnlockSheet } from './Shop';
import { useTheme } from './theme';

const CHOICE_KEY = 'blockout.mobile.choice';
const DEFAULT_CHOICE = { mode: 'single', difficulty: 'easy', size: 6 };

// The game to start from the menu's choice (falling back to what's unlocked)
function setupFor(choice, progress) {
  const difficulty = difficultyOpen(progress, choice.difficulty) ? choice.difficulty : 'easy';
  const size = boardOpen(progress, choice.size) ? choice.size : 6;
  const mode = modeOpen(progress, choice.mode) ? choice.mode : 'single';
  const players = mode === 'multi' ? [{ name: 'Player 1' }, { name: 'Player 2' }] : [{ name: 'You' }, { name: 'CPU', cpu: true }];
  return { mode, difficulty, size, players };
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Main />
    </SafeAreaProvider>
  );
}

function Main() {
  const t = useTheme();
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState(null);
  const [progress, setProgress] = useState(null);
  const [choice, setChoice] = useState(DEFAULT_CHOICE);
  const [game, setGame] = useState(null); // { key, setup }
  const [screen, setScreen] = useState('menu'); // 'menu' | 'shop' (a game is on top of either)
  const [offer, setOffer] = useState(null); // the unlock sheet: Shop.unlockOffer's answer
  const [signingIn, setSigningIn] = useState(false);
  const [accountError, setAccountError] = useState(null);
  const [, setTick] = useState(0);
  const toasts = useToasts();

  // At start: the last account, its save (synced when online), the last choice
  useEffect(() => {
    (async () => {
      const who = await Account.loadSession();
      setUser(who);
      let save = await Account.loadProgress();
      if (who) save = await Account.syncProgress().catch(() => save); // (offline: play on, sync later)
      setProgress(save);
      try {
        setChoice({ ...DEFAULT_CHOICE, ...JSON.parse(await AsyncStorage.getItem(CHOICE_KEY)) });
      } catch (_) {}
      setReady(true);
    })();
  }, []);

  const save = () => {
    Account.saveProgress(progress);
    setTick((n) => n + 1); // (the wallet changed)
  };

  const choose = (part) => {
    const next = { ...choice, ...part };
    setChoice(next);
    AsyncStorage.setItem(CHOICE_KEY, JSON.stringify(next));
  };

  // Tapped a locked thing, or a Shop row: what can be done about it
  const ask = (itemId) => setOffer(Shop.unlockOffer(progress, itemId));

  // Buy it, say so, and switch it on (the choices the app has so far)
  function buy(itemId) {
    setOffer(null);
    const bought = Shop.purchase(progress, itemId);
    if (!bought.ok) return;
    toasts.show(...bought.toast);
    for (const a of bought.earned) toasts.show(`${a.icon} ${a.name}`, `Achievement! +${a.reward} points`);
    save();
    const on = Shop.activation(itemId) || {};
    const part = {};
    if (on.mode === 'single' || (on.mode === 'multi' && (on.players || 2) === 2)) part.mode = on.mode;
    if (DIFFICULTIES.some((d) => d.id === on.difficulty)) part.difficulty = on.difficulty;
    if (BOARDS.includes(on.size)) part.size = on.size;
    if (Object.keys(part).length) choose(part);
  }

  async function signIn() {
    setAccountError(null);
    setSigningIn(true);
    try {
      const who = await Account.signIn();
      if (who) {
        setUser(who);
        setProgress(await Account.syncProgress());
      }
    } catch (e) {
      setAccountError(e.message || 'Signing in didn’t work.');
    } finally {
      setSigningIn(false);
    }
  }

  async function signOut() {
    await Account.signOut();
    setUser(null);
    setProgress(await Account.loadProgress()); // back to this phone's guest save
  }

  if (!ready) {
    return (
      <View style={[styles.center, { backgroundColor: t.bg }]}>
        <ActivityIndicator size="large" color={t.accent} />
      </View>
    );
  }

  const play = () => setGame({ key: Date.now(), setup: setupFor(choice, progress) });

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: t.bg }]}>
      <StatusBar style="auto" />
      {game ? (
        <Game key={game.key} setup={game.setup} progress={progress} onSave={save} toast={toasts.show} onExit={() => setGame(null)} onAgain={play} />
      ) : screen === 'shop' ? (
        <ShopScreen progress={progress} onAsk={ask} onClose={() => setScreen('menu')} />
      ) : (
        <Home
          progress={progress || Progress.createProgress()}
          user={user}
          choice={choice}
          onChoose={choose}
          onPlay={play}
          onSignIn={signIn}
          onSignOut={signOut}
          signingIn={signingIn}
          accountError={accountError}
          onLocked={ask}
          onShop={() => setScreen('shop')}
        />
      )}
      <UnlockSheet offer={offer} onBuy={buy} onClose={() => setOffer(null)} />
      <toasts.View />
    </SafeAreaView>
  );
}

// Bonuses and achievements show one at a time, sliding in at the top
function useToasts() {
  const t = useTheme();
  // (positioned absolutely, so it has to step below the notch and status bar itself)
  const insets = useSafeAreaInsets();
  const queue = useRef([]);
  const active = useRef(false); // (a ref: show() is called from other screens' renders)
  const [current, setCurrent] = useState(null);
  const y = useRef(new Animated.Value(-200)).current;

  const next = () => {
    const item = queue.current.shift();
    active.current = Boolean(item);
    setCurrent(item || null);
    if (!item) return;
    y.setValue(-(insets.top + 160));
    Animated.sequence([
      Animated.spring(y, { toValue: 0, useNativeDriver: true }),
      Animated.delay(1800),
      Animated.timing(y, { toValue: -(insets.top + 160), duration: 250, useNativeDriver: true }),
    ]).start(next);
  };

  const show = (title, text) => {
    queue.current.push({ title, text });
    if (!active.current) next();
  };

  const View_ = () =>
    current ? (
      <Animated.View pointerEvents="none" style={[styles.toast, { top: insets.top + 8, backgroundColor: t.goldBg, borderColor: t.gold, transform: [{ translateY: y }] }]}>
        <Text style={[styles.toastTitle, { color: t.ink }]}>{current.title}</Text>
        <Text style={[styles.toastText, { color: t.goldInk }]}>{current.text}</Text>
      </Animated.View>
    ) : null;

  return { show, View: View_ };
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  toast: { position: 'absolute', left: 16, right: 16, padding: 12, borderRadius: 14, borderWidth: 2 },
  toastTitle: { fontSize: 17, fontWeight: '800' },
  toastText: { fontSize: 15, fontWeight: '600' },
});
