// A student's homework, as on the web game (@blockout/progress/homework):
// late first, each with how far along it is and who set it. Play › sets the
// menu up for it and starts.
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Homework from '@blockout/progress/homework';
import * as Account from './account';
import { useTheme } from './theme';
import { Button, ScreenHeader } from './ui';

// onPlay(goal); onCount(n): how many are still to do (the menu's badge)
export default function HomeworkScreen({ onPlay, onCount, onClose }) {
  const t = useTheme();
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
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
        {error ? <Text style={[styles.help, { color: t.muted }]}>{error}</Text> : !items ? <ActivityIndicator color={t.accent} /> : null}
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
  row: { borderWidth: 2, borderRadius: 14, padding: 12, gap: 8 },
  top: { gap: 2 },
  label: { fontSize: 17, fontWeight: '800' },
  state: { fontSize: 14, fontWeight: '700' },
  bar: { height: 10, borderRadius: 5, overflow: 'hidden' },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  metaText: { flex: 1, fontSize: 14 },
  play: { height: 44, minWidth: 92 },
});
