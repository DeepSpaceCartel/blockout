// Blockout sign-in: one interface, swappable providers. No dependencies.
//
// Every provider turns a bearer token into the same claims shape (OIDC-style):
//   { sub, given_name, family_name, email?, roles: ['student'|'teacher'|'parent'] }
// and `identity(claims)` turns claims into what we store (first name, last
// initial, role, email *domain* only).
//
// Providers:
//   dev       issues and checks HMAC-SHA256 signed JWTs ("dev login": pick any
//             name and role). For development and the first classroom trials.
//   keycloak  checks RS256 JWTs from a Keycloak realm (OIDC with PKCE in the
//             browser). Keycloak can broker Google sign-in, restricted to a
//             school's domain (e.g. @iusd.org). Roles come from realm roles.
//
//   BLOCKOUT_AUTH=keycloak KEYCLOAK_ISSUER=https://id.example.org/realms/blockout KEYCLOAK_CLIENT_ID=blockout
import crypto from 'crypto';

const ROLES = ['student', 'teacher', 'parent'];
const TOKEN_HOURS = 12; // dev sign-in tokens can't be renewed: a school day, then sign in again

class AuthError extends Error {
  constructor(message) {
    super(message);
    this.code = 'auth';
  }
}

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const fromB64url = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

function decodeJwt(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new AuthError('Not a sign-in token.');
  try {
    return { header: JSON.parse(fromB64url(parts[0])), payload: JSON.parse(fromB64url(parts[1])), signed: `${parts[0]}.${parts[1]}`, signature: fromB64url(parts[2]) };
  } catch (e) {
    throw new AuthError('Not a sign-in token.');
  }
}

function checkTimes(payload, now) {
  const secs = Math.floor(now / 1000);
  if (typeof payload.exp === 'number' && payload.exp < secs) throw new AuthError('Your sign-in has expired. Please sign in again.');
  if (typeof payload.nbf === 'number' && payload.nbf > secs + 60) throw new AuthError('Sign-in token not valid yet.');
}

// ---------------------------------------------------------------- dev provider

function devProvider({ secret, now = () => Date.now() }) {
  if (!secret) throw new Error('dev auth needs a secret');
  const sign = (data) => crypto.createHmac('sha256', secret).update(data).digest();
  return {
    name: 'dev',
    // Issue a token for a made-up person: { firstName, lastInitial, role, email? }
    issue(person) {
      const role = ROLES.includes(person.role) ? person.role : 'student';
      const firstName = cleanFirstName(person.firstName);
      if (!firstName) throw new AuthError('Please type a first name.');
      const lastInitial = cleanInitial(person.lastInitial);
      const email = person.email ? String(person.email).trim().toLowerCase() : '';
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new AuthError('That email doesn’t look right.');
      // The same person (name, role, email) always gets the same subject, so
      // signing in again finds the same account.
      const sub = `dev:${crypto.createHash('sha256').update(`${role}|${firstName.toLowerCase()}|${lastInitial}|${email}`).digest('hex').slice(0, 24)}`;
      const iat = Math.floor(now() / 1000);
      const payload = { iss: 'blockout-dev', sub, given_name: firstName, family_name: lastInitial, roles: [role], iat, exp: iat + TOKEN_HOURS * 3600 };
      if (email) payload.email = email;
      const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const body = b64url(JSON.stringify(payload));
      return `${head}.${body}.${b64url(sign(`${head}.${body}`))}`;
    },
    async verify(token) {
      const t = decodeJwt(token);
      if (t.header.alg !== 'HS256') throw new AuthError('Wrong kind of sign-in token.');
      const expected = sign(t.signed);
      if (expected.length !== t.signature.length || !crypto.timingSafeEqual(expected, t.signature)) throw new AuthError('Sign-in token isn’t valid.');
      checkTimes(t.payload, now());
      return t.payload;
    },
  };
}

// ---------------------------------------------------------------- keycloak provider

