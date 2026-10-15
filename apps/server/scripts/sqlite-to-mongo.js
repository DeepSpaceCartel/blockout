#!/usr/bin/env node
// Copies the accounts in an old sqlite file (data/blockout.db) into MongoDB.
// Safe to run again: every record is written by its id, so a second run
// changes nothing. Prints how many of each it found and how many MongoDB has.
//
//   BLOCKOUT_MONGO_URL=mongodb://… node apps/server/scripts/sqlite-to-mongo.js [data/blockout.db] [--dry-run]
import path from 'path';
import { openSqliteStore } from '../src/store/sqlite.js';
import { openMongoStore } from '../src/store/mongo.js';

// Writes one export (store.exportAll()) into a MongoDB store's database
async function copyInto(db, all) {
  // Each record replaces the one with the same key, or is added
  const put = (name, docs, key) => Promise.all(docs.map((d) => db.collection(name).replaceOne(key(d), d, { upsert: true })));
  const byId = ({ _id }) => ({ _id });
  const withId = ({ id, ...rest }) => ({ _id: id, ...rest });
  for (const name of ['schools', 'users', 'classes', 'assignments', 'schedules']) await put(name, all[name].map(withId), byId);
  await put('progress', all.progress.map((p) => ({ _id: p.userId, json: JSON.stringify(p.data), updatedAt: p.updatedAt })), byId);
  await put('classMembers', all.classMembers, ({ classId, userId }) => ({ classId, userId }));
  await put('parentLinks', all.parentLinks, ({ parentId, childId }) => ({ parentId, childId }));
  for (const [key, value] of Object.entries(all.meta)) await db.collection('meta').updateOne({ _id: key }, { $set: { value } }, { upsert: true });
}

const counts = (all) => Object.fromEntries(Object.entries(all).map(([k, v]) => [k, Array.isArray(v) ? v.length : Object.keys(v).length]));

async function main(argv) {
  const dryRun = argv.includes('--dry-run');
  const file = path.resolve(argv.find((a) => !a.startsWith('--')) || path.join(import.meta.dirname, '..', '..', '..', 'data', 'blockout.db'));
  const sqlite = openSqliteStore(file);
  const all = await sqlite.exportAll();
  await sqlite.close();
  console.log(`In ${file}:`, counts(all));
  if (dryRun) return;
  if (!process.env.BLOCKOUT_MONGO_URL) throw new Error('Set BLOCKOUT_MONGO_URL to the MongoDB to copy into.');
  const mongo = await openMongoStore(process.env.BLOCKOUT_MONGO_URL);
  try {
    await mongo.migrate();
    await copyInto(mongo.db, all);
    console.log('In MongoDB now:', counts(await mongo.exportAll()));
  } finally {
    await mongo.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}

export { copyInto };
