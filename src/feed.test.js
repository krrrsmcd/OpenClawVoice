// Offline tests for RSS feed rendering (no network).
//   node src/feed.test.js   (or: npm run test:feed)

import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { renderFeed, renderItem, escapeXml, rfc822 } from './feed.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`  ok  ${name}`); };

const config = { r2PublicBaseUrl: 'https://pub-abc.r2.dev' };

const ep = {
  title: 'Josh Kerr Breaks the Record',
  author: 'A. Reporter',
  sourceUrl: 'https://example.com/kerr',
  mp3Url: 'https://pub-abc.r2.dev/episodes/josh-kerr-x1.mp3',
  bytes: 3322400,
  durationSec: 725,
  slug: 'josh-kerr-x1',
  pubDate: '2026-07-18T12:00:00.000Z',
};

test('escapeXml handles the five special characters', () => {
  assert.equal(escapeXml(`a & b < c > d " e ' f`), 'a &amp; b &lt; c &gt; d &quot; e &apos; f');
});

test('rfc822 renders a GMT date string', () => {
  assert.equal(rfc822('2026-07-18T12:00:00.000Z'), 'Sat, 18 Jul 2026 12:00:00 GMT');
});

test('item has enclosure, guid, pubDate, and itunes:duration', () => {
  const xml = renderItem(ep);
  assert.match(xml, /<enclosure url="https:\/\/pub-abc\.r2\.dev\/episodes\/josh-kerr-x1\.mp3" length="3322400" type="audio\/mpeg"\/>/);
  assert.match(xml, /<guid isPermaLink="false">josh-kerr-x1<\/guid>/);
  assert.match(xml, /<pubDate>Sat, 18 Jul 2026 12:00:00 GMT<\/pubDate>/);
  assert.match(xml, /<itunes:duration>12:05<\/itunes:duration>/);
});

test('special characters in a title are escaped in output', () => {
  const xml = renderItem({ ...ep, title: 'Tom & Jerry <live>' });
  assert.match(xml, /<title>Tom &amp; Jerry &lt;live&gt;<\/title>/);
});

test('full feed is well-formed XML and parses', () => {
  const xml = renderFeed(config, [ep]);
  // Parse as XML; a malformed doc yields a <parsererror> element.
  const doc = new JSDOM(xml, { contentType: 'text/xml' }).window.document;
  assert.equal(doc.querySelector('parsererror'), null, 'feed XML should be well-formed');
  assert.equal(doc.querySelectorAll('item').length, 1);
  assert.ok(/<rss version="2.0"/.test(xml));
  assert.match(xml, /<link>https:\/\/pub-abc\.r2\.dev\/<\/link>/);
});

test('multiple episodes render newest-first in order given', () => {
  const a = { ...ep, slug: 'a', title: 'A' };
  const b = { ...ep, slug: 'b', title: 'B' };
  const xml = renderFeed(config, [b, a]);
  assert.ok(xml.indexOf('<title>B</title>') < xml.indexOf('<title>A</title>'));
});

test('empty feed still renders a valid channel', () => {
  const xml = renderFeed(config, []);
  const doc = new JSDOM(xml, { contentType: 'text/xml' }).window.document;
  assert.equal(doc.querySelector('parsererror'), null);
  assert.equal(doc.querySelectorAll('item').length, 0);
});

console.log(`\n✅ ${passed} tests passed\n`);
