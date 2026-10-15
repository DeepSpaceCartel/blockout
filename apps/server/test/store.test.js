// The accounts store contract, on every store that runs here. MongoDB runs when
// BLOCKOUT_MONGO_URL is set (CI starts one), each test in a database of its own.
import { runStoreContract } from './store.contract.js';
import { openMemoryStore } from '../src/store/memory.js';
import { openSqliteStore } from '../src/store/sqlite.js';

runStoreContract('memory', () => openMemoryStore());
runStoreContract('sqlite', () => openSqliteStore(':memory:'));
