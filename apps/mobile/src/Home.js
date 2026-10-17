// The menu, on one screen: points and who's signed in, what to play
// (mode, difficulty, board, each one row of choices) and Play at the bottom.
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Shop from '@blockout/progress/shop';
import { BOARDS, DIFFICULTIES, boardOpen, difficultyOpen, itemFor, modeOpen } from './rewards';
import { useTheme } from './theme';
import { Button } from './ui';

const MODES = [
  { id: 'single', label: 'You vs CPU' },
  { id: 'multi', label: 'Two players' },
];

// onLocked(itemId): a locked choice was tapped (offer it); onShop(): open the Shop
export default function Home({ progress, user, choice, onChoose, onPlay, onSignIn, onSignOut, signingIn, accountError, onLocked, onShop, onAchievements, onStats, onStickers }) {
  const t = useTheme();
  const newUnlocks = Shop.affordableCount(progress);
  const stickerNews = Shop.newStickers(progress) + Shop.spareStickers(progress);
  const anyLocked = DIFFICULTIES.some((d) => !difficultyOpen(progress, d.id)) || BOARDS.some((n) => !boardOpen(progress, n));
  return (
    <View style={[styles.fill, { backgroundColor: t.bg }]}>
      <ScrollView contentContainerStyle={styles.page} bounces={false}>
        <View style={styles.top}>
          <Text style={[styles.title, { color: t.ink }]}>Blockout</Text>
          <View style={styles.topRight}>
            <Text testID="wallet" style={[styles.wallet, { color: t.goldInk, backgroundColor: t.goldBg }]}>
              🪙 {Shop.formatPoints(progress.wallet)}
            </Text>
            <Pressable testID="shop" accessibilityRole="button" accessibilityLabel={`Shop${newUnlocks ? `, ${newUnlocks} to unlock` : ''}`} onPress={onShop} style={({ pressed }) => [styles.shopBtn, { backgroundColor: t.soft, borderColor: t.line, transform: [{ scale: pressed ? 0.96 : 1 }] }]}>
              <Text style={[styles.smallText, { color: t.ink }]}>🛒 Shop</Text>
              {newUnlocks ? (
                <View style={[styles.badge, { backgroundColor: t.bad }]}>
                  <Text style={styles.badgeText}>{newUnlocks}</Text>
                </View>
              ) : null}
            </Pressable>
          </View>
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

        <View style={styles.more}>
          <MenuButton testID="stats" label="📊 Stats" onPress={onStats} />
          <MenuButton testID="achievements" label="🏆 Awards" onPress={onAchievements} />
          <MenuButton testID="stickers" label="🎁 Stickers" badge={stickerNews} onPress={onStickers} />
        </View>

        <Section title="Play">
          <Segments items={MODES.map((x) => ({ id: x.id, label: x.label, open: modeOpen(progress, x.id) }))} value={choice.mode} onPick={(mode) => onChoose({ mode })} onLocked={() => onLocked(itemFor.mode())} />
        </Section>

        <Section title="Difficulty">
          <Segments
            items={DIFFICULTIES.map((d) => ({ id: d.id, label: d.name, sub: d.dice.replace(' dice', ''), open: difficultyOpen(progress, d.id) }))}
            value={choice.difficulty}
            onPick={(difficulty) => onChoose({ difficulty })}
            onLocked={(id) => onLocked(itemFor.difficulty(id))}
          />
        </Section>

        <Section title="Board">
          <Segments items={BOARDS.map((n) => ({ id: n, label: `${n}`, sub: `× ${n}`, open: boardOpen(progress, n) }))} value={choice.size} onPick={(size) => onChoose({ size })} onLocked={(n) => onLocked(itemFor.size(n))} />
        </Section>

        {anyLocked ? <Text style={[styles.note, { color: t.muted }]}>🔒 Tap a locked one to see how to unlock it.</Text> : null}
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

// One row of equal choices; a locked one shows 🔒, and tapping it offers it (onLocked)
function Segments({ items, value, onPick, onLocked }) {
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
            accessibilityState={{ selected: on }}
            onPress={() => (it.open ? onPick(it.id) : onLocked(it.id))}
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

// One of the menu's row of extras, with a count badge when there's something new
function MenuButton({ label, badge = 0, onPress, testID }) {
  const t = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${label.replace(/^\S+ /, '')}${badge ? `, ${badge} new` : ''}`}
      onPress={onPress}
      style={({ pressed }) => [styles.menuBtn, { backgroundColor: t.surface, borderColor: t.line, transform: [{ scale: pressed ? 0.97 : 1 }] }]}
    >
      <Text style={[styles.smallText, { color: t.ink }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
        {label}
      </Text>
      {badge ? (
        <View style={[styles.badge, styles.cornerBadge, { backgroundColor: t.bad }]}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
    </Pressable>
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
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  wallet: { fontSize: 17, fontWeight: '800', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, overflow: 'hidden' },
  shopBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth * 2 },
  badge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  // (on the corner, like an app's badge, so the label keeps its room)
  cornerBadge: { position: 'absolute', top: -7, right: -5 },
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
  more: { flexDirection: 'row', gap: 8 },
  menuBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth * 2 },
  small: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth * 2 },
  smallText: { fontSize: 15, fontWeight: '700' },
});
