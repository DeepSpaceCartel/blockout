// A game on the phone, played turn by turn with @blockout/engine/match. Each
// turn moves through three screens, sized to the phone so nothing scrolls:
//
//   roll    big dice and a Roll button; then "Draw it ›" (or on by itself)
//   board   the board, as big as it fits: drawing the rectangle, the CPU's
//           turn and its explanation, and the results
//   answer  the question and the keypad
//   help    "Help me count": the rectangle on its own, its rows lighting up
//           one by one with the running total, then back to the answer
//
// The screen animates between the match's steps; a game left half-way just
// stops (every wait checks it's still the same game).
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Match from '@blockout/engine/match';
import * as Core from '@blockout/engine';
import * as Progress from '@blockout/progress';
import * as Settings from '@blockout/progress/settings';
import Board, { RectPicture } from './Board';
import { dragRect, drawnMessage } from './boardMath';
import * as Rewards from './rewards';
import { recordGame } from './history';
import { PLAYER_COLORS, useTheme } from './theme';
import { Button, Die, Keypad } from './ui';

// For automated checks of the web build: BLOCKOUT_FAST (set before the page
// loads) makes every wait 20 times shorter, and BlockoutMobile.match is the game
const testing = Platform.OS === 'web' && typeof window !== 'undefined';
const pace = testing && window.BLOCKOUT_FAST ? 0.05 : 1;
const AUTO_ROLL_MS = 700 * pace; // before an auto roll, so "Your turn" can be read first
const INSTANT_CPU_MS = 600 * pace; // an instant CPU turn: just long enough to see it
const COUNT_STEP_MS = 850 * pace; // between skip-counting steps when helping
const PASS_MS = 1600 * pace;
const SCORED_MS = 1400 * pace;
const DRAW_IT_MS = 2500 * pace; // after a roll, on to the board by itself
const TRY_AGAIN = ['Not quite — try again!', 'Almost! Have another go.', 'Hmm, not that one. Try again!'];
const BONUS_ICONS = { first: '✨', speedy: '⚡', streak: '🔥', timer: '⏱️' };
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
// "an 8", "an 11", "an 18", but "a 7"
const article = (n) => (/^(8|11|18)$/.test(String(n)) || /^8\d$/.test(String(n)) ? 'an' : 'a');