// issuer: https://host/realms/NAME. fetchJson(url) is injectable for tests.
function keycloakProvider({ issuer, clientId, fetchJson = defaultFetchJson, now = () => Date.now() }) {
  if (!issuer || !clientId) throw new Error('keycloak auth needs KEYCLOAK_ISSUER and KEYCLOAK_CLIENT_ID');
  let keys = null; // kid -> KeyObject
  let fetchedAt = 0;
  async function keyFor(kid) {
    if (!keys || !keys.has(kid) || now() - fetchedAt > 3600 * 1000) {
      const jwks = await fetchJson(`${issuer}/protocol/openid-connect/certs`);
      keys = new Map((jwks.keys || []).filter((k) => k.kty === 'RSA').map((k) => [k.kid, crypto.createPublicKey({ key: k, format: 'jwk' })]));
      fetchedAt = now();
    }
    const key = keys.get(kid);
    if (!key) throw new AuthError('Unknown sign-in key.');
    return key;
  }
  return {
    name: 'keycloak',
    config: { issuer, clientId },
    async verify(token) {
      const t = decodeJwt(token);
      if (t.header.alg !== 'RS256') throw new AuthError('Wrong kind of sign-in token.');
      const ok = crypto.verify('RSA-SHA256', Buffer.from(t.signed), await keyFor(t.header.kid), t.signature);
      if (!ok) throw new AuthError('Sign-in token isn’t valid.');
      const p = t.payload;
      if (p.iss !== issuer) throw new AuthError('Sign-in token is from somewhere else.');
      const aud = [].concat(p.aud || []);
      if (p.azp !== clientId && !aud.includes(clientId)) throw new AuthError('Sign-in token is for another app.');
      checkTimes(p, now());
      // Keycloak puts realm roles under realm_access.roles
      return { ...p, roles: p.roles || (p.realm_access && p.realm_access.roles) || [] };
    },
  };
}

async function defaultFetchJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new AuthError('Can’t reach the sign-in server.');
  return res.json();
}

// ---------------------------------------------------------------- identity

function cleanFirstName(name) {
  const n = String(name || '')
    .normalize('NFC')
    .replace(/[^\p{L}\p{M}' -]/gu, '')
    .trim()
    .split(/\s+/)[0] || '';
  return n.slice(0, 20);
}

function cleanInitial(s) {
  const c = String(s || '').normalize('NFC').replace(/[^\p{L}]/gu, '').charAt(0);
  return c ? c.toUpperCase() : '';
}

// Claims -> what we keep. Role: the first of our roles the token has; without
// one, a school-domain account is a student and anyone else a parent.
function identity(claims, { schoolByDomain = () => null } = {}) {
  const email = String(claims.email || '').toLowerCase();
  const domain = email.includes('@') ? email.split('@').pop() : null;
  const school = domain ? schoolByDomain(domain) : null;
  const roles = [].concat(claims.roles || []);
  const role = ROLES.find((r) => roles.includes(r)) || (school ? 'student' : 'parent');
  const firstName = cleanFirstName(claims.given_name || claims.name || claims.preferred_username) || 'Player';
  return {
    sub: String(claims.sub),
    role,
    firstName,
    lastInitial: cleanInitial(claims.family_name),
    domain,
    schoolId: school ? school.id : null,
  };
}

async function fromEnv(env, store) {
  if (env.BLOCKOUT_AUTH === 'keycloak') return keycloakProvider({ issuer: env.KEYCLOAK_ISSUER, clientId: env.KEYCLOAK_CLIENT_ID });
  // The dev secret is kept in the database so sign-ins survive a restart
  let secret = env.BLOCKOUT_AUTH_SECRET || (await store.getMeta('devSecret'));
  if (!secret) {
    secret = crypto.randomBytes(32).toString('hex');
    await store.setMeta('devSecret', secret);
  }
  return devProvider({ secret });
}

// "Bearer xyz" -> "xyz"
const bearer = (req) => {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
};

export { ROLES, AuthError, devProvider, keycloakProvider, identity, fromEnv, bearer, cleanFirstName, cleanInitial, b64url };
