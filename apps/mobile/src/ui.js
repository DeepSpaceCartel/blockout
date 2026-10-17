// Small shared pieces: buttons, dice and the answer keypad.
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { useTheme } from './theme';
import { useDiceSkin, useKeypadSkin } from './looks';

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

// A screen's top bar: ✕ back, the title, and something on the right (points)
export function ScreenHeader({ title, onClose, right = null, closeLabel = 'Back to the menu' }) {
  const t = useTheme();
  return (
    <View style={styles.header}>
      <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={closeLabel} hitSlop={10} style={[styles.close, { borderColor: t.line, backgroundColor: t.surface }]}>
        <Text style={[styles.closeText, { color: t.ink }]}>✕</Text>
      </Pressable>
      <Text style={[styles.headerTitle, { color: t.ink }]} numberOfLines={1}>
        {title}
      </Text>
      {right}
    </View>
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

// A die, in the Wardrobe's dice and dots (skin: another look, for previews)
export function Die({ value, size = 56, skin }) {
  const worn = useDiceSkin();
  const k = skin || worn;
  const pips = PIPS[value];
  const grad = `die-${k.id}`;
  return (
    <View style={{ width: size, height: size }} accessibilityLabel={value ? `Die: ${value}` : 'Die'}>
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id={grad} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={k.face[0]} />
            <Stop offset="1" stopColor={k.face[1]} />
          </LinearGradient>
        </Defs>
        <Rect x={2} y={2} width={size - 4} height={size - 4} rx={size * 0.18} fill={`url(#${grad})`} stroke={k.edge} strokeWidth={2} />
        {pips
          ? pips.map(([c, r], i) =>
              k.glyph ? (
                <SvgText key={i} x={size * (0.27 + c * 0.23)} y={size * (0.27 + r * 0.23) + size * 0.065} fontSize={size * 0.18} textAnchor="middle">
                  {k.glyph}
                </SvgText>
              ) : (
                <Circle key={i} cx={size * (0.27 + c * 0.23)} cy={size * (0.27 + r * 0.23)} r={size * 0.08} fill={k.pip} />
              )
            )
          : null}
      </Svg>
      {value && !pips ? (
        <View style={StyleSheet.absoluteFill}>
          <Text style={[styles.dieNumber, { color: k.num, lineHeight: size, fontSize: size * 0.45 }]}>{value}</Text>
        </View>
      ) : null}
    </View>
  );
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0', 'check'];
const LABELS = { back: '⌫', check: '✓' };

// The answer keypad, in the Wardrobe's keypad
export function Keypad({ onKey, disabled }) {
  const k = useKeypadSkin();
  return (
    <View style={styles.keypad}>
      {KEYS.map((key) => {
        const c = k[key] || k.key;
        return (
          <Pressable
            key={key}
            testID={`key-${key}`}
            accessibilityRole="button"
            accessibilityLabel={key === 'back' ? 'Delete' : key === 'check' ? 'Check' : key}
            disabled={disabled}
            onPress={() => onKey(key)}
            style={({ pressed }) => [styles.key, { backgroundColor: c.bg, borderColor: c.edge, borderRadius: k.radius, opacity: disabled ? 0.45 : pressed ? 0.7 : 1 }]}
          >
            <Text style={[styles.keyText, { color: c.ink }, k.mono ? styles.mono : null]}>{LABELS[key] || key}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
  close: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 18, fontWeight: '800' },
  headerTitle: { flex: 1, fontSize: 26, fontWeight: '900' },
  button: { height: 52, paddingHorizontal: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  primary: { shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  buttonText: { fontSize: 17, fontWeight: '700', letterSpacing: 0.2 },
  dieNumber: { textAlign: 'center', fontWeight: '800' },
  keypad: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  key: { width: '30%', paddingVertical: 12, borderRadius: 12, borderWidth: 2, alignItems: 'center' },
  keyText: { fontSize: 24, fontWeight: '700' },
  mono: { fontFamily: Platform.select({ ios: 'Courier New', android: 'monospace', default: 'ui-monospace, monospace' }) },
});
