// What every accounts store shares: ids, the first school, how a name is shown.
import crypto from 'crypto';

const newId = () => crypto.randomBytes(8).toString('hex');

// The first school. More can be added with addSchool().
const DEFAULT_SCHOOLS = [{ id: 'cadence-park', name: 'Cadence Park', domain: 'iusd.org' }];

// "Maya K." (or just "Maya")
const nameOf = (u) => (u.lastInitial ? `${u.firstName} ${u.lastInitial}.` : u.firstName);

// Rosters are listed by first name, then last initial
const byName = (a, b) => a.firstName.localeCompare(b.firstName) || a.lastInitial.localeCompare(b.lastInitial);

export { newId, DEFAULT_SCHOOLS, nameOf, byName };
