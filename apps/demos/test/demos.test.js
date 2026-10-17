import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import { DEMOS, GROUPS } from '../src/catalog.js';
import { LEVELS, makeFact, nearMisses, factorPair, isPrime } from '../src/kit.js';

// a repeatable "random" for tests
function seeded(seed = 1) {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
}

test('every demo in the catalog has a game module that mounts, and every module is listed', () => {
  const files = fs.readdirSync(new URL('../src/games/', import.meta.url)).filter((f) => f.endsWith('.js'));
  const ids = DEMOS.map((d) => d.id);
  assert.equal(new Set(ids).size, ids.length, 'ids are unique');
  for (const id of ids) {
    assert.ok(files.includes(`${id}.js`), `${id}.js exists`);
    const src = fs.readFileSync(new URL(`../src/games/${id}.js`, import.meta.url), 'utf8');
    assert.match(src, /export function mount\(stage, ctx\)/, `${id} exports mount(stage, ctx)`);
  }
  for (const f of files) assert.ok(ids.includes(f.replace('.js', '')), `${f} is in the catalog`);
  for (const d of DEMOS) {
    assert.ok(GROUPS.some((g) => g.id === d.group), `${d.id} is in a group`);
    assert.ok(d.name && d.classic && d.idea && d.how.length >= 2, `${d.id} has its text`);
  }
  assert.equal(DEMOS.length, 26);
});

test('facts come from the level’s tables and are right; near misses are never the answer', () => {
  for (const level of Object.keys(LEVELS)) {
    const rng = seeded(3);
    for (let i = 0; i < 200; i++) {
      const f = makeFact(level, rng);
      assert.equal(f.answer, f.a * f.b);
      assert.equal(f.text, `${f.a} × ${f.b}`);
      assert.ok(LEVELS[level].tables.includes(f.a) || LEVELS[level].tables.includes(f.b), `${f.text} on ${level}`);
      const wrong = nearMisses(rng, f.answer, 3, f);
      assert.equal(wrong.length, 3);
      assert.ok(wrong.every((w) => w > 0 && w !== f.answer));
      assert.equal(new Set(wrong).size, 3);
    }
  }
});

test('factor pairs and primes', () => {
  const rng = seeded(5);
  assert.equal(factorPair(rng, 7), null);
  const [a, b] = factorPair(rng, 24);
  assert.equal(a * b, 24);
  assert.ok(a > 1 && b > 1);
  assert.deepEqual([2, 3, 4, 9, 11, 1].map(isPrime), [true, true, false, false, true, false]);
});
