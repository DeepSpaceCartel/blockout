// The menu: who's signed in, the points, and the game to play.
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BOARDS, DIFFICULTIES, boardOpen, difficultyOpen } from './rewards';
import { useTheme } from './theme';
import { Button } from './ui';

const MODES = [
  { id: 'single', name: 'You vs the CPU' },
  { id: 'multi', name: 'Two players' },
];

export default function Home({ progress, user, choice, onChoose, onPlay, onSignIn, onSignOut, signingIn, accountError }) {
  const t = useTheme();
  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={styles.page}>
      <Text style={[styles.title, { color: t.ink }]}>Blockout</Text>
      <Text style={[styles.tagline, { color: t.muted }]}>Roll two dice, draw the rectangle, count the squares.</Text>

      <View style={[styles.card, { backgroundColor: t.paper, borderColor: t.line }]}>
        <Text testID="wallet" style={[styles.wallet, { color: t.goldInk, backgroundColor: t.goldBg }]}>
          ⭐ {progress.wallet} points
        </Text>
        {user ? (
          <View style={styles.account}>
            <Text style={[styles.accountText, { color: t.ink }]}>
              Signed in as {user.firstName || user.name || 'you'}
              {user.role && user.role !== 'student' ? ` (${user.role})` : ''}
            </Text>
            <Button kind="secondary" title="Sign out" onPress={onSignOut} />
          </View>
        ) : (
          <View style={styles.account}>
            <Text style={[styles.accountText, { color: t.muted }]}>Sign in to keep your points and unlocks on every device.</Text>
            <Button testID="sign-in" kind="secondary" title={signingIn ? 'Signing in…' : 'Sign in'} onPress={onSignIn} disabled={signingIn} />
          </View>
        )}
        {accountError ? <Text style={[styles.error, { color: t.bad }]}>{accountError}</Text> : null}
      </View>

      <Section title="Play">
        <Chips items={MODES.map((x) => ({ id: x.id, label: x.name, open: true }))} value={choice.mode} onPick={(mode) => onChoose({ mode })} />
      </Section>

      <Section title="Difficulty">
        <Chips items={DIFFICULTIES.map((d) => ({ id: d.id, label: `${d.name}: ${d.dice}`, open: difficultyOpen(progress, d.id) }))} value={choice.difficulty} onPick={(difficulty) => onChoose({ difficulty })} />
      </Section>

      <Section title="Board">
        <Chips items={BOARDS.map((n) => ({ id: n, label: `${n} × ${n}`, open: boardOpen(progress, n) }))} value={choice.size} onPick={(size) => onChoose({ size })} row />
      </Section>

      <Text style={[styles.note, { color: t.muted }]}>🔒 Unlock more boards and difficulties in the Shop at blockout.deepspacecartel.com: signed in, they show up here too.</Text>

      <Button testID="play" title="Play" onPress={onPlay} style={styles.play} />
    </ScrollView>
  );
}

function Section({ title, children }) {
  const t = useTheme();
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: t.muted }]}>{title}</Text>
      {children}
    </View>
  );
}

function Chips({ items, value, onPick, row = false }) {
  const t = useTheme();
  return (
    <View style={[styles.chips, row ? styles.row : null]}>
      {items.map((it) => {
        const on = it.id === value;
        return (
          <Pressable
            key={it.id}
            testID={`choice-${it.id}`}
            accessibilityRole="radio"
            accessibilityState={{ selected: on, disabled: !it.open }}
            disabled={!it.open}
            onPress={() => onPick(it.id)}
            style={[styles.chip, { backgroundColor: on ? t.accentSoft : t.surface, borderColor: on ? t.accent : t.line, opacity: it.open ? 1 : 0.5 }]}
          >
            <Text style={[styles.chipText, { color: t.ink }]}>
              {it.open ? '' : '🔒 '}
              {it.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20, gap: 18, paddingBottom: 48 },
  title: { fontSize: 40, fontWeight: '900', textAlign: 'center', marginTop: 12 },
  tagline: { fontSize: 17, textAlign: 'center' },
  card: { padding: 16, borderRadius: 16, borderWidth: 2, gap: 12 },
  wallet: { alignSelf: 'center', fontSize: 20, fontWeight: '800', paddingVertical: 6, paddingHorizontal: 14, borderRadius: 999, overflow: 'hidden' },
  account: { gap: 10 },
  accountText: { fontSize: 16, textAlign: 'center' },
  error: { fontSize: 15, textAlign: 'center' },
  section: { gap: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  chips: { gap: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, borderWidth: 2 },
  chipText: { fontSize: 17, fontWeight: '600' },
  note: { fontSize: 14, lineHeight: 20 },
  play: { marginTop: 4 },
});
