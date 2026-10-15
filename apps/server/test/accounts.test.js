import test from 'node:test';
import assert from 'node:assert';
import crypto from 'crypto';
import { openStore } from '../src/store.js';
import * as Auth from '../src/auth.js';
import { createLogger } from '../src/log.js';
import { createAccounts } from '../src/accounts.js';
import * as P from '@blockout/progress';

function setup() {
  let clock = Date.UTC(2026, 8, 23, 17, 0, 0);
  const store = openStore(':memory:');
  const auth = Auth.devProvider({ secret: 'test-secret', now: () => clock });
  const accounts = createAccounts({ store, auth, now: () => clock });
  const signIn = async (person) => {
    const { token } = await accounts.devSignIn(person);
    return accounts.authenticate(token);
  };
  return { store, auth, accounts, signIn, tick: (ms) => (clock += ms), now: () => clock };
}

test('dev sign-in: tokens check out, the same person gets the same account, bad tokens fail', async () => {
  const { accounts, auth, signIn } = setup();
  const a = await signIn({ firstName: 'Maya', lastInitial: 'k', role: 'student', email: 'maya.k@iusd.org' });
  const b = await signIn({ firstName: 'Maya', lastInitial: 'K', role: 'student', email: 'maya.k@iusd.org' });
  assert.equal(a.id, b.id);
  assert.equal(a.name, 'Maya K.');
  assert.equal(a.schoolId, 'cadence-park'); // @iusd.org is Cadence Park
  assert.equal(a.domain, 'iusd.org'); // the domain, never the address
  const token = auth.issue({ firstName: 'Sam', role: 'parent' });
  const forged = token.slice(0, -4) + (token.endsWith('AAAA') ? 'BBBB' : 'AAAA');
  await assert.rejects(accounts.authenticate(forged), /isn’t valid/);
  await assert.rejects(accounts.devSignIn({ firstName: '   ', role: 'student' }), /first name/);
});

test('privacy: only first name, last initial, role and email domain are stored', async () => {
  const { store, signIn } = setup();
  await signIn({ firstName: 'Olivia Grace', lastInitial: 'Martinez', role: 'student', email: 'olivia.martinez@iusd.org' });
  const rows = store.db.prepare('SELECT * FROM users').all();
  const text = JSON.stringify(rows);
  assert.ok(!text.includes('olivia.martinez'), 'no email address');
  assert.ok(!text.includes('Martinez'), 'no last name');
  assert.equal(rows[0].first_name, 'Olivia');
  assert.equal(rows[0].last_initial, 'M');
});

test('keycloak provider: checks RS256 signature, issuer and client; roles from realm_access', async () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', use: 'sig', alg: 'RS256' };
  const issuer = 'https://id.example.org/realms/blockout';
  const kc = Auth.keycloakProvider({ issuer, clientId: 'blockout', fetchJson: async () => ({ keys: [jwk] }), now: () => 1_800_000_000_000 });
  const make = (payload, key = privateKey) => {
    const head = Auth.b64url(JSON.stringify({ alg: 'RS256', kid: 'k1', typ: 'JWT' }));
    const body = Auth.b64url(JSON.stringify(payload));
    return `${head}.${body}.${Auth.b64url(crypto.sign('RSA-SHA256', Buffer.from(`${head}.${body}`), key))}`;
  };
  const good = { iss: issuer, azp: 'blockout', sub: 'abc', given_name: 'Ana', family_name: 'Lopez', email: 'ana@iusd.org', realm_access: { roles: ['teacher'] }, exp: 1_900_000_000 };
  const claims = await kc.verify(make(good));
  assert.deepEqual(claims.roles, ['teacher']);
  await assert.rejects(kc.verify(make({ ...good, iss: 'https://evil.example.org' })), /somewhere else/);
  await assert.rejects(kc.verify(make({ ...good, azp: 'other' })), /another app/);
  await assert.rejects(kc.verify(make({ ...good, exp: 1_000 })), /expired/);
  const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  await assert.rejects(kc.verify(make(good, other)), /isn’t valid/);
  // Google-brokered student without a role: school domain -> student
  const id = Auth.identity({ sub: 'g1', given_name: 'Leo', email: 'leo@iusd.org' }, { schoolByDomain: (d) => (d === 'iusd.org' ? { id: 'cadence-park' } : null) });
  assert.deepEqual([id.role, id.schoolId, id.domain], ['student', 'cadence-park', 'iusd.org']);
});

