// A live class, as a student (the teacher hosts it from the web game): join
// with the code on the board, wait for the teacher, then play each game the
// teacher starts: the whole class on the same rolls, or pairs and
// tournaments head to head. Results stay up until the next game starts.
// What the screens say is shared with the web game (@blockout/progress/classroom).
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Live from '@blockout/progress/classroom';
import * as Wardrobe from '@blockout/progress/wardrobe';
import * as Classroom from './classroom';
import Game from './Game';
import { addToHistory } from './history';
import { useLooks } from './looks';
import { useTheme } from './theme';
import { Button, ScreenHeader } from './ui';

// The game for this view, if there's one to play: { key, kind, me }
function gameFor(view) {
  if (view.you.benched) return null; // joined after it started: the next one
  if (view.type === 'class') return view.state === 'lobby' ? null : { key: `class:${view.game}`, kind: 'class', me: 0 };
  const m = view.match;
  if (!m || view.state === 'lobby') return null;
  return { key: `pair:${view.game}:${m.id}`, kind: 'pair', me: m.players.findIndex((p) => p.id === view.you.id), over: m.over };
}

// user: the signed-in account (a student plays under their first name);
// resume: a session from last time; code: from a link; onExit() back to the menu
export default function ClassScreen({ user, resume = null, code: linkCode = '', progress, settings, onSave, toast, onEarned, onExit }) {
  const t = useTheme();
  const looks = useLooks();
  const [session, setSession] = useState(resume);
  const [view, setView] = useState(null);
  const [playing, setPlaying] = useState(null); // the game on screen: { key, kind, me, setup, cfg }
  const finished = useRef(new Set()); // (games whose results are up)
  const stop = useRef(null);
  const seen = useRef(false);
  const rewarded = useRef(new Set()); // (tournaments already rewarded)

  // Live updates while in the class
  useEffect(() => {
    if (!session) return undefined;
    seen.current = false;
    Classroom.client.saveSession(session);
    stop.current = Classroom.client.listenStudent(session, {
      view: (v) => {
        seen.current = true;
        setView(v);
      },
      gone: (reason) => {
        stop.current = null;
        Classroom.client.saveSession(null);
        const said = Live.goneToast(reason, seen.current);
        if (said) toast(...said);
        onExit();
      },
    });
    return () => stop.current && stop.current();
  }, [session]);

  // Each view: which game to show, and a tournament's rewards once it's over
  useEffect(() => {
    if (!view) return;
    const done = !session.teacher && Live.tournamentRewards(progress, view, session.name, rewarded.current);
    if (done) {
      onEarned(done.earned);
      onSave();
      addToHistory(done.entry);
      if (done.champion) toast('🏆 Tournament champion!', 'You won the whole thing!');
    }
    const next = gameFor(view);
    if (next && (!playing || playing.key !== next.key)) {
      if (next.over) return setPlaying((p) => (p && finished.current.has(p.key) ? p : null)); // (finished before you got here)
      return setPlaying({ ...next, ...setupFor(view, next, settings, looks) });
    }
    // no game now: a finished one's results stay up until the next starts
    if (!next && playing && !finished.current.has(playing.key)) setPlaying(null);
  }, [view]);

  async function leave() {
    if (stop.current) stop.current();
    stop.current = null;
    if (session) Classroom.client.leave(session).catch(() => {});
    Classroom.client.saveSession(null);
    onExit();
  }

  if (!session) return <JoinForm user={user} linkCode={linkCode} looks={looks} onJoined={setSession} onClose={onExit} />;

  if (playing && view) {
    return (
      <Game
        key={playing.key}
        setup={playing.setup}
        settings={playing.cfg}
        progress={progress}
        onSave={onSave}
        toast={toast}
        onEarned={onEarned}
        onExit={leave}
        live={{ kind: playing.kind, view, session, client: Classroom.client, me: playing.me, onOver: () => finished.current.add(playing.key) }}
      />
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: t.bg }]}>
      <ScreenHeader title={`Class ${session.code}`} onClose={leave} closeLabel="Leave the class" />
      <View style={styles.wait}>
        <Text style={styles.waitIcon}>🏫</Text>
        <Text testID="class-name" style={[styles.waitName, { color: t.ink }]}>
          {session.name}
        </Text>
        {view ? null : <ActivityIndicator color={t.accent} />}
        <Text testID="class-wait" style={[styles.waitText, { color: t.muted }]}>
          {view ? Live.waitingText(view, session) : 'Joining…'}
        </Text>
        <Button testID="leave-class" kind="secondary" title="Leave class" onPress={leave} style={styles.wide} />
      </View>
    </View>
  );
}

