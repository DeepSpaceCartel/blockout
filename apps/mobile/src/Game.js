// A game on the phone: the board, the dice, the keypad and the CPU's
// explanations, played turn by turn with @blockout/engine/match. The screen
// animates between the match's steps; a game left half-way just stops (every
// wait checks it's still the same game).
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import * as Match from '@blockout/engine/match';
import * as Progress from '@blockout/progress';
import Board from './Board';
import { dragRect, drawnMessage } from './boardMath';
import * as Rewards from './rewards';
import { PLAYER_COLORS, useTheme } from './theme';
import { Button, Die, Keypad } from './ui';

// For automated checks of the web build: BLOCKOUT_FAST (set before the page
// loads) makes every wait 20 times shorter, and BlockoutMobile.match is the game
const testing = Platform.OS === 'web' && typeof window !== 'undefined';
const pace = testing && window.BLOCKOUT_FAST ? 0.05 : 1;
const CPU_STEP_MS = 1000 * pace; // the web game's "normal" CPU speed
const COUNT_STEP_MS = 850 * pace; // between skip-counting steps when helping
const PASS_MS = 1600 * pace;
const SCORED_MS = 1400 * pace;
const TRY_AGAIN = ['Not quite — try again!', 'Almost! Have another go.', 'Hmm, not that one. Try again!'];
const BONUS_ICONS = { first: '✨', speedy: '⚡', streak: '🔥', timer: '⏱️' };
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
// "an 8", "an 11", "an 18", but "a 7"
const article = (n) => (/^(8|11|18)$/.test(String(n)) || /^8\d$/.test(String(n)) ? 'an' : 'a');