test('classes: teacher creates, any @iusd.org student joins with the code, others cannot', async () => {
  const { accounts, signIn } = setup();
  const teacher = await signIn({ firstName: 'Ms', lastInitial: 'R', role: 'teacher', schoolId: 'cadence-park' });
  assert.equal(teacher.schoolId, 'cadence-park');
  const c = await accounts.createClass(teacher, { name: 'Room 12' });
  assert.match(c.code, /^[A-Z2-9]{6}$/);
  const kid = await signIn({ firstName: 'Maya', lastInitial: 'K', role: 'student', email: 'maya@iusd.org' });
  const outsider = await signIn({ firstName: 'Bo', role: 'student', email: 'bo@gmail.com' });
  assert.equal((await accounts.joinClass(kid, { code: c.code.toLowerCase() })).class.name, 'Room 12');
  await assert.rejects(accounts.joinClass(outsider, { code: c.code }), /@iusd\.org/);
  await assert.rejects(accounts.joinClass(kid, { code: 'NOPE22' }), /No class/);
  await assert.rejects(accounts.createClass(kid, { name: 'x' }), /Only teachers/);
  const other = await signIn({ firstName: 'Mr', lastInitial: 'T', role: 'teacher', schoolId: 'cadence-park' });
  await assert.rejects(accounts.classDetail(other, c.id), /isn’t one of yours/);
  const detail = await accounts.classDetail(teacher, c.id);
  assert.equal(detail.students.length, 1);
  assert.equal(detail.students[0].name, 'Maya K.');
  assert.match(detail.students[0].parentCode, /^[A-Z2-9]{8}$/);
});

test('progress sync: saves round-trip, cheats stay on the device, stats come from the save', async () => {
  const { accounts, signIn } = setup();
  const kid = await signIn({ firstName: 'Maya', role: 'student', email: 'maya@iusd.org' });
  assert.equal((await accounts.getProgress(kid)).progress, null);
  const s = P.createProgress();
  s.wallet = 50;
  P.cheatOn(s, 'fivemoreminutesmom');
  s.facts.you = { name: 'You', facts: { '6 × 7': { asked: 4, firstTry: 1, wrong: 3, timeouts: 0, said: [], times: [] } } };
  await accounts.putProgress(kid, s);
  const back = (await accounts.getProgress(kid)).progress;
  assert.equal(back.wallet, 50);
  assert.deepEqual(back.cheats, {});
  // IDDQD's free unlocks never reach the account
  P.cheatOn(s, 'iddqd');
  await accounts.putProgress(kid, s);
  assert.deepEqual((await accounts.getProgress(kid)).progress.unlocks, []);
  assert.deepEqual(P.factSummary(back).needsPractice, ['6 × 7']);
});

test('merging a device into an account keeps the most of everything', () => {
  const device = P.createProgress();
  device.wallet = 30;
  device.unlocks = ['practice'];
  device.facts.you = { name: 'You', facts: { '3 × 4': { asked: 5, firstTry: 5, wrong: 0, timeouts: 0, said: [], times: [] } } };
  P.noteActivity(device, { kind: 'game', won: true, size: 6, difficulty: 'easy' }, 1000);
  const account = P.createProgress();
  account.wallet = 80;
  account.unlocks = ['board8'];
  account.achievements = { first_game: 500 };
  account.facts.you = { name: 'You', facts: { '3 × 4': { asked: 2, firstTry: 1, wrong: 1, timeouts: 0, said: [], times: [] }, '5 × 5': { asked: 1, firstTry: 1, wrong: 0, timeouts: 0, said: [], times: [] } } };
  P.noteActivity(account, { kind: 'practice', finished: true, difficulty: 'easy' }, 2000);
  const m = P.mergeProgress(device, account);
  assert.equal(m.wallet, 80);
  assert.deepEqual(m.unlocks.sort(), ['board8', 'practice']);
  assert.equal(m.achievements.first_game, 500);
  assert.equal(m.facts.you.facts['3 × 4'].asked, 5);
  assert.ok(m.facts.you.facts['5 × 5']);
  assert.deepEqual(m.activity.map((e) => e.kind), ['game', 'practice']);
});

