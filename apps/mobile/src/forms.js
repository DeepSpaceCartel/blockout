// Small pieces for the grown-ups' screens: sections, labelled fields, choices
// as chips (a phone has no drop-downs to speak of), text boxes, an error
// line, asking first, and a child's mastery bar.
import { Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Grownups from '@blockout/progress/grownups';
import { STATUS } from './StatsScreen';
import { useTheme } from './theme';

export function Section({ title, help, children, testID }) {
  const t = useTheme();
  return (
    <View style={styles.section} testID={testID}>
      {title ? <Text style={[styles.heading, { color: t.muted }]}>{title}</Text> : null}
      {help ? <Text style={[styles.help, { color: t.muted }]}>{help}</Text> : null}
      {children}
    </View>
  );
}

export function Help({ children }) {
  const t = useTheme();
  return <Text style={[styles.help, { color: t.muted }]}>{children}</Text>;
}

export function ErrorLine({ error, testID }) {
  const t = useTheme();
  return error ? (
    <Text testID={testID} style={[styles.error, { color: t.bad }]}>
      {error}
    </Text>
  ) : null;
}

export function Field({ label, children }) {
  const t = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: t.ink }]}>{label}</Text>
      {children}
    </View>
  );
}

// options: [[value, label]]; testID: each chip is `${testID}-${value}`
export function Chips({ options, value, onChange, testID }) {
  const t = useTheme();
  return (
    <View style={styles.chips} accessibilityRole="radiogroup">
      {options.map(([v, label]) => {
        const on = String(v) === String(value);
        return (
          <Pressable
            key={String(v)}
            testID={testID ? `${testID}-${v}` : undefined}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(v)}
            style={({ pressed }) => [styles.chip, { backgroundColor: on ? t.accentSoft : t.surface, borderColor: on ? t.accent : t.line, transform: [{ scale: pressed ? 0.96 : 1 }] }]}
          >
            <Text style={[styles.chipText, { color: t.ink }]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function TextBox({ style, ...props }) {
  const t = useTheme();
  return <TextInput placeholderTextColor={t.muted} autoCorrect={false} {...props} style={[styles.input, { color: t.ink, backgroundColor: t.surface, borderColor: t.line }, style]} />;
}

// A row in a list: its words on the left, its buttons on the right
export function Row({ children, right, testID, tone }) {
  const t = useTheme();
  return (
    <View testID={testID} style={[styles.row, { backgroundColor: t.surface, borderColor: tone === 'live' ? t.gold : t.line }]}>
      <View style={styles.rowText}>{children}</View>
      {right}
    </View>
  );
}

// A small button for rows ("Remove", "Grown-ups")
export function SmallButton({ title, onPress, testID, kind = 'secondary', disabled = false }) {
  const t = useTheme();
  const primary = kind === 'primary';
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.small, { backgroundColor: primary ? t.accentButton : t.soft, borderColor: primary ? t.accentButton : t.line, opacity: disabled ? 0.5 : pressed ? 0.7 : 1 }]}
    >
      <Text style={[styles.smallText, { color: primary ? t.accentInk : t.ink }]}>{title}</Text>
    </Pressable>
  );
}

// Ask first; resolves true for yes
export function ask(title, text, yes = 'OK') {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${title}\n\n${text}`));
  return new Promise((resolve) =>
    Alert.alert(title, text, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: yes, style: 'destructive', onPress: () => resolve(true) },
    ])
  );
}

// Mastered / learning / needs practice / not seen, out of the whole table
export function MasteryBar({ summary }) {
  const t = useTheme();
  return (
    <View style={[styles.bar, { backgroundColor: t.soft }]} accessibilityLabel={Grownups.STATUS_ORDER.map(([k, label]) => `${label}: ${summary[k]}`).join(', ')}>
      {Grownups.STATUS_ORDER.map(([k]) => (
        <View key={k} style={{ width: `${(summary[k] / summary.total) * 100}%`, backgroundColor: STATUS[k] || t.soft }} />
      ))}
    </View>
  );
}

// Due dates to pick from: none, tomorrow, in 3 days, a week, two weeks
export function dueChoices(now = new Date()) {
  const inDays = (n) => Grownups.dayString(new Date(now.getTime() + n * 86400000));
  return [
    ['', 'No due date'],
    [inDays(1), 'Tomorrow'],
    [inDays(3), 'In 3 days'],
    [inDays(7), 'In a week'],
    [inDays(14), 'In 2 weeks'],
  ];
}

export const styles = StyleSheet.create({
  section: { gap: 8 },
  heading: { fontSize: 14, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  help: { fontSize: 15, lineHeight: 21 },
  error: { fontSize: 15, fontWeight: '600' },
  field: { gap: 6 },
  label: { fontSize: 15, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { minHeight: 40, paddingHorizontal: 12, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: 15, fontWeight: '700' },
  input: { height: 50, minWidth: 0, borderWidth: 2, borderRadius: 12, paddingHorizontal: 12, fontSize: 17, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderWidth: 2, borderRadius: 12 },
  rowText: { flex: 1, gap: 3 },
  small: { minHeight: 38, paddingHorizontal: 12, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  smallText: { fontSize: 14, fontWeight: '800' },
  bar: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden' },
});
