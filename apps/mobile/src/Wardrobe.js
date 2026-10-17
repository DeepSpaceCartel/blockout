// The Wardrobe: every look by category, as chips (a preview and its name).
// Owned ones are worn with a tap; locked ones show their price and open the
// unlock sheet; later steps of a chain are blurred placeholders. Titles are
// earned, not bought. The rows are @blockout/progress/wardrobe's, as on the web.
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';
import * as Shop from '@blockout/progress/shop';
import * as Wardrobe from '@blockout/progress/wardrobe';
import { BoardDecor, PatternDefs, boardSkin, diceSkin, hasPattern, keypadSkin, patternFill, useLooks } from './looks';
import { useTheme } from './theme';
import { Die, ScreenHeader } from './ui';

const PREVIEW = 36;

// onWear(categoryId, optionId); onAsk(itemId): a locked look was tapped.
// newKeys: the looks that were new when it opened (for the New filter).
export default function WardrobeScreen({ progress, newKeys, onWear, onAsk, onClose }) {
  const t = useTheme();
  const looks = useLooks();
  const { width } = useWindowDimensions();
  const [onlyNew, setOnlyNew] = useState(false);
  const only = onlyNew ? Wardrobe.availableKeys(progress, newKeys) : null;
  const rows = Wardrobe.wardrobeRows(progress, looks, only);
  const titles = Wardrobe.titleRow(progress, looks, only);
  // three chips a row (four on a wide screen)
  const columns = width >= 600 ? 4 : 3;
  const chipWidth = (Math.min(width, 700) - 32 - 8 * (columns - 1)) / columns - 0.5;

  return (
    <View style={[styles.fill, { backgroundColor: t.bg }]}>
      <ScreenHeader
        title="Wardrobe"
        onClose={onClose}
        right={
          <Text testID="wardrobe-wallet" style={[styles.wallet, { color: t.goldInk, backgroundColor: t.goldBg }]}>
            🪙 {Shop.formatPoints(progress.wallet)}
          </Text>
        }
      />
      <View style={styles.toggle}>
        {[
          [false, 'All'],
          [true, 'New'],
        ].map(([value, label]) => (
          <Pressable
            key={label}
            testID={`wardrobe-${label.toLowerCase()}`}
            accessibilityRole="radio"
            accessibilityState={{ selected: onlyNew === value }}
            onPress={() => setOnlyNew(value)}
            style={[styles.toggleOption, { backgroundColor: onlyNew === value ? t.accentSoft : t.surface, borderColor: onlyNew === value ? t.accent : t.line }]}
          >
            <Text style={[styles.toggleText, { color: t.ink }]}>{label}</Text>
          </Pressable>
        ))}
      </View>
      <ScrollView contentContainerStyle={styles.page}>
        {onlyNew && !rows.length && !titles.length ? <Text style={[styles.empty, { color: t.muted }]}>Nothing new to wear yet. Keep playing to earn points!</Text> : null}
        {rows.map(({ category, options }) => (
          <View key={category.id} style={styles.group}>
            <Text style={[styles.heading, { color: t.muted }]}>{category.name}</Text>
            <View style={styles.chips}>
              {options.map((o) => (
                <Chip key={o.key} o={o} category={category} width={chipWidth} onPress={() => (o.owned ? onWear(category.id, o.option.id) : onAsk(o.item))} />
              ))}
            </View>
          </View>
        ))}
        {titles.length ? (
          <View style={styles.group}>
            <Text style={[styles.heading, { color: t.muted }]}>Your title</Text>
            <View style={styles.chips}>
              {titles.map(({ title, key, earned, worn }) => (
                <Pressable
                  key={key}
                  testID={`look-${key}`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: worn, disabled: !earned }}
                  accessibilityLabel={`${title.name}${earned ? '' : `, locked: ${title.need}`}`}
                  disabled={!earned}
                  onPress={() => onWear('title', title.id)}
                  style={({ pressed }) => [styles.chip, styles.titleChip, chipColors(t, worn), { width: chipWidth, opacity: earned ? 1 : 0.55, transform: [{ scale: pressed ? 0.96 : 1 }] }]}
                >
                  <Text style={[styles.name, { color: t.ink }]} numberOfLines={2}>
                    {title.name}
                  </Text>
                  {earned ? null : (
                    <Text style={[styles.need, { color: t.muted }]} numberOfLines={3}>
                      {title.need}
                    </Text>
                  )}
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const chipColors = (t, worn) => ({ backgroundColor: worn ? t.accentSoft : t.surface, borderColor: worn ? t.accent : t.line });

function Chip({ o, category, width, onPress }) {
  const t = useTheme();
  const tag = o.hidden ? '🔒' : o.season ? `🔒 ${o.season}` : `🔒 ${Shop.formatPoints(o.price)}`;
  return (
    <Pressable
      testID={`look-${o.key}`}
      accessibilityRole="radio"
      accessibilityState={{ selected: o.worn }}
      accessibilityLabel={o.hidden ? 'Locked: unlock the one before it first' : `${o.option.name}${o.owned ? '' : `, locked, ${o.season || `${o.price} points`}`}`}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, chipColors(t, o.worn), { width, transform: [{ scale: pressed ? 0.96 : 1 }] }]}
    >
      {o.hidden ? (
        // a later step of the chain: no preview, no name
        <View style={[styles.skeleton, { backgroundColor: t.soft }]} />
      ) : (
        <View style={{ opacity: o.owned ? 1 : 0.6 }}>
          <Preview category={category.id} option={o.option} />
        </View>
      )}
      <Text style={[styles.name, { color: o.hidden ? t.muted : t.ink }]} numberOfLines={2}>
        {o.hidden ? '???' : o.option.name}
      </Text>
      {o.owned ? null : (
        <Text style={[styles.lock, { color: t.goldInk, backgroundColor: t.goldBg }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
          {tag}
        </Text>
      )}
    </Pressable>
  );
}

// What a look looks like, small
function Preview({ category, option }) {
  const t = useTheme();
  const looks = useLooks();
  const box = { width: PREVIEW, height: PREVIEW };
  if (category === 'dice') return <Die value={5} size={PREVIEW} skin={diceSkin(t, option.id, looks.pips)} />;
  if (category === 'pips') return <Die value={5} size={PREVIEW} skin={diceSkin(t, looks.dice, option.id)} />;
  if (category === 'colors') {
    return (
      <View style={[box, styles.swatches]}>
        {option.colors.map((c) => (
          <View key={c} style={[styles.swatch, { backgroundColor: c }]} />
        ))}
      </View>
    );
  }
  if (category === 'pattern') {
    return (
      <Svg {...box}>
        <PatternDefs kind={option.id} />
        <Rect x={0} y={0} width={PREVIEW} height={PREVIEW} rx={6} fill={t.accent} />
        {hasPattern(option.id) ? <Rect x={0} y={0} width={PREVIEW} height={PREVIEW} rx={6} fill={patternFill(option.id)} /> : null}
      </Svg>
    );
  }
  if (category === 'board') {
    const skin = boardSkin(t, option.id);
    const cell = PREVIEW / 4;
    return (
      <Svg {...box}>
        <Rect x={0} y={0} width={PREVIEW} height={PREVIEW} fill={skin.bg} />
        <BoardDecor kind={skin.decor} side={PREVIEW} cell={cell} />
        {[1, 2, 3].map((i) => [
          <Line key={`v${i}`} x1={i * cell} y1={0} x2={i * cell} y2={PREVIEW} stroke={skin.grid} />,
          <Line key={`h${i}`} x1={0} y1={i * cell} x2={PREVIEW} y2={i * cell} stroke={skin.grid} />,
        ])}
        <Rect x={1} y={1} width={PREVIEW - 2} height={PREVIEW - 2} fill="none" stroke={skin.edge} strokeWidth={2} />
      </Svg>
    );
  }
  if (category === 'keypad') {
    const k = keypadSkin(t, option.id).key;
    return (
      <View style={[box, styles.key, { backgroundColor: k.bg, borderColor: k.edge, borderRadius: keypadSkin(t, option.id).radius / 2 }]}>
        <Text style={[styles.keyText, { color: k.ink }]}>7</Text>
      </View>
    );
  }
  const glyph = category === 'cpu' ? option.avatar : category === 'roll' ? '🎲' : category === 'place' ? '▦' : option.preview || '';
  return (
    <View style={[styles.center, { height: PREVIEW, minWidth: PREVIEW }]}>
      <Text style={[styles.emoji, { color: t.ink }]} numberOfLines={1}>
        {glyph}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  wallet: { fontSize: 16, fontWeight: '800', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, overflow: 'hidden' },
  toggle: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 6 },
  toggleOption: { flex: 1, height: 40, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  toggleText: { fontSize: 15, fontWeight: '800' },
  page: { padding: 16, paddingTop: 6, gap: 18, paddingBottom: 40, maxWidth: 700, width: '100%', alignSelf: 'center' },
  empty: { fontSize: 16, textAlign: 'center', marginTop: 24 },
  group: { gap: 8 },
  heading: { fontSize: 14, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 92, borderRadius: 12, borderWidth: 2, padding: 6, alignItems: 'center', justifyContent: 'center', gap: 4 },
  titleChip: { minHeight: 64 },
  skeleton: { width: PREVIEW, height: PREVIEW, borderRadius: 8 },
  name: { fontSize: 14, fontWeight: '700', textAlign: 'center' },
  need: { fontSize: 11, textAlign: 'center' },
  lock: { fontSize: 12, fontWeight: '800', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, overflow: 'hidden' },
  swatches: { flexDirection: 'row', flexWrap: 'wrap' },
  swatch: { width: PREVIEW / 2, height: PREVIEW / 2 },
  key: { borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  keyText: { fontSize: 18, fontWeight: '800' },
  center: { alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 26 },
});
