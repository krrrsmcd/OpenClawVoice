// Offline tests for storage URL/key building (no network, no credentials).
//   node src/storage.test.js   (or: npm run test:storage)

import assert from 'node:assert/strict';
import { publicUrlFor, KEYS } from './storage.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`  ok  ${name}`); };

const config = { r2PublicBaseUrl: 'https://pub-abc.r2.dev' };

test('publicUrlFor joins base + key', () => {
  assert.equal(
    publicUrlFor(config, 'episodes/my-slug.mp3'),
    'https://pub-abc.r2.dev/episodes/my-slug.mp3',
  );
});

test('publicUrlFor tolerates a trailing slash on the base', () => {
  assert.equal(
    publicUrlFor({ r2PublicBaseUrl: 'https://pub-abc.r2.dev/' }, 'feed.xml'),
    'https://pub-abc.r2.dev/feed.xml',
  );
});

test('publicUrlFor percent-encodes segments but keeps slashes', () => {
  assert.equal(
    publicUrlFor(config, 'episodes/a b&c.mp3'),
    'https://pub-abc.r2.dev/episodes/a%20b%26c.mp3',
  );
});

test('KEYS builds expected object keys', () => {
  assert.equal(KEYS.feed, 'feed.xml');
  assert.equal(KEYS.episode('hello-world-x1'), 'episodes/hello-world-x1.mp3');
});

console.log(`\n✅ ${passed} tests passed\n`);
