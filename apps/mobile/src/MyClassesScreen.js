// A teacher's classes, as on the web game: a tab for each (and a new one),
// then the class's join code (with its link's QR code), its students (their
// Times Table, homework and grown-ups), the class's homework, planned
// tournaments, and codes for other teachers. Hosting a live game is its own
// screen (onHost). The words and rules are shared (@blockout/progress/grownups).
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import * as Grownups from '@blockout/progress/grownups';
import * as Homework from '@blockout/progress/homework';
import * as Account from './account';
import { CodeCard, Qr } from './AccountScreen';
import StudentPage, { HomeworkForm } from './StudentPage';
import { Chips, ErrorLine, Field, Help, MasteryBar, Row, Section, SmallButton, TextBox, ask } from './forms';
import { useTheme } from './theme';
import { Button, ScreenHeader } from './ui';

const SERVER = Constants.expoConfig.extra.server;

// onHost(): set up a live game; onOpenLobby({ code, teacherKey }): a planned tournament's lobby
export default function MyClassesScreen({ user, toast, onHost, onOpenLobby, onClose }) {
  const t = useTheme();
  const [classes, setClasses] = useState(null);
  const [current, setCurrent] = useState(null);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(null); // { student } or { grownUps: student }
  const [name, setName] = useState('');
  const [addError, setAddError] = useState(null);

  const load = async (pick = null) => {
    try {
      const list = (await Account.api('GET', '/api/classes')).classes;
      setClasses(list);
      setCurrent((now) => pick || (list.some((c) => c.id === now) ? now : list.length ? list[0].id : null));
    } catch (e) {
      setError(e.message);
    }
  };
  useEffect(() => {
    load();
  }, []);

  if (page && page.student) return <StudentPage id={page.student.id} me={user} toast={toast} onBack={() => setPage(null)} onDeleted={() => setPage(null)} />;
  if (page && page.grownUps) return <GrownUps student={page.grownUps} onBack={() => setPage(null)} />;

  async function addClass() {
    setAddError(null);
    try {
      const c = await Account.api('POST', '/api/classes', { name });
      setName('');
      load(c.id);
    } catch (e) {
      setAddError(e.message);
    }
  }

  return (
    <View style={[styles.fill, { backgroundColor: t.bg }]}>
      <ScreenHeader title="🏫 My classes" onClose={onClose} />
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <Button testID="host-open" title="Host a live game" onPress={onHost} />
        {error ? <Help>{error}</Help> : !classes ? <ActivityIndicator color={t.accent} /> : null}
        {classes && classes.length ? (
          <Chips testID="class-tab" options={classes.map((c) => [c.id, `${c.name} (${c.students})`])} value={current} onChange={setCurrent} />
        ) : null}
        {classes ? (
          <View style={styles.form}>
            <TextBox testID="class-new-name" value={name} onChangeText={setName} placeholder={classes.length ? 'New class name' : 'Class name, like “Room 12”'} maxLength={40} style={styles.flex} onSubmitEditing={addClass} />
            <Button testID="class-new" kind="secondary" title="+ New class" onPress={addClass} disabled={!name.trim()} style={styles.button} />
          </View>
        ) : null}
        <ErrorLine error={addError} />
        {classes && !classes.length ? <Help>Make a class, then give your students its code. Any student with a school account can join with it.</Help> : null}
        {current ? <ClassDetail key={current} id={current} toast={toast} onStudent={(s) => setPage({ student: s })} onGrownUps={(s) => setPage({ grownUps: s })} onChanged={() => load()} onOpenLobby={onOpenLobby} /> : null}
        {classes ? <TeacherInvites /> : null}
      </ScrollView>
    </View>
  );
}