test('homework: teacher sets class homework, parent sets extra; progress detected from the save', async () => {
  const { accounts, signIn, tick, now } = setup();
  const teacher = await signIn({ firstName: 'Ms', lastInitial: 'R', role: 'teacher', schoolId: 'cadence-park' });
  const c = await accounts.createClass(teacher, { name: 'Room 12' });
  const kid = await signIn({ firstName: 'Maya', role: 'student', email: 'maya@iusd.org' });
  await accounts.joinClass(kid, { code: c.code });
  const parent = await signIn({ firstName: 'Ana', role: 'parent', email: 'ana@gmail.com' });
  await assert.rejects(accounts.createAssignment(parent, { studentId: kid.id, goal: { type: 'games', games: 1 } }), /Link your child/);
  const code = (await accounts.parentCode(kid)).code;
  assert.equal((await accounts.linkChild(parent, { code: code.toLowerCase() })).child.name, 'Maya');
  await accounts.createAssignment(teacher, { classId: c.id, goal: { type: 'practice', rounds: 2, difficulty: 'easy' }, due: '2026-09-25' });
  await accounts.createAssignment(parent, { studentId: kid.id, goal: { type: 'master', table: 7 } });
  await assert.rejects(accounts.createAssignment(teacher, { classId: c.id, goal: { type: 'fly' } }), /Pick what/);
  tick(1000);
  const s = P.createProgress();
  P.noteActivity(s, { kind: 'practice', finished: true, difficulty: 'easy' }, now());
  await accounts.putProgress(kid, s);
  let hw = (await accounts.myHomework(kid)).homework;
  assert.equal(hw.length, 2);
  const practice = hw.find((h) => h.goal.type === 'practice');
  assert.deepEqual([practice.have, practice.need, practice.status, practice.from], [1, 2, 'open', 'teacher']);
  assert.equal(hw.find((h) => h.goal.type === 'master').from, 'parent');
  // the parent sees everything, the teacher sees class progress
  const seen = await accounts.childDetail(parent, kid.id);
  assert.equal(seen.assignments.length, 2);
  const stranger = await signIn({ firstName: 'Zed', role: 'parent' });
  await assert.rejects(accounts.childDetail(stranger, kid.id), /can’t see/);
  const detail = await accounts.classDetail(teacher, c.id);
  assert.deepEqual([detail.assignments.length, detail.assignments[0].done, detail.assignments[0].of], [1, 0, 1]);
  // only the setter can remove homework
  const extra = hw.find((h) => h.from === 'parent');
  await assert.rejects(accounts.deleteAssignment(teacher, extra.id), /Only whoever/);
  await accounts.deleteAssignment(parent, extra.id);
  hw = (await accounts.myHomework(kid)).homework;
  assert.equal(hw.length, 1);
});

test('homework goals: master, practice by difficulty, win by board, games; late after due', () => {
  const s = P.createProgress();
  s.facts.you = { name: 'You', facts: {} };
  for (let n = 1; n <= 10; n++) {
    s.facts.you.facts[P.factKey(7, n)] = { asked: 3, firstTry: 3, wrong: 0, timeouts: 0, said: [], times: [] };
    s.facts.you.facts[P.factKey(n, 7)] = { asked: 3, firstTry: 3, wrong: 0, timeouts: 0, said: [], times: [] };
  }
  assert.equal(P.goalProgress(s, { type: 'master', table: 7 }).done, true);
  assert.deepEqual(P.goalProgress(s, { type: 'master', table: 8 }), { have: 2, need: 19, done: false }); // 8 × 7 and 7 × 8
  P.noteActivity(s, { kind: 'practice', finished: true, difficulty: 'medium' }, 100);
  P.noteActivity(s, { kind: 'practice', finished: false, difficulty: 'medium' }, 200);
  P.noteActivity(s, { kind: 'game', won: true, size: 8, difficulty: 'easy' }, 300);
  assert.equal(P.goalProgress(s, { type: 'practice', rounds: 1, difficulty: 'medium' }).done, true);
  assert.equal(P.goalProgress(s, { type: 'practice', rounds: 1, difficulty: 'hard' }).done, false);
  assert.equal(P.goalProgress(s, { type: 'practice', rounds: 1, difficulty: 'medium' }, 150).done, false); // set after it
  assert.equal(P.goalProgress(s, { type: 'win', size: 8, difficulty: 'any' }).done, true);
  assert.equal(P.goalProgress(s, { type: 'win', size: 10, difficulty: 'any' }).done, false);
  assert.equal(P.goalProgress(s, { type: 'games', games: 2 }).have, 1);
  const late = P.homeworkStatus(s, { goal: { type: 'games', games: 2 }, due: '2026-09-20', createdAt: 0 }, '2026-09-23');
  assert.equal(late.status, 'late');
  assert.equal(late.label, 'Finish 2 games');
  assert.equal(P.cleanGoal({ type: 'win', size: 99 }), null);
});

