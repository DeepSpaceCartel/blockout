// The server's settings, from the command line and the environment, in one
// place. Pure: loadConfig(env, argv) either returns the settings or throws a
// ConfigError naming everything that's wrong, so a bad deployment stops at
// start-up instead of running with unsafe defaults.

class ConfigError extends Error {
  constructor(problems) {
    super(`Blockout can't start:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.problems = problems;
  }
}

function loadConfig(env = {}, argv = []) {
  const flag = (name) => {
    const i = argv.indexOf(name);
    return i === -1 ? null : argv[i + 1];
  };
  const problems = [];
  const production = env.NODE_ENV === 'production';

  const port = Number(argv.find((a) => /^\d+$/.test(a)) || env.PORT || 8080);
  if (!Number.isInteger(port) || port < 0 || port > 65535) problems.push(`PORT must be a port number, not "${env.PORT}"`);

  // The address students should use, when it isn't this computer's own (tunnels, proxies)
  const publicUrl = (flag('--public-url') || env.PUBLIC_URL || '').replace(/\/*$/, '/').replace(/^\/$/, '');
  if (publicUrl && !/^https?:\/\/[^/]+/.test(publicUrl)) problems.push(`PUBLIC_URL must be a web address like https://blockout.example.org, not "${publicUrl}"`);

  const authKind = env.BLOCKOUT_AUTH || 'dev';
  if (!['dev', 'keycloak'].includes(authKind)) problems.push(`BLOCKOUT_AUTH must be "dev" or "keycloak", not "${authKind}"`);
  if (authKind === 'keycloak') {
    if (!env.KEYCLOAK_ISSUER) problems.push('BLOCKOUT_AUTH=keycloak needs KEYCLOAK_ISSUER (the realm URL)');
    if (!env.KEYCLOAK_CLIENT_ID) problems.push('BLOCKOUT_AUTH=keycloak needs KEYCLOAK_CLIENT_ID');
  }

  // How many proxies in front of us to trust for X-Forwarded-For (0: none, use the socket's address)
  const trustProxy = Number(env.TRUST_PROXY || 0);
  if (!Number.isInteger(trustProxy) || trustProxy < 0) problems.push(`TRUST_PROXY must be a number of proxies (0 or more), not "${env.TRUST_PROXY}"`);

  // Where accounts are kept: MongoDB (BLOCKOUT_MONGO_URL), or memory (nothing kept: tests and quick tries).
  // (The old sqlite file is only read by scripts/sqlite-to-mongo.js.)
  const storeKind = env.BLOCKOUT_STORE || (env.BLOCKOUT_MONGO_URL ? 'mongo' : 'memory');
  if (!['mongo', 'memory'].includes(storeKind)) problems.push(`BLOCKOUT_STORE must be mongo or memory, not "${storeKind}"${storeKind === 'sqlite' ? ' (copy the sqlite file into MongoDB with apps/server/scripts/sqlite-to-mongo.js)' : ''}`);
  if (storeKind === 'mongo' && !env.BLOCKOUT_MONGO_URL) problems.push('BLOCKOUT_STORE=mongo needs BLOCKOUT_MONGO_URL (mongodb://…)');

  // Where live classes are kept: Redis/Valkey (BLOCKOUT_REDIS_URL), shared by every server, or this server's memory
  const roomsKind = env.BLOCKOUT_ROOMS || (env.BLOCKOUT_REDIS_URL ? 'redis' : 'memory');
  if (!['redis', 'memory'].includes(roomsKind)) problems.push(`BLOCKOUT_ROOMS must be redis or memory, not "${roomsKind}"`);
  if (roomsKind === 'redis' && !env.BLOCKOUT_REDIS_URL) problems.push('BLOCKOUT_ROOMS=redis needs BLOCKOUT_REDIS_URL (redis://…)');

  const logLevel = env.LOG_LEVEL || 'info';
  if (!['debug', 'info', 'warn', 'error', 'silent'].includes(logLevel)) problems.push(`LOG_LEVEL must be debug, info, warn, error or silent, not "${logLevel}"`);
  // JSON lines for a log stack in production; short text lines at a terminal
  const logFormat = env.LOG_FORMAT || (production ? 'json' : 'text');
  if (!['json', 'text'].includes(logFormat)) problems.push(`LOG_FORMAT must be json or text, not "${logFormat}"`);

  // A public server must not run with the practice sign-in (anyone can pick any role) or over plain HTTP
  if (production) {
    if (authKind !== 'keycloak') problems.push('NODE_ENV=production needs BLOCKOUT_AUTH=keycloak: dev sign-in lets anyone be a teacher');
    if (!publicUrl.startsWith('https://')) problems.push('NODE_ENV=production needs PUBLIC_URL to be an https:// address');
    if (storeKind !== 'mongo') problems.push('NODE_ENV=production needs BLOCKOUT_MONGO_URL: accounts must be kept in MongoDB');
    if (roomsKind !== 'redis') problems.push('NODE_ENV=production needs BLOCKOUT_REDIS_URL: live classes must be shared by every server');
  }

  if (problems.length) throw new ConfigError(problems);
  return {
    production,
    port,
    publicUrl,
    https: publicUrl.startsWith('https://'),
    trustProxy,
    log: { level: logLevel, format: logFormat },
    // Names are also checked with OpenAI's free moderation model when this is set (and only then are names sent to OpenAI)
    openaiKey: env.OPENAI_API_KEY || '',
    store: { kind: storeKind, url: env.BLOCKOUT_MONGO_URL || undefined },
    rooms: { kind: roomsKind, url: env.BLOCKOUT_REDIS_URL || undefined, prefix: env.BLOCKOUT_REDIS_PREFIX || '' },
    auth: { kind: authKind, issuer: env.KEYCLOAK_ISSUER || null, clientId: env.KEYCLOAK_CLIENT_ID || null, secret: env.BLOCKOUT_AUTH_SECRET || null },
  };
}

export { loadConfig, ConfigError };
