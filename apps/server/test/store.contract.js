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
    const again = await store.upsertUser({ ...maya, firstName: 'Mia' }, 2000);
    assert.equal(again.id, a.id);
    assert.equal(again.firstName, 'Mia');
    assert.equal(again.createdAt, 1000);
    assert.equal(again.lastSeen, 2000);
    assert.equal((await store.userBySub('kc:maya')).id, a.id);
    assert.equal((await store.user(a.id)).sub, 'kc:maya');
    assert.equal(await store.user('nope'), null);
    await store.touchUser(a.id, 3000);
    assert.equal((await store.user(a.id)).lastSeen, 3000);
    await store.setParentCode(a.id, 'ABCD2345');
    assert.equal((await store.userByParentCode('ABCD2345')).id, a.id);
    assert.equal(await store.userByParentCode('NOPE'), null);
    const p = await store.upsertUser(mom, 1000);
    assert.equal(p.name, 'Ana', 'no initial, no dot');
    assert.deepEqual((await store.usersWithRole('student')).map((u) => u.id), [a.id]);
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
    for (const key of ['meta', 'schools', 'users', 'progress', 'classes', 'classMembers', 'parentLinks', 'assignments', 'schedules']) assert.ok(key in all, key);
    assert.deepEqual(all.progress, [{ userId: t.id, data: { coins: 3 }, updatedAt: 5 }]);
    assert.equal(all.users[0].sub, 'kc:r');
    assert.ok(!('name' in all.users[0]), 'the shown name is derived, not stored');
  });
}

export { runStoreContract };
