import test from 'node:test';
import assert from 'node:assert';
import { createLogger, exception, redact } from '../src/log.js';

const capture = (options) => {
  const lines = [];
  const log = createLogger({ write: (l) => lines.push(l), now: () => new Date('2026-10-15T12:00:00Z'), ...options });
  return { log, lines };
};

test('log: one JSON object per line, with OpenTelemetry field names', () => {
  const { log, lines } = capture({ version: '0.3.0' });
  log.info('class.created', { 'user.id': 'u1', 'class.id': 'c1' });
  assert.deepEqual(JSON.parse(lines[0]), {
    timestamp: '2026-10-15T12:00:00.000Z',
    severity_text: 'INFO',
    severity_number: 9,
    'event.name': 'class.created',
    'service.name': 'blockout',
    'service.version': '0.3.0',
    'user.id': 'u1',
    'class.id': 'c1',
  });
});

test('log: below the level is dropped; silent drops everything', () => {
  const warn = capture({ level: 'warn' });
  warn.log.info('a');
  warn.log.error('b');
  assert.deepEqual(warn.lines.map((l) => JSON.parse(l)['event.name']), ['b']);
  const silent = capture({ level: 'silent' });
  silent.log.error('c');
  assert.equal(silent.lines.length, 0);
});

test('log: secrets and names are redacted, ids and routes are kept', () => {
  assert.deepEqual(redact({ 'user.id': 'u1', 'http.route': '/api/rooms/:code/join', token: 't', 'room.code': 'ABCD', firstName: 'Maya', 'teacher.key': 'k' }), {
    'user.id': 'u1',
    'http.route': '/api/rooms/:code/join',
    token: '[redacted]',
    'room.code': '[redacted]',
    firstName: '[redacted]',
    'teacher.key': '[redacted]',
  });
});

test('log: text format for a terminal; exceptions carry type and stack', () => {
  const { log, lines } = capture({ format: 'text' });
  log.error('server.error', exception(new TypeError('boom')));
  assert.match(lines[0], /^ERROR server\.error exception\.type=TypeError exception\.message=boom\n.*TypeError: boom/s);
});