// setup: { mode, difficulty, size, players }; progress: the save (changed in
// place); onSave() after every change to it; toast(title, text) for bonuses
// and achievements; onExit() back to the menu.
export default function Game({ setup, progress, onSave, toast, onExit, onAgain }) {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const [, setTick] = useState(0);
  const redraw = () => setTick((n) => n + 1);
  const alive = useRef(true);
  const m = useRef(null);
  if (!m.current) {
    m.current = Match.createMatch({ ...setup, answerBonus: Progress.answerBonus });
  }
  const match = m.current;
  if (testing) window.BlockoutMobile = { match, Match };

  const [msg, setMsg] = useState('');
  const [oops, setOops] = useState(false);
  const [dice, setDice] = useState([null, null]);
  const [drag, setDrag] = useState(null);
  const [preview, setPreview] = useState(null);
  const [hide, setHide] = useState(null);
  const [counting, setCounting] = useState(null);
  const [steps, setSteps] = useState([]);
  const [entry, setEntry] = useState('');
  const [feedback, setFeedback] = useState(null); // { text, kind: 'good' | 'try' | 'help' }
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(null); // { results, rewards }
  const answerStart = useRef(0);
  const pausedMs = useRef(0);

  useEffect(() => () => (alive.current = false), []);
  // Resolves after ms, or never once the game is left
  const wait = useCallback((ms) => new Promise((resolve) => setTimeout(() => alive.current && resolve(), ms)), []);

  const who = (p) => (match.mode === 'single' && !p.cpu ? 'You' : p.name);
  const mine = () => !Match.currentPlayer(match).cpu;

  const award = (earned) => {
    for (const a of earned) toast(`${a.icon} ${a.name}`, `Achievement! +${a.reward} points`);
  };

  // ---- turns

  async function rollAnimation() {
    const face = (list) => list[Math.floor(Math.random() * list.length)];
    for (let i = 0; i < 8; i++) {
      setDice([face(match.faces.a), face(match.faces.b)]);
      await wait(55);
    }
  }

  function startTurn() {
    setDice([null, null]);
    setSteps([]);
    setFeedback(null);
    setEntry('');
    setOops(false);
    if (match.phase === 'cpu') return runCpu();
    const p = Match.currentPlayer(match);
    const first = Match.mustUseCorner(match) ? ' Your first rectangle goes in the top-left corner.' : '';
    setMsg(match.mode === 'multi' ? `${p.name}, roll the dice!${first}` : `Roll the dice!${first}`);
    redraw();
  }

  async function nextTurn() {
    const results = Match.endTurn(match);
    if (results) return finish(results);
    startTurn();
  }

  async function humanRoll() {
    if (match.phase !== 'roll' || busy) return;
    setBusy(true);
    await rollAnimation();
    const [a, b] = Match.roll(match);
    setDice([a, b]);
    setBusy(false);
    if (match.phase === 'stuck') {
      setMsg(`No room for a ${a} × ${b} anywhere. ${match.mode === 'multi' ? `${Match.currentPlayer(match).name} passes` : 'You pass'}.`);
      redraw();
      await wait(PASS_MS);
      Match.pass(match);
      return nextTurn();
    }
    const corner = Match.mustUseCorner(match);
    setMsg(`You rolled ${a} and ${b}. Draw a ${a} by ${b} rectangle: ${corner ? 'start on the top-left square and drag.' : 'press on a square and drag.'}`);
    redraw();
  }

  function onDrag(d) {
    if (!d || match.phase !== 'place') return setDrag(null);
    setDrag({ ...d, verdict: Match.judge(match, dragRect(d)) });
  }

  function onDraw(rect) {
    setDrag(null);
    if (match.phase !== 'place') return;
    const res = Match.place(match, rect);
    if (!res.ok) {
      setMsg(drawnMessage(rect, match.dice, res.verdict));
      setOops(true);
      return;
    }
    setOops(false);
    setMsg('How many squares did you just draw?');
    setEntry('');
    setFeedback(null);
    answerStart.current = Date.now();
    pausedMs.current = 0;
    redraw();
  }

  // ---- answering

  function onKey(key) {
    if (match.phase !== 'answer' || busy) return;
    if (key === 'check') return check(entry);
    let next = entry;
    if (key === 'back') next = entry.slice(0, -1);
    else if (entry.length < 3) next = (entry === '0' ? '' : entry) + key;
    setEntry(next);
    if (Match.answerDecided(next, match.pending.rect.area)) check(next);
  }

  async function check(value) {
    if (value === '' || match.phase !== 'answer') return;
    const ms = Date.now() - answerStart.current - pausedMs.current;
    const res = Match.answer(match, value, { ms });
    if (res.correct) {
      setBusy(true);
      const squares = `+${res.rect.area} ${res.rect.area === 1 ? 'square' : 'squares'}`;
      setFeedback({ text: res.firstTry ? `Correct! ${squares} 🎉` : `You got it! ${squares}`, kind: 'good' });
      for (const part of res.bonus.parts) toast(`${BONUS_ICONS[part.label.split(' ')[0]] || '⭐'} ${capitalize(part.label)}`, `+${part.points} bonus points`);
      award(Rewards.onAnswer(progress, match, res, ms));
      onSave();
      redraw();
      await wait(SCORED_MS);
      setBusy(false);
      return nextTurn();
    }
    setEntry('');
    setFeedback({ text: TRY_AGAIN[(res.attempts - 1) % TRY_AGAIN.length], kind: 'try' });
    if (res.helpNow) helpCount("Let's count them together!");
  }

  async function helpCount(intro = null) {
    if (match.phase !== 'answer') return;
    const rect = match.pending.rect;
    const h = Match.help(match);
    if (!h) return;
    award(Rewards.onHelp(progress, match, rect));
    onSave();
    if (h.split) {
      const s = h.split;
      setFeedback({ kind: 'help', text: `Split ${s.teen} into 10 and ${s.ones}: 10 × ${s.other} = ${s.tens}, ${s.ones} × ${s.other} = ${s.rest}. Now add them up!` });
      return;
    }
    const plan = h.count;
    const started = Date.now();
    const units = plan.steps === 1 ? plan.unit : `${plan.unit}s`;
    setBusy(true);
    for (let i = 1; i <= plan.steps; i++) {
      setFeedback({ kind: 'help', text: `${intro ? `${intro} ` : ''}${plan.steps} ${units} of ${plan.group}: ${plan.totals.slice(0, i).join(', ')}` });
      setCounting({ rect, byRows: plan.byRows, group: plan.group, shown: i });
      await wait(COUNT_STEP_MS);
    }
    setCounting(null);
    pausedMs.current += Date.now() - started; // counting doesn't count against them
    setFeedback({ kind: 'help', text: `${plan.totals.join(', ')}. So what is ${rect.a} × ${rect.b}?` });
    setBusy(false);
  }

  // ---- the CPU's turn: roll, draw it growing, explain the counting

  async function runCpu() {
    const p = Match.currentPlayer(match);
    setMsg(`${p.name} is rolling…`);
    redraw();
    await wait(CPU_STEP_MS);
    await rollAnimation();
    const firstOnBoard = match.board.rects.length === 0;
    const { dice: [a, b], rect } = Match.cpuTurn(match);
    setDice([a, b]);
    if (!rect) {
      setMsg(`No room for a ${a} × ${b} anywhere. ${p.name} passes.`);
      redraw();
      await wait(PASS_MS);
      return nextTurn();
    }
    setMsg('');
    setHide(rect);
    const lines = [`I rolled ${article(a)} ${a} and ${article(b)} ${b}.`];
    setSteps([...lines]);
    await wait(CPU_STEP_MS);
    lines.push(`I'll draw it ${firstOnBoard ? 'in a corner' : 'snug against the others'}: ${rect.w} across and ${rect.h} down.`);
    setSteps([...lines]);
    for (let w = 1; w <= rect.w; w++) {
      setPreview({ ...rect, w, h: 1 });
      await wait(CPU_STEP_MS / 2);
    }
    for (let h = 2; h <= rect.h; h++) {
      setPreview({ ...rect, h });
      await wait(CPU_STEP_MS);
    }
    setPreview(null);
    setHide(null);
    lines.push(`${a} × ${b}: how many squares is that?`);
    setSteps([...lines]);
    await wait(CPU_STEP_MS);
    const split = Match.legendSplit(rect, match.difficulty);
    if (split) {
      const s = split.split;
      lines.push(`Split ${s.teen} into 10 and ${s.ones}: ${s.tens} + ${s.rest} = ${rect.area}.`);
      setSteps([...lines]);
      await wait(CPU_STEP_MS * 2);
    } else if (a === 1 || b === 1) {
      lines.push(`It's just 1 ${a === 1 ? 'row' : 'column'} of ${a === 1 ? b : a}, so that's ${rect.area}.`);
      setSteps([...lines]);
      await wait(CPU_STEP_MS);
    } else {
      const plan = Match.countPlan(rect);
      lines.push(`That's ${plan.steps} ${plan.unit}s of ${plan.group}. Let's count by ${plan.group}s:`);
      for (let i = 1; i <= plan.steps; i++) {
        setSteps([...lines, plan.totals.slice(0, i).join(', ')]);
        setCounting({ rect, byRows: plan.byRows, group: plan.group, shown: i });
        await wait(CPU_STEP_MS);
      }
      lines.push(plan.totals.join(', '));
      setCounting(null);
    }
    lines.push(`${a} × ${b} = ${rect.area}`);
    setSteps([...lines]);
    redraw();
    await wait(CPU_STEP_MS * 1.5);
    return nextTurn();
  }

  // ---- the end

  function finish(results) {
    const rewards = Rewards.onGameOver(progress, match, results);
    if (rewards.boardBonus) toast(`🏁 Finished ${article(match.size)} ${match.size}×${match.size} game!`, `+${rewards.boardBonus} bonus points`);
    award(rewards.earned);
    onSave();
    setOver({ results, rewards });
    redraw();
  }

  useEffect(() => {
    startTurn(); // (once, for the match this screen was made with)
  }, []);

  // ---- the screen

  const boardWidth = Math.min(width - 32, 560);
  const phase = match.phase;
  const pending = match.pending;

  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={styles.page} scrollEnabled={phase !== 'place'}>
      <View style={styles.scores}>
        {match.players.map((p, i) => (
          <View key={i} style={[styles.score, { borderColor: i === match.current && !over ? PLAYER_COLORS[i] : t.line, backgroundColor: t.surface }]}>
            <View style={[styles.swatch, { backgroundColor: PLAYER_COLORS[i] }]} />
            <Text style={[styles.scoreName, { color: t.ink }]} numberOfLines={1}>
              {who(p)}
            </Text>
            <Text style={[styles.scorePts, { color: t.ink }]}>{p.score}</Text>
          </View>
        ))}
      </View>

      <Board
        match={match}
        width={boardWidth}
        drag={drag}
        preview={preview}
        hide={hide}
        counting={counting}
        canDraw={phase === 'place' && mine()}
        onDrag={onDrag}
        onDraw={onDraw}
      />

      {over ? (
        <Results over={over} match={match} who={who} onAgain={onAgain} onExit={onExit} />
      ) : (
        <View style={styles.panel}>
          <View style={styles.diceRow}>
            <Die value={dice[0]} />
            <Text style={[styles.times, { color: t.muted }]}>×</Text>
            <Die value={dice[1]} />
          </View>
          {msg ? (
            <Text testID="turn-msg" style={[styles.msg, { color: oops ? t.bad : t.ink }]}>
              {msg}
            </Text>
          ) : null}
          {steps.length ? (
            <View style={[styles.steps, { backgroundColor: t.surface, borderColor: t.line }]}>
              {steps.map((s, i) => (
                <Text key={i} style={[styles.step, { color: t.ink }, i === steps.length - 1 && /=/.test(s) ? styles.stepBig : null]}>
                  {s}
                </Text>
              ))}
            </View>
          ) : null}
          {phase === 'roll' && mine() ? <Button testID="roll" title="Roll the dice" onPress={humanRoll} disabled={busy} /> : null}
          {phase === 'answer' && pending ? (
            <View style={styles.answer}>
              <Text style={[styles.question, { color: t.ink }]}>
                {pending.rect.a} × {pending.rect.b} =
              </Text>
              <View testID="answer-box" style={[styles.answerBox, { borderColor: feedback && feedback.kind === 'good' ? t.good : t.edge, backgroundColor: t.surface }]}>
                <Text style={[styles.answerText, { color: t.ink }]}>{entry || ' '}</Text>
              </View>
              {feedback ? (
                <Text testID="feedback" style={[styles.feedback, { color: feedback.kind === 'good' ? t.goodInk : feedback.kind === 'try' ? t.bad : t.ink }]}>
                  {feedback.text}
                </Text>
              ) : null}
              <Keypad onKey={onKey} disabled={busy} />
              {!match.expert && !pending.helped ? <Button kind="secondary" title="Help me count" onPress={() => helpCount()} disabled={busy} style={styles.help} /> : null}
            </View>
          ) : null}
          {phase === 'scored' && feedback ? <Text style={[styles.feedback, { color: t.goodInk }]}>{feedback.text}</Text> : null}
          <Button kind="secondary" title="Main menu" onPress={onExit} style={styles.menu} />
        </View>
      )}
    </ScrollView>
  );
}