function ClassDetail({ id, toast, onStudent, onGrownUps, onChanged, onOpenLobby }) {
  const t = useTheme();
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const load = () =>
    Account.api('GET', `/api/classes/${id}`)
      .then(setD)
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, [id]);
  if (error) return <Help>{error}</Help>;
  if (!d) return <ActivityIndicator color={t.accent} />;
  const c = d.class;
  const link = `${SERVER}/#roster=${c.code}`;

  async function takeOut(s) {
    if (!(await ask(`Take ${s.name} out of ${c.name}?`, 'They can join again with the class code.', 'Take out'))) return;
    await Account.api('DELETE', `/api/classes/${c.id}/students/${s.id}`).catch((e) => toast('⚠️ Couldn’t do that', e.message));
    load();
    onChanged();
  }
  async function removeHomework(a) {
    if (!(await ask(`Remove “${a.label}”?`, 'It comes off for the whole class.', 'Remove'))) return;
    await Account.api('DELETE', `/api/homework/${a.id}`).catch((e) => toast('⚠️ Couldn’t remove it', e.message));
    load();
  }

  return (
    <>
      <View style={[styles.join, { backgroundColor: t.paper, borderColor: t.line }]}>
        <Qr text={link} size={110} />
        <View style={styles.flex}>
          <Text style={[styles.small, { color: t.muted }]}>Students join with</Text>
          <Text testID="class-code" style={[styles.code, { color: t.ink }]} selectable>
            {c.code}
          </Text>
          <SmallButton testID="class-share" title="Share join link…" onPress={() => Share.share({ message: `Join ${c.name} on Blockout: ${link} (class code ${c.code})` }).catch(() => {})} />
        </View>
      </View>
      <Help>Students sign in with their school account{c.school ? ` (${c.school})` : ''}, then type the code or open the link.</Help>

      <Section title={`Students · ${d.students.length}`}>
        {!d.students.length ? <Help>Nobody has joined yet.</Help> : null}
        {d.students.map((s) => (
          <View key={s.id} testID="roster-row" style={[styles.student, { backgroundColor: t.surface, borderColor: t.line }]}>
            <Pressable accessibilityRole="button" onPress={() => onStudent(s)} style={styles.studentTop}>
              <Text style={[styles.name, { color: t.accent }]}>{s.name} ›</Text>
              <Text style={[styles.small, { color: t.muted }]}>played {Grownups.ago(s.lastPlayed)}</Text>
            </Pressable>
            <MasteryBar summary={s.summary} />
            <Text style={[styles.small, { color: t.muted }]}>
              {s.summary.mastered} of {s.summary.total} mastered · needs practice: {Grownups.needsPracticeShort(s.summary.needsPractice)} · homework: {Grownups.homeworkCount(s.homework)}
            </Text>
            <View style={styles.buttons}>
              <SmallButton testID="roster-grown-ups" title="Grown-ups" onPress={() => onGrownUps(s)} />
              <SmallButton testID="roster-remove" title="Take out" onPress={() => takeOut(s)} />
            </View>
          </View>
        ))}
      </Section>

      <Section title="Class homework">
        {!d.assignments.length ? <Help>No homework set.</Help> : null}
        {d.assignments.map((a) => (
          <Row key={a.id} testID="class-homework" right={<SmallButton title="Remove" onPress={() => removeHomework(a)} />}>
            <Text style={[styles.strong, { color: t.ink }]}>{a.label}</Text>
            <Text style={[styles.small, { color: t.muted }]}>{Grownups.classHomeworkLine(a, Homework.niceDay)}</Text>
          </Row>
        ))}
        <HomeworkForm
          options={d.options}
          who={d.students.length ? `every student in ${c.name}` : 'a new student'}
          toast={toast}
          onSubmit={async ({ goal, due }) => {
            await Account.api('POST', '/api/homework', { classId: c.id, goal, due });
            load();
          }}
        />
      </Section>

      <Schedules classId={c.id} toast={toast} onOpenLobby={onOpenLobby} />
    </>
  );
}