// The game a view starts: the teacher's settings for everyone (no shop locks),
// your own way of placing unless the teacher picked one
function setupFor(view, next, settings, looks) {
  const s = view.settings;
  const timer = Number(s.answerTime) || 0;
  const mine = (p) => ({ ...p, ...Wardrobe.playerLook(looks, p, 'single') });
  const players =
    next.kind === 'class'
      ? [mine({ name: view.you.name })]
      : view.match.players.map((p, i) => (i === next.me ? mine({ name: p.name }) : { name: p.isTeacher ? 'Teacher' : p.name, avatar: p.avatar, title: p.title })); // (the server plays a CPU partner's turns)
  return {
    setup: { mode: next.kind, difficulty: s.difficulty, size: s.size, players, timer, timerMs: timer * 1000 },
    cfg: { ...settings, ...Live.classCfg(s, settings.placeMode), autoRoll: 'manual', fitRolls: 'never' },
  };
}

// The class code (and a guest's name: a signed-in student plays under their first name)
function JoinForm({ user, linkCode, looks, onJoined, onClose }) {
  const t = useTheme();
  const student = user && user.role === 'student' ? user : null;
  const [code, setCode] = useState(linkCode);
  const [name, setName] = useState(student ? student.firstName || student.name : '');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!student) Classroom.lastName().then((n) => n && setName((now) => now || n));
    // from a link: is that class still on?
    if (linkCode)
      Classroom.client.roomInfo(linkCode).catch((err) => {
        if (err.code !== 'room') return;
        setError('This class has finished. Ask your teacher for a new link.');
        setCode('');
      });
  }, []);

  async function join() {
    const c = code.trim().toUpperCase();
    const n = name.trim();
    if (!c || !n || busy) return;
    setError(null);
    setBusy(true);
    try {
      const r = await Classroom.client.join(c, n, { avatar: looks.avatar, title: looks.title });
      if (!student) Classroom.saveName(n);
      onJoined({ code: c, id: r.id, key: r.key, name: r.name || n, teacher: r.teacher });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const input = [styles.input, { color: t.ink, backgroundColor: t.surface, borderColor: t.line }];
  return (
    <View style={[styles.fill, { backgroundColor: t.bg }]}>
      <ScreenHeader title="Join a class" onClose={onClose} />
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <Text style={[styles.help, { color: t.muted }]}>Type the code your teacher shows on the board.</Text>
        <Text style={[styles.label, { color: t.ink }]}>Class code</Text>
        <TextInput testID="class-code" value={code} onChangeText={(v) => setCode(v.toUpperCase())} placeholder="ABCD" placeholderTextColor={t.muted} maxLength={4} autoCapitalize="characters" autoCorrect={false} style={[...input, styles.code]} />
        <Text style={[styles.label, { color: t.ink }]}>Your name</Text>
        <TextInput
          testID="class-name-input"
          value={name}
          onChangeText={setName}
          editable={!student}
          placeholder="First name"
          placeholderTextColor={t.muted}
          maxLength={20}
          autoCorrect={false}
          returnKeyType="go"
          onSubmitEditing={join}
          style={[...input, student ? { opacity: 0.7 } : null]}
        />
        {student ? <Text style={[styles.help, { color: t.muted }]}>You play under your account’s name.</Text> : null}
        {error ? (
          <Text testID="class-join-error" style={[styles.error, { color: t.bad }]}>
            {error}
          </Text>
        ) : null}
        <Button testID="class-join" title={busy ? 'Joining…' : 'Join'} onPress={join} disabled={busy || code.trim().length < 4 || !name.trim()} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  page: { padding: 16, paddingTop: 4, gap: 10, maxWidth: 700, width: '100%', alignSelf: 'center' },
  help: { fontSize: 15, lineHeight: 21 },
  label: { fontSize: 15, fontWeight: '800', marginTop: 6 },
  input: { height: 52, minWidth: 0, borderWidth: 2, borderRadius: 12, paddingHorizontal: 12, fontSize: 20, fontWeight: '700' },
  code: { fontSize: 30, letterSpacing: 8, textAlign: 'center', height: 64 },
  error: { fontSize: 15, fontWeight: '600' },
  wait: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 },
  waitIcon: { fontSize: 56 },
  waitName: { fontSize: 26, fontWeight: '900' },
  waitText: { fontSize: 18, textAlign: 'center', lineHeight: 26 },
  wide: { alignSelf: 'stretch' },
});
