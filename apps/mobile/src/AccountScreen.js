// Your account, as on the web game: who you are, and for a student their
// classes (join one with a code), a code for a grown-up, and "I have a code"
// (a teacher's or a grown-up's one-time code). Teachers and grown-ups can
// delete their account; a child's is removed by their grown-up.
import qrcode from 'qrcode-generator';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import Constants from 'expo-constants';
import * as Account from './account';
import { codeLink, spaced } from './links';
import { useTheme } from './theme';
import { Button, ScreenHeader } from './ui';

export const ROLE = {
  student: { emoji: '🎒', label: 'Student' },
  teacher: { emoji: '🍎', label: 'Teacher' },
  parent: { emoji: '👪', label: 'Parent' },
};

const SERVER = Constants.expoConfig.extra.server;
const shortDay = (t) => new Date(t).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

// user: the signed-in account; onUser(user) when a code changes it;
// toast(title, text); onSignOut(); onDeleted()
export default function AccountScreen({ user, toast, onUser, onSignOut, onDeleted, onClose }) {
  const t = useTheme();
  const role = ROLE[user.role] || ROLE.student;
  const grownUp = user.role === 'teacher' || user.role === 'parent';
  return (
    <View style={[styles.fill, { backgroundColor: t.bg }]}>
      <ScreenHeader title="Your account" onClose={onClose} />
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <View style={[styles.card, { backgroundColor: t.paper, borderColor: t.line }]}>
          <Text testID="account-name" style={[styles.big, { color: t.ink }]}>
            {role.emoji} {user.name}
          </Text>
          <Text style={[styles.sub, { color: t.muted }]}>
            {role.label}
            {user.isAdmin ? ' · Admin' : ''}
            {user.school ? ` · ${user.school.name}` : ''}
          </Text>
        </View>
        {user.role === 'student' ? <StudentClasses toast={toast} /> : null}
        {user.role === 'student' ? <GrownUpCode /> : null}
        {user.role === 'student' ? <Redeem toast={toast} onUser={onUser} /> : null}
        {user.role === 'teacher' ? <Text style={[styles.help, { color: t.muted }]}>Your classes, homework, tournaments and codes for other teachers are under 🏫 My classes in the web game.</Text> : null}
        {user.role === 'parent' ? <Text style={[styles.help, { color: t.muted }]}>Follow your children under 👪 My kids in the web game.</Text> : null}
        {grownUp ? <DeleteAccount onDeleted={onDeleted} /> : null}
        <Button testID="sign-out" kind="secondary" title="Sign out" onPress={onSignOut} />
      </ScrollView>
    </View>
  );
}

function Section({ title, help, children }) {
  const t = useTheme();
  return (
    <View style={styles.section}>
      <Text style={[styles.heading, { color: t.muted }]}>{title}</Text>
      {help ? <Text style={[styles.help, { color: t.muted }]}>{help}</Text> : null}
      {children}
    </View>
  );
}