// setup: { mode, difficulty, size, players }; progress: the save (changed in
// place); onSave() after every change to it; toast(title, text) for bonuses;
// onEarned(achievements) for their banners and stickers; onExit() back to the
// menu; onAgain() a new game.
// settings: the Settings (read once: they don't change mid-game, as on the web).
export default function Game({ setup, settings = Settings.DEFAULT_SETTINGS, progress, onSave, toast, onEarned, onExit, onAgain }) {
  const t = useTheme();
  const [, setTick] = useState(0);
  const redraw = () => setTick((n) => n + 1);
  const alive = useRef(true);
  const m = useRef(null);
  const cfg = useRef(settings).current;
  const CPU_STEP_MS = (Settings.CPU_STEP_MS[cfg.cpuSpeed] || 1000) * pace;
  if (!m.current) m.current = Match.createMatch({ ...setup, firstInCorner: cfg.firstInCorner === true || cfg.firstInCorner === 'true', fitMode: cfg.fitRolls, answerBonus: Progress.answerBonus });
  const match = m.current;
  if (testing) window.BlockoutMobile = { match, Match };

  const [area, setArea] = useState(null); // { width, height } below the header
  const [view, setView] = useState('roll'); // 'roll' | 'board' | 'answer' | 'help'
  const [msg, setMsg] = useState('');
  const [oops, setOops] = useState(false);
  const [dice, setDice] = useState([null, null]);
  const [rolled, setRolled] = useState(false); // the roll is in: "Draw it ›"
  const [drag, setDrag] = useState(null);
  const [preview, setPreview] = useState(null);
  const [hide, setHide] = useState(null);
  const [counting, setCounting] = useState(null);
  const [steps, setSteps] = useState([]);
  const [entry, setEntry] = useState('');
  const [feedback, setFeedback] = useState(null); // { text, kind: 'good' | 'try' | 'help' }
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(null); // { results }
  const [helpDone, setHelpDone] = useState(false); // counted: "I know it! ›"
  const [goOn, setGoOn] = useState(null); // after a CPU turn: the "My turn ›" button's label
  const goOnPressed = useRef(null);
  const helpStarted = useRef(0);
  const answerStart = useRef(0);
  const pausedMs = useRef(0);
  const turnId = useRef(0); // (so a late "on by itself" doesn't skip a turn)

  useEffect(() => () => (alive.current = false), []);
  // Resolves after ms, or never once the game is left
  const wait = useCallback((ms) => new Promise((resolve) => setTimeout(() => alive.current && resolve(), ms)), []);

  const who = (p) => (match.mode === 'single' && !p.cpu ? 'You' : p.name);
  const mine = () => !Match.currentPlayer(match).cpu;
  const award = (earned) => onEarned(earned);

  // ---- turns

  async function rollAnimation() {
    const face = (list) => list[Math.floor(Math.random() * list.length)];
    for (let i = 0; i < 10; i++) {
      setDice([face(match.faces.a), face(match.faces.b)]);
      await wait(60 * Math.max(pace, 0.5));
    }
  }

  function startTurn() {
    turnId.current++;
    helpPlan.current = null;
    setView('roll');
    setDice([null, null]);
    setRolled(false);
    setSteps([]);
    setFeedback(null);
    setEntry('');
    setOops(false);
    if (match.phase === 'cpu') return runCpu();
    const p = Match.currentPlayer(match);
    const first = Match.mustUseCorner(match) ? ' Your first rectangle goes in the top-left corner.' : '';
    if (cfg.autoRoll === 'auto') {
      // Auto roll: the dice roll by themselves, after a moment to read whose turn it is
      setMsg(match.mode === 'multi' ? `${p.name}: rolling the dice…${first}` : `Rolling the dice…${first}`);
      redraw();
      const turn = turnId.current;
      wait(AUTO_ROLL_MS).then(() => turn === turnId.current && humanRoll());
      return;
    }
    setMsg(match.mode === 'multi' ? `${p.name}, roll the dice!${first}` : `Roll the dice!${first}`);
    redraw();
  }

  function nextTurn() {
    const results = Match.endTurn(match);
    if (results) return finish(results);
    startTurn();
  }

  async function humanRoll() {
    if (match.phase !== 'roll' || busy) return;
    setBusy(true);
    setMsg('');
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
    setMsg(`You rolled ${a} and ${b}!`);
    setRolled(true);
    const turn = turnId.current;
    wait(DRAW_IT_MS).then(() => turn === turnId.current && match.phase === 'place' && toBoard());
  }

  // From the roll to drawing it
  function toBoard() {
    if (match.phase !== 'place') return;
    const [a, b] = match.dice;
    const corner = Match.mustUseCorner(match);
    setRolled(false);
    setMsg(`Draw a ${a} by ${b} rectangle: ${corner ? 'start on the top-left square and drag.' : 'press on a square and drag.'}`);
    setView('board');
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
    setEntry('');
    setFeedback(null);
    answerStart.current = Date.now();
    pausedMs.current = 0;
    setView('answer');
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
      setCounting(null);
      return nextTurn();
    }
    setEntry('');
    setFeedback({ text: TRY_AGAIN[(res.attempts - 1) % TRY_AGAIN.length], kind: 'try' });
    if (res.helpNow) {
      setBusy(true);
      await wait(900 * Math.max(pace, 0.2)); // ("Not quite" first)
      setBusy(false);
      helpCount("Let's count them together!");
    }
  }

  // The first time a turn: the help counts (fact stats, achievements). After
  // that, "Count again" replays the same counting (again: the plan kept here).
  const helpPlan = useRef(null);
  async function helpCount(intro = null, again = false) {
    if (match.phase !== 'answer') return;
    const rect = match.pending.rect;
    let h = helpPlan.current;
    if (!again) {
      h = Match.help(match);
      if (!h) return;
      helpPlan.current = h;
      award(Rewards.onHelp(progress, match, rect));
      onSave();
    }
    if (!h) return;
    helpStarted.current = Date.now();
    setHelpDone(false);
    setCounting(null);
    setView('help');
    if (h.split) {
      const s = h.split;
      setFeedback({ kind: 'help', text: `Split ${s.teen} into 10 and ${s.ones}: 10 × ${s.other} = ${s.tens}, and ${s.ones} × ${s.other} = ${s.rest}. Now add them up!` });
      setHelpDone(true);
      return;
    }
    const plan = h.count;
    const units = plan.steps === 1 ? plan.unit : `${plan.unit}s`;
    setFeedback({ kind: 'help', text: intro || `${plan.steps} ${units} of ${plan.group}. Let's count${again ? ' again' : ''}!` });
    await wait(COUNT_STEP_MS);
    for (let i = 1; i <= plan.steps; i++) {
      setFeedback({ kind: 'help', text: `${plan.steps} ${units} of ${plan.group}: ${plan.totals.slice(0, i).join(', ')}` });
      setCounting({ byRows: plan.byRows, group: plan.group, shown: i });
      await wait(COUNT_STEP_MS);
    }
    setFeedback({ kind: 'help', text: `${plan.totals.join(', ')}. So what is ${rect.a} × ${rect.b}?` });
    setHelpDone(true);
  }

  // From counting back to the answer (the time spent counting doesn't count against them)
  function backToAnswer() {
    pausedMs.current += Date.now() - helpStarted.current;
    setFeedback(null);
    setEntry('');
    setView('answer');
  }

  // ---- the CPU's turn: roll, then on the board: draw it growing, explain the counting

  // After a CPU turn: on by itself, or (Settings › After a CPU turn) a button
  // to press, unless the game is over anyway
  async function afterCpu(delay) {
    if (cfg.cpuEnd !== 'button' || Match.isOver(match)) return wait(delay);
    const next = match.players[(match.current + 1) % match.players.length];
    setGoOn(match.mode === 'single' ? 'My turn ›' : next.cpu ? `${next.name} ›` : `${next.name}'s turn ›`);
    await new Promise((resolve) => (goOnPressed.current = resolve));
    setGoOn(null);
  }

  // Instant CPU turns: roll, place and score straight away, no explanation
  async function runInstantCpu() {
    const p = Match.currentPlayer(match);
    const { dice: [a, b], rect } = Match.cpuTurn(match);
    setDice([a, b]);
    setView('board');
    setMsg(rect ? `${p.name} rolled ${a} and ${b}: ${a} × ${b} = ${rect.area}.` : `${p.name} rolled ${a} and ${b}: no room, so it passes.`);
    redraw();
    await wait(INSTANT_CPU_MS);
    return nextTurn();
  }

  async function runCpu() {
    if (cfg.cpuSteps === 'instant') return runInstantCpu();
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
      await afterCpu(PASS_MS);
      return nextTurn();
    }
    setMsg(`${p.name} rolled ${a} and ${b}.`);
    setHide(rect);
    await wait(CPU_STEP_MS * 1.2);
    setMsg('');
    setView('board');
    const lines = [`I rolled ${article(a)} ${a} and ${article(b)} ${b}. I'll draw it ${firstOnBoard ? 'in a corner' : 'snug against the others'}: ${rect.w} across and ${rect.h} down.`];
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
      const intro = `That's ${plan.steps} ${plan.unit}s of ${plan.group}. Let's count by ${plan.group}s:`;
      for (let i = 1; i <= plan.steps; i++) {
        setSteps([...lines, `${intro} ${plan.totals.slice(0, i).join(', ')}`]);
        setCounting({ rect, byRows: plan.byRows, group: plan.group, shown: i });
        await wait(CPU_STEP_MS);
      }
      lines.push(`${intro} ${plan.totals.join(', ')}`);
      setCounting(null);
    }
    lines.push(`${a} × ${b} = ${rect.area}`);
    setSteps([...lines]);
    redraw();
    await afterCpu(CPU_STEP_MS * 1.5);
    return nextTurn();
  }

  // ✕ in the middle of a game asks first: the game's points only count once it's finished
  function leave() {
    if (over) return onExit();
    const title = 'Leave this game?';
    const text = "The points from this game won't count. (Your answers and achievements are kept.)";
    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n\n${text}`)) onExit();
      return;
    }
    Alert.alert(title, text, [
      { text: 'Keep playing', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: onExit },
    ]);
  }

  // ---- the end

  function finish(results) {
    const rewards = Rewards.onGameOver(progress, match, results);
    if (Rewards.countsForStats(match)) recordGame(match, results); // (two players on one phone: just for fun)
    if (rewards.boardBonus) toast(`🏁 Finished ${article(match.size)} ${match.size}×${match.size} game!`, `+${rewards.boardBonus} bonus points`);
    award(rewards.earned);
    onSave();
    setOver({ results });
    setView('board');
    redraw();
  }

  useEffect(() => {
    startTurn(); // (once, for the match this screen was made with)
  }, []);

  // ---- the screens

  const side = (reserve) => (area ? Math.max(120, Math.min(area.width - 32, area.height - reserve, 620)) : 0);
  const current = match.current;

  return (
    <View style={[styles.fill, { backgroundColor: t.bg }]}>
      <Header match={match} who={who} over={over} onExit={leave} showProgress={cfg.showProgress === true || cfg.showProgress === 'true'} />
      <View style={styles.fill} onLayout={(e) => setArea(e.nativeEvent.layout)}>
        {!area ? null : view === 'roll' ? (
          <View style={styles.rollScreen}>
            <View style={styles.bigDice}>
              <Die value={dice[0]} size={Math.min(130, area.width * 0.32)} />
              <Text style={[styles.bigTimes, { color: t.muted }]}>×</Text>
              <Die value={dice[1]} size={Math.min(130, area.width * 0.32)} />
            </View>
            <Text testID="turn-msg" style={[styles.rollMsg, { color: t.ink }]}>
              {msg || ' '}
            </Text>
            {match.phase === 'roll' && mine() && cfg.autoRoll !== 'auto' ? <Button testID="roll" title="Roll the dice" onPress={humanRoll} disabled={busy} style={styles.wide} /> : null}
            {rolled ? <Button testID="draw-it" title="Draw it ›" onPress={toBoard} style={styles.wide} /> : null}
          </View>
        ) : view === 'board' ? (
          <View style={styles.boardScreen}>
            <Board
              match={match}
              width={side((over ? 300 : steps.length ? 214 : 150) + (goOn ? 64 : 0))}
              drag={drag}
              preview={preview}
              hide={hide}
              counting={counting}
              canDraw={match.phase === 'place' && mine()}
              onDrag={onDrag}
              onDraw={onDraw}
            />
            {over ? null : (
              <View style={styles.diceRow} accessibilityLabel={dice[0] ? `Rolled ${dice[0]} and ${dice[1]}` : undefined}>
                <Die value={dice[0]} size={52} />
                <Text style={[styles.times, { color: t.muted }]}>×</Text>
                <Die value={dice[1]} size={52} />
              </View>
            )}
            {goOn ? <Button testID="go-on" title={goOn} onPress={() => goOnPressed.current && goOnPressed.current()} style={styles.wide} /> : null}
            {over ? (
              <Results over={over} match={match} who={who} onAgain={onAgain} onExit={onExit} />
            ) : steps.length ? (
              <View style={[styles.steps, { backgroundColor: t.surface, borderColor: t.line }]}>
                {steps.slice(-3).map((s, i, shown) => (
                  <Text key={i} style={[styles.step, { color: t.ink }, i === shown.length - 1 && /^\d+ × \d+ = \d+$/.test(s) ? styles.stepBig : null]}>
                    {s}
                  </Text>
                ))}
              </View>
            ) : (
              <Text testID="turn-msg" style={[styles.msg, { color: oops ? t.bad : t.ink }]}>
                {msg}
              </Text>
            )}
          </View>
        ) : view === 'help' ? (
          <HelpScreen area={area} rect={match.pending.rect} color={PLAYER_COLORS[current % PLAYER_COLORS.length]} counting={counting} text={feedback ? feedback.text : ''} done={helpDone} onBack={backToAnswer} />
        ) : (
          <AnswerScreen
            rect={match.pending ? match.pending.rect : match.lastRect}
            entry={entry}
            feedback={feedback}
            busy={busy}
            help={!match.pending || match.expert ? null : match.pending.helped ? 'again' : 'first'}
            onKey={onKey}
            onHelp={() => helpCount(null, Boolean(match.pending && match.pending.helped))}
          />
        )}
      </View>
    </View>
  );
}

// "Help me count": the rectangle as big as it fits, its rows lighting up
function HelpScreen({ area, rect, color, counting, text, done, onBack }) {
  const t = useTheme();
  const below = 120 + 72; // the words and the button
  return (
    <View style={styles.helpScreen}>
      <RectPicture rect={rect} color={color} counting={counting} maxWidth={area.width - 32} maxHeight={Math.max(80, area.height - below - 32)} />
      <Text testID="help-text" style={[styles.helpText, { color: t.ink }]}>
        {text}
      </Text>
      <Button testID="help-done" title="I know it! ›" onPress={onBack} disabled={!done} style={styles.wide} />
    </View>
  );
}

// Scores, and ✕ back to the menu; with Settings › Board progress, how full the board is
function Header({ match, who, over, onExit, showProgress }) {
  const t = useTheme();
  const total = match.size * match.size;
  const filled = total - Core.emptyCount(match.board);
  return (
    <View>
    <View style={styles.header}>
      <Pressable onPress={onExit} accessibilityRole="button" accessibilityLabel="Main menu" hitSlop={10} style={[styles.close, { borderColor: t.line, backgroundColor: t.surface }]}>
        <Text style={[styles.closeText, { color: t.ink }]}>✕</Text>
      </Pressable>
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
    {showProgress ? (
      <View style={styles.progress} accessibilityLabel={`Board: ${filled} of ${total} filled`}>
        <Text testID="board-progress" style={[styles.progressText, { color: t.muted }]}>
          Board: {filled} of {total} filled
        </Text>
        <View style={[styles.progressBar, { backgroundColor: t.soft }]}>
          <View style={{ width: `${(filled / total) * 100}%`, height: '100%', backgroundColor: PLAYER_COLORS[match.current % PLAYER_COLORS.length], borderRadius: 4 }} />
        </View>
      </View>
    ) : null}
    </View>
  );
}

// The question and the keypad
// help: 'first' ("Help me count"), 'again' ("Count again") or null (Expert)
function AnswerScreen({ rect, entry, feedback, busy, help, onKey, onHelp }) {
  const t = useTheme();
  if (!rect) return null;
  return (
    <View style={styles.answerScreen}>
      <View style={styles.questionRow}>
        <Text style={[styles.question, { color: t.ink }]}>
          {rect.a} × {rect.b} =
        </Text>
        <View testID="answer-box" style={[styles.answerBox, { borderColor: feedback && feedback.kind === 'good' ? t.good : t.edge, backgroundColor: t.surface }]}>
          <Text style={[styles.answerText, { color: t.ink }]}>{entry || ' '}</Text>
        </View>
      </View>
      <Text testID="feedback" numberOfLines={2} style={[styles.feedback, { color: !feedback ? t.muted : feedback.kind === 'good' ? t.goodInk : feedback.kind === 'try' ? t.bad : t.ink }]}>
        {feedback ? feedback.text : 'How many squares did you just draw?'}
      </Text>
      <Keypad onKey={onKey} disabled={busy} />
      {help ? <Button testID="help" kind="secondary" title={help === 'again' ? 'Count again' : 'Help me count'} onPress={onHelp} disabled={busy} /> : null}
    </View>
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
          <View style={styles.resultLine}>
            <Text style={[styles.resultName, { color: t.ink }]}>{who(p)}</Text>
            <Text style={[styles.resultName, { color: t.ink }]}>{p.score} pts</Text>
          </View>
          <View style={[styles.bar, { backgroundColor: t.soft }]}>
            <View style={{ width: `${top ? (p.score / top) * 100 : 0}%`, height: '100%', backgroundColor: PLAYER_COLORS[p.index], borderRadius: 6 }} />
          </View>
        </View>
      ))}
      {match.mode === 'multi' ? <Text style={[styles.resultSub, { color: t.muted }]}>Two-player games are just for fun: they don’t count towards stats or achievements.</Text> : null}
      <View style={styles.resultActions}>
        <Button title="Play Again" onPress={onAgain} style={styles.flex} testID="again" />
        <Button kind="secondary" title="Menu" onPress={onExit} style={styles.flex} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  close: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 18, fontWeight: '800' },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 6 },
  progressText: { fontSize: 13, fontWeight: '600' },
  progressBar: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  score: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 12, borderWidth: 3 },
  swatch: { width: 12, height: 12, borderRadius: 6 },
  scoreName: { flex: 1, fontSize: 15, fontWeight: '600' },
  scorePts: { fontSize: 18, fontWeight: '800' },
  diceRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  times: { fontSize: 24, fontWeight: '800' },
  rollScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 28, padding: 24 },
  bigDice: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  bigTimes: { fontSize: 40, fontWeight: '800' },
  rollMsg: { fontSize: 24, fontWeight: '700', textAlign: 'center', lineHeight: 32 },
  wide: { alignSelf: 'stretch' },
  boardScreen: { flex: 1, alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 4 },
  msg: { fontSize: 18, textAlign: 'center', lineHeight: 24 },
  steps: { alignSelf: 'stretch', padding: 12, borderRadius: 12, borderWidth: 2, gap: 4 },
  step: { fontSize: 16, lineHeight: 22 },
  stepBig: { fontSize: 22, fontWeight: '800' },
  answerScreen: { flex: 1, justifyContent: 'center', gap: 14, paddingHorizontal: 16, paddingBottom: 16 },
  questionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  question: { fontSize: 44, fontWeight: '800' },
  answerBox: { minWidth: 130, borderWidth: 3, borderRadius: 14, paddingVertical: 6, alignItems: 'center' },
  answerText: { fontSize: 44, fontWeight: '800' },
  helpScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20, paddingHorizontal: 16, paddingBottom: 16 },
  helpText: { fontSize: 22, fontWeight: '700', textAlign: 'center', lineHeight: 30, minHeight: 60 },
  feedback: { fontSize: 17, textAlign: 'center', fontWeight: '600', lineHeight: 23, minHeight: 46 },
  results: { alignSelf: 'stretch', padding: 14, borderRadius: 16, borderWidth: 2, gap: 8 },
  resultTitle: { fontSize: 26, fontWeight: '800', textAlign: 'center' },
  resultSub: { fontSize: 15, textAlign: 'center' },
  resultRow: { gap: 4 },
  resultLine: { flexDirection: 'row', justifyContent: 'space-between' },
  resultName: { fontSize: 17, fontWeight: '700' },
  bar: { height: 10, borderRadius: 5, overflow: 'hidden' },
  resultActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
});
