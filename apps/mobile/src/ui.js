// Small shared pieces: buttons, dice and the answer keypad.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Rect } from 'react-native-svg';
import { useTheme } from './theme';

// primary: the one thing to do next (solid, with a soft shadow); secondary:
// everything else (a light fill and a thin edge)
export function Button({ title, onPress, kind = 'primary', disabled = false, style, testID }) {
  const t = useTheme();
  const primary = kind === 'primary';
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary ? [styles.primary, { backgroundColor: t.accentButton, shadowColor: t.accentButton }] : { backgroundColor: t.soft, borderColor: t.line, borderWidth: StyleSheet.hairlineWidth * 2 },
        { opacity: disabled ? 0.45 : 1, transform: [{ scale: pressed && !disabled ? 0.97 : 1 }] },
        style,
      ]}
    >
      {/* (one line: a label that doesn't fit gets smaller rather than cut off, e.g. with larger text) */}
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={[styles.buttonText, { color: primary ? t.accentInk : t.ink }]}>
        {title}
      </Text>
    </Pressable>
  );
}

// Pips for 1 to 6, as on a real die; bigger numbers are written out
const PIPS = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [2, 0], [0, 2], [2, 2]],
  5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
  6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
};

export function Die({ value, size = 56 }) {
  const t = useTheme();
  const pips = PIPS[value];
  return (
    <View style={{ width: size, height: size }} accessibilityLabel={value ? `Die: ${value}` : 'Die'}>
      <Svg width={size} height={size}>
        <Rect x={2} y={2} width={size - 4} height={size - 4} rx={size * 0.18} fill={t.surface} stroke={t.edge} strokeWidth={2} />
        {pips ? pips.map(([c, r], i) => <Circle key={i} cx={size * (0.27 + c * 0.23)} cy={size * (0.27 + r * 0.23)} r={size * 0.08} fill={t.ink} />) : null}
      </Svg>
      {value && !pips ? (
        <View style={StyleSheet.absoluteFill}>
          <Text style={[styles.dieNumber, { color: t.ink, lineHeight: size, fontSize: size * 0.45 }]}>{value}</Text>
        </View>
      ) : null}
    </View>
  );
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0', 'check'];
const LABELS = { back: '⌫', check: '✓' };

export function Keypad({ onKey, disabled }) {
  const t = useTheme();
  return (
    <View style={styles.keypad}>
      {KEYS.map((k) => (
        <Pressable
          key={k}
          testID={`key-${k}`}
          accessibilityRole="button"
          accessibilityLabel={k === 'back' ? 'Delete' : k === 'check' ? 'Check' : k}
          disabled={disabled}
          onPress={() => onKey(k)}
          style={({ pressed }) => [
            styles.key,
            { backgroundColor: k === 'check' ? t.good : t.surface, borderColor: t.line, opacity: disabled ? 0.45 : pressed ? 0.7 : 1 },
          ]}
        >
          <Text style={[styles.keyText, { color: k === 'check' ? '#fff' : t.ink }]}>{LABELS[k] || k}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  button: { height: 52, paddingHorizontal: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  primary: { shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  buttonText: { fontSize: 17, fontWeight: '700', letterSpacing: 0.2 },
  dieNumber: { textAlign: 'center', fontWeight: '800' },
  keypad: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  key: { width: '30%', paddingVertical: 12, borderRadius: 12, borderWidth: 2, alignItems: 'center' },
  keyText: { fontSize: 24, fontWeight: '700' },
});
