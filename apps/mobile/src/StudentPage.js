// One child, for their teacher or grown-up (as on the web game): their
// Times Table, homework (yours can come off; set more), and what they played
// lately. A parent can also delete their child's account. The words and rules
// are shared (@blockout/progress/grownups, /homework).
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Grownups from '@blockout/progress/grownups';
import * as Homework from '@blockout/progress/homework';
import * as Account from './account';
import { FactGrid } from './StatsScreen';
import { Chips, ErrorLine, Field, Help, MasteryBar, Row, Section, SmallButton, TextBox, ask, dueChoices } from './forms';
import { useTheme } from './theme';
import { Button, ScreenHeader } from './ui';

// me: the signed-in teacher or parent; onBack(); onDeleted() (a parent deleted the account)
export default function StudentPage({ id, me, toast, onBack, onDeleted }) {
  const t = useTheme();
  const [s, setS] = useState(null);
  const [error, setError] = useState(null);
  const load = () =>
    Account.api('GET', `/api/students/${id}`)
      .then(setS)
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, [id]);

  async function remove(h) {
    if (!(await ask(`Remove “${h.label}”?`, 'It comes off their homework list.', 'Remove'))) return;
    await Account.api('DELETE', `/api/homework/${h.id}`).catch((e) => toast('⚠️ Couldn’t remove it', e.message));
    load();
  }

  return (
    <View style={[styles.fill, { backgroundColor: t.bg }]}>
      <ScreenHeader title={s ? s.name : 'Student'} onClose={onBack} closeLabel="Back" />
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        {error ? <Help>{error}</Help> : !s ? <ActivityIndicator color={t.accent} /> : null}
        {s ? (
          <>
            <Help>Last played {Grownups.ago(s.lastPlayed)}</Help>
            <Section title="Times Table">
              <View style={styles.counts}>
                {Grownups.STATUS_ORDER.map(([k, label]) => (
                  <Text key={k} style={[styles.count, { color: t.ink }]}>
                    {s.summary[k]} {label.toLowerCase()}
                  </Text>
                ))}
              </View>
              <MasteryBar summary={s.summary} />
              {s.facts ? <FactGrid facts={s.facts} size={12} unlocked={12} /> : null}
              {s.summary.needsPractice.length ? (
                <>
                  <Help>Needs practice:</Help>
                  <View style={styles.chips}>
                    {s.summary.needsPractice.map((f) => (
                      <Text key={f} style={[styles.fact, { color: t.bad, borderColor: t.bad }]}>
                        {f}
                      </Text>
                    ))}
                  </View>
                </>
              ) : null}
            </Section>
            <Section title="Homework">
              {!s.assignments.length ? <Help>No homework.</Help> : null}
              {s.assignments.map((h) => {
                const row = Homework.homeworkRow(h);
                return (
                  <Row key={h.id} testID="student-homework" right={Grownups.canRemove(h, me) ? <SmallButton title="Remove" onPress={() => remove(h)} /> : null}>
                    <Text style={[styles.strong, { color: t.ink }]}>{row.label}</Text>
                    <Text style={[styles.small, { color: t.muted }]}>
                      {row.state} · {row.have} of {row.need} · {row.from}
                    </Text>
                  </Row>
                );
              })}
              <HomeworkForm
                options={s.options}
                who={s.name}
                toast={toast}
                onSubmit={async ({ goal, due }) => {
                  await Account.api('POST', '/api/homework', { studentId: s.id, goal, due });
                  load();
                }}
              />
            </Section>
            <Section title="Recently">
              {!s.recent.length ? <Help>Nothing played yet.</Help> : null}
              {s.recent.map((e, i) => (
                <View key={i} style={[styles.recent, { borderColor: t.line }]}>
                  <Text style={[styles.recentText, { color: t.ink }]}>{Grownups.activityText(e)}</Text>
                  <Text style={[styles.small, { color: t.muted }]}>{Grownups.ago(e.t)}</Text>
                </View>
              ))}
            </Section>
            {me.role === 'parent' ? <DeleteChild child={s} onDeleted={onDeleted} /> : null}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

// Set homework: what it is, its details, when it's due. Only what the child
// (or every child in a class) can play already: options from the server.
export function HomeworkForm({ options, who, toast, onSubmit }) {
  const t = useTheme();
  const c = Grownups.homeworkChoices(options);
  const [v, setV] = useState(c.start);
  const [due, setDue] = useState(dueChoices()[3][0]); // (a week)
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const uses = Grownups.homeworkFields(v.type);
  const set = (part) => setV((now) => ({ ...now, ...part }));
  const go = async () => {
    setError(null);
    setBusy(true);
    const goal = Grownups.goalFrom(v);
    try {
      await onSubmit({ goal, due: due || null });
      toast(...Grownups.homeworkSet(goal));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={[styles.form, { backgroundColor: t.paper, borderColor: t.line }]}>
      <Text style={[styles.strong, { color: t.ink }]}>Add homework</Text>
      <Field label="Homework">
        <Chips testID="hw-type" options={c.kinds} value={v.type} onChange={(type) => set({ type })} />
      </Field>
      {uses.table ? (
        <Field label="Table">
          <Chips testID="hw-table" options={c.tables.map((n) => [n, `×${n}`])} value={v.table} onChange={(table) => set({ table })} />
        </Field>
      ) : null}
      {uses.rounds ? (
        <Field label="Rounds">
          <Chips testID="hw-rounds" options={Grownups.HOMEWORK_COUNTS.map((n) => [n, String(n)])} value={v.rounds} onChange={(rounds) => set({ rounds })} />
        </Field>
      ) : null}
      {uses.games ? (
        <Field label="Games">
          <Chips testID="hw-games" options={Grownups.HOMEWORK_COUNTS.map((n) => [n, String(n)])} value={v.games} onChange={(games) => set({ games })} />
        </Field>
      ) : null}
      {uses.size ? (
        <Field label="Board">
          <Chips testID="hw-size" options={c.boards.map((n) => [n, `${n}×${n}`])} value={v.size} onChange={(size) => set({ size })} />
        </Field>
      ) : null}
      {uses.difficulty ? (
        <Field label="Difficulty">
          <Chips testID="hw-difficulty" options={c.difficulties} value={v.difficulty} onChange={(difficulty) => set({ difficulty })} />
        </Field>
      ) : null}
      <Field label="Due">
        <Chips testID="hw-due" options={dueChoices()} value={due} onChange={setDue} />
      </Field>
      <Help>{Grownups.homeworkNote(who)}</Help>
      <ErrorLine error={error} />
      <Button testID="hw-set" title={busy ? 'Setting it…' : 'Set homework'} onPress={go} disabled={busy} />
    </View>
  );
}

// A parent deletes their child's account: typed, because it can't be undone
function DeleteChild({ child, onDeleted }) {
  const t = useTheme();
  const first = child.name.split(' ')[0];
  const [asking, setAsking] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState(null);
  if (!asking) return <Button testID="delete-child" kind="secondary" title={`Delete ${child.name}’s account`} onPress={() => setAsking(true)} />;
  const sure = typed.trim().toLowerCase() === first.toLowerCase();
  return (
    <View style={[styles.form, { borderColor: t.bad }]}>
      <Text style={[styles.help, { color: t.ink }]}>
        Delete {child.name}’s Blockout account, with their progress, classes and homework? This can’t be undone. Type {first} to go ahead.
      </Text>
      <TextBox testID="delete-child-typed" value={typed} onChangeText={setTyped} placeholder={first} autoCapitalize="words" />
      <ErrorLine error={error} />
      <View style={styles.buttons}>
        <Button kind="secondary" title="Cancel" onPress={() => setAsking(false)} style={styles.flex} />
        <Button
          testID="delete-child-confirm"
          title="Delete"
          disabled={!sure}
          style={[styles.flex, { backgroundColor: t.bad, shadowColor: t.bad }]}
          onPress={async () => {
            try {
              await Account.api('DELETE', `/api/students/${child.id}`);
              onDeleted();
            } catch (e) {
              setError(e.message);
            }
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flex: 1 },
  page: { padding: 16, paddingTop: 4, gap: 22, paddingBottom: 40, maxWidth: 700, width: '100%', alignSelf: 'center' },
  help: { fontSize: 15, lineHeight: 21 },
  counts: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 4 },
  count: { fontSize: 15, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  fact: { fontSize: 14, fontWeight: '800', borderWidth: 2, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden' },
  strong: { fontSize: 16, fontWeight: '800' },
  small: { fontSize: 13, lineHeight: 18 },
  form: { borderWidth: 2, borderRadius: 14, padding: 12, gap: 12 },
  recent: { paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, gap: 2 },
  recentText: { fontSize: 15 },
  buttons: { flexDirection: 'row', gap: 8 },
});
