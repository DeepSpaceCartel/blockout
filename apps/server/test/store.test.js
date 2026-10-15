// The accounts store contract, on every store that runs here. MongoDB runs when
// BLOCKOUT_MONGO_URL is set (CI starts one), each test in a database of its own.
import { runStoreContract } from './store.contract.js';
import { openMemoryStore } from '../src/store/memory.js';
import { openSqliteStore } from '../src/store/sqlite.js';

runStoreContract('memory', () => openMemoryStore());

// MongoDB: a database of its own for each test, dropped afterwards
const MONGO_URL = process.env.BLOCKOUT_MONGO_URL;
if (MONGO_URL) {
  const { openMongoStore } = await import('../src/store/mongo.js');
  let n = 0;
  runStoreContract('mongo', async () => {
    const store = await openMongoStore(MONGO_URL, { dbName: `blockout_test_${process.pid}_${n++}` });
    const close = store.close;
    store.close = async () => {
      await store.db.dropDatabase();
      await close();
    };
    return store;
  });
}

if (MONGO_URL) {
  const test = (await import('node:test')).default;
  const assert = (await import('node:assert')).default;
  const { MongoClient } = await import('mongodb');
  const { migrate, MIGRATIONS } = await import('../src/store/migrations.js');

  test('migrations (mongo): several servers starting at once run each step exactly once', async () => {
    const client = await new MongoClient(MONGO_URL).connect();
    const db = client.db(`blockout_test_${process.pid}_migrate`);
    try {
      let runs = 0;
      const steps = [...MIGRATIONS, { version: 99, up: async () => (runs++, new Promise((r) => setTimeout(r, 300))) }];
      const versions = await Promise.all([1, 2, 3].map((i) => migrate(db, { steps, owner: `server${i}` })));
      assert.deepEqual(versions, [99, 99, 99]);
      assert.equal(runs, 1);
      assert.equal(await migrate(db, { steps }), 99, 'nothing left to do');
      assert.ok((await db.collection('users').indexes()).some((ix) => ix.unique && ix.key.sub === 1));
    } finally {
      await db.dropDatabase();
      await client.close();
    }
  });
}

if (MONGO_URL) {
  const test = (await import('node:test')).default;
  const assert = (await import('node:assert')).default;
  const { openMongoStore } = await import('../src/store/mongo.js');
  const { copyInto } = await import('../scripts/sqlite-to-mongo.js');

  test('sqlite to MongoDB: everything is copied, and copying again changes nothing', async () => {
    const sqlite = openSqliteStore(':memory:');
    const t = await sqlite.upsertUser({ sub: 'kc:t', role: 'teacher', firstName: 'Ms', lastInitial: 'R', domain: 'iusd.org', schoolId: 'cadence-park' }, 1);
    const kid = await sqlite.upsertUser({ sub: 'kc:k', role: 'student', firstName: 'Maya', lastInitial: 'K', domain: 'iusd.org', schoolId: 'cadence-park' }, 2);
    const mom = await sqlite.upsertUser({ sub: 'kc:m', role: 'parent', firstName: 'Ana', lastInitial: '', domain: 'gmail.com', schoolId: null }, 3);
    await sqlite.setParentCode(kid.id, 'ABCD2345');
    await sqlite.putProgress(kid.id, { coins: 5, facts: { '3x4': [2, 1] } }, 4);
    const c = await sqlite.createClass({ teacherId: t.id, schoolId: 'cadence-park', name: 'Room 12', code: 'ABC234' }, 5);
    await sqlite.addMember(c.id, kid.id, 6);
    await sqlite.linkParent(mom.id, kid.id, 7);
    await sqlite.createAssignment({ createdBy: t.id, classId: c.id, goal: { type: 'games', games: 2 }, due: '2026-10-20' }, 8);
    const s = await sqlite.createSchedule({ teacherId: t.id, scope: 'class', classId: c.id, title: 'Cup', startsAt: 100, settings: { format: 'swiss' } }, 9);
    await sqlite.markOpened(s.id, 'ROOM', 'key', 100);
    await sqlite.setMeta('devSecret', 'shh');
    const before = await sqlite.exportAll();

    const mongo = await openMongoStore(MONGO_URL, { dbName: `blockout_test_${process.pid}_copy` });
    try {
      await mongo.migrate();
      await copyInto(mongo.db, before);
      await copyInto(mongo.db, before);
      const after = await mongo.exportAll();
      const sorted = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Array.isArray(v) ? [...v].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) : v]));
      assert.deepEqual(sorted(after), sorted(before));
      // and the store reads it as its own
      assert.equal((await mongo.userByParentCode('ABCD2345')).name, 'Maya K.');
      assert.deepEqual((await mongo.members(c.id)).map((u) => u.id), [kid.id]);
      assert.deepEqual((await mongo.openSchedulesForStudent(kid)).map((x) => x.roomCode), ['ROOM']);
    } finally {
      await mongo.db.dropDatabase();
      await mongo.close();
    }
  });
}
