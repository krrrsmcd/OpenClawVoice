// Offline tests for retention partitioning (no network).
//   node src/publish.test.js   (or: npm run test:publish)

import assert from 'node:assert/strict';
import { partitionByAge, RETENTION_DAYS } from './publish.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`  ok  ${name}`); };

const NOW = Date.parse('2026-07-18T00:00:00.000Z');
const daysAgo = (n) => new Date(NOW - n * 86400000).toISOString();

test('default retention window is 21 days', () => {
  assert.equal(RETENTION_DAYS, 21);
});

test('episodes older than the window are removed, newer kept', () => {
  const episodes = [
    { slug: 'fresh', pubDate: daysAgo(1) },
    { slug: 'edge-inside', pubDate: daysAgo(20) },
    { slug: 'old', pubDate: daysAgo(22) },
  ];
  const { keep, remove } = partitionByAge(episodes, 21, NOW);
  assert.deepEqual(keep.map((e) => e.slug), ['fresh', 'edge-inside']);
  assert.deepEqual(remove.map((e) => e.slug), ['old']);
});

test('exactly at the boundary is kept (strictly older is removed)', () => {
  const episodes = [{ slug: 'boundary', pubDate: daysAgo(21) }];
  const { keep, remove } = partitionByAge(episodes, 21, NOW);
  // 21 days ago == cutoff; not strictly less, so kept.
  assert.equal(keep.length, 1);
  assert.equal(remove.length, 0);
});

test('missing or invalid pubDate is kept (fail-safe)', () => {
  const episodes = [
    { slug: 'no-date' },
    { slug: 'bad-date', pubDate: 'not-a-date' },
  ];
  const { keep, remove } = partitionByAge(episodes, 21, NOW);
  assert.equal(remove.length, 0);
  assert.equal(keep.length, 2);
});

test('custom window works', () => {
  const episodes = [{ slug: 'x', pubDate: daysAgo(10) }];
  assert.equal(partitionByAge(episodes, 7, NOW).remove.length, 1);
  assert.equal(partitionByAge(episodes, 30, NOW).remove.length, 0);
});

console.log(`\n✅ ${passed} tests passed\n`);
