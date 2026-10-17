// The menu, on one screen: points and who's signed in, what to play
// (mode, difficulty, board, each one row of choices) and Play at the bottom.
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Progress from '@blockout/progress';
import * as Shop from '@blockout/progress/shop';
import * as Setup from '@blockout/progress/setup';
import * as Practice from '@blockout/progress/practice';
import { BOARDS, DIFFICULTIES, PLAYER_COUNTS, boardOpen, difficultyOpen, itemFor, modeOpen, playersOpen } from './rewards';
import { useTheme } from './theme';
import { ROLE } from './AccountScreen';
import { Button } from './ui';

const MODES = [
  { id: 'single', label: 'You vs CPU' },
  { id: 'multi', label: 'Friends' },
  { id: 'practice', label: 'Practice' },
];
const LEVELS = [
  { id: 'learn', label: 'Learn' },
  { id: 'expert', label: 'Expert ×2' },
];

// onLocked(itemId): a locked choice was tapped (offer it); onShop(): open the Shop
export default function Home({ progress, user, choice, onChoose, onPlay, onSignIn, onAccount, onHomework, homeworkCount = 0, signingIn, accountError, onLocked, onShop, onWardrobe, onAchievements, onStats, onStickers, onSettings }) {
  const t = useTheme();
  const newUnlocks = Shop.affordableCount(progress);
  const stickerNews = Shop.newStickers(progress) + Shop.spareStickers(progress);
  const wardrobeNews = Shop.newWardrobe(progress) + Shop.affordableLooks(progress);
  const anyLocked = DIFFICULTIES.some((d) => !difficultyOpen(progress, d.id)) || BOARDS.some((n) => !boardOpen(progress, n));
  const d = choice.difficulty;
  const level = Setup.gameLevel(progress, d, choice); // (what's unlocked on this difficulty)
  const practicing = choice.mode === 'practice';
  const pr = Practice.practiceChoice(progress, d, choice.practice || {});
  const picked = (choice.practice && choice.practice.tables) || [];
  const prPreview = practicing ? Practice.preview(progress, d, picked) : null;
  const warning = practicing ? null : Setup.boardWarning(d, choice.size);
  const setPractice = (part) => onChoose({ practice: { ...pr, tables: picked, ...part } });
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
            <Pressable testID="settings" accessibilityRole="button" accessibilityLabel="Settings" onPress={onSettings} hitSlop={6} style={({ pressed }) => [styles.gear, { backgroundColor: t.soft, borderColor: t.line, transform: [{ scale: pressed ? 0.94 : 1 }] }]}>
              <Text style={styles.gearText}>⚙️</Text>
            </Pressable>
          </View>
        </View>

        <View style={[styles.account, { backgroundColor: t.paper, borderColor: t.line }]}>
          {user ? (
            <>
              <Text testID="signed-in" style={[styles.accountText, { color: t.ink }]} numberOfLines={1}>
                {(ROLE[user.role] || ROLE.student).emoji} <Text style={styles.bold}>{user.name || user.firstName || 'You'}</Text>
              </Text>
              {user.role === 'student' ? <SmallButton testID="homework" title="📚 Homework" badge={homeworkCount} onPress={onHomework} /> : null}
              <SmallButton testID="account" title="Account" onPress={onAccount} />
            </>
          ) : (
            <>
              <Text style={[styles.accountText, { color: t.muted }]} numberOfLines={2}>
                Sign in to keep your points on every device.
              </Text>
              <SmallButton testID="sign-in" title={signingIn ? 'Signing in…' : 'Sign in'} onPress={onSignIn} disabled={signingIn} />
            </>
          )}
        </View>
        {accountError ? <Text style={[styles.error, { color: t.bad }]}>{accountError}</Text> : null}

        <View style={styles.more}>
          <MenuButton testID="wardrobe" label="👕 Looks" badge={wardrobeNews} onPress={onWardrobe} />
          <MenuButton testID="stats" label="📊 Stats" onPress={onStats} />
          <MenuButton testID="achievements" label="🏆 Awards" onPress={onAchievements} />
          <MenuButton testID="stickers" label="🎁 Stickers" badge={stickerNews} onPress={onStickers} />
        </View>

        <Section title="Play">
          <Segments items={MODES.map((x) => ({ id: x.id, label: x.label, open: modeOpen(progress, x.id) }))} value={choice.mode} onPick={(mode) => onChoose({ mode })} onLocked={(mode) => onLocked(itemFor.mode(mode))} />
          {practicing ? (
            <>
              <Segments
                compact
                items={LEVELS.map((l) => ({ id: l.id, label: l.label, open: isOpen(progress, Practice.levelItem(d, l.id)) }))}
                value={pr.level}
                onPick={(level) => setPractice({ level })}
                onLocked={(lv) => onLocked(Practice.levelItem(d, lv))}
              />
              {pr.level === 'expert' ? (
                <Segments
                  compact
                  items={Practice.PRACTICE_TIMERS.map((secs) => ({ id: secs, label: secs ? `⏱️ ${secs} s` : 'No timer', open: isOpen(progress, Practice.timerItem(d, secs)) }))}
                  prefix="t"
                  value={pr.timer}
                  onPick={(timer) => setPractice({ timer })}
                  onLocked={(secs) => onLocked(Practice.timerItem(d, secs))}
                />
              ) : null}
              <Segments
                compact
                items={Practice.PRACTICE_COUNTS.map((n) => ({ id: n, label: `${n}`, sub: 'questions', open: isOpen(progress, Practice.countItem(d, n)) }))}
                prefix="q"
                value={pr.count}
                onPick={(count) => setPractice({ count })}
                onLocked={(n) => onLocked(Practice.countItem(d, n))}
              />
            </>
          ) : choice.mode === 'single' ? (
            <Segments
              compact
              items={LEVELS.map((l) => ({ id: l.id, label: l.label, open: isOpen(progress, Setup.levelItem(d, l.id)) }))}
              value={level.level}
              onPick={(lv) => onChoose({ level: lv })}
              onLocked={(lv) => onLocked(Setup.levelItem(d, lv))}
            />
          ) : (
            <Segments
              compact
              items={PLAYER_COUNTS.map((n) => ({ id: n, label: `${n} players`, open: playersOpen(progress, n) }))}
              value={choice.players || 2}
              onPick={(players) => onChoose({ players })}
              onLocked={(n) => onLocked(itemFor.players(n))}
            />
          )}
          {choice.mode === 'single' && level.level === 'expert' ? (
            <Segments
              compact
              items={Setup.GAME_TIMERS.map((secs) => ({ id: secs, label: secs ? `⏱️ ${secs} s` : 'No timer', open: !secs || isOpen(progress, Setup.timerItem(d, secs)) }))}
              value={level.timer}
              onPick={(timer) => onChoose({ timer })}
              onLocked={(secs) => onLocked(Setup.timerItem(d, secs))}
            />
          ) : null}
        </Section>

        <Section title="Difficulty">
          <Segments
            columns={3}
            compact={practicing}
            items={DIFFICULTIES.map((x) => ({ id: x.id, label: x.name, sub: practicing ? null : x.dice.replace(' dice', ''), open: difficultyOpen(progress, x.id) }))}
            value={choice.difficulty}
            onPick={(difficulty) => onChoose({ difficulty })}
            onLocked={(id) => onLocked(itemFor.difficulty(id))}
          />
        </Section>

        {practicing ? (
          <Section title="Times tables">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {Practice.tableChoices(d).map((n) => {
                const on = picked.includes(n);
                const open = Practice.tableOpen(progress, n);
                return (
                  <Pressable
                    key={n}
                    testID={`table-${n}`}
                    accessibilityRole="checkbox"
                    accessibilityLabel={`${n} times table${open ? '' : ', locked'}`}
                    accessibilityState={{ checked: on }}
                    onPress={() => (open ? setPractice({ tables: on ? picked.filter((x) => x !== n) : [...picked, n] }) : onLocked(Practice.tableItem(n)))}
                    style={[styles.chip, { backgroundColor: on ? t.accentSoft : t.surface, borderColor: on ? t.accent : t.line, opacity: open ? 1 : 0.5 }]}
                  >
                    <Text style={[styles.chipText, { color: t.ink }]}>{open ? `×${n}` : '🔒'}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Text testID="practice-preview" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={[styles.preview, { color: prPreview ? t.muted : t.bad }]}>
              {prPreview || 'Unlock a times table to practice: tap ×1 to start.'}
            </Text>
          </Section>
        ) : (
          <Section title="Board">
            <Segments compact items={BOARDS.map((n) => ({ id: n, label: `${n}`, open: boardOpen(progress, n) }))} value={choice.size} onPick={(size) => onChoose({ size })} onLocked={(n) => onLocked(itemFor.size(n))} />
            {warning ? <Text testID="board-warning" style={[styles.warning, { color: t.bad }]}>{warning}</Text> : null}
          </Section>
        )}

        {anyLocked ? <Text style={[styles.note, { color: t.muted }]}>🔒 Tap a locked one to see how to unlock it.</Text> : null}
      </ScrollView>
      <View style={styles.bottom}>
        <Button testID="play" title={practicing ? 'Practice' : 'Play'} onPress={onPlay} disabled={Boolean(warning) || (practicing && !prPreview)} />
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

const isOpen = (progress, itemId) => !itemId || Progress.isUnlocked(progress, itemId);

// One row of equal choices (or rows of `columns`); a locked one shows 🔒, and
// tapping it offers it (onLocked). compact: shorter, for the second rows.
// (testIDs are choice-<prefix><id>, so two rows can share an id like 10)
function Segments({ items, value, onPick, onLocked, columns = 0, compact = false, prefix = '' }) {
  const t = useTheme();
  return (
    <View style={[styles.segments, columns ? styles.wrap : null]} accessibilityRole="radiogroup">
      {items.map((it) => {
        const on = it.id === value;
        return (
          <Pressable
            key={it.id}
            testID={`choice-${prefix}${it.id}`}
            accessibilityRole="radio"
            accessibilityLabel={`${it.label}${it.sub ? ` ${it.sub}` : ''}${it.open ? '' : ', locked'}`}
            accessibilityState={{ selected: on }}
            onPress={() => (it.open ? onPick(it.id) : onLocked(it.id))}
            style={({ pressed }) => [
              styles.segment,
              compact ? styles.compact : null,
              columns ? { flexBasis: `${100 / columns - 3}%`, flexGrow: 1 } : null,
              { backgroundColor: on ? t.accentSoft : t.surface, borderColor: on ? t.accent : t.line, opacity: it.open ? 1 : 0.5, transform: [{ scale: pressed ? 0.97 : 1 }] },
            ]}
          >
            <Text style={[styles.segmentText, { color: t.ink }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
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
      {/* the icon over its word, so four fit side by side on a small phone */}
      <Text style={styles.menuIcon}>{label.split(' ')[0]}</Text>
      <Text style={[styles.menuText, { color: t.ink }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
        {label.replace(/^\S+ /, '')}
      </Text>
      {badge ? (
        <View style={[styles.badge, styles.cornerBadge, { backgroundColor: t.bad }]}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function SmallButton({ title, onPress, disabled, testID, badge = 0 }) {
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
      {badge ? (
        <View style={[styles.badge, styles.cornerBadge, { backgroundColor: t.bad }]}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  page: { flexGrow: 1, padding: 16, paddingTop: 10, paddingBottom: 8, gap: 10 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 28, fontWeight: '900' },
  gear: { width: 38, height: 38, borderRadius: 19, borderWidth: StyleSheet.hairlineWidth * 2, alignItems: 'center', justifyContent: 'center' },
  gearText: { fontSize: 18 },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  wallet: { fontSize: 17, fontWeight: '800', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, overflow: 'hidden' },
  shopBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth * 2 },
  badge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  // (on the corner, like an app's badge, so the label keeps its room)
  cornerBadge: { position: 'absolute', top: -7, right: -5 },
  account: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth * 2 },
  accountText: { flex: 1, fontSize: 15 },
  bold: { fontWeight: '700' },
  error: { fontSize: 14, textAlign: 'center' },
  section: { gap: 6 },
  sectionTitle: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  segments: { flexDirection: 'row', gap: 8 },
  wrap: { flexWrap: 'wrap' },
  compact: { minHeight: 36, paddingVertical: 2 },
  warning: { fontSize: 14, lineHeight: 19, fontWeight: '600' },
  chips: { flexDirection: 'row', gap: 6 },
  chip: { minWidth: 46, height: 36, paddingHorizontal: 8, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: 15, fontWeight: '800' },
  preview: { fontSize: 13, lineHeight: 18 },
  segment: { flex: 1, minHeight: 48, paddingVertical: 6, paddingHorizontal: 4, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  segmentText: { fontSize: 16, fontWeight: '700' },
  segmentSub: { fontSize: 12, marginTop: 2 },
  note: { fontSize: 13, textAlign: 'center' },
  bottom: { padding: 16, paddingTop: 8 },
  more: { flexDirection: 'row', gap: 8 },
  menuBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', height: 52, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth * 2 },
  menuIcon: { fontSize: 18, lineHeight: 22 },
  menuText: { fontSize: 13, fontWeight: '700' },
  small: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth * 2 },
  smallText: { fontSize: 15, fontWeight: '700' },
});