test('scheduled tournaments open on time; students of the class (or school) see them', async () => {
  const { accounts, signIn, tick, now } = setup();
  const teacher = await signIn({ firstName: 'Ms', lastInitial: 'R', role: 'teacher', schoolId: 'cadence-park' });
  const c = await accounts.createClass(teacher, { name: 'Room 12' });
  const kid = await signIn({ firstName: 'Maya', role: 'student', email: 'maya@iusd.org' });
  const other = await signIn({ firstName: 'Leo', role: 'student', email: 'leo@iusd.org' });
  await accounts.joinClass(kid, { code: c.code });
  await assert.rejects(accounts.createSchedule(teacher, { classId: c.id, startsAt: now() - 3600e3 }), /hasn’t passed/);
  const { schedule } = await accounts.createSchedule(teacher, { classId: c.id, startsAt: now() + 60e3, settings: { format: 'swiss', size: 8 } });
  await accounts.createSchedule(teacher, { scope: 'school', title: 'Cadence Park Cup', startsAt: now() + 120e3 });
  let made = 0;
  const createRoom = (settings) => {
    assert.equal(settings.type, 'tournament');
    made++;
    return { code: `ROOM${made}`, teacherKey: `key${made}` };
  };
  assert.deepEqual((await accounts.openDue(createRoom)), []);
  await assert.rejects(accounts.hostSchedule(teacher, schedule.id), /hasn’t started/);
  tick(61e3);
  assert.equal((await accounts.openDue(createRoom)).length, 1);
  assert.deepEqual((await accounts.hostSchedule(teacher, schedule.id)), { code: 'ROOM1', teacherKey: 'key1' });
  assert.deepEqual((await accounts.live(kid)).live.map((l) => l.code), ['ROOM1']);
  assert.deepEqual((await accounts.live(other)).live, []); // not in the class
  tick(60e3);
  await accounts.openDue(createRoom);
  assert.deepEqual((await accounts.live(other)).live.map((l) => l.title), ['Cadence Park Cup']); // the whole school
  assert.equal((await accounts.openDue(createRoom)).length, 0); // each opens once
});

test('audit log: account changes are logged by id, never by name or code', async () => {
  const lines = [];
  const store = openStore(':memory:');
  const auth = Auth.devProvider({ secret: 'test-secret' });
  const accounts = createAccounts({ store, auth, log: createLogger({ write: (l) => lines.push(JSON.parse(l)) }) });
  const signIn = async (person) => accounts.authenticate((await accounts.devSignIn(person)).token);
  const teacher = await signIn({ role: 'teacher', firstName: 'Ms', lastInitial: 'R', schoolId: 'cadence-park' });
  const kid = await signIn({ role: 'student', firstName: 'Maya', lastInitial: 'K', email: 'maya@iusd.org' });
  const c = await accounts.createClass(teacher, { name: 'Room 12' });
  await accounts.joinClass(kid, { code: c.code });
  await accounts.removeStudent(teacher, c.id, kid.id);
  assert.deepEqual(
    lines.map((l) => [l['event.name'], l['user.role']]),
    [['class.created', 'teacher'], ['class.joined', 'student'], ['class.student_removed', 'teacher']]
  );
  assert.equal(lines[2]['student.id'], kid.id);
  const text = JSON.stringify(lines);
  assert.ok(!text.includes('Maya') && !text.includes('Room 12') && !text.includes(c.code));
});

test('sign-in: the account is written when the token changes, otherwise once a minute', async () => {
  const { store, signIn, tick } = setup();
  const writes = [];
  const upsert = store.upsertUser;
  store.upsertUser = (u, at) => (writes.push(at), upsert(u, at));
  const a = await signIn({ firstName: 'Maya', lastInitial: 'K', role: 'student', email: 'maya@iusd.org' });
  await signIn({ firstName: 'Maya', lastInitial: 'K', role: 'student', email: 'maya@iusd.org' });
  tick(30 * 1000);
  const b = await signIn({ firstName: 'Maya', lastInitial: 'K', role: 'student', email: 'maya@iusd.org' });
  assert.equal(b.id, a.id);
  assert.equal(writes.length, 1, 'no write within the minute');
  tick(31 * 1000);
  await signIn({ firstName: 'Maya', lastInitial: 'K', role: 'student', email: 'maya@iusd.org' });
  assert.equal(writes.length, 2);
  assert.equal(store.user(a.id).lastSeen, writes[1]);
});
