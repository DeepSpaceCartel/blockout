// Practice on the phone: a round of questions from your weakest facts, played
// with @blockout/progress/practice (the web game's rules and words). The
// question and keypad on one screen; "Help me count" on its own, as in the game.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Practice from '@blockout/progress/practice';
import * as Settings from '@blockout/progress/settings';
import * as Setup from '@blockout/progress/setup';
import * as Stats from '@blockout/progress/stats';
import * as Views from '@blockout/progress/views';
import { RectPicture } from './Board';
import { addToHistory } from './history';
import { PLAYER_COLORS, useTheme } from './theme';
import { Button, Keypad } from './ui';

const testing = Platform.OS === 'web' && typeof window !== 'undefined';
const pace = testing && window.BLOCKOUT_FAST ? 0.05 : 1;
const COUNT_STEP_MS = 850 * pace;
const RIGHT_MS = 1100 * pace;
const TIMEOUT_MS = 2200 * pace;
const TRY_AGAIN = ['Not quite — try again!', 'Almost! Have another go.', 'Hmm, not that one. Try again!'];
const BONUS_ICONS = { first: '✨', speedy: '⚡', streak: '🔥', timer: '⏱️' };
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const STATUS = { mastered: '#2a9d5c', learning: '#f2c94c', practice: '#d64533', unseen: null };

