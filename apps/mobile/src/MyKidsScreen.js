// A grown-up's children, as on the web game: a card for each (Times Table,
// homework, when they last played) that opens their page, and linking another
// child with the code they (or their teacher) made.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Grownups from '@blockout/progress/grownups';
import * as Account from './account';
import StudentPage from './StudentPage';
import { ErrorLine, Help, MasteryBar, Section, TextBox } from './forms';
import { useTheme } from './theme';
import { Button, ScreenHeader } from './ui';

export default function MyKidsScreen({ user, toast, onClose }) {
  const t = useTheme();
  const [kids, setKids] = useState(null);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(null); // a child's page
  const [code, setCode] = useState('');
  const [linkError, setLinkError] = useState(null);
  const load = () =>
    Account.api('GET', '/api/children')
      .then((r) => setKids(r.children))
      .catch((e) => setError(e.message));
  useEffect(() => {
    if (!open) load();
  }, [open]);

  if (open)
    return (
      <StudentPage
        id={open}
        me={user}
        toast={toast}
        onBack={() => setOpen(null)}
        onDeleted={() => {
          toast('👋 Account deleted', 'Everything in it is gone.');
          setOpen(null);
        }}
      />
    );

  async function link() {
    setLinkError(null);
    try {
      const r = await Account.api('POST', '/api/children', { code: code.replace(/\s+/g, '').toUpperCase() });
      toast('👪 Linked', r.child.name);
      setCode('');
      load();
    } catch (e) {
      setLinkError(e.message);
    }
  }

  return (
    <View style={[styles.fill, { backgroundColor: t.bg }]}>
      <ScreenHeader title="👪 My kids" onClose={onClose} />
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        {error ? <Help>{error}</Help> : !kids ? <ActivityIndicator color={t.accent} /> : null}
        {kids && !kids.length ? <Help>Link your child’s account with a code: your child makes one on their Blockout account page (tap Account on the menu), or their teacher can.</Help> : null}
        {(kids || []).map((c) => (
          <Pressable
            key={c.id}
            testID="kid-card"
            accessibilityRole="button"
            onPress={() => setOpen(c.id)}
            style={({ pressed }) => [styles.card, { backgroundColor: t.surface, borderColor: t.line, transform: [{ scale: pressed ? 0.98 : 1 }] }]}
          >
            <Text style={[styles.name, { color: t.ink }]}>🎒 {c.name}</Text>
            <MasteryBar summary={c.summary} />
            <Text style={[styles.small, { color: t.muted }]}>
              {c.summary.mastered} of {c.summary.total} facts mastered · played {Grownups.ago(c.lastPlayed)}
            </Text>
            <Text style={[styles.small, { color: t.muted }]}>{Grownups.kidHomework(c.homework)}</Text>
          </Pressable>
        ))}
        <Section title="Link a child">
          <View style={styles.form}>
            <TextBox testID="kid-code" value={code} onChangeText={setCode} placeholder="Child’s code" maxLength={9} autoCapitalize="characters" style={styles.flex} onSubmitEditing={link} />
            <Button testID="kid-link" title="Link" onPress={link} disabled={!code.trim()} style={styles.button} />
          </View>
          <ErrorLine error={linkError} testID="kid-error" />
        </Section>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flex: 1 },
  page: { padding: 16, paddingTop: 4, gap: 14, paddingBottom: 40, maxWidth: 700, width: '100%', alignSelf: 'center' },
  card: { borderWidth: 2, borderRadius: 14, padding: 14, gap: 8 },
  name: { fontSize: 19, fontWeight: '900' },
  small: { fontSize: 14 },
  form: { flexDirection: 'row', gap: 8 },
  button: { minWidth: 92 },
});
