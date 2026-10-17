// The admin page, on the phone (as the web's /admin/): find accounts and
// change their role or delete them, make teacher codes, add schools. Only for
// accounts with Keycloak's admin role; the server checks every request.
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Grownups from '@blockout/progress/grownups';
import * as Account from './account';
import { CodeCard } from './AccountScreen';
import { Chips, ErrorLine, Field, Help, Row, Section, SmallButton, TextBox } from './forms';
import { useTheme } from './theme';
import { Button, ScreenHeader } from './ui';

const PAGE = 20;
const ROLES = Object.entries(Grownups.ROLE).map(([role, r]) => [role, `${r.emoji} ${r.label}`]);
const day = (t) => (t ? new Date(t).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—');

export default function AdminScreen({ user, onClose }) {
  const t = useTheme();
  const [tab, setTab] = useState('accounts');
  const [error, setError] = useState(null);
  // every action: clear the last error, show a new one
  const act = async (fn) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    }
  };
  return (
    <View style={[styles.fill, { backgroundColor: t.bg }]}>
      <ScreenHeader title="🛠 Admin" onClose={onClose} />
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <Chips
          testID="admin-tab"
          options={[
            ['accounts', 'Accounts'],
            ['codes', 'Teacher codes'],
            ['schools', 'Schools'],
          ]}
          value={tab}
          onChange={(v) => {
            setError(null);
            setTab(v);
          }}
        />
        <ErrorLine error={error} testID="admin-error" />
        {tab === 'accounts' ? <Accounts me={user} act={act} /> : tab === 'codes' ? <Codes act={act} /> : <Schools act={act} />}
      </ScrollView>
    </View>
  );
}

function Accounts({ me, act }) {
  const t = useTheme();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(0);
  const [data, setData] = useState(null);
  const [deleting, setDeleting] = useState(null); // { user, typed }
  const load = (p = page, r = role) =>
    act(async () => {
      const params = new URLSearchParams({ q: q.trim(), page: String(p), limit: String(PAGE) });
      if (r) params.set('role', r);
      setData(await Account.api('GET', `/api/admin/users?${params}`));
    });
  useEffect(() => {
    load();
  }, []);
  const search = (p = 0, r = role) => {
    setPage(p);
    load(p, r);
  };
  return (
    <Section>
      <View style={styles.form}>
        <TextBox testID="admin-q" value={q} onChangeText={setQ} placeholder="First name" maxLength={40} style={styles.flex} onSubmitEditing={() => search()} returnKeyType="search" />
        <Button testID="admin-search" title="Find" onPress={() => search()} style={styles.button} />
      </View>
      <Chips
        testID="admin-role"
        options={[['', 'Everyone'], ...ROLES]}
        value={role}
        onChange={(r) => {
          setRole(r);
          search(0, r);
        }}
      />
      {!data ? <ActivityIndicator color={t.accent} /> : null}
      {data ? (
        <Help>
          {data.total} account{data.total === 1 ? '' : 's'}
        </Help>
      ) : null}
      {(data ? data.users : []).map((u) => (
        <View key={u.id} testID="admin-user" style={[styles.card, { backgroundColor: t.surface, borderColor: t.line }]}>
          <Text style={[styles.strong, { color: t.ink }]}>
            {u.name} {u.id === me.id ? <Text style={[styles.small, { color: t.muted }]}>(you)</Text> : null}
          </Text>
          <Text style={[styles.small, { color: t.muted }]}>
            {u.domain ? `@${u.domain} · ` : ''}joined {day(u.createdAt)} · last seen {day(u.lastSeen)}
          </Text>
          <Chips testID={`admin-role-${u.id}`} options={ROLES} value={u.role} onChange={(r) => act(async () => {
            try {
              await Account.api('PUT', `/api/admin/users/${u.id}/role`, { role: r });
            } finally {
              await load();
            }
          })} />
          {u.id === me.id ? null : deleting && deleting.user === u.id ? (
            <View style={styles.danger}>
              <Text style={[styles.small, { color: t.ink }]}>Delete {u.name}’s account and everything in it (progress, classes they teach, homework, links)? This can’t be undone. Type DELETE to go ahead.</Text>
              <TextBox testID="admin-delete-typed" value={deleting.typed} onChangeText={(typed) => setDeleting({ user: u.id, typed })} placeholder="DELETE" autoCapitalize="characters" />
              <View style={styles.form}>
                <SmallButton title="Cancel" onPress={() => setDeleting(null)} />
                <SmallButton
                  testID="admin-delete-confirm"
                  kind="primary"
                  title="Delete"
                  disabled={deleting.typed.trim() !== 'DELETE'}
                  onPress={() =>
                    act(async () => {
                      await Account.api('DELETE', `/api/admin/users/${u.id}`);
                      setDeleting(null);
                      await load();
                    })
                  }
                />
              </View>
            </View>
          ) : (
            <SmallButton testID="admin-delete" title="Delete" onPress={() => setDeleting({ user: u.id, typed: '' })} />
          )}
        </View>
      ))}
      {data ? (
        <View style={styles.form}>
          {page > 0 ? <SmallButton title="← Newer" onPress={() => search(page - 1)} /> : null}
          {(page + 1) * PAGE < data.total ? <SmallButton title="Older →" onPress={() => search(page + 1)} /> : null}
        </View>
      ) : null}
    </Section>
  );
}

