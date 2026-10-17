// Settings: the web game's settings and words (@blockout/progress/settings),
// the ones the app's game honours so far. A locked choice shows 🔒; tapping it
// offers its unlock.
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Settings from '@blockout/progress/settings';
import { useTheme } from './theme';
import { ScreenHeader } from './ui';

// (all of them; the order and words are the web game's)
const IN_THE_APP = ['theme', 'firstInCorner', 'diceMode', 'autoRoll', 'fitRolls', 'placeMode', 'cpuSpeed', 'cpuSteps', 'cpuEnd', 'answerTime', 'showProgress', 'timesMastered', 'timesLearning', 'timesPractice'];

// onSet(key, value): pick a choice; onLocked(itemId): a locked one was tapped
export default function SettingsScreen({ progress, settings, onSet, onLocked, onClose }) {
  const t = useTheme();
  const list = Settings.SETTINGS.filter((s) => IN_THE_APP.includes(s.key));
  return (
    <View style={[styles.fill, { backgroundColor: t.bg }]}>
      <ScreenHeader title="Settings" onClose={onClose} />
      <ScrollView contentContainerStyle={styles.page}>
        {list.map((s) => (
          <View key={s.key} style={styles.setting}>
            <Text style={[styles.label, { color: t.ink }]}>{s.label}</Text>
            <View style={styles.options} accessibilityRole="radiogroup" accessibilityLabel={s.label}>
              {s.options.map((o) => {
                const on = String(settings[s.key]) === String(o.value);
                const open = Settings.allowed(progress, s.key, o.value);
                return (
                  <Pressable
                    key={String(o.value)}
                    testID={`setting-${s.key}-${o.value}`}
                    accessibilityRole="radio"
                    accessibilityLabel={`${o.label}${open ? '' : ', locked'}`}
                    accessibilityState={{ selected: on }}
                    onPress={() => (open ? onSet(s.key, o.value) : onLocked(Settings.unlockFor(s.key, o.value)))}
                    style={({ pressed }) => [
                      styles.option,
                      { backgroundColor: on ? t.accentSoft : t.surface, borderColor: on ? t.accent : t.line, opacity: open ? 1 : 0.55, transform: [{ scale: pressed ? 0.97 : 1 }] },
                    ]}
                  >
                    <Text style={[styles.optionText, { color: t.ink }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                      {open ? '' : '🔒 '}
                      {o.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {s.help ? <Text style={[styles.help, { color: t.muted }]}>{s.help}</Text> : null}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  page: { padding: 16, paddingTop: 4, gap: 22, paddingBottom: 40 },
  setting: { gap: 8 },
  label: { fontSize: 17, fontWeight: '800' },
  options: { flexDirection: 'row', gap: 8 },
  option: { flex: 1, minHeight: 44, paddingHorizontal: 6, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  optionText: { fontSize: 15, fontWeight: '700' },
  help: { fontSize: 14, lineHeight: 20 },
});
