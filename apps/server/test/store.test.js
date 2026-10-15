// The accounts store contract, on every store that runs here. MongoDB runs when
// BLOCKOUT_MONGO_URL is set (CI starts one), each test in a database of its own.
import { runStoreContract } from './store.contract.js';
import { openMemoryStore } from '../src/store/memory.js';
import { openSqliteStore } from '../src/store/sqlite.js';

runStoreContract('memory', () => openMemoryStore());
runStoreContract('sqlite', () => openSqliteStore(':memory:'));

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