function Codes({ act }) {
  const t = useTheme();
  const [schools, setSchools] = useState([]);
  const [school, setSchool] = useState('');
  const [invites, setInvites] = useState(null);
  const [made, setMade] = useState(null);
  const load = () =>
    act(async () => {
      const [s, i] = await Promise.all([Account.api('GET', '/api/admin/schools'), Account.api('GET', '/api/admin/invites?kind=teacher')]);
      setSchools(s.schools);
      setInvites(i.invites);
    });
  useEffect(() => {
    load();
  }, []);
  return (
    <Section help="A teacher code makes one account a teacher (at a school, if you pick one).">
      <Field label="For">
        <Chips testID="admin-code-school" options={[['', 'Any school (or none)'], ...schools.map((s) => [s.id, s.name])]} value={school} onChange={setSchool} />
      </Field>
      {made ? <CodeCard invite={made} who="For one teacher." /> : null}
      <Button
        testID="admin-make-code"
        kind="secondary"
        title="Make a teacher code"
        onPress={() =>
          act(async () => {
            setMade(await Account.api('POST', '/api/admin/invites', { schoolId: school || null }));
            await load();
          })
        }
      />
      {!invites ? <ActivityIndicator color={t.accent} /> : !invites.length ? <Help>Nothing here.</Help> : null}
      {(invites || []).map((i) => (
        <Row
          key={i.id}
          testID="admin-code"
          right={
            i.usedAt ? null : (
              <SmallButton
                title="Remove"
                onPress={() =>
                  act(async () => {
                    await Account.api('DELETE', `/api/me/invites/${i.id}`);
                    await load();
                  })
                }
              />
            )
          }
        >
          <Text style={[styles.strong, { color: t.ink }]}>
            {day(i.createdAt)} · by {i.by}
          </Text>
          <Text style={[styles.small, { color: t.muted }]}>
            Used by: {Grownups.adminCodeState(i, day)} · until {day(i.expiresAt)}
          </Text>
        </Row>
      ))}
    </Section>
  );
}

function Schools({ act }) {
  const t = useTheme();
  const [schools, setSchools] = useState(null);
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const load = () => act(async () => setSchools((await Account.api('GET', '/api/admin/schools')).schools));
  useEffect(() => {
    load();
  }, []);
  return (
    <Section>
      {!schools ? <ActivityIndicator color={t.accent} /> : !schools.length ? <Help>Nothing here.</Help> : null}
      {(schools || []).map((s) => (
        <Row key={s.id} testID="admin-school">
          <Text style={[styles.strong, { color: t.ink }]}>{s.name}</Text>
          <Text style={[styles.small, { color: t.muted }]}>@{s.domain}</Text>
        </Row>
      ))}
      <Field label="Add a school">
        <TextBox testID="admin-school-name" value={name} onChangeText={setName} placeholder="School name" maxLength={60} />
        <TextBox testID="admin-school-domain" value={domain} onChangeText={setDomain} placeholder="email domain, like iusd.org" maxLength={80} autoCapitalize="none" keyboardType="url" />
      </Field>
      <Button
        testID="admin-add-school"
        title="Add school"
        disabled={!name.trim() || !domain.trim()}
        onPress={() =>
          act(async () => {
            await Account.api('POST', '/api/admin/schools', { name, domain });
            setName('');
            setDomain('');
            await load();
          })
        }
      />
    </Section>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flex: 1 },
  page: { padding: 16, paddingTop: 4, gap: 14, paddingBottom: 40, maxWidth: 700, width: '100%', alignSelf: 'center' },
  form: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  button: { minWidth: 80 },
  card: { borderWidth: 2, borderRadius: 12, padding: 12, gap: 8 },
  strong: { fontSize: 16, fontWeight: '800' },
  small: { fontSize: 13, lineHeight: 18 },
  danger: { gap: 8 },
});
