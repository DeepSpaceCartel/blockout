import test from 'node:test';
import assert from 'node:assert';
import { loadConfig, ConfigError } from '../src/config.js';

const KEYCLOAK = { BLOCKOUT_AUTH: 'keycloak', KEYCLOAK_ISSUER: 'https://id.example.org/realms/blockout', KEYCLOAK_CLIENT_ID: 'blockout' };

test('config: development defaults', () => {
  const c = loadConfig({}, []);
  assert.equal(c.production, false);
  assert.equal(c.port, 8080);
  assert.equal(c.publicUrl, '');
  assert.equal(c.auth.kind, 'dev');
  assert.equal(c.trustProxy, 0);
});

test('config: port from the command line beats PORT; public URL gets one trailing slash', () => {
  const c = loadConfig({ PORT: '9000', PUBLIC_URL: 'https://x.trycloudflare.com///' }, ['8135']);
  assert.equal(c.port, 8135);
  assert.equal(c.publicUrl, 'https://x.trycloudflare.com/');
  assert.equal(c.https, true);
  assert.equal(loadConfig({}, ['--public-url', 'http://10.0.0.5:8080']).publicUrl, 'http://10.0.0.5:8080/');
});

test('config: production refuses dev sign-in and plain HTTP, listing every problem', () => {
  assert.throws(
    () => loadConfig({ NODE_ENV: 'production' }, []),
    (e) => e instanceof ConfigError && e.problems.length === 2 && /dev sign-in/.test(e.message) && /https/.test(e.message)
  );
  const c = loadConfig({ NODE_ENV: 'production', PUBLIC_URL: 'https://blockout.example.org', TRUST_PROXY: '1', ...KEYCLOAK }, []);
  assert.equal(c.production, true);
  assert.equal(c.auth.issuer, KEYCLOAK.KEYCLOAK_ISSUER);
  assert.equal(c.trustProxy, 1);
});

test('config: bad values are caught at start-up', () => {
  for (const env of [{ BLOCKOUT_AUTH: 'magic' }, { BLOCKOUT_AUTH: 'keycloak' }, { TRUST_PROXY: 'yes' }, { PUBLIC_URL: 'blockout.org' }, { PORT: '99999' }]) {
    assert.throws(() => loadConfig(env, []), ConfigError, JSON.stringify(env));
  }
});