// A code box and its button, with the server's answer under it
function CodeForm({ placeholder, maxLength, button, testID, onSubmit }) {
  const t = useTheme();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const submit = async () => {
    if (!code.trim() || busy) return;
    setError(null);
    setBusy(true);
    try {
      await onSubmit(code.replace(/\s+/g, '').toUpperCase());
      setCode('');
    } catch (e) {
      setError(e.message || 'That didn’t work.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={styles.formWrap}>
      <View style={styles.form}>
        <TextInput
          testID={`${testID}-input`}
          value={code}
          onChangeText={setCode}
          onSubmitEditing={submit}
          placeholder={placeholder}
          placeholderTextColor={t.muted}
          maxLength={maxLength}
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="go"
          style={[styles.input, { color: t.ink, backgroundColor: t.surface, borderColor: t.line }]}
        />
        <Button testID={`${testID}-go`} title={busy ? '…' : button} onPress={submit} disabled={busy || !code.trim()} style={styles.formButton} />
      </View>
      {error ? (
        <Text testID={`${testID}-error`} style={[styles.error, { color: t.bad }]}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

function StudentClasses({ toast }) {
  const t = useTheme();
  const [classes, setClasses] = useState(null);
  const [error, setError] = useState(null);
  const load = async () => {
    try {
      setClasses((await Account.api('GET', '/api/me/classes')).classes);
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  };
  useEffect(() => {
    load();
  }, []);
  return (
    <Section title="Your classes">
      {error ? <Text style={[styles.help, { color: t.muted }]}>{error}</Text> : !classes ? <ActivityIndicator color={t.accent} /> : null}
      {classes && !classes.length ? <Text style={[styles.help, { color: t.muted }]}>Not in a class yet. Type the code your teacher gives you.</Text> : null}
      {(classes || []).map((c) => (
        <Text key={c.id || c.name} testID="class-row" style={[styles.item, { color: t.ink, backgroundColor: t.surface, borderColor: t.line }]}>
          🏫 {c.name}
        </Text>
      ))}
      <CodeForm
        testID="join"
        placeholder="Class code"
        maxLength={8}
        button="Join"
        onSubmit={async (code) => {
          const r = await Account.api('POST', '/api/me/classes', { code });
          toast('🏫 Joined!', r.class.name);
          await load();
        }}
      />
    </Section>
  );
}

function GrownUpCode() {
  const t = useTheme();
  const [invite, setInvite] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const make = async () => {
    setError(null);
    setBusy(true);
    try {
      setInvite(await Account.api('POST', '/api/me/parent-invites'));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section title="For a grown-up" help="Make a code for your mom, dad or another grown-up, so they can see how you’re doing and add homework.">
      {invite ? <CodeCard invite={invite} who="Give it to one grown-up." /> : <Button testID="grown-up-code" kind="secondary" title={busy ? 'Making a code…' : 'Make a grown-up code'} onPress={make} disabled={busy} />}
      {error ? <Text style={[styles.error, { color: t.bad }]}>{error}</Text> : null}
    </Section>
  );
}

// A one-time code: its QR code (the web link, so any phone's camera opens
// it), the code to type, and Share
export function CodeCard({ invite, who }) {
  const t = useTheme();
  const link = codeLink(SERVER, invite.code);
  return (
    <View style={[styles.codeCard, { backgroundColor: t.paper, borderColor: t.line }]}>
      <Qr text={link} size={132} />
      <View style={styles.codeText}>
        <Text testID="invite-code" style={[styles.code, { color: t.ink }]} selectable>
          {spaced(invite.code)}
        </Text>
        <Text style={[styles.help, { color: t.muted }]}>
          {who} Works once, until {shortDay(invite.expiresAt)}.
        </Text>
        <Pressable
          testID="share-code"
          accessibilityRole="button"
          onPress={() => Share.share({ message: `My Blockout code: ${spaced(invite.code)}\n${link}` }).catch(() => {})}
          style={({ pressed }) => [styles.share, { backgroundColor: t.soft, borderColor: t.line, opacity: pressed ? 0.7 : 1 }]}
        >
          <Text style={[styles.shareText, { color: t.ink }]}>Share…</Text>
        </Pressable>
      </View>
    </View>
  );
}

// A QR code (black on white, with its quiet edge), drawn as one path
export function Qr({ text, size }) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const quiet = 4;
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + quiet} ${r + quiet}h1v1h-1z`;
  const box = n + quiet * 2;
  return (
    <Svg testID="qr" width={size} height={size} viewBox={`0 0 ${box} ${box}`} accessibilityLabel="QR code">
      <Rect x={0} y={0} width={box} height={box} fill="#ffffff" />
      <Path d={d} fill="#000000" />
    </Svg>
  );
}

// "I have a code": a teacher's or a grown-up's one-time code
function Redeem({ toast, onUser }) {
  return (
    <Section title="Teachers and grown-ups" help="Got a code to become a teacher, or to follow a child? Type it here.">
      <CodeForm testID="redeem" placeholder="Code" maxLength={9} button="Use code" onSubmit={(code) => redeemCode(code, { toast, onUser })} />
    </Section>
  );
}

// Use a one-time code; the account changes (a new role, a linked child)
export async function redeemCode(code, { toast, onUser }) {
  const r = await Account.api('POST', '/api/invites/redeem', { code });
  const who = await Account.refreshUser();
  const role = ROLE[who.role] || ROLE.student;
  toast(r.child ? '👪 Linked' : `${role.emoji} Welcome`, r.child ? r.child.name : `You’re a ${role.label.toLowerCase()} now.`);
  onUser(who);
}

// Deleting: typed, because it can't be undone
function DeleteAccount({ onDeleted }) {
  const t = useTheme();
  const [asking, setAsking] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  if (!asking) return <Button testID="delete-account" kind="secondary" title="Delete my account" onPress={() => setAsking(true)} />;
  const sure = typed.trim().toLowerCase() === 'delete';
  const go = async () => {
    setError(null);
    setBusy(true);
    try {
      await Account.deleteAccount();
      onDeleted();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };
  return (
    <View style={[styles.danger, { borderColor: t.bad }]}>
      <Text style={[styles.dangerText, { color: t.ink }]}>Delete your Blockout account and everything in it? This can’t be undone. Type delete to go ahead.</Text>
      <TextInput testID="delete-typed" value={typed} onChangeText={setTyped} autoCapitalize="none" autoCorrect={false} placeholder="delete" placeholderTextColor={t.muted} style={[styles.input, { color: t.ink, backgroundColor: t.surface, borderColor: t.line }]} />
      {error ? <Text style={[styles.error, { color: t.bad }]}>{error}</Text> : null}
      <View style={styles.form}>
        <Button kind="secondary" title="Cancel" onPress={() => setAsking(false)} style={styles.flex} />
        <Pressable
          testID="delete-confirm"
          accessibilityRole="button"
          accessibilityState={{ disabled: !sure || busy }}
          disabled={!sure || busy}
          onPress={go}
          style={[styles.deleteBtn, { backgroundColor: t.bad, opacity: sure && !busy ? 1 : 0.45 }]}
        >
          <Text style={styles.deleteText}>{busy ? 'Deleting…' : 'Delete'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  page: { padding: 16, paddingTop: 4, gap: 22, paddingBottom: 40, maxWidth: 700, width: '100%', alignSelf: 'center' },
  card: { borderWidth: 2, borderRadius: 14, padding: 14, gap: 4 },
  big: { fontSize: 22, fontWeight: '900' },
  sub: { fontSize: 15, fontWeight: '600' },
  section: { gap: 8 },
  heading: { fontSize: 14, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  help: { fontSize: 15, lineHeight: 21 },
  item: { fontSize: 16, fontWeight: '700', padding: 12, borderWidth: 2, borderRadius: 12, overflow: 'hidden' },
  formWrap: { gap: 6 },
  form: { flexDirection: 'row', gap: 8 },
  input: { flex: 1, minWidth: 0, height: 52, borderWidth: 2, borderRadius: 12, paddingHorizontal: 12, fontSize: 18, fontWeight: '700', letterSpacing: 1 },
  formButton: { minWidth: 104 },
  error: { fontSize: 15, fontWeight: '600' },
  codeCard: { flexDirection: 'row', gap: 12, borderWidth: 2, borderRadius: 14, padding: 12, alignItems: 'center' },
  codeText: { flex: 1, gap: 6 },
  code: { fontSize: 26, fontWeight: '900', letterSpacing: 2, fontVariant: ['tabular-nums'] },
  share: { alignSelf: 'flex-start', paddingHorizontal: 14, height: 40, borderRadius: 10, borderWidth: 2, justifyContent: 'center' },
  shareText: { fontSize: 15, fontWeight: '800' },
  danger: { borderWidth: 2, borderRadius: 14, padding: 12, gap: 10 },
  dangerText: { fontSize: 15, lineHeight: 21 },
  flex: { flex: 1 },
  deleteBtn: { flex: 1, height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  deleteText: { color: '#fff', fontSize: 17, fontWeight: '800' },
});
