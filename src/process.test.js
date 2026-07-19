// Offline test for the episode-record mapping (no network).
//   node src/process.test.js   (or: npm run test:process)

import assert from 'node:assert/strict';
import { buildEpisodeRecord } from './process.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`  ok  ${name}`); };

const meta = {
  url: 'https://example.com/kerr',
  title: 'Josh Kerr Breaks the Record',
  author: 'A. Reporter',
  siteName: 'Example Sport',
  slug: 'josh-kerr-x1',
  bytes: 3322400,
  durationSec: 725,
  duration: '12 min',
  publishedAt: '2026-07-18T12:00:00.000Z',
  mp3Path: './out/josh-kerr-x1.mp3',
};

test('maps pipeline meta + upload result into a feed record', () => {
  const ep = buildEpisodeRecord(meta, {
    mp3Url: 'https://pub-abc.r2.dev/episodes/josh-kerr-x1.mp3',
    mp3Key: 'episodes/josh-kerr-x1.mp3',
  });
  assert.equal(ep.slug, 'josh-kerr-x1');
  assert.equal(ep.title, 'Josh Kerr Breaks the Record');
  assert.equal(ep.author, 'A. Reporter');
  assert.equal(ep.sourceUrl, 'https://example.com/kerr');
  assert.equal(ep.mp3Url, 'https://pub-abc.r2.dev/episodes/josh-kerr-x1.mp3');
  assert.equal(ep.mp3Key, 'episodes/josh-kerr-x1.mp3');
  assert.equal(ep.bytes, 3322400);
  assert.equal(ep.durationSec, 725);
  assert.equal(ep.pubDate, '2026-07-18T12:00:00.000Z');
});

test('record has exactly the fields the feed renderer needs', () => {
  const ep = buildEpisodeRecord(meta, { mp3Url: 'u', mp3Key: 'k' });
  assert.deepEqual(
    Object.keys(ep).sort(),
    ['author', 'bytes', 'durationSec', 'mp3Key', 'mp3Url', 'pubDate', 'slug', 'sourceUrl', 'title'].sort(),
  );
});

console.log(`\n✅ ${passed} tests passed\n`);
