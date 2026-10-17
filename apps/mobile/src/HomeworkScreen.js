// Homework, as on the web game: today's practice first (everyone, guests
// too: @blockout/progress/daily: three cards to pick from, and new ones for
// points), then a student's homework
// (@blockout/progress/homework), late first, each with how far along it is
// and who set it. Play › sets the menu up for it and starts.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Homework from '@blockout/progress/homework';
import * as Daily from '@blockout/progress/daily';
import * as Account from './account';
import { useTheme } from './theme';
import { Button, ScreenHeader } from './ui';

// student: signed in as one (else only today's practice); onPlay(goal);
// onDaily(i): today's practice, its card i; onReroll(): new cards (true when
// dealt); onCount(n): homework still to do (the menu's badge)
export default function HomeworkScreen({ progress, student, onPlay, onDaily, onReroll, onCount, onClose }) {
  const t = useTheme();
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [, setDealt] = useState(0); // (new cards: draw them)
  const daily = Daily.card(progress);
  useEffect(() => {
    if (!student) return;
    Account.api('GET', '/api/me/homework')
      .then(({ homework }) => {
        setItems(homework);
        onCount(Homework.openCount(homework));
      })
      .catch((e) => setError(e.message));
  }, []);
  return (
    <View style={[styles.fill, { backgroundColor: t.bg }]}>
      <ScreenHeader title="Homework" onClose={onClose} />
      <ScrollView contentContainerStyle={styles.page}>
        <Text style={[styles.heading, { color: t.muted }]}>⭐ Today’s practice</Text>
        <View testID="daily" style={styles.top}>
          <Text style={[styles.label, { color: t.ink }]}>
            {daily.title} {daily.reward ? <Text style={{ color: t.goldInk }}>{daily.reward}</Text> : null}
          </Text>
          {daily.streak ? <Text style={[styles.state, { color: t.goldInk }]}>{daily.streak}</Text> : null}
          {daily.done ? (
            <Text testID="daily-text" style={[styles.task, { color: t.muted }]}>
              {daily.doneText}
            </Text>
          ) : null}
        </View>
        {/* three cards to pick from, like a level-up's: tapping one plays it */}
        {daily.cards.map((card, i) => (
          <Pressable
            key={i}
            testID="daily-card"
            accessibilityRole="button"
            accessibilityLabel={`Play: ${card.text}. ${card.why}`}
            onPress={() => onDaily(i)}
            style={({ pressed }) => [styles.row, styles.daily, { backgroundColor: t.goldBg, borderColor: t.gold, transform: [{ scale: pressed ? 0.97 : 1 }] }]}
          >
            <Text style={styles.icon}>{card.icon}</Text>
            <View style={[styles.top, styles.flex]}>
              <Text style={[styles.task, { color: t.ink }]}>{card.text}</Text>
              <Text style={[styles.state, { color: t.muted }]}>{card.why}</Text>
            </View>
            <Text style={[styles.go, { color: t.goldInk }]}>Play ›</Text>
          </Pressable>
        ))}
        {daily.done ? null : <Button testID="daily-reroll" kind="secondary" title={daily.reroll.label} disabled={!daily.reroll.can} onPress={() => onReroll() && setDealt((n) => n + 1)} />}
        <Text style={[styles.heading, { color: t.muted }]}>From your teacher</Text>
        {!student ? <Text style={[styles.help, { color: t.muted }]}>Sign in with your school account to see homework from your teacher or a grown-up.</Text> : null}
        {!student ? null : error ? <Text style={[styles.help, { color: t.muted }]}>{error}</Text> : !items ? <ActivityIndicator color={t.accent} /> : null}
        {items ? (
          <Text testID="homework-intro" style={[styles.help, { color: t.muted }]}>
            {Homework.homeworkIntro(items)}
          </Text>
        ) : null}
        {(items ? Homework.homeworkRows(items) : []).map((row, i) => (
          <View key={row.h.id || i} testID="homework-row" style={[styles.row, { backgroundColor: t.surface, borderColor: row.h.status === 'late' ? t.bad : t.line, opacity: row.playable ? 1 : 0.7 }]}>
            <View style={styles.top}>
              <Text style={[styles.label, { color: t.ink }]}>{row.label}</Text>
              <Text style={[styles.state, { color: row.h.status === 'late' ? t.bad : row.h.status === 'done' ? t.goodInk : t.muted }]}>{row.state}</Text>
            </View>
            <View style={[styles.bar, { backgroundColor: t.soft }]}>
              <View style={{ width: `${(row.have / row.need) * 100}%`, height: '100%', backgroundColor: t.good, borderRadius: 5 }} />
            </View>
            <View style={styles.meta}>
              <Text style={[styles.metaText, { color: t.muted }]}>
                {row.have} of {row.need} · {row.from}
              </Text>
              {row.playable ? <Button testID="homework-play" title="Play ›" onPress={() => onPlay(row.h.goal)} style={styles.play} /> : null}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  page: { padding: 16, paddingTop: 4, gap: 12, paddingBottom: 40, maxWidth: 700, width: '100%', alignSelf: 'center' },
  help: { fontSize: 15, lineHeight: 21 },
  heading: { fontSize: 14, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 6 },
  daily: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { fontSize: 30 },
  go: { fontSize: 15, fontWeight: '900' },
  flex: { flex: 1 },
  task: { fontSize: 16, fontWeight: '700' },
  row: { borderWidth: 2, borderRadius: 14, padding: 12, gap: 8 },
  top: { gap: 2 },
  label: { fontSize: 17, fontWeight: '800' },
  state: { fontSize: 14, fontWeight: '700' },
  bar: { height: 10, borderRadius: 5, overflow: 'hidden' },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  metaText: { flex: 1, fontSize: 14 },
  play: { height: 44, minWidth: 92 },
});
