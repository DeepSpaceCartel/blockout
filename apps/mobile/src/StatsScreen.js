// Stats: the same report as the web game's (@blockout/progress/stats), laid
// out for a phone: tiles, a card per game type, the Times Table and the facts
// to practice, and the recent games.
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Stats from '@blockout/progress/stats';
import * as Views from '@blockout/progress/views';
import { loadHistory } from './history';
import { useTheme } from './theme';
import { ScreenHeader } from './ui';

// The fact statuses' colours (the web grid's)
const STATUS = { mastered: '#2a9d5c', learning: '#f2c94c', practice: '#d64533', unseen: null };

export default function StatsScreen({ progress, onClose }) {
  const t = useTheme();
  const [history, setHistory] = useState(null);
  useEffect(() => {
    loadHistory().then(setHistory);
  }, []);
  if (!history) return <View style={[styles.fill, { backgroundColor: t.bg }]} />;
  const report = Stats.statsReport(history, progress);
  return (
    <View style={[styles.fill, { backgroundColor: t.bg }]}>
      <ScreenHeader title="Stats" onClose={onClose} />
      <ScrollView contentContainerStyle={styles.page}>
        {report.empty ? (
          <Text testID="stats-empty" style={[styles.empty, { color: t.muted }]}>
            No games or practice yet. Play one and your stats will show up here!
          </Text>
        ) : null}
        {report.tiles.length ? (
          <View style={styles.tiles}>
            {report.tiles.map((tile) => (
              <View key={tile.label} style={[styles.tile, { backgroundColor: t.surface, borderColor: t.line }]}>
                <Text testID="stats-tile" style={[styles.tileValue, { color: t.ink }]} numberOfLines={1} adjustsFontSizeToFit>
                  {tile.value}
                </Text>
                <Text style={[styles.tileLabel, { color: t.muted }]}>{tile.label}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {report.tables.map((table) => (
          <View key={table.heading} style={styles.group}>
            <Text style={[styles.groupTitle, { color: t.muted }]}>{table.heading}</Text>
            {table.rows.map((row) => (
              <View key={`${row.title}${row.sub}`} style={[styles.card, { backgroundColor: t.surface, borderColor: t.line }]}>
                <Text style={[styles.cardTitle, { color: t.ink }]}>
                  {row.title} <Text style={{ color: t.muted, fontWeight: '600' }}>· {row.sub}</Text>
                </Text>
                <View style={styles.values}>
                  {table.columns.map((col, i) => (
                    <View key={col} style={styles.value}>
                      <Text style={[styles.valueNum, { color: t.ink }]}>{String(row.values[i])}</Text>
                      <Text style={[styles.valueLabel, { color: t.muted }]}>{col}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>
        ))}
        {report.players.length ? (
          <View style={styles.group}>
            <Text style={[styles.groupTitle, { color: t.muted }]}>Times Table</Text>
            <View style={styles.legend}>
              {Object.entries(Stats.FACT_STATUS).map(([status, { mark, label }]) => (
                <View key={status} style={styles.legendItem}>
                  <View style={[styles.legendCell, { backgroundColor: STATUS[status] || t.soft }]}>
                    <Text style={styles.cellMark}>{mark}</Text>
                  </View>
                  <Text style={[styles.small, { color: t.ink }]}>{label}</Text>
                </View>
              ))}
            </View>
            {report.players.map((p) => (
              <PlayerTable key={p.name} progress={progress} player={p} />
            ))}
          </View>
        ) : null}
        {report.recent.length ? (
          <View style={styles.group}>
            <Text style={[styles.groupTitle, { color: t.muted }]}>Recent games</Text>
            {report.recent.map((line, i) => (
              <View key={i} style={[styles.recent, { borderColor: t.line }]}>
                <Text style={[styles.small, { color: t.muted }]}>{line.meta}</Text>
                <Text style={[styles.recentText, { color: t.ink }]}>
                  {line.text} · <Text style={{ fontWeight: '800' }}>{line.winner}</Text>
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

// One player's grid, then the facts they miss most
function PlayerTable({ progress, player }) {
  const t = useTheme();
  const facts = Stats.playerFacts(progress, player.name);
  const grid = Stats.factGrid(facts, { unlocked: Views.tableSize(progress) });
  const practice = Stats.factsToPractice(facts);
  return (
    <View style={styles.player}>
      {player.label ? <Text style={[styles.cardTitle, { color: t.ink }]}>{player.label}</Text> : null}
      <View style={styles.grid} accessibilityLabel={`Times Table up to ${grid.max} × ${grid.max}`}>
        <View style={styles.gridRow}>
          <Cell text="×" t={t} />
          {grid.heads.map((h) => (
            <Cell key={h.n} text={h.mastered ? `★${h.n}` : String(h.n)} t={t} gold={h.mastered} />
          ))}
        </View>
        {grid.cells.map((row, r) => (
          <View key={r} style={styles.gridRow}>
            <Cell text={grid.heads[r].mastered ? `★${r + 1}` : String(r + 1)} t={t} gold={grid.heads[r].mastered} />
            {row.map((c) => (
              <View key={c.b} accessibilityLabel={c.detail} style={[styles.cell, styles.fact, { backgroundColor: STATUS[c.status] || t.soft }]}>
                <Text style={styles.cellMark}>{c.mark}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>
      <Text style={[styles.cardTitle, { color: t.ink }]}>{player.label ? `${player.label}: facts to practice` : 'Facts to practice'}</Text>
      {practice.length ? (
        practice.map((f) => (
          <View key={f.fact} style={[styles.card, { backgroundColor: t.surface, borderColor: t.line }]}>
            <Text style={[styles.cardTitle, { color: t.ink }]}>
              {f.fact} <Text style={{ color: t.bad }}>· missed {f.count}×</Text>
            </Text>
            <Text style={[styles.small, { color: t.muted }]}>
              {f.rate}
              {f.answers && f.answers.length ? ` · said ${f.answers.slice(-3).join(', ')}` : ''}
            </Text>
          </View>
        ))
      ) : (
        <Text style={[styles.small, { color: t.muted }]}>{Object.keys(facts).length ? 'Nothing missed so far! 🌟' : 'No answers yet.'}</Text>
      )}
    </View>
  );
}

function Cell({ text, t, gold = false }) {
  return (
    <View style={styles.cell}>
      <Text style={[styles.head, { color: gold ? t.goldInk : t.muted }]} numberOfLines={1} adjustsFontSizeToFit>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  page: { padding: 16, paddingTop: 4, gap: 18, paddingBottom: 40 },
  empty: { fontSize: 16, textAlign: 'center', marginTop: 24, lineHeight: 22 },
  tiles: { flexDirection: 'row', gap: 8 },
  tile: { flex: 1, padding: 10, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth * 2, alignItems: 'center', gap: 2 },
  tileValue: { fontSize: 22, fontWeight: '900' },
  tileLabel: { fontSize: 12, textAlign: 'center' },
  group: { gap: 8 },
  groupTitle: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  card: { padding: 12, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth * 2, gap: 8 },
  cardTitle: { fontSize: 16, fontWeight: '800' },
  values: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 },
  value: { width: '33%' },
  valueNum: { fontSize: 17, fontWeight: '800' },
  valueLabel: { fontSize: 12 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendCell: { width: 22, height: 22, borderRadius: 5, alignItems: 'center', justifyContent: 'center' },
  small: { fontSize: 13, lineHeight: 18 },
  player: { gap: 10 },
  grid: { gap: 2 },
  gridRow: { flexDirection: 'row', gap: 2 },
  cell: { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  head: { fontSize: 12, fontWeight: '800' },
  fact: { borderRadius: 3 },
  cellMark: { color: '#fff', fontSize: 11, fontWeight: '900' },
  recent: { paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, gap: 2 },
  recentText: { fontSize: 15 },
});
