// Blockout on a phone: the menu and the game, the save, and signing in.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Linking, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Progress from '@blockout/progress';
import * as Shop from '@blockout/progress/shop';
import * as Views from '@blockout/progress/views';
import * as Settings from '@blockout/progress/settings';
import * as Wardrobe from '@blockout/progress/wardrobe';
import * as Homework from '@blockout/progress/homework';
import * as Account from './account';
import Game from './Game';
import Home from './Home';
import * as Setup from '@blockout/progress/setup';
import { BOARDS, DIFFICULTIES, boardOpen, difficultyOpen, modeOpen, playersOpen } from './rewards';
import { ShopScreen, UnlockSheet } from './Shop';
import { AchievementsScreen, StickersScreen } from './Collection';
import StatsScreen from './StatsScreen';
import PracticeScreen from './PracticeScreen';
import * as Practice from '@blockout/progress/practice';
import SettingsScreen from './SettingsScreen';
import WardrobeScreen from './Wardrobe';
import AccountScreen, { redeemCode } from './AccountScreen';
import HomeworkScreen from './HomeworkScreen';
import ClassScreen from './ClassScreen';
import HostScreen from './HostScreen';
import MyClassesScreen from './MyClassesScreen';
import MyKidsScreen from './MyKidsScreen';
import AdminScreen from './AdminScreen';
import * as Classroom from './classroom';
import { parseLink } from './links';
import { DEFAULT_LOOKS, Looks } from './looks';
import { ThemeSetting, useTheme } from './theme';

const CHOICE_KEY = 'blockout.mobile.choice';
const SETTINGS_KEY = 'blockout.settings'; // (on this phone only, like the web game's)
const DEFAULT_CHOICE = { mode: 'single', difficulty: 'easy', size: 6, level: 'learn', timer: 0, players: 2 };

// The game to start from the menu's choice (falling back to what's unlocked).
// Single player has its Level (Expert: no help, bonus ×2) and Expert's timer;
// Home multiplayer has the Settings' answer timer, as on the web. The players
// wear the Wardrobe's looks: the CPU's character, your avatar and title.
function setupFor(choice, progress, settings, looks) {
  const difficulty = difficultyOpen(progress, choice.difficulty) ? choice.difficulty : 'easy';
  const size = boardOpen(progress, choice.size) ? choice.size : 6;
  const mode = modeOpen(progress, choice.mode) ? choice.mode : 'single';
  const count = mode === 'multi' && playersOpen(progress, choice.players) ? choice.players : 2;
  const people = mode === 'multi' ? Array.from({ length: count }, (_, i) => ({ name: `Player ${i + 1}` })) : [{ name: 'You' }, { name: 'CPU', cpu: true }];
  const players = people.map((p) => ({ ...p, statsName: p.name, ...Wardrobe.playerLook(looks, p, mode) }));
  const { level, timer } = mode === 'single' ? Setup.gameLevel(progress, difficulty, choice) : { level: 'learn', timer: Number(settings.answerTime) || 0 };
  return {
    mode,
    difficulty,
    size,
    players,
    expert: level === 'expert',
    bonusMultiplier: level === 'expert' ? Setup.GAME_EXPERT_BONUS : 1,
    timer, // seconds to answer (0: none); the bonus goes by it, the clock by timerMs
    timerMs: Setup.timerMs(progress, timer),
    weight: difficulty === 'master' ? Setup.masterWeight(progress, players.find((p) => !p.cpu).name) : null,
  };
}

export default function App() {
  const [theme, setTheme] = useState('auto'); // (Settings › Theme, for every screen)
  return (
    <SafeAreaProvider>
      <ThemeSetting.Provider value={theme}>
        <Main onTheme={setTheme} />
      </ThemeSetting.Provider>
    </SafeAreaProvider>
  );
}

