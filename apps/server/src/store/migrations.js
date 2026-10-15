// MongoDB schema steps, in order. Each runs once per database (the version is
// kept in meta._id 'schema'); a step must be safe to run again if a server
// stops halfway. Add new steps at the end; never change one that has run.
import { DEFAULT_SCHOOLS } from './shared.js';

const MIGRATIONS = [
  {
    version: 1,
    name: 'indexes and the first school',
    async up(db) {
      await db.collection('users').createIndexes([
        { key: { sub: 1 }, unique: true },
        // (only codes that exist must be unique)
        { key: { parentCode: 1 }, unique: true, partialFilterExpression: { parentCode: { $type: 'string' } } },
        { key: { role: 1, firstName: 1 } },
        { key: { schoolId: 1 } },
      ]);
      await db.collection('schools').createIndex({ domain: 1 }, { unique: true });
      await db.collection('classes').createIndexes([{ key: { code: 1 }, unique: true }, { key: { teacherId: 1 } }]);
      await db.collection('classMembers').createIndexes([{ key: { classId: 1, userId: 1 }, unique: true }, { key: { userId: 1 } }]);
      await db.collection('parentLinks').createIndexes([{ key: { parentId: 1, childId: 1 }, unique: true }, { key: { childId: 1 } }]);
      await db.collection('assignments').createIndexes([{ key: { classId: 1 } }, { key: { studentId: 1 } }, { key: { createdBy: 1 } }]);
      await db.collection('schedules').createIndexes([{ key: { openedAt: 1, startsAt: 1 } }, { key: { teacherId: 1 } }, { key: { classId: 1 } }]);
      for (const s of DEFAULT_SCHOOLS) {
        await db.collection('schools').updateOne({ _id: s.id }, { $setOnInsert: { name: s.name, domain: s.domain } }, { upsert: true });
      }
    },
  },
];

const LOCK_MS = 60 * 1000;

// Runs the steps this database hasn't had yet. Several servers may start at
// once: one takes the lock, the others wait for it to finish.
async function migrate(db, { now = () => Date.now(), steps = MIGRATIONS, owner = Math.random().toString(36).slice(2) } = {}) {
  const meta = db.collection('meta');
  await meta.updateOne({ _id: 'schema' }, { $setOnInsert: { version: 0, lockedUntil: 0 } }, { upsert: true });
  const latest = steps.length ? steps[steps.length - 1].version : 0;
  for (let waited = 0; ; waited++) {
    const doc = await meta.findOne({ _id: 'schema' });
    if (doc.version >= latest) return doc.version;
    const lock = await meta.findOneAndUpdate(
      { _id: 'schema', lockedUntil: { $lt: now() } },
      { $set: { lockedUntil: now() + LOCK_MS, lockedBy: owner } },
      { returnDocument: 'after' }
    );
    if (lock) {
      try {
        for (const step of steps.filter((s) => s.version > lock.version)) {
          await step.up(db);
          await meta.updateOne({ _id: 'schema' }, { $set: { version: step.version } });
        }
      } finally {
        await meta.updateOne({ _id: 'schema', lockedBy: owner }, { $set: { lockedUntil: 0 }, $unset: { lockedBy: '' } });
      }
      continue;
    }
    if (waited > LOCK_MS / 500) throw new Error('database migration is taking too long (is another server stuck?)');
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

export { MIGRATIONS, migrate };
