// Hosting a live class from the phone (a teacher), as on the web game's
// projector screen: pick the kind of game, then the lobby (the code and its
// QR code, settings, pairs, who's joined), the game (the teacher's rolls, or
// the pairs and the bracket) and the end (podium and the class report). The
// choices and words are shared (@blockout/progress/hosting). On a phone the
// odd one out in pairs plays the CPU or the teacher on another device.
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, Switch, Text, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import Constants from 'expo-constants';
import * as Hosting from '@blockout/progress/hosting';
import * as Classroom from './classroom';
import { Qr } from './AccountScreen';
import { Chips, Field, Help, Row, Section, SmallButton, ask } from './forms';
import { useTheme } from './theme';
import { Button, Die, ScreenHeader } from './ui';

const SERVER = Constants.expoConfig.extra.server;
const joinLink = (code) => `${SERVER}/#class=${code}`;
const ODD_ON_PHONE = Hosting.ODD.filter(([v]) => v !== 'screen'); // (playing on this phone while hosting: not here)

// host: { code, teacherKey } to pick up (a planned tournament's lobby, or after
// the app was closed); null to set one up. onExit(): back to the menu.
export default function HostScreen({ host: start = null, toast, onExit }) {
  const t = useTheme();
  const [host, setHost] = useState(start);
  const [view, setView] = useState(null);
  const stop = useRef(null);

  useEffect(() => {
    if (!host) return undefined;
    Classroom.client.saveHost(host);
    stop.current = Classroom.client.listenTeacher(host, {
      view: setView,
      gone: (reason) => {
        Classroom.client.saveHost(null);
        if (reason !== 'closed') toast('⚠️ Lost the class', 'The classroom server may have restarted.');
        onExit();
      },
    });
    return () => stop.current && stop.current();
  }, [host]);

  const act = (action, extra) => Classroom.client.teacher(host, action, extra).catch((e) => toast('⚠️ Couldn’t do that', e.message));

  async function close() {
    if (!(await ask('Close the class?', 'Everyone goes back to their menu.', 'Close'))) return;
    if (stop.current) stop.current();
    await Classroom.client.teacher(host, 'close').catch(() => {});
    Classroom.client.saveHost(null);
    onExit();
  }

  if (!host) return <Setup onCreated={setHost} onClose={onExit} />;

  return (
    <View style={[styles.fill, { backgroundColor: t.bg }]}>
      <ScreenHeader title={`Class ${host.code}`} onClose={close} closeLabel="Close the class" />
      <ScrollView contentContainerStyle={styles.page}>
        {!view ? <ActivityIndicator color={t.accent} /> : view.state === 'lobby' ? <Lobby view={view} act={act} /> : view.state === 'playing' ? <Playing view={view} act={act} /> : <Ended view={view} act={act} />}
        {view ? <Roster view={view} act={act} /> : null}
        <Button testID="host-close" kind="secondary" title="Close the class" onPress={close} />
      </ScrollView>
    </View>
  );
}

