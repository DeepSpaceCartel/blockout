// Homework, as on the web game: today's practice first (everyone, guests
// too: @blockout/progress/daily), then a student's homework
// (@blockout/progress/homework), late first, each with how far along it is
// and who set it. Play › sets the menu up for it and starts.
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Homework from '@blockout/progress/homework';
import * as Daily from '@blockout/progress/daily';
import * as Account from './account';
import { useTheme } from './theme';
import { Button, ScreenHeader } from './ui';

// student: signed in as one (else only today's practice); onPlay(goal);
// onDaily(): today's practice; onCount(n): homework still to do (the menu's badge)
export default function HomeworkScreen({ progress, student, onPlay, onDaily, onCount, onClose }) {
  const t = useTheme();
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
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
        <View testID="daily" style={[styles.row, styles.daily, { backgroundColor: daily.done ? t.surface : t.goldBg, borderColor: daily.done ? t.line : t.gold }]}>
          <View style={[styles.top, styles.flex]}>
            <Text style={[styles.label, { color: t.ink }]}>
              {daily.title} {daily.reward ? <Text style={{ color: t.goldInk }}>{daily.reward}</Text> : null}
            </Text>
            <Text testID="daily-text" style={[styles.task, { color: daily.done ? t.muted : t.ink }]}>
              {daily.text}
            </Text>
            {daily.done ? null : <Text style={[styles.state, { color: t.muted }]}>{daily.why}</Text>}
            {daily.streak ? <Text style={[styles.state, { color: t.goldInk }]}>{daily.streak}</Text> : null}
          </View>
          {daily.done ? null : <Button testID="daily-play" title="Play ›" onPress={onDaily} style={styles.play} />}
        </View>
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
  daily: { flexDirection: 'row', alignItems: 'center', gap: 10 },
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
