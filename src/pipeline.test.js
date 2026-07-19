// Offline tests for pipeline helpers (slug + duration formatting).
//   node src/pipeline.test.js   (or: npm run test:pipeline)

import assert from 'node:assert/strict';
import { slugify, formatDuration, formatHMS } from './pipeline.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`  ok  ${name}`); };

test('slugify makes a URL-safe base from the title', () => {
  const s = slugify('The Quiet Power of Reading!', 0);
  assert.match(s, /^the-quiet-power-of-reading-/);
  assert.doesNotMatch(s, /[^a-z0-9-]/);
});

test('slugify is unique across calls', () => {
  assert.notEqual(slugify('Same Title'), slugify('Same Title'));
});

test('slugify falls back for empty/garbage titles', () => {
  assert.match(slugify('', 0), /^episode-/);
  assert.match(slugify('!!!', 0), /^episode-/);
});

test('slugify caps base length', () => {
  const long = 'word '.repeat(50);
  const s = slugify(long, 0);
  const base = s.slice(0, s.lastIndexOf('-'));
  assert.ok(base.length <= 60);
});

test('formatDuration renders sensible units', () => {
  assert.equal(formatDuration(45), '45 sec');
  assert.equal(formatDuration(60), '1 min');
  assert.equal(formatDuration(725), '12 min');
  assert.equal(formatDuration(3660), '1 hr 1 min');
});

test('formatHMS pads correctly', () => {
  assert.equal(formatHMS(65), '1:05');
  assert.equal(formatHMS(3725), '1:02:05');
});

console.log(`\n✅ ${passed} tests passed\n`);