// options: { difficulty, count, tables, level, timer }; the save is changed in
// place (onSave after each change); toast and onEarned as in the game.
export default function PracticeScreen({ options, progress, settings = Settings.DEFAULT_SETTINGS, onSave, toast, onEarned, onExit, onAgain }) {
  const t = useTheme();
  const r = useRef(null);
  if (!r.current) r.current = Practice.createRound(progress, options);
  const round = r.current;
  if (testing) window.BlockoutPractice = { round };
  const alive = useRef(true);
  const [, setTick] = useState(0);
  const redraw = () => setTick((n) => n + 1);
  const [area, setArea] = useState(null);
  const [view, setView] = useState('question'); // 'question' | 'help' | 'done'
  const [entry, setEntry] = useState('');
  const [feedback, setFeedback] = useState(null); // { text, kind }
  const [busy, setBusy] = useState(false);
  const [counting, setCounting] = useState(null);
  const [helpText, setHelpText] = useState('');
  const [helpDone, setHelpDone] = useState(false);
  const [end, setEnd] = useState(null);
  const [timeLeft, setTimeLeft] = useState(null);
  const started = useRef(Date.now());
  const paused = useRef(0);
  const helpStarted = useRef(0);
  const clock = useRef(null);
  const timerMs = round.timer ? Setup.timerMs(progress, round.timer) : 0; // (a cheat can stretch it)

  const wait = useCallback((ms) => new Promise((resolve) => setTimeout(() => alive.current && resolve(), ms)), []);
  useEffect(() => {
    startQuestion();
    return () => {
      alive.current = false;
      stopClock();
    };
  }, []);

  // ---- the timer (Expert's): pauses while counting; out of time, it's missed and comes back
  function startClock() {
    stopClock();
    if (!timerMs) return;
    const c = { total: timerMs, remaining: timerMs, last: Date.now(), paused: false };
    c.interval = setInterval(() => {
      const now = Date.now();
      if (!c.paused) c.remaining -= now - c.last;
      c.last = now;
      setTimeLeft(Math.max(0, c.remaining));
      if (c.remaining <= 0) {
        stopClock();
        onTimeout();
      }
    }, 100);
    clock.current = c;
    setTimeLeft(timerMs);
  }
  function stopClock() {
    if (clock.current) clearInterval(clock.current.interval);
    clock.current = null;
  }
  const pauseClock = (p) => {
    if (!clock.current) return;
    clock.current.paused = p;
    clock.current.last = Date.now();
  };

  function startQuestion() {
    if (!round.current) return finish();
    setEntry('');
    setFeedback(null);
    setView('question');
    started.current = Date.now();
    paused.current = 0;
    startClock();
    redraw();
  }

  async function onTimeout() {
    if (!alive.current || !round.current) return;
    const out = Practice.timeout(progress, round);
    if (!out) return;
    onSave();
    setBusy(true);
    setEntry(String(round.current.area));
    setFeedback({ kind: 'try', text: out.text });
    await wait(TIMEOUT_MS);
    setBusy(false);
    Practice.next(round);
    startQuestion();
  }

  function onKey(key) {
    if (busy || !round.current || round.current.done) return;
    if (key === 'check') return check(entry);
    let next = entry;
    if (key === 'back') next = entry.slice(0, -1);
    else if (entry.length < 3) next = (entry === '0' ? '' : entry) + key;
    setEntry(next);
    const q = round.current;
    if (next !== '' && (Number(next) >= q.area || next.length >= String(q.area).length)) check(next);
  }

  async function check(value) {
    if (value === '') return;
    const c = clock.current;
    const timer = c && round.timer ? { secs: round.timer, left: c.remaining / c.total } : null;
    const res = Practice.answer(progress, round, value, { ms: Date.now() - started.current - paused.current, timer });
    if (!res) return;
    if (res.correct) {
      stopClock();
      setBusy(true);
      setFeedback({ kind: 'good', text: res.text });
      for (const part of res.bonus.parts) toast(`${BONUS_ICONS[part.label.split(' ')[0]] || '⭐'} ${capitalize(part.label)}`, `+${part.points} bonus points${round.expert ? ` (×${Practice.PRACTICE_EXPERT_BONUS} Expert)` : ''}`);
      onEarned(res.earned);
      onSave();
      redraw();
      await wait(RIGHT_MS);
      setBusy(false);
      setTimeLeft(null);
      Practice.next(round);
      return startQuestion();
    }
    setEntry('');
    setFeedback({ kind: 'try', text: TRY_AGAIN[(res.attempts - 1) % TRY_AGAIN.length] });
    redraw();
    if (res.helpNow) {
      setBusy(true);
      await wait(900 * Math.max(pace, 0.2));
      setBusy(false);
      helpCount("Let's count them together!");
    }
  }

  // "Help me count": the fact as a rectangle, each square numbered row by row
  async function helpCount(intro = null) {
    const h = Practice.help(progress, round);
    if (!h) return;
    onEarned(h.earned);
    onSave();
    helpStarted.current = Date.now();
    pauseClock(true);
    setHelpDone(false);
    setCounting(null);
    setView('help');
    const unit = h.rows === 1 ? 'row' : 'rows';
    setHelpText(intro || `${h.rows} ${unit} of ${h.group}. Let's count!`);
    await wait(COUNT_STEP_MS);
    for (let i = 1; i <= h.rows; i++) {
      setHelpText(`${h.rows} ${unit} of ${h.group}: ${h.totals.slice(0, i).join(', ')}`);
      setCounting({ byRows: true, group: h.group, shown: i });
      await wait(COUNT_STEP_MS);
    }
    setHelpText(`${h.totals.join(', ')}. So what is ${round.current.a} × ${round.current.b}?`);
    setHelpDone(true);
  }

  function backFromHelp() {
    paused.current += Date.now() - helpStarted.current;
    pauseClock(false);
    setFeedback(null);
    setEntry('');
    setView('question');
  }

  function finish() {
    stopClock();
    const out = Practice.finish(progress, round);
    if (out.finishToast) toast(...out.finishToast);
    onEarned(out.earned);
    onSave();
    addToHistory(out.record);
    setEnd(out);
    setView('done');
  }

  function leave() {
    if (view === 'done') return onExit();
    const title = 'Stop practicing?';
    const text = 'The points for your answers are kept.';
    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n\n${text}`)) onExit();
      return;
    }
    Alert.alert(title, text, [
      { text: 'Keep going', style: 'cancel' },
      { text: 'Stop', style: 'destructive', onPress: onExit },
    ]);
  }

  const q = round.current;
  const progressShare = round.queue.length ? (view === 'done' ? 1 : round.index / round.queue.length) : 0;
  const low = timeLeft !== null && timeLeft <= 5000;

  return (
    <View style={[styles.fill, { backgroundColor: t.bg }]}>
      <View style={styles.header}>
        <Pressable onPress={leave} accessibilityRole="button" accessibilityLabel="Main menu" hitSlop={10} style={[styles.close, { borderColor: t.line, backgroundColor: t.surface }]}>
          <Text style={[styles.closeText, { color: t.ink }]}>✕</Text>
        </Pressable>
        <View style={styles.headerMid}>
          <Text testID="pr-counter" style={[styles.counter, { color: t.ink }]} numberOfLines={1}>
            {view === 'done' ? 'Practice done!' : Practice.counter(round)}
          </Text>
          <View style={[styles.bar, { backgroundColor: t.soft }]}>
            <View style={{ width: `${progressShare * 100}%`, height: '100%', backgroundColor: t.good, borderRadius: 4 }} />
          </View>
        </View>
        {round.streak >= 2 && view !== 'done' ? <Text style={[styles.streak, { color: t.goldInk }]}>🔥 {round.streak}</Text> : null}
      </View>
      <View style={styles.fill} onLayout={(e) => setArea(e.nativeEvent.layout)}>
        {!area ? null : view === 'done' && end ? (
          <Done end={end} progress={progress} round={round} settings={settings} onAgain={onAgain} onExit={onExit} />
        ) : view === 'help' && q ? (
          <View style={styles.helpScreen}>
            <RectPicture rect={{ a: q.a, b: q.b, w: q.b, h: q.a }} color={PLAYER_COLORS[0]} counting={counting} maxWidth={area.width - 32} maxHeight={Math.max(80, area.height - 200)} />
            <Text testID="pr-help-text" style={[styles.helpText, { color: t.ink }]}>
              {helpText}
            </Text>
            <Button testID="pr-help-done" title="I know it! ›" onPress={backFromHelp} disabled={!helpDone} style={styles.wide} />
          </View>
        ) : q ? (
          <View style={styles.question}>
            {timeLeft !== null && timerMs ? (
              <View style={styles.timer}>
                <Text testID="pr-timer" style={[styles.timerText, { color: low ? t.bad : t.ink }]}>
                  ⏱️ {Math.ceil(timeLeft / 1000)} s
                </Text>
                <View style={[styles.timerBar, { backgroundColor: t.soft }]}>
                  <View style={{ width: `${(timeLeft / timerMs) * 100}%`, height: '100%', backgroundColor: low ? t.bad : t.good, borderRadius: 5 }} />
                </View>
              </View>
            ) : null}
            <View style={styles.questionRow}>
              <Text testID="pr-q" style={[styles.q, { color: t.ink }]}>
                {q.a} × {q.b} =
              </Text>
              <View style={[styles.answerBox, { borderColor: feedback && feedback.kind === 'good' ? t.good : t.edge, backgroundColor: t.surface }]}>
                <Text style={[styles.answerText, { color: t.ink }]}>{entry || ' '}</Text>
              </View>
            </View>
            <Text testID="pr-feedback" numberOfLines={2} style={[styles.feedback, { color: !feedback ? t.muted : feedback.kind === 'good' ? t.goodInk : t.bad }]}>
              {feedback ? feedback.text : q.retry ? 'One you missed earlier: have another go!' : ' '}
            </Text>
            <Keypad onKey={onKey} disabled={busy} />
            {!round.expert && !q.helped ? <Button testID="pr-help" kind="secondary" title="Help me count" onPress={() => helpCount()} disabled={busy} /> : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function Done({ end, progress, round, settings, onAgain, onExit }) {
  const t = useTheme();
  const facts = Stats.playerFacts(progress, round.name);
  const grid = Stats.factGrid(facts, { unlocked: Views.tableSize(progress), showTime: Settings.showsTime(settings) });
  return (
    <View style={styles.fill}>
      <ScrollView contentContainerStyle={styles.done}>
        <Text testID="pd-sub" style={[styles.sub, { color: t.ink }]}>
          {end.sub}
        </Text>
        <Text style={[styles.groupTitle, { color: t.muted }]}>What changed</Text>
        {end.changes.length ? (
          end.changes.map((c) => (
            <View key={c.fact} testID="pd-change" style={[styles.change, { borderColor: t.line }]}>
              <Text style={[styles.changeFact, { color: t.ink }]}>{c.fact}</Text>
              <Text style={[styles.changeWhat, { color: c.up ? t.goodInk : t.bad }]}>
                {Stats.FACT_STATUS[c.was].label} → {Stats.FACT_STATUS[c.now].label}
              </Text>
            </View>
          ))
        ) : (
          <Text style={[styles.small, { color: t.muted }]}>No changes this time. Keep practicing and your facts will move up!</Text>
        )}
        <Text style={[styles.groupTitle, { color: t.muted }]}>Times table</Text>
        <View style={styles.grid}>
          <View style={styles.gridRow}>
            <Head text="×" t={t} />
            {grid.heads.map((h) => (
              <Head key={h.n} text={h.mastered ? `★${h.n}` : String(h.n)} t={t} gold={h.mastered} />
            ))}
          </View>
          {grid.cells.map((row, i) => (
            <View key={i} style={styles.gridRow}>
              <Head text={grid.heads[i].mastered ? `★${i + 1}` : String(i + 1)} t={t} gold={grid.heads[i].mastered} />
              {row.map((c) => (
                <View key={c.b} accessibilityLabel={c.detail} style={[styles.cell, { backgroundColor: STATUS[c.status] || t.soft }]}>
                  <Text style={styles.cellMark}>{c.mark}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
      <View style={styles.actions}>
        <Button testID="pd-again" title="Again" onPress={onAgain} style={styles.flex} />
        <Button kind="secondary" title="Menu" onPress={onExit} style={styles.flex} />
      </View>
    </View>
  );
}

// A row or column number on the edge of the grid (★ when the whole line is mastered)
function Head({ text, t, gold = false }) {
  return (
    <View style={styles.cell}>
      <Text style={[styles.head, { color: gold ? t.goldInk : t.muted }]} numberOfLines={1} adjustsFontSizeToFit>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flex: 1 },
  wide: { alignSelf: 'stretch' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8 },
  close: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 18, fontWeight: '800' },
  headerMid: { flex: 1, gap: 6 },
  counter: { fontSize: 15, fontWeight: '700' },
  bar: { height: 8, borderRadius: 4, overflow: 'hidden' },
  streak: { fontSize: 17, fontWeight: '800' },
  question: { flex: 1, justifyContent: 'center', gap: 14, paddingHorizontal: 16, paddingBottom: 16 },
  timer: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  timerText: { fontSize: 18, fontWeight: '800', minWidth: 70 },
  timerBar: { flex: 1, height: 10, borderRadius: 5, overflow: 'hidden' },
  questionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  q: { fontSize: 44, fontWeight: '800' },
  answerBox: { minWidth: 130, borderWidth: 3, borderRadius: 14, paddingVertical: 6, alignItems: 'center' },
  answerText: { fontSize: 44, fontWeight: '800' },
  feedback: { fontSize: 17, textAlign: 'center', fontWeight: '600', lineHeight: 23, minHeight: 46 },
  helpScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20, paddingHorizontal: 16, paddingBottom: 16 },
  helpText: { fontSize: 22, fontWeight: '700', textAlign: 'center', lineHeight: 30, minHeight: 60 },
  done: { padding: 16, gap: 10, paddingBottom: 24 },
  sub: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  groupTitle: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginTop: 8 },
  change: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  changeFact: { fontSize: 16, fontWeight: '800' },
  changeWhat: { fontSize: 15, fontWeight: '700' },
  small: { fontSize: 14, lineHeight: 20 },
  grid: { gap: 2 },
  gridRow: { flexDirection: 'row', gap: 2 },
  cell: { flex: 1, aspectRatio: 1, borderRadius: 3, alignItems: 'center', justifyContent: 'center' },
  cellMark: { color: '#fff', fontSize: 11, fontWeight: '900' },
  head: { fontSize: 12, fontWeight: '800' },
  actions: { flexDirection: 'row', gap: 12, padding: 16, paddingTop: 8 },
});
