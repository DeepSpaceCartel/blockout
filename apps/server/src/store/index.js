// The accounts store: MongoDB on a server, in memory for tests and for a quick
// run without a database. Every store has the same async interface (see
// memory.js, the simplest), checked by test/store.contract.js.
//   BLOCKOUT_STORE  mongo | memory | sqlite (the old file store)
import { openMemoryStore } from './memory.js';
import { openSqliteStore } from './sqlite.js';

async function openStore({ kind = 'memory', file, url } = {}) {
  if (kind === 'memory') return openMemoryStore();
  if (kind === 'sqlite') return openSqliteStore(file);
  if (kind === 'mongo') {
    const { openMongoStore } = await import('./mongo.js');
    return openMongoStore(url);
  }
  throw new Error(`no store called ${kind}`);
}

export { openStore };