// Planned tournaments: their lobby opens by itself at the time
function Schedules({ classId, toast, onOpenLobby }) {
  const t = useTheme();
  const [list, setList] = useState(null);
  const load = () =>
    Account.api('GET', '/api/schedules')
      .then((r) => setList(r.schedules))
      .catch(() => setList([]));
  useEffect(() => {
    load();
  }, [classId]);
  if (!list) return null;
  const mine = Grownups.schedulesFor(list, classId);

  async function remove(s) {
    if (!(await ask(`Remove “${s.title}”?`, 'The tournament won’t open.', 'Remove'))) return;
    await Account.api('DELETE', `/api/schedules/${s.id}`).catch((e) => toast('⚠️ Couldn’t remove it', e.message));
    load();
  }
  async function open(s) {
    try {
      const h = await Account.api('GET', `/api/schedules/${s.id}/host`);
      onOpenLobby({ code: h.code, teacherKey: h.teacherKey });
    } catch (e) {
      toast('⚠️ Couldn’t open it', e.message);
    }
  }

  return (
    <Section title="Tournaments">
      {!mine.length ? <Help>Plan a tournament and its lobby opens by itself at that time.</Help> : null}
      {mine.map((s) => (
        <Row
          key={s.id}
          testID="schedule-row"
          tone={s.open ? 'live' : null}
          right={
            <View style={styles.rowButtons}>
              {s.open ? <SmallButton kind="primary" title="Open the lobby" onPress={() => open(s)} /> : null}
              <SmallButton title="Remove" onPress={() => remove(s)} />
            </View>
          }
        >
          <Text style={[styles.strong, { color: t.ink }]}>{s.title}</Text>
          <Text style={[styles.small, { color: t.muted }]}>{Grownups.scheduleLine(s)}</Text>
        </Row>
      ))}
      <ScheduleForm classId={classId} toast={toast} onPlanned={load} />
    </Section>
  );
}

// When: one of the next seven days, at a time in the school day
const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16];
const hourLabel = (h) => new Date(2000, 0, 1, h).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

function ScheduleForm({ classId, toast, onPlanned }) {
  const t = useTheme();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() + i * 86400000);
    return [Grownups.dayString(d), i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : Grownups.shortDay(d.getTime())];
  });
  const [v, setV] = useState({ title: '', day: days[1][0], hour: 10, format: 'knockout', size: 8, difficulty: 'easy', scope: 'class' });
  const [error, setError] = useState(null);
  const set = (part) => setV((now) => ({ ...now, ...part }));
  async function plan() {
    setError(null);
    const [y, m, d] = v.day.split('-').map(Number);
    const startsAt = new Date(y, m - 1, d, v.hour).getTime();
    try {
      await Account.api('POST', '/api/schedules', { classId, scope: v.scope, title: v.title, startsAt, settings: { format: v.format, size: Number(v.size), difficulty: v.difficulty } });
      toast('🏆 Tournament planned', Grownups.niceTime(startsAt));
      set({ title: '' });
      onPlanned();
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <View style={[styles.box, { backgroundColor: t.paper, borderColor: t.line }]}>
      <Text style={[styles.strong, { color: t.ink }]}>Plan a tournament</Text>
      <Field label="Name">
        <TextBox testID="schedule-title" value={v.title} onChangeText={(title) => set({ title })} placeholder="e.g. Friday Cup" maxLength={60} />
      </Field>
      <Field label="Day">
        <Chips testID="schedule-day" options={days} value={v.day} onChange={(day) => set({ day })} />
      </Field>
      <Field label="Time">
        <Chips testID="schedule-hour" options={HOURS.map((h) => [h, hourLabel(h)])} value={v.hour} onChange={(hour) => set({ hour })} />
      </Field>
      <Field label="Format">
        <Chips testID="schedule-format" options={Object.entries(Grownups.FORMAT_NAMES)} value={v.format} onChange={(format) => set({ format })} />
      </Field>
      <Field label="Board">
        <Chips options={Grownups.SCHEDULE_SIZES.map((n) => [n, `${n}×${n}`])} value={v.size} onChange={(size) => set({ size })} />
      </Field>
      <Field label="Difficulty">
        <Chips options={Grownups.SCHEDULE_DIFFICULTIES.map((x) => [x, x[0].toUpperCase() + x.slice(1)])} value={v.difficulty} onChange={(difficulty) => set({ difficulty })} />
      </Field>
      <Field label="Who">
        <Chips
          options={[
            ['class', 'This class'],
            ['school', 'Whole school'],
          ]}
          value={v.scope}
          onChange={(scope) => set({ scope })}
        />
      </Field>
      <ErrorLine error={error} />
      <Button testID="schedule-plan" title="Plan it" onPress={plan} disabled={!v.title.trim()} />
    </View>
  );
}

