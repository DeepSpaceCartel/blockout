import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codeLink, parseLink, spaced } from '../src/links.js';

test('codes and classes come from web links and app links', () => {
  assert.deepEqual(parseLink('https://blockout.deepspacecartel.com/#code=abcd2345'), { kind: 'code', code: 'ABCD2345' });
  assert.deepEqual(parseLink('https://blockout.deepspacecartel.com/#roster=QX7K2P'), { kind: 'roster', code: 'QX7K2P' });
  assert.deepEqual(parseLink('blockout://code/ABCD2345'), { kind: 'code', code: 'ABCD2345' });
  assert.deepEqual(parseLink('exp://slejycq-deepspacecartel-8081.exp.direct/--/roster/qx7k2p'), { kind: 'roster', code: 'QX7K2P' });
  assert.equal(parseLink('blockout://auth?code=xyz'), null, 'the sign-in redirect is not a code');
  assert.equal(parseLink('exp://host/--/auth?code=abc'), null);
  assert.equal(parseLink(null), null);
  assert.deepEqual(parseLink('https://blockout.deepspacecartel.com/#class=qxkp'), { kind: 'class', code: 'QXKP' });
  assert.deepEqual(parseLink('https://blockout.deepspacecartel.com/#class=QXKP&play=0a1b'), { kind: 'class', code: 'QXKP' });
  assert.deepEqual(parseLink('blockout://class/QXKP'), { kind: 'class', code: 'QXKP' });
});

test('a code is shared as the web link, and read in two halves', () => {
  assert.equal(codeLink('https://b.example', 'ABCD2345'), 'https://b.example/#code=ABCD2345');
  assert.equal(spaced('ABCD2345'), 'ABCD 2345');
});
