// Achievements and Stickers, drawn from @blockout/progress/views (the same
// lists and words as the web game).
import { useEffect } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Shop from '@blockout/progress/shop';
import * as Views from '@blockout/progress/views';
import { useTheme } from './theme';
import { Button, ScreenHeader } from './ui';

// The fact speed tiers' colours: bronze, silver, gold
const SPEED = { 10: '#c98a4b', 5: '#9aa3ad', 1: '#e0a800' };

export function AchievementsScreen({ progress, onClose }) {
  const t = useTheme();
  const list = Views.achievementGroups(progress);
  const fs = Views.factSpeed(progress);
  return (
    <View style={[styles.fill, { backgroundColor: t.bg }]}>
      <ScreenHeader title="Achievements" onClose={onClose} />
      <ScrollView contentContainerStyle={styles.page}>
        <Text testID="achievements-summary" style={[styles.summary, { color: t.muted }]}>
          {list.earned} of {list.total} earned
        </Text>
        {list.groups.map((g) => (
          <View key={g.name} style={styles.group}>
            <Text style={[styles.groupTitle, { color: t.muted }]}>
              {g.name} · {g.earned} of {g.total}
            </Text>
            {g.note ? <Text style={[styles.note, { color: t.muted }]}>{g.note}</Text> : null}
            {g.rows.map((r) => (
              <View key={r.id} testID={`achievement-${r.id}`} style={[styles.row, { backgroundColor: r.earned ? t.goldBg : t.surface, borderColor: r.earned ? t.gold : t.line }]}>
                <Text style={[styles.icon, { opacity: r.earned ? 1 : 0.45 }]}>{r.icon || '🔒'}</Text>
                <View style={styles.rowText}>
                  <Text style={[styles.name, { color: t.ink }]}>{r.name}</Text>
                  <Text style={[styles.desc, { color: t.muted }]}>{r.desc}</Text>
                </View>
                <Text style={[styles.right, { color: r.earned ? t.goldInk : t.muted }]}>{r.right}</Text>
              </View>
            ))}
          </View>
        ))}
        <View style={styles.group}>
          <Text style={[styles.groupTitle, { color: t.muted }]}>
            Fact speed · {fs.earned} of {fs.total}
          </Text>
          <Text style={[styles.note, { color: t.muted }]}>{fs.note}</Text>
          <View style={styles.legend}>
            {fs.tiers.map((tier) => (
              <View key={tier.secs} style={styles.legendItem}>
                <View style={[styles.legendCell, { backgroundColor: SPEED[tier.secs] }]}>
                  <Text style={styles.legendNum}>{tier.secs}</Text>
                </View>
                <Text style={[styles.desc, { color: t.ink }]}>
                  Under {tier.secs} s: {tier.count}
                </Text>
              </View>
            ))}
          </View>
          <FactGrid fs={fs} />
        </View>
      </ScrollView>
    </View>
  );
}

// size × size cells with the times table along the edges
function FactGrid({ fs }) {
  const t = useTheme();
  const head = (text, key) => (
    <View key={key} style={styles.cell}>
      <Text style={[styles.head, { color: t.muted }]}>{text}</Text>
    </View>
  );
  return (
    <View style={styles.grid} accessibilityLabel={`Fact speed, up to ${fs.size} × ${fs.size}`}>
      <View style={styles.gridRow}>
        {head('×', 'corner')}
        {fs.cells[0].map((c) => head(String(c.b), `h${c.b}`))}
      </View>
      {fs.cells.map((row, r) => (
        <View key={r} style={styles.gridRow}>
          {head(String(r + 1), `r${r}`)}
          {row.map((c) => (
            <View key={c.b} style={[styles.cell, styles.fact, { backgroundColor: c.best ? SPEED[c.best] : t.soft }]}>
              {c.best ? <Text style={styles.factNum}>{c.best}</Text> : null}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

// onSeen(ids): they've been looked at (clears the menu badge); onSwap(): spares for points
export function StickersScreen({ progress, onClose, onSeen, onSwap }) {
  const t = useTheme();
  const album = Views.stickerAlbum(progress);
  useEffect(() => {
    onSeen(Object.keys(progress.stickers || {}));
  }, []);
  return (
    <View style={[styles.fill, { backgroundColor: t.bg }]}>
      <ScreenHeader title="Stickers" onClose={onClose} />
      <ScrollView contentContainerStyle={styles.page}>
        <Text testID="stickers-summary" style={[styles.summary, { color: t.muted }]}>
          {album.got} of {album.total} collected
        </Text>
        <Text style={[styles.note, { color: t.muted }]}>Every achievement drops a sticker. Swap the spares for points!</Text>
        {album.sections.map((section) => (
          <View key={section.rarity} style={styles.group}>
            <Text style={[styles.groupTitle, { color: t.muted }]}>{section.name}</Text>
            <View style={styles.album}>
              {section.slots.map((st) => (
                <View key={st.id} accessibilityLabel={st.count ? `${st.id}, ${section.name}${st.count > 1 ? `, ${st.count}` : ''}` : 'Not found yet'} style={[styles.slot, { backgroundColor: st.count ? t.surface : t.soft, borderColor: st.count ? RARITY[section.rarity] : t.line }]}>
                  <Text style={[styles.sticker, { opacity: st.count ? 1 : 0.35, color: t.muted }]}>{st.emoji || '?'}</Text>
                  {st.count > 1 ? (
                    <View style={[styles.count, { backgroundColor: t.ink }]}>
                      <Text style={[styles.countText, { color: t.bg }]}>×{st.count}</Text>
                    </View>
                  ) : null}
                </View>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
      <View style={styles.bottom}>
        <Button testID="swap-spares" title={album.spareValue ? `Swap spares for 🪙 ${Shop.formatPoints(album.spareValue)}` : 'No spares to swap'} onPress={onSwap} disabled={!album.spareValue} />
      </View>
    </View>
  );
}

const RARITY = { common: '#9aa3ad', rare: '#2e86de', epic: '#8e5bd6' };

const styles = StyleSheet.create({
  fill: { flex: 1 },
  page: { padding: 16, paddingTop: 4, gap: 18, paddingBottom: 40 },
  summary: { fontSize: 16, fontWeight: '700' },
  group: { gap: 8 },
  groupTitle: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  note: { fontSize: 14, lineHeight: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth * 2 },
  icon: { fontSize: 26, width: 34, textAlign: 'center' },
  rowText: { flex: 1, gap: 2 },
  name: { fontSize: 16, fontWeight: '700' },
  desc: { fontSize: 14, lineHeight: 19 },
  right: { fontSize: 14, fontWeight: '700' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendCell: { width: 24, height: 24, borderRadius: 5, alignItems: 'center', justifyContent: 'center' },
  legendNum: { color: '#fff', fontSize: 12, fontWeight: '800' },
  grid: { gap: 3 },
  gridRow: { flexDirection: 'row', gap: 3 },
  cell: { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  head: { fontSize: 13, fontWeight: '700' },
  fact: { borderRadius: 4 },
  factNum: { color: '#fff', fontSize: 11, fontWeight: '800' },
  album: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  slot: { width: 64, height: 64, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  sticker: { fontSize: 32 },
  count: { position: 'absolute', right: -6, top: -6, minWidth: 26, height: 20, borderRadius: 10, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  countText: { fontSize: 12, fontWeight: '800' },
  bottom: { padding: 16, paddingTop: 8 },
});