// A student's grown-ups, for their teacher: who's following (take off a wrong
// one), and a code for a new one
function GrownUps({ student, onBack }) {
  const t = useTheme();
  const [parents, setParents] = useState(null);
  const [invite, setInvite] = useState(null);
  const [error, setError] = useState(null);
  const load = () =>
    Account.api('GET', `/api/students/${student.id}/parents`)
      .then((r) => setParents(r.parents))
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);
  async function remove(p) {
    if (!(await ask(`Stop ${p.name} following ${student.name}?`, 'They won’t see how they’re doing any more.', 'Stop'))) return;
    await Account.api('DELETE', `/api/students/${student.id}/parents/${p.id}`).catch((e) => setError(e.message));
    load();
  }
  return (
    <View style={[styles.fill, { backgroundColor: t.bg }]}>
      <ScreenHeader title={`${student.name}’s grown-ups`} onClose={onBack} closeLabel="Back" />
      <ScrollView contentContainerStyle={styles.page}>
        {!parents ? <ActivityIndicator color={t.accent} /> : !parents.length ? <Help>No grown-up is following yet.</Help> : null}
        {(parents || []).map((p) => (
          <Row key={p.id} right={<SmallButton title="Remove" onPress={() => remove(p)} />}>
            <Text style={[styles.strong, { color: t.ink }]}>👪 {p.name}</Text>
          </Row>
        ))}
        <Help>A code lets one grown-up follow {student.name}: their Times Table, homework, and setting homework of their own.</Help>
        {invite ? (
          <CodeCard invite={invite} who={`For ${student.name}’s grown-up.`} />
        ) : (
          <Button
            testID="student-parent-code"
            kind="secondary"
            title="Make a grown-up code"
            onPress={() =>
              Account.api('POST', `/api/students/${student.id}/parent-invites`)
                .then(setInvite)
                .catch((e) => setError(e.message))
            }
          />
        )}
        <ErrorLine error={error} />
      </ScrollView>
    </View>
  );
}

// Bringing in another teacher: a one-time code, and the codes still out there
function TeacherInvites() {
  const t = useTheme();
  const [invites, setInvites] = useState([]);
  const [made, setMade] = useState(null);
  const [error, setError] = useState(null);
  const load = () =>
    Account.api('GET', '/api/me/teacher-invites')
      .then((r) => setInvites(r.invites))
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);
  async function make() {
    setError(null);
    try {
      setMade(await Account.api('POST', '/api/me/teacher-invites', {}));
      load();
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <Section title="Invite a teacher" help="A colleague signs in, then types the code (or opens its link) to get their own classes.">
      {made ? <CodeCard invite={made} who="For one teacher." /> : <Button testID="teacher-code" kind="secondary" title="Make a teacher code" onPress={make} />}
      {invites.map((i) => (
        <Row
          key={i.id}
          testID="teacher-invite"
          right={
            i.usedAt ? null : (
              <SmallButton
                title="Remove"
                onPress={() =>
                  Account.api('DELETE', `/api/me/invites/${i.id}`)
                    .then(load)
                    .catch((e) => setError(e.message))
                }
              />
            )
          }
        >
          <Text style={[styles.strong, { color: t.ink }]}>🍎 Code from {Grownups.shortDay(i.createdAt)}</Text>
          <Text style={[styles.small, { color: t.muted }]}>{Grownups.inviteState(i)}</Text>
        </Row>
      ))}
      <ErrorLine error={error} />
    </Section>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flex: 1, gap: 6 },
  page: { padding: 16, paddingTop: 4, gap: 16, paddingBottom: 40, maxWidth: 700, width: '100%', alignSelf: 'center' },
  form: { flexDirection: 'row', gap: 8 },
  button: { minWidth: 120 },
  join: { flexDirection: 'row', gap: 12, alignItems: 'center', borderWidth: 2, borderRadius: 14, padding: 12 },
  code: { fontSize: 34, fontWeight: '900', letterSpacing: 4 },
  small: { fontSize: 13, lineHeight: 18 },
  strong: { fontSize: 16, fontWeight: '800' },
  name: { fontSize: 18, fontWeight: '900' },
  student: { borderWidth: 2, borderRadius: 12, padding: 12, gap: 8 },
  studentTop: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  buttons: { flexDirection: 'row', gap: 8 },
  rowButtons: { gap: 6 },
  box: { borderWidth: 2, borderRadius: 14, padding: 12, gap: 12 },
});