// The kind of game, its board and difficulty (the rest is in the lobby)
function Setup({ onCreated, onClose }) {
  const t = useTheme();
  const [v, setV] = useState(Hosting.SETUP.start);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (part) => setV((now) => ({ ...now, ...part, size: Hosting.setupSize(part.type || now.type, part.size || now.size) }));
  async function create() {
    setError(null);
    setBusy(true);
    try {
      const room = await Classroom.client.createRoom({ type: v.type, size: v.size, difficulty: v.difficulty, rounds: v.rounds });
      onCreated({ code: room.code, teacherKey: room.teacherKey });
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }
  return (
    <View style={[styles.fill, { backgroundColor: t.bg }]}>
      <ScreenHeader title="Host a live game" onClose={onClose} />
      <ScrollView contentContainerStyle={styles.page}>
        <Field label="Game">
          <Chips testID="host-type" options={Hosting.HOST_TYPES.map(([value, label]) => [value, label])} value={v.type} onChange={(type) => set({ type })} />
          <Help>{Hosting.HOST_TYPE_HELP[v.type]}</Help>
        </Field>
        <Field label="Board size">
          <Chips testID="host-size" options={Hosting.SETUP.sizes.map((n) => [n, `${n}×${n}`])} value={v.size} onChange={(size) => set({ size })} />
        </Field>
        <Field label="Difficulty">
          <Chips testID="host-difficulty" options={Hosting.SETUP.difficulties.map(([value, label, detail]) => [value, `${label} · ${detail}`])} value={v.difficulty} onChange={(difficulty) => set({ difficulty })} />
        </Field>
        {v.type === 'class' ? (
          <Field label="Rolls in a game">
            <Chips testID="host-rounds" options={Hosting.SETUP.rounds.map((n) => [n, String(n)])} value={v.rounds} onChange={(rounds) => set({ rounds })} />
          </Field>
        ) : null}
        {error ? <Text style={{ color: t.bad, fontWeight: '600' }}>{error}</Text> : null}
        <Button testID="host-create" title={busy ? 'Opening the class…' : 'Open the class'} onPress={create} disabled={busy} />
      </ScrollView>
    </View>
  );
}

function Lobby({ view, act }) {
  const t = useTheme();
  const link = joinLink(view.code);
  const start = Hosting.startButton(view);
  const [pick, setPick] = useState(null); // arranging pairs: the first name tapped
  return (
    <>
      <View style={[styles.join, { backgroundColor: t.paper, borderColor: t.line }]}>
        <Qr text={link} size={130} />
        <View style={styles.flex}>
          <Text style={[styles.small, { color: t.muted }]}>Join with the code</Text>
          <Text testID="host-code" style={[styles.code, { color: t.ink }]} selectable>
            {view.code}
          </Text>
          <Text style={[styles.small, { color: t.muted }]} numberOfLines={2}>
            {link.replace(/^https?:\/\//, '')}
          </Text>
          <SmallButton testID="host-share" title="Share…" onPress={() => Share.share({ message: Hosting.joinMessage(link, view.code) }).catch(() => {})} />
        </View>
      </View>
      <Button testID="host-start" title={start.text} onPress={() => act('start')} disabled={start.disabled} />
      {view.type === 'pairs' ? (
        <Section title="Pairs">
          <Chips testID="host-matching" options={Hosting.MATCHING} value={view.pairOptions.matching} onChange={(matching) => act('pairOptions', { options: { matching } })} />
          <Text style={[styles.label, { color: t.ink }]}>The odd one out plays</Text>
          <Chips testID="host-odd" options={ODD_ON_PHONE.map(([v, label, detail]) => [v, `${label} ${detail}`])} value={view.pairOptions.odd} onChange={(odd) => act('pairOptions', { options: { odd } })} />
          <Help>{Hosting.pairsHelp(view)}</Help>
          {view.pairOptions.odd === 'device' ? (
            <View style={styles.device}>
              <Qr text={`${link}&play=${view.playKey}`} size={96} />
              <Help>Scan this on your other device to play the odd one out there. {view.teacher && view.teacher.connected ? '✓ It has joined.' : 'Not joined yet.'}</Help>
            </View>
          ) : null}
          {view.pairOptions.matching !== 'shuffle'
            ? view.pairs.map(([a, b], i) => (
                <View key={i} style={styles.pairRow}>
                  {[a, b].map((p, j) =>
                    p ? (
                      <Pressable
                        key={p.id}
                        disabled={view.pairOptions.matching !== 'arrange'}
                        onPress={() => {
                          if (!pick) setPick(p.id);
                          else if (pick === p.id) setPick(null);
                          else {
                            act('swap', { a: pick, b: p.id });
                            setPick(null);
                          }
                        }}
                        style={[styles.pairName, { backgroundColor: pick === p.id ? t.accentSoft : t.surface, borderColor: pick === p.id ? t.accent : t.line }]}
                      >
                        <Text style={[styles.strong, { color: t.ink }]}>{p.name}</Text>
                      </Pressable>
                    ) : (
                      <Text key={`odd${j}`} style={[styles.pairName, styles.strong, { color: t.muted, borderColor: t.line }]}>
                        {view.pairOptions.odd === 'cpu' ? 'CPU' : 'You'}
                      </Text>
                    )
                  )}
                </View>
              ))
            : null}
        </Section>
      ) : null}
      <Section title="Settings">
        <SmallButton testID="host-quick" title="⚡ Make it quick" onPress={() => act('settings', { settings: Hosting.QUICK_SETTINGS })} disabled={Hosting.isQuick(view)} />
        {Hosting.HOST_SETTINGS.filter((d) => Hosting.settingShown(d, view)).map((d) => (
          <Field key={d.key} label={d.label}>
            <Chips testID={`host-setting-${d.key}`} options={d.options.map(([value, label, detail]) => [value, detail ? `${label} · ${detail}` : label])} value={view.settings[d.key]} onChange={(value) => act('settings', { settings: { [d.key]: value } })} />
          </Field>
        ))}
      </Section>
    </>
  );
}

function Playing({ view, act }) {
  const t = useTheme();
  const next = Hosting.nextButton(view);
  const done = view.here ? view.done / view.here : 0;
  return (
    <>
      <Text testID="host-round" style={[styles.round, { color: t.ink }]}>
        {Hosting.roundLabel(view)}
      </Text>
      {view.type === 'class' && view.roll ? (
        <>
          <View style={styles.dice}>
            <Die value={view.roll[0]} size={84} />
            <Text style={[styles.times, { color: t.muted }]}>×</Text>
            <Die value={view.roll[1]} size={84} />
          </View>
          <Text style={[styles.rollText, { color: t.ink }]}>
            Draw a {view.roll[0]} by {view.roll[1]} rectangle
          </Text>
          <View style={[styles.bar, { backgroundColor: t.soft }]}>
            <View style={{ width: `${done * 100}%`, height: '100%', backgroundColor: t.good, borderRadius: 6 }} />
          </View>
          <Text testID="host-done" style={[styles.small, { color: t.muted, textAlign: 'center' }]}>
            {view.done} of {view.here} done
          </Text>
        </>
      ) : null}
      {next ? <Button testID="host-next" title={next.text} onPress={() => act('next')} disabled={next.disabled} /> : null}
      {next ? (
        <View style={styles.auto}>
          <Switch testID="host-auto" value={Boolean(view.autoNext)} onValueChange={(on) => act('autoNext', { on })} />
          <Text style={[styles.small, { color: t.ink, flex: 1 }]}>{Hosting.autoLabel(view)}</Text>
        </View>
      ) : null}
      {view.type !== 'class' ? <Matches view={view} /> : <Boards view={view} />}
      {view.type === 'tournament' && view.tournament ? <Tournament t={view.tournament} /> : null}
      <Button
        testID="host-end"
        kind="secondary"
        title="End the game now"
        onPress={async () => (await ask('End the game now?', 'Scores so far are final.', 'End it')) && act('end')}
      />
    </>
  );
}

function Ended({ view, act }) {
  const t = useTheme();
  const r = view.report;
  return (
    <>
      <Text style={[styles.round, { color: t.ink }]}>{view.type === 'tournament' ? '🏆 The tournament is over' : 'Game over'}</Text>
      {Hosting.podium(view).map((p, i) => (
        <Row key={i} testID="host-podium">
          <Text style={[styles.podium, { color: t.ink }]}>
            {p.medal} {p.avatar ? `${p.avatar} ` : ''}
            {p.name} · {p.score}
          </Text>
        </Row>
      ))}
      {view.type === 'pairs' ? <Matches view={view} /> : null}
      {view.type === 'tournament' && view.tournament ? <Tournament t={view.tournament} /> : null}
      {r ? (
        <Section title="How the class did">
          <View style={styles.tiles}>
            {Hosting.reportTiles(r).map(([value, label]) => (
              <View key={label} style={[styles.tile, { backgroundColor: t.surface, borderColor: t.line }]}>
                <Text style={[styles.tileValue, { color: t.ink }]}>{value}</Text>
                <Text style={[styles.small, { color: t.muted, textAlign: 'center' }]}>{label}</Text>
              </View>
            ))}
          </View>
          {!r.hardest.length ? <Help>Nothing missed. What a class! 🌟</Help> : null}
          {r.hardest.map((f) => (
            <Row key={f.fact}>
              <Text style={[styles.strong, { color: t.ink }]}>
                {f.fact} <Text style={{ color: t.bad }}>· missed {f.missed} of {f.asked}</Text>
              </Text>
            </Row>
          ))}
        </Section>
      ) : null}
      <Button testID="host-again" title="Play again" onPress={() => act('lobby')} />
    </>
  );
}

// Pairs and tournaments: a card per game
function Matches({ view }) {
  const t = useTheme();
  return (view.matches || []).map((m, i) => {
    const card = Hosting.matchCard(m);
    return (
      <View key={i} testID="host-match" style={[styles.match, { backgroundColor: t.surface, borderColor: m.over ? t.line : t.accent }]}>
        {card.rows.map((p) => (
          <View key={p.id} style={styles.matchRow}>
            <Text style={styles.mark}>{p.mark}</Text>
            <Text style={[styles.strong, { color: t.ink, flex: 1, fontWeight: p.winner ? '900' : '700' }]} numberOfLines={1}>
              {p.avatar ? `${p.avatar} ` : ''}
              {p.name}
            </Text>
            <Text style={[styles.strong, { color: t.ink }]}>{p.score}</Text>
          </View>
        ))}
        <Text style={[styles.small, { color: t.muted }]}>{card.status}</Text>
      </View>
    );
  });
}

// A tournament: the bracket's rounds (knockouts), else the standings
function Tournament({ t: tour }) {
  const t = useTheme();
  return (
    <Section title="Tournament">
      {tour.format === 'koth'
        ? tour.hills.map((h) => (
            <Row key={h.id}>
              <Text style={[styles.strong, { color: t.ink }]}>
                {tour.hills.length > 1 ? `Hill ${h.id}: ` : ''}👑 {h.king || '…'}
                {h.streak > 1 ? ` · 🔥 ${h.streak} in a row` : ''}
              </Text>
              <Text style={[styles.small, { color: t.muted }]}>
                {h.queue.length ? `Next: ${h.queue.join(', ')} · ` : ''}
                {h.played} of {h.limit} games
              </Text>
            </Row>
          ))
        : null}
      {tour.format === 'knockout' || tour.format === 'double' ? (
        <ScrollView horizontal contentContainerStyle={styles.bracket}>
          {tour.rounds.map((r, i) => (
            <View key={i} style={styles.bracketRound}>
              <Text style={[styles.small, { color: t.muted }]}>{r.label}</Text>
              {r.matches.map((m, j) => (
                <View key={j} style={[styles.bracketMatch, { borderColor: t.line, backgroundColor: t.surface }]}>
                  {[m.a, m.b].map((name, k) => (
                    <Text key={k} style={{ color: name === m.winner ? t.ink : t.muted, fontWeight: name === m.winner ? '900' : '600' }}>
                      {name}
                    </Text>
                  ))}
                </View>
              ))}
              {r.byes.map((name) => (
                <Text key={name} style={[styles.small, { color: t.muted }]}>
                  {name}: bye
                </Text>
              ))}
            </View>
          ))}
        </ScrollView>
      ) : null}
    </Section>
  );
}

// Whole class: everyone's board, as they place their rectangles
function Boards({ view }) {
  const t = useTheme();
  const size = view.settings.size;
  const px = 76;
  const cell = px / size;
  return (
    <View style={styles.boards}>
      {view.players.map((p) => (
        <View key={p.id} style={[styles.boardCard, { borderColor: p.done ? t.good : t.line, opacity: p.connected ? 1 : 0.5 }]}>
          <Svg width={px} height={px}>
            <Rect x={0} y={0} width={px} height={px} fill={t.surface} />
            {((view.boards && view.boards[p.id]) || []).map(([x, y, w, h], i) => (
              <Rect key={i} x={x * cell} y={y * cell} width={w * cell} height={h * cell} fill="#2e86de" fillOpacity={0.85} stroke={t.paper} strokeWidth={1} />
            ))}
          </Svg>
          <Text style={[styles.small, { color: t.ink }]} numberOfLines={1}>
            {p.done ? '✓ ' : ''}
            {p.name} · {p.score}
          </Text>
        </View>
      ))}
    </View>
  );
}

function Roster({ view, act }) {
  const t = useTheme();
  const r = Hosting.roster(view);
  return (
    <Section title={r.title}>
      {!r.rows.length ? <Help>Nobody yet. Names show up here as students join.</Help> : null}
      {r.rows.map((p, i) => (
        <View key={p.id || i} testID="host-roster" style={[styles.rosterRow, { borderColor: t.line, opacity: p.offline ? 0.5 : 1 }]}>
          {p.rank ? <Text style={[styles.rank, { color: t.muted }]}>{p.rank}</Text> : null}
          <Text style={[styles.strong, { color: t.ink, flex: 1 }]} numberOfLines={1}>
            {p.avatar ? `${p.avatar} ` : ''}
            {p.name}
            {p.title ? <Text style={[styles.small, { color: t.muted }]}> {p.title}</Text> : null}
          </Text>
          {p.waiting ? <Text style={[styles.small, { color: t.muted }]}>{p.waiting}</Text> : null}
          {p.removable ? (
            <SmallButton title="×" testID="host-remove" onPress={async () => (await ask(`Remove ${p.name} from the class?`, 'They can join again with the code.', 'Remove')) && act('remove', { id: p.id })} />
          ) : p.score !== undefined && !p.waiting ? (
            <Text style={[styles.strong, { color: t.ink }]}>
              {p.score} {p.status}
            </Text>
          ) : null}
        </View>
      ))}
    </Section>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flex: 1, gap: 6 },
  page: { padding: 16, paddingTop: 4, gap: 16, paddingBottom: 40, maxWidth: 700, width: '100%', alignSelf: 'center' },
  join: { flexDirection: 'row', gap: 12, alignItems: 'center', borderWidth: 2, borderRadius: 14, padding: 12 },
  code: { fontSize: 44, fontWeight: '900', letterSpacing: 6 },
  small: { fontSize: 13, lineHeight: 18 },
  strong: { fontSize: 16, fontWeight: '700' },
  label: { fontSize: 15, fontWeight: '800' },
  device: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  pairRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  pairName: { flex: 1, borderWidth: 2, borderRadius: 10, padding: 10, textAlign: 'center' },
  round: { fontSize: 22, fontWeight: '900', textAlign: 'center' },
  dice: { flexDirection: 'row', gap: 16, alignItems: 'center', justifyContent: 'center' },
  times: { fontSize: 30, fontWeight: '800' },
  rollText: { fontSize: 20, fontWeight: '800', textAlign: 'center' },
  bar: { height: 12, borderRadius: 6, overflow: 'hidden' },
  auto: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  match: { borderWidth: 2, borderRadius: 12, padding: 10, gap: 4 },
  matchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mark: { width: 22, fontSize: 16 },
  bracket: { gap: 12, paddingVertical: 4 },
  bracketRound: { gap: 8, minWidth: 130 },
  bracketMatch: { borderWidth: 2, borderRadius: 10, padding: 8, gap: 2 },
  boards: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  boardCard: { width: 92, alignItems: 'center', gap: 4, borderWidth: 2, borderRadius: 10, padding: 6 },
  rosterRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  rank: { width: 36, fontSize: 14, fontWeight: '800' },
  podium: { fontSize: 18, fontWeight: '800' },
  tiles: { flexDirection: 'row', gap: 8 },
  tile: { flex: 1, padding: 10, borderRadius: 12, borderWidth: 2, alignItems: 'center', gap: 2 },
  tileValue: { fontSize: 22, fontWeight: '900' },
});
