// The accounts store: MongoDB on a server, in memory for tests and for a quick
// run without a database. Both have the same async interface (see memory.js,
// the simplest), checked by test/store.contract.js. (sqlite.js only reads old
// databases, for scripts/sqlite-to-mongo.js.)
//   BLOCKOUT_STORE  mongo | memory
import { openMemoryStore } from './memory.js';

async function openStore({ kind = 'memory', url } = {}) {
  if (kind === 'memory') return openMemoryStore();
  if (kind === 'mongo') {
    const { openMongoStore } = await import('./mongo.js');
    return openMongoStore(url);
  }
  throw new Error(`no store called ${kind}`);
}

export { openStore };