function Results({ over, match, who, onAgain, onExit }) {
  const t = useTheme();
  const { results } = over;
  const winner = results.winners[0];
  const title = results.tie ? "It's a tie!" : match.mode === 'single' ? (winner.cpu ? `${winner.name} wins!` : 'You win! 🎉') : `${winner.name} wins! 🎉`;
  const top = results.ranked[0].score;
  return (
    <View testID="results" style={[styles.results, { backgroundColor: t.paper, borderColor: t.line }]}>
      <Text style={[styles.resultTitle, { color: t.ink }]}>{title}</Text>
      <Text style={[styles.resultSub, { color: t.muted }]}>{results.empty === 0 ? 'The board is completely full!' : `Nobody could fit a rectangle. ${results.empty} squares left empty.`}</Text>
      {results.ranked.map((p) => (
        <View key={p.index} style={styles.resultRow}>
          <Text style={[styles.resultName, { color: t.ink }]}>{who(p)}</Text>
          <Text style={[styles.resultPts, { color: t.ink }]}>{p.score} pts</Text>
          <View style={[styles.bar, { backgroundColor: t.soft }]}>
            <View style={{ width: `${top ? (p.score / top) * 100 : 0}%`, height: '100%', backgroundColor: PLAYER_COLORS[p.index], borderRadius: 6 }} />
          </View>
        </View>
      ))}
      {match.mode === 'multi' ? <Text style={[styles.resultSub, { color: t.muted }]}>Two-player games are just for fun: they don’t count towards stats or achievements.</Text> : null}
      <View style={styles.resultActions}>
        <Button title="Play again" onPress={onAgain} style={styles.flex} testID="again" />
        <Button kind="secondary" title="Main menu" onPress={onExit} style={styles.flex} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 14, paddingBottom: 40 },
  scores: { flexDirection: 'row', gap: 8 },
  score: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 12, borderWidth: 3 },
  swatch: { width: 14, height: 14, borderRadius: 7 },
  scoreName: { flex: 1, fontSize: 16, fontWeight: '600' },
  scorePts: { fontSize: 20, fontWeight: '800' },
  panel: { gap: 12 },
  diceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  times: { fontSize: 28, fontWeight: '700' },
  msg: { fontSize: 18, textAlign: 'center', lineHeight: 24 },
  steps: { padding: 12, borderRadius: 12, borderWidth: 2, gap: 6 },
  step: { fontSize: 17, lineHeight: 23 },
  stepBig: { fontSize: 22, fontWeight: '800' },
  answer: { gap: 10, alignItems: 'stretch' },
  question: { fontSize: 32, fontWeight: '800', textAlign: 'center' },
  answerBox: { alignSelf: 'center', minWidth: 120, borderWidth: 3, borderRadius: 12, paddingVertical: 6, alignItems: 'center' },
  answerText: { fontSize: 32, fontWeight: '800' },
  feedback: { fontSize: 18, textAlign: 'center', fontWeight: '600', lineHeight: 24 },
  help: { marginTop: 4 },
  menu: { marginTop: 8 },
  results: { padding: 16, borderRadius: 16, borderWidth: 2, gap: 10 },
  resultTitle: { fontSize: 28, fontWeight: '800', textAlign: 'center' },
  resultSub: { fontSize: 16, textAlign: 'center' },
  resultRow: { gap: 4 },
  resultName: { fontSize: 18, fontWeight: '700' },
  resultPts: { position: 'absolute', right: 0, top: 0, fontSize: 18, fontWeight: '700' },
  bar: { height: 12, borderRadius: 6, overflow: 'hidden' },
  resultActions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  flex: { flex: 1 },
});
