// What every accounts store must do, whatever keeps the data (memory, sqlite,
// MongoDB). runStoreContract(name, open) adds the tests; open() returns a
// fresh, empty store (and may be async).
import test from 'node:test';
import assert from 'node:assert';

const maya = { sub: 'kc:maya', role: 'student', firstName: 'Maya', lastInitial: 'K', domain: 'iusd.org', schoolId: 'cadence-park' };
const ben = { sub: 'kc:ben', role: 'student', firstName: 'Ben', lastInitial: 'A', domain: 'gmail.com', schoolId: null };
const msR = { sub: 'kc:r', role: 'teacher', firstName: 'Ms', lastInitial: 'R', domain: 'iusd.org', schoolId: 'cadence-park' };
const mom = { sub: 'kc:mom', role: 'parent', firstName: 'Ana', lastInitial: '', domain: 'gmail.com', schoolId: null };

function runStoreContract(name, open) {
  const withStore = (title, fn) =>
    test(`store (${name}): ${title}`, async () => {
      const store = await open();
      await store.migrate();
      try {
        await fn(store);
      } finally {
        await store.close();
      }
    });

  withStore('meta values and schools', async (store) => {
    assert.equal(await store.getMeta('x'), null);
    await store.setMeta('x', 'one');
    await store.setMeta('x', 'two');
    assert.equal(await store.getMeta('x'), 'two');
    assert.ok(await store.ping());
    assert.deepEqual(await store.schoolByDomain('IUSD.org'), { id: 'cadence-park', name: 'Cadence Park', domain: 'iusd.org' });
    await store.addSchool({ id: 'oak', name: 'Oak Hill', domain: 'Oak.EDU' });
    await store.addSchool({ id: 'oak2', name: 'Again', domain: 'oak.edu' }); // (domain taken: ignored)
    assert.deepEqual((await store.schools()).map((s) => s.id), ['cadence-park', 'oak']);
    assert.equal((await store.school('oak')).domain, 'oak.edu');
    assert.equal(await store.school('nope'), null);
  });

  withStore('users: created once per subject, updated on sign-in, found by id, subject and parent code', async (store) => {
    const a = await store.upsertUser(maya, 1000);
    assert.equal(a.name, 'Maya K.');
    assert.equal(a.createdAt, 1000);
    assert.equal(a.lastSeen, 1000);
    const again = await store.upsertUser({ ...maya, firstName: 'Mia', role: 'teacher' }, 2000);
    assert.equal(again.id, a.id);
    assert.equal(again.firstName, 'Mia');
    assert.equal(again.role, 'student', 'signing in never changes the role');
    assert.equal(again.invitedBy, null);
    assert.equal(again.createdAt, 1000);
    assert.equal(again.lastSeen, 2000);
    assert.equal((await store.userBySub('kc:maya')).id, a.id);
    assert.equal((await store.user(a.id)).sub, 'kc:maya');
    assert.equal(await store.user('nope'), null);
    await store.touchUser(a.id, 3000);
    assert.equal((await store.user(a.id)).lastSeen, 3000);
    await store.setRole(a.id, 'teacher', { invitedBy: 'someone' });
    assert.equal((await store.user(a.id)).role, 'teacher');
    assert.equal((await store.user(a.id)).invitedBy, 'someone');
    await store.setRole(a.id, 'student');
    assert.equal((await store.user(a.id)).invitedBy, 'someone', 'kept when not given');
    assert.equal((await store.upsertUser({ ...ben, role: undefined })).role, 'student', 'new accounts are students');
    const p = await store.upsertUser(mom, 1000);
    assert.equal(p.name, 'Ana', 'no initial, no dot');
    assert.deepEqual((await store.usersWithRole('parent')).map((u) => u.id), [p.id]);
  });

  withStore('users for admins: newest first, by first name and role', async (store) => {
    await store.upsertUser(maya, 10);
    await store.upsertUser(ben, 30);
    await store.upsertUser(msR, 20);
    await store.upsertUser({ ...maya, sub: 'kc:m2', firstName: 'Max' }, 5);
    assert.deepEqual((await store.listUsers()).users.map((u) => u.firstName), ['Ben', 'Ms', 'Maya', 'Max']);
    assert.equal((await store.listUsers()).total, 4);
    assert.deepEqual((await store.listUsers({ q: 'ma' })).users.map((u) => u.firstName), ['Maya', 'Max']);
    assert.deepEqual((await store.listUsers({ q: 'm', role: 'teacher' })).users.map((u) => u.firstName), ['Ms']);
    const page = await store.listUsers({ limit: 2, offset: 1 });
    assert.deepEqual([page.users.map((u) => u.firstName), page.total], [['Ms', 'Maya'], 4]);
    assert.equal((await store.listUsers({ q: '.*' })).total, 0, 'the search is text, not a pattern');
  });

  withStore('stale accounts: not seen since a time, oldest first', async (store) => {
    const a = await store.upsertUser(maya, 100);
    const b = await store.upsertUser(ben, 50);
    await store.upsertUser(msR, 300);
    assert.deepEqual(await store.staleUsers(200), [b.id, a.id]);
    assert.deepEqual(await store.staleUsers(200, 1), [b.id]);
    assert.deepEqual(await store.staleUsers(10), []);
  });

  withStore('invites: one use each, until they expire', async (store) => {
    const t = await store.upsertUser(msR);
    const a = await store.upsertUser(maya);
    const b = await store.upsertUser(ben);
    const i = await store.createInvite({ kind: 'parent', codeHash: 'h1', createdBy: t.id, childId: a.id, expiresAt: 1000 }, 100);
    assert.equal(i.usedBy, null);
    assert.equal((await store.invite(i.id)).childId, a.id);
    assert.equal((await store.inviteByHash('h1')).id, i.id);
    assert.equal(await store.inviteByHash('nope'), null);
    await assert.rejects(store.createInvite({ kind: 'parent', codeHash: 'h1', createdBy: t.id, expiresAt: 1000 }, 100), 'codes are unique');
    assert.equal(await store.redeemInvite('nope', b.id, 200), null);
    const [won, lost] = await Promise.all([store.redeemInvite('h1', b.id, 200), store.redeemInvite('h1', a.id, 200)]);
    assert.ok(Boolean(won) !== Boolean(lost), 'one of two at once wins');
    assert.equal((await store.invite(i.id)).usedAt, 200);
    await store.createInvite({ kind: 'teacher', codeHash: 'h2', createdBy: t.id, schoolId: 'cadence-park', expiresAt: 1000 }, 300);
    assert.equal(await store.redeemInvite('h2', b.id, 1000), null, 'expired');
    await store.createInvite({ kind: 'parent', codeHash: 'h3', createdBy: t.id, childId: a.id, expiresAt: 5000 }, 400);
    await store.createInvite({ kind: 'parent', codeHash: 'h4', createdBy: t.id, childId: b.id, expiresAt: 5000 }, 500);
    assert.deepEqual((await store.invitesBy(t.id)).map((x) => x.codeHash), ['h4', 'h3', 'h2', 'h1']);
    assert.equal(await store.countInvites({ createdBy: t.id, kind: 'parent', since: 150 }), 2);
    assert.equal(await store.countInvites({ createdBy: t.id, kind: 'parent', unused: true }), 2);
    await store.revokeInvites({ createdBy: t.id, kind: 'parent', childId: a.id });
    assert.deepEqual((await store.invitesBy(t.id)).map((x) => x.codeHash), ['h4', 'h2', 'h1'], 'used ones stay');
    assert.deepEqual((await store.allInvites({ kind: 'teacher' })).map((x) => x.codeHash), ['h2']);
    await store.deleteInvite((await store.allInvites({ kind: 'teacher' }))[0].id);
    assert.deepEqual((await store.allInvites()).map((x) => x.codeHash), ['h4', 'h1']);
  });

  withStore('deleting a user takes everything of theirs with them', async (store) => {
    const t = await store.upsertUser(msR);
    const a = await store.upsertUser(maya);
    const b = await store.upsertUser(ben);
    const p = await store.upsertUser(mom);
    const c = await store.createClass({ teacherId: t.id, name: 'Room 12', code: 'ABC234' });
    await store.addMember(c.id, a.id);
    await store.addMember(c.id, b.id);
    await store.linkParent(p.id, a.id);
    await store.putProgress(a.id, { coins: 1 });
    await store.putProgress(t.id, { coins: 2 });
    await store.createAssignment({ createdBy: t.id, classId: c.id, goal: { type: 'games', games: 1 } });
    await store.createAssignment({ createdBy: p.id, studentId: a.id, goal: { type: 'games', games: 1 } });
    await store.createSchedule({ teacherId: t.id, scope: 'class', classId: c.id, title: 'Cup', startsAt: 1 });
    await store.createInvite({ kind: 'parent', codeHash: 'x1', createdBy: t.id, childId: b.id, expiresAt: 9e12 });
    await store.createInvite({ kind: 'parent', codeHash: 'x2', createdBy: p.id, childId: a.id, expiresAt: 9e12 });

    await store.deleteUser(a.id);
    let all = JSON.stringify(await store.exportAll());
    assert.ok(!all.includes(a.id), 'nothing refers to the child any more');
    assert.deepEqual((await store.members(c.id)).map((u) => u.id), [b.id]);
    assert.deepEqual(await store.parentsOf(a.id), []);

    await store.deleteUser(t.id);
    all = await store.exportAll();
    assert.ok(!JSON.stringify(all).includes(t.id), 'nor to the teacher');
    assert.deepEqual([all.classes, all.classMembers, all.schedules], [[], [], []], 'their class went with them');
    assert.deepEqual(all.users.map((u) => u.id).sort(), [b.id, p.id].sort());
    assert.equal((await store.parentsOf(b.id)).length, 0);
  });

  withStore('progress: one save per user, replaced whole', async (store) => {
    const a = await store.upsertUser(maya);
    assert.equal(await store.getProgress(a.id), null);
    await store.putProgress(a.id, { coins: 1, facts: { '3x4': [1, 0] } }, 10);
    await store.putProgress(a.id, { coins: 2 }, 20);
    assert.deepEqual(await store.getProgress(a.id), { data: { coins: 2 }, updatedAt: 20 });
    const got = await store.getProgress(a.id);
    got.data.coins = 99;
    assert.equal((await store.getProgress(a.id)).data.coins, 2, 'a copy: changing it changes nothing stored');
  });

  withStore('classes and rosters', async (store) => {
    const t = await store.upsertUser(msR);
    const [a, b] = [await store.upsertUser(maya), await store.upsertUser(ben)];
    const c1 = await store.createClass({ teacherId: t.id, schoolId: 'cadence-park', name: 'Room 12', code: 'ABC234' }, 1);
    const c2 = await store.createClass({ teacherId: t.id, name: 'Club', code: 'XYZ789' }, 2);
    assert.equal(c2.schoolId, null);
    await assert.rejects(store.createClass({ teacherId: t.id, name: 'Dup', code: 'ABC234' }, 3), 'codes are unique');
    assert.equal((await store.classByCode('ABC234')).id, c1.id);
    assert.equal(await store.classByCode('NOPE'), null);
    assert.deepEqual((await store.classesOfTeacher(t.id)).map((c) => c.name), ['Room 12', 'Club']);
    await store.addMember(c1.id, a.id, 5);
    await store.addMember(c1.id, b.id, 6);
    await store.addMember(c1.id, b.id, 7); // (already in: ignored)
    await store.addMember(c2.id, a.id, 8);
    assert.deepEqual((await store.members(c1.id)).map((u) => u.name), ['Ben A.', 'Maya K.'], 'by first name');
    assert.deepEqual((await store.classesOfStudent(a.id)).map((c) => c.name), ['Room 12', 'Club']);
    assert.ok(await store.isMember(c1.id, b.id));
    await store.removeMember(c1.id, b.id);
    assert.ok(!(await store.isMember(c1.id, b.id)));
    await store.renameClass(c2.id, 'Chess club');
    assert.equal((await store.classById(c2.id)).name, 'Chess club');
  });

  withStore('parent links', async (store) => {
    const p = await store.upsertUser(mom);
    const [a, b] = [await store.upsertUser(maya), await store.upsertUser(ben)];
    await store.linkParent(p.id, a.id, 1);
    await store.linkParent(p.id, b.id, 2);
    await store.linkParent(p.id, b.id, 3);
    assert.deepEqual((await store.childrenOf(p.id)).map((u) => u.firstName), ['Ben', 'Maya']);
    assert.deepEqual((await store.parentsOf(a.id)).map((u) => u.id), [p.id]);
    assert.ok(await store.isParentOf(p.id, a.id));
    await store.unlinkParent(p.id, a.id);
    assert.ok(!(await store.isParentOf(p.id, a.id)));
    assert.deepEqual((await store.childrenOf(p.id)).map((u) => u.firstName), ['Ben']);
  });

  withStore('homework: for a class or one student, in the order it was set', async (store) => {
    const t = await store.upsertUser(msR);
    const p = await store.upsertUser(mom);
    const a = await store.upsertUser(maya);
    const c = await store.createClass({ teacherId: t.id, name: 'Room 12', code: 'ABC234' });
    await store.addMember(c.id, a.id);
    const h1 = await store.createAssignment({ createdBy: t.id, classId: c.id, goal: { type: 'games', games: 2 }, due: '2026-10-20' }, 10);
    const h2 = await store.createAssignment({ createdBy: p.id, studentId: a.id, goal: { type: 'master', table: 7 } }, 20);
    assert.deepEqual(h1.goal, { type: 'games', games: 2 });
    assert.equal(h2.due, null);
    assert.equal(h2.classId, null);
    assert.deepEqual((await store.assignmentsForClass(c.id)).map((h) => h.id), [h1.id]);
    assert.deepEqual((await store.assignmentsForStudent(a.id)).map((h) => h.id), [h1.id, h2.id]);
    await store.deleteAssignment(h1.id);
    assert.equal(await store.assignment(h1.id), null);
    assert.deepEqual((await store.assignmentsForStudent(a.id)).map((h) => h.id), [h2.id]);
  });

  withStore('scheduled tournaments: due ones open exactly once; students see their class and school ones', async (store) => {
    const t = await store.upsertUser(msR);
    const a = await store.upsertUser(maya);
    const b = await store.upsertUser(ben);
    const c = await store.createClass({ teacherId: t.id, schoolId: 'cadence-park', name: 'Room 12', code: 'ABC234' });
    await store.addMember(c.id, a.id);
    const s1 = await store.createSchedule({ teacherId: t.id, scope: 'class', classId: c.id, schoolId: 'cadence-park', title: 'Class cup', startsAt: 100, settings: { format: 'swiss' } }, 1);
    const s2 = await store.createSchedule({ teacherId: t.id, scope: 'school', schoolId: 'cadence-park', title: 'School cup', startsAt: 50 }, 2);
    assert.deepEqual(s2.settings, {});
    assert.equal(s1.roomCode, null);
    assert.deepEqual((await store.schedulesOfTeacher(t.id)).map((s) => s.title), ['School cup', 'Class cup'], 'by start time');
    assert.deepEqual((await store.dueSchedules(60)).map((s) => s.id), [s2.id]);
    assert.equal(await store.markOpened(s2.id, 'ROOM', 'key', 60), true);
    assert.equal(await store.markOpened(s2.id, 'ROOM2', 'key2', 61), false, 'only once');
    assert.equal((await store.schedule(s2.id)).roomCode, 'ROOM');
    assert.deepEqual(await store.dueSchedules(60), []);
    await store.markOpened(s1.id, 'ROOM3', 'k', 100);
    assert.deepEqual((await store.openSchedulesForStudent(a)).map((s) => s.title), ['School cup', 'Class cup']);
    assert.deepEqual(await store.openSchedulesForStudent(b), [], 'not in the class, not at the school');
    await store.deleteSchedule(s1.id);
    assert.equal(await store.schedule(s1.id), null);
  });

  withStore('export: everything stored, by collection', async (store) => {
    const t = await store.upsertUser(msR);
    await store.putProgress(t.id, { coins: 3 }, 5);
    const all = await store.exportAll();
    for (const key of ['meta', 'schools', 'users', 'progress', 'classes', 'classMembers', 'parentLinks', 'assignments', 'schedules', 'invites']) assert.ok(key in all, key);
    assert.deepEqual(all.progress, [{ userId: t.id, data: { coins: 3 }, updatedAt: 5 }]);
    assert.equal(all.users[0].sub, 'kc:r');
    assert.ok(!('name' in all.users[0]), 'the shown name is derived, not stored');
  });
}

export { runStoreContract };