function Main({ onTheme }) {
  const t = useTheme();
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState(null);
  const [progress, setProgress] = useState(null);
  const [choice, setChoice] = useState(DEFAULT_CHOICE);
  const [settings, setSettings] = useState(Settings.DEFAULT_SETTINGS);
  const [game, setGame] = useState(null); // { key, setup }
  const [screen, setScreen] = useState('menu'); // 'menu' | 'shop' | 'wardrobe' | 'stats' | 'achievements' | 'stickers' | 'settings' (a game is on top)
  const [wardrobeNew, setWardrobeNew] = useState([]); // (the looks new when the Wardrobe opened)
  const [homeworkCount, setHomeworkCount] = useState(0); // (a student's homework still to do)
  const [inClass, setInClass] = useState(null); // a live class: { code } to join, or { resume } (a session from last time)
  const [liveClasses, setLiveClasses] = useState([]); // (a student's scheduled tournaments, open now)
  const [hosting, setHosting] = useState(null); // a live class this teacher hosts: { host } (null in it: setting one up)
  const pendingLink = useRef(null); // (a code's link that came before signing in)
  const live = useRef({}); // (the latest user, for link events)
  live.current.user = user;
  const [offer, setOffer] = useState(null); // the unlock sheet: Shop.unlockOffer's answer
  const [signingIn, setSigningIn] = useState(false);
  const [accountError, setAccountError] = useState(null);
  const [, setTick] = useState(0);
  const toasts = useToasts();
  // The looks worn: the ones chosen (Settings › cosmetics), if they're owned
  const unlocked = progress ? progress.unlocks.length : 0; // (buying changes what can be worn)
  const looks = useMemo(() => (progress ? Wardrobe.chosenLooks(settings.cosmetics, progress) : DEFAULT_LOOKS), [settings.cosmetics, progress, unlocked]);

  // At start: the last account, its save (synced when online), the last choice
  useEffect(() => {
    (async () => {
      const who = await Account.loadSession();
      setUser(who);
      let save = await Account.loadProgress();
      if (who) save = await Account.syncProgress().catch(() => save); // (offline: play on, sync later)
      // the first visit of the day: points, and the streak achievements
      const visit = Views.dailyCheckIn(save);
      if (visit) {
        toasts.show(...visit.toast);
        for (const a of visit.earned) toasts.show(`${a.icon} ${a.name}`, `Achievement! +${a.reward} points`);
        for (const drop of Views.grantStickers(save, visit.earned)) toasts.show(...drop.toast);
        Account.saveProgress(save);
      }
      setProgress(save);
      try {
        setChoice({ ...DEFAULT_CHOICE, ...JSON.parse(await AsyncStorage.getItem(CHOICE_KEY)) });
      } catch (_) {}
      let saved = {};
      try {
        saved = JSON.parse(await AsyncStorage.getItem(SETTINGS_KEY)) || {};
      } catch (_) {}
      const s = Settings.enforce(saved, save); // (anything not unlocked back to its default)
      setSettings(s);
      onTheme(s.theme);
      const left = await Classroom.loadSaved(); // (the app was closed in the middle of a class)
      if (left.host) setHosting({ host: left.host });
      else if (left.session) setInClass({ resume: left.session });
      setReady(true);
    })();
  }, []);

  // A student's homework badge: at start, after signing in, and back on the menu
  useEffect(() => {
    if (!ready || !user || user.role !== 'student' || game || screen !== 'menu') return;
    Account.api('GET', '/api/me/homework')
      .then(({ homework }) => setHomeworkCount(Homework.openCount(homework)))
      .catch(() => {}); // (offline: no badge)
  }, [ready, user, game, screen]);

  // A student's tournaments open now (scheduled by their teacher), while on the menu
  useEffect(() => {
    if (!ready || !user || user.role !== 'student' || game || inClass || hosting || screen !== 'menu') return setLiveClasses([]);
    const look = () =>
      Account.api('GET', '/api/me/live')
        .then(({ live }) => setLiveClasses(live))
        .catch(() => {}); // (offline)
    look();
    const every = setInterval(look, 20 * 1000);
    return () => clearInterval(every);
  }, [ready, user, game, inClass, hosting, screen]);

  // Links into the app: a one-time code, or a class to join (links.js)
  useEffect(() => {
    if (!ready) return undefined;
    Linking.getInitialURL()
      .then((url) => followLink(parseLink(url)))
      .catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => followLink(parseLink(url)));
    return () => sub.remove();
  }, [ready]);

  function followLink(link) {
    if (!link) return;
    const who = live.current.user;
    if (link.kind === 'class') return setInClass({ code: link.code }); // (no account needed)
    if (link.kind === 'code') {
      if (!who) {
        pendingLink.current = link;
        return toasts.show('🔑 Sign in first', 'Then the code is used for your account.');
      }
      return redeemCode(link.code, { toast: toasts.show, onUser: setUser }).catch((e) => toasts.show('🔑 That code didn’t work', e.message));
    }
    if (!who || who.role !== 'student') {
      if (!who) pendingLink.current = link;
      return toasts.show(`🏫 To join class ${link.code}`, 'Sign in with your school account.');
    }
    Account.api('POST', '/api/me/classes', { code: link.code })
      .then((r) => toasts.show('🏫 You joined', r.class.name))
      .catch((e) => toasts.show('🏫 Couldn’t join', e.message));
  }

  const save = () => {
    Account.saveProgress(progress);
    setTick((n) => n + 1); // (the wallet changed)
  };

  const choose = (part) => {
    const next = { ...choice, ...part };
    setChoice(next);
    AsyncStorage.setItem(CHOICE_KEY, JSON.stringify(next));
  };

  const setSetting = (key, value) => {
    setSettings((now) => {
      const next = { ...now, [key]: value };
      AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      return next;
    });
    if (key === 'theme') onTheme(value);
  };

  // Put a look on (or a title)
  const wear = (categoryId, optionId) => setSetting('cosmetics', { ...looks, [categoryId]: optionId });

  const openWardrobe = () => {
    const keys = Shop.wardrobeKeys(progress);
    setWardrobeNew(keys.filter((k) => !Shop.seenList(progress, 'wardrobe').includes(k)));
    Shop.markSeen(progress, 'wardrobe', keys);
    save();
    setScreen('wardrobe');
  };

  // New achievements: a banner each, and the sticker each big one drops (as on the web)
  function celebrate(earned) {
    for (const a of earned) toasts.show(`${a.icon} ${a.name}`, `Achievement! +${a.reward} points`);
    for (const drop of Views.grantStickers(progress, earned)) toasts.show(...drop.toast);
  }

  // Tapped a locked thing, or a Shop row: what can be done about it
  const ask = (itemId) => setOffer(Shop.unlockOffer(progress, itemId));

  // Buy it, say so, and switch it on (the choices the app has so far)
  function buy(itemId) {
    setOffer(null);
    const bought = Shop.purchase(progress, itemId);
    if (!bought.ok) return;
    toasts.show(...bought.toast);
    celebrate(bought.earned);
    save();
    const on = Shop.activation(itemId) || {};
    const part = {};
    if (on.mode === 'single' || (on.mode === 'multi' && (on.players || 2) === 2)) part.mode = on.mode;
    if (DIFFICULTIES.some((d) => d.id === on.difficulty)) part.difficulty = on.difficulty;
    if (BOARDS.includes(on.size)) part.size = on.size;
    if (Object.keys(part).length) choose(part);
    if (on.setting) setSetting(on.setting[0], on.setting[1] === 'true' ? true : on.setting[1]);
    const item = Progress.shopItem(itemId);
    if (item.cosmetic) {
      wear(...item.cosmetic); // put it on
      Shop.markSeen(progress, 'wardrobe', [item.cosmetic.join(':')]);
    }
  }

  async function signIn() {
    setAccountError(null);
    setSigningIn(true);
    try {
      const who = await Account.signIn();
      if (who) {
        setUser(who);
        const synced = await Account.syncProgress();
        setProgress(synced);
        setSettings((s) => Settings.enforce(s, synced)); // (this save's unlocks)
        live.current.user = who;
        const link = pendingLink.current;
        pendingLink.current = null;
        followLink(link); // (a code's link that came before signing in)
      }
    } catch (e) {
      setAccountError(e.message || 'Signing in didn’t work.');
    } finally {
      setSigningIn(false);
    }
  }

  async function signOut() {
    setScreen('menu');
    await Account.signOut();
    setUser(null);
    setHomeworkCount(0);
    const guest = await Account.loadProgress(); // back to this phone's guest save
    setProgress(guest);
    setSettings((s) => Settings.enforce(s, guest)); // (its unlocks)
  }

  live.current.choice = choice;
  if (!ready) {
    return (
      <View style={[styles.center, { backgroundColor: t.bg }]}>
        <ActivityIndicator size="large" color={t.accent} />
      </View>
    );
  }

  // The account was deleted: back to this phone's guest save
  async function deleted() {
    setScreen('menu');
    setUser(null);
    const guest = await Account.loadProgress();
    setProgress(guest);
    setSettings((s) => Settings.enforce(s, guest));
    toasts.show('👋 Account deleted', 'Everything in it is gone.');
  }

  // Homework's Play ›: set the menu up for it, then start
  function playHomework(goal) {
    const c = Homework.homeworkChoice(progress, goal);
    const next = { ...choice, mode: c.mode };
    if (c.difficulty) next.difficulty = c.difficulty;
    if (c.size) next.size = c.size;
    if (c.tables) next.practice = { ...(choice.practice || {}), tables: c.tables };
    choose(next);
    setScreen('menu');
    play(next);
  }

  // Play a game, or a practice round (the round's options from the menu)
  const play = (choice = live.current.choice) => {
    if (choice.mode === 'practice' && modeOpen(progress, 'practice')) {
      const d = difficultyOpen(progress, choice.difficulty) ? choice.difficulty : 'easy';
      const pr = Practice.practiceChoice(progress, d, choice.practice || {});
      // (the tables picked, or else every unlocked one: locked tables never come up)
      const tables = Practice.roundTables(progress, d, (choice.practice && choice.practice.tables) || []);
      return setGame({ key: Date.now(), practice: { difficulty: d, count: pr.count, tables, level: pr.level, timer: pr.timer } });
    }
    setGame({ key: Date.now(), setup: setupFor(choice, progress, settings, looks) });
  };

  return (
    <Looks.Provider value={looks}>
    <SafeAreaView style={[styles.fill, { backgroundColor: t.bg }]}>
      <StatusBar style="auto" />
      {hosting ? (
        <HostScreen
          host={hosting.host}
          toast={toasts.show}
          onExit={() => {
            setHosting(null);
            setScreen(user && user.role === 'teacher' ? 'classes' : 'menu');
          }}
        />
      ) : inClass ? (
        <ClassScreen
          key={inClass.code || 'class'}
          user={user}
          resume={inClass.resume || null}
          code={inClass.code || ''}
          progress={progress}
          settings={settings}
          onSave={save}
          toast={toasts.show}
          onEarned={celebrate}
          onExit={() => setInClass(null)}
        />
      ) : game && game.practice ? (
        <PracticeScreen key={game.key} options={game.practice} progress={progress} settings={settings} onSave={save} toast={toasts.show} onEarned={celebrate} onExit={() => setGame(null)} onAgain={() => play()} />
      ) : game ? (
        <Game key={game.key} setup={game.setup} settings={settings} progress={progress} onSave={save} toast={toasts.show} onEarned={celebrate} onExit={() => setGame(null)} onAgain={() => play()} />
      ) : screen === 'shop' ? (
        <ShopScreen progress={progress} onAsk={ask} onClose={() => setScreen('menu')} />
      ) : screen === 'account' && user ? (
        <AccountScreen user={user} toast={toasts.show} onUser={setUser} onSignOut={signOut} onDeleted={deleted} onClose={() => setScreen('menu')} />
      ) : screen === 'homework' && user ? (
        <HomeworkScreen onPlay={playHomework} onCount={setHomeworkCount} onClose={() => setScreen('menu')} />
      ) : screen === 'classes' && user ? (
        <MyClassesScreen user={user} toast={toasts.show} onHost={() => setHosting({ host: null })} onOpenLobby={(host) => setHosting({ host })} onClose={() => setScreen('menu')} />
      ) : screen === 'admin' && user ? (
        <AdminScreen user={user} onClose={() => setScreen('menu')} />
      ) : screen === 'kids' && user ? (
        <MyKidsScreen user={user} toast={toasts.show} onClose={() => setScreen('menu')} />
      ) : screen === 'wardrobe' ? (
        <WardrobeScreen progress={progress} newKeys={wardrobeNew} onWear={wear} onAsk={ask} onClose={() => setScreen('menu')} />
      ) : screen === 'stats' ? (
        <StatsScreen progress={progress} settings={settings} onClose={() => setScreen('menu')} />
      ) : screen === 'settings' ? (
        <SettingsScreen progress={progress} settings={settings} onSet={setSetting} onLocked={ask} onClose={() => setScreen('menu')} />
      ) : screen === 'achievements' ? (
        <AchievementsScreen progress={progress} onClose={() => setScreen('menu')} />
      ) : screen === 'stickers' ? (
        <StickersScreen
          progress={progress}
          onClose={() => setScreen('menu')}
          onSeen={(ids) => {
            Shop.markSeen(progress, 'stickers', ids);
            save();
          }}
          onSwap={() => {
            const swap = Views.swapSpares(progress, Shop.formatPoints);
            if (!swap.points) return;
            toasts.show(...swap.toast);
            save();
          }}
        />
      ) : (
        <Home
          progress={progress || Progress.createProgress()}
          user={user}
          choice={choice}
          onChoose={choose}
          onPlay={() => play()}
          onClass={(code) => setInClass({ code })}
          liveClasses={liveClasses}
          onSignIn={signIn}
          onAccount={() => setScreen('account')}
          onHomework={() => setScreen('homework')}
          onClasses={() => setScreen('classes')}
          onKids={() => setScreen('kids')}
          onAdmin={() => setScreen('admin')}
          homeworkCount={homeworkCount}
          signingIn={signingIn}
          accountError={accountError}
          onLocked={ask}
          onShop={() => setScreen('shop')}
          onWardrobe={openWardrobe}
          onAchievements={() => setScreen('achievements')}
          onStats={() => setScreen('stats')}
          onSettings={() => setScreen('settings')}
          onStickers={() => setScreen('stickers')}
        />
      )}
      <UnlockSheet offer={offer} onBuy={buy} onClose={() => setOffer(null)} />
      <toasts.View />
    </SafeAreaView>
    </Looks.Provider>
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
