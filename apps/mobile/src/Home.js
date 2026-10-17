// The menu, on one screen: points and who's signed in, what to play
// (mode, difficulty, board, each one row of choices) and Play at the bottom.
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BOARDS, DIFFICULTIES, boardOpen, difficultyOpen } from './rewards';
import { useTheme } from './theme';
import { Button } from './ui';

const MODES = [
  { id: 'single', label: 'You vs CPU' },
  { id: 'multi', label: 'Two players' },
];

export default function Home({ progress, user, choice, onChoose, onPlay, onSignIn, onSignOut, signingIn, accountError }) {
  const t = useTheme();
  const anyLocked = DIFFICULTIES.some((d) => !difficultyOpen(progress, d.id)) || BOARDS.some((n) => !boardOpen(progress, n));
  return (
    <View style={[styles.fill, { backgroundColor: t.bg }]}>
      <ScrollView contentContainerStyle={styles.page} bounces={false}>
        <View style={styles.top}>
          <Text style={[styles.title, { color: t.ink }]}>Blockout</Text>
          <Text testID="wallet" style={[styles.wallet, { color: t.goldInk, backgroundColor: t.goldBg }]}>
            ⭐ {progress.wallet}
          </Text>
        </View>

        <View style={[styles.account, { backgroundColor: t.paper, borderColor: t.line }]}>
          {user ? (
            <Text style={[styles.accountText, { color: t.ink }]} numberOfLines={1}>
              Signed in as <Text style={styles.bold}>{user.firstName || user.name || 'you'}</Text>
              {user.role && user.role !== 'student' ? ` (${user.role})` : ''}
            </Text>
          ) : (
            <Text style={[styles.accountText, { color: t.muted }]} numberOfLines={2}>
              Sign in to keep your points on every device.
            </Text>
          )}
          <SmallButton testID={user ? 'sign-out' : 'sign-in'} title={user ? 'Sign out' : signingIn ? 'Signing in…' : 'Sign in'} onPress={user ? onSignOut : onSignIn} disabled={signingIn} />
        </View>
        {accountError ? <Text style={[styles.error, { color: t.bad }]}>{accountError}</Text> : null}

        <Section title="Play">
          <Segments items={MODES.map((x) => ({ id: x.id, label: x.label, open: true }))} value={choice.mode} onPick={(mode) => onChoose({ mode })} />
        </Section>

        <Section title="Difficulty">
          <Segments
            items={DIFFICULTIES.map((d) => ({ id: d.id, label: d.name, sub: d.dice.replace(' dice', ''), open: difficultyOpen(progress, d.id) }))}
            value={choice.difficulty}
            onPick={(difficulty) => onChoose({ difficulty })}
          />
        </Section>

        <Section title="Board">
          <Segments items={BOARDS.map((n) => ({ id: n, label: `${n}`, sub: `× ${n}`, open: boardOpen(progress, n) }))} value={choice.size} onPick={(size) => onChoose({ size })} />
        </Section>

        {anyLocked ? <Text style={[styles.note, { color: t.muted }]}>🔒 Unlock more in the Shop at blockout.deepspacecartel.com</Text> : null}
      </ScrollView>
      <View style={styles.bottom}>
        <Button testID="play" title="Play" onPress={onPlay} />
      </View>
    </View>
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

// One row of equal choices; a locked one shows 🔒 and can't be picked
function Segments({ items, value, onPick }) {
  const t = useTheme();
  return (
    <View style={styles.segments} accessibilityRole="radiogroup">
      {items.map((it) => {
        const on = it.id === value;
        return (
          <Pressable
            key={it.id}
            testID={`choice-${it.id}`}
            accessibilityRole="radio"
            accessibilityLabel={`${it.label}${it.sub ? ` ${it.sub}` : ''}${it.open ? '' : ', locked'}`}
            accessibilityState={{ selected: on, disabled: !it.open }}
            disabled={!it.open}
            onPress={() => onPick(it.id)}
            style={({ pressed }) => [
              styles.segment,
              { backgroundColor: on ? t.accentSoft : t.surface, borderColor: on ? t.accent : t.line, opacity: it.open ? 1 : 0.5, transform: [{ scale: pressed ? 0.97 : 1 }] },
            ]}
          >
            <Text style={[styles.segmentText, { color: t.ink }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
              {it.open ? '' : '🔒 '}
              {it.label}
            </Text>
            {it.sub ? (
              <Text style={[styles.segmentSub, { color: t.muted }]} numberOfLines={1}>
                {it.sub}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function SmallButton({ title, onPress, disabled, testID }) {
  const t = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.small, { backgroundColor: t.soft, borderColor: t.line, opacity: disabled ? 0.5 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] }]}
    >
      <Text style={[styles.smallText, { color: t.ink }]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  page: { flexGrow: 1, padding: 16, gap: 16 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 32, fontWeight: '900' },
  wallet: { fontSize: 18, fontWeight: '800', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, overflow: 'hidden' },
  account: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth * 2 },
  accountText: { flex: 1, fontSize: 15 },
  bold: { fontWeight: '700' },
  error: { fontSize: 14, textAlign: 'center' },
  section: { gap: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  segments: { flexDirection: 'row', gap: 8 },
  segment: { flex: 1, minHeight: 52, paddingVertical: 8, paddingHorizontal: 4, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  segmentText: { fontSize: 16, fontWeight: '700' },
  segmentSub: { fontSize: 12, marginTop: 2 },
  note: { fontSize: 13, textAlign: 'center' },
  bottom: { padding: 16, paddingTop: 8 },
  small: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth * 2 },
  smallText: { fontSize: 15, fontWeight: '700' },
});
