// Offline tests for parseArticle (no network). Feeds constructed HTML through
// Readability and checks title/author/body extraction and failure handling.
//   node src/extract.test.js   (or: npm run test:extract)

import assert from 'node:assert/strict';
import { parseArticle } from './extract.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`  ok  ${name}`); };

const bodyParas = Array.from(
  { length: 8 },
  (_, i) =>
    `<p>This is paragraph ${i + 1} of a test article. It contains several sentences so that ` +
    `Readability treats it as real content rather than boilerplate navigation or a menu.</p>`,
).join('\n');

const goodHtml = `<!doctype html><html><head>
  <title>Test Article Title | Example News</title>
  <meta name="author" content="Jane Doe">
</head><body>
  <nav><a href="/">Home</a><a href="/about">About</a></nav>
  <article>
    <h1>Test Article Title</h1>
    <p class="byline">By Jane Doe</p>
    ${bodyParas}
  </article>
  <footer>Copyright Example News</footer>
</body></html>`;

test('extracts title, author, and body from a normal article', () => {
  const a = parseArticle(goodHtml, 'https://example.com/story');
  assert.match(a.title, /Test Article Title/);
  assert.equal(a.author, 'Jane Doe');
  assert.ok(a.length >= 400, `body should be substantial, got ${a.length}`);
  assert.match(a.body, /paragraph 1 of a test article/);
});

test('strips nav and footer boilerplate from the body', () => {
  const a = parseArticle(goodHtml, 'https://example.com/story');
  assert.doesNotMatch(a.body, /Home\s*About/);
  assert.doesNotMatch(a.body, /Copyright Example News/);
});

test('"by" prefix is trimmed from the byline', () => {
  const html = goodHtml.replace('content="Jane Doe"', 'content="by Jane Doe"');
  const a = parseArticle(html, 'https://example.com/story');
  assert.equal(a.author, 'Jane Doe');
});

test('image captions are stripped from the body', () => {
  const withCaption = goodHtml.replace(
    '<article>',
    '<article><figure><img src="x.jpg"><figcaption>A lobster waves at the camera on a beach.</figcaption></figure>',
  );
  const a = parseArticle(withCaption, 'https://example.com/story');
  assert.doesNotMatch(a.body, /lobster waves at the camera/);
  // real article text still present
  assert.match(a.body, /paragraph 1 of a test article/);
});

test('too-short / paywall-like page throws a clear error', () => {
  const thin = `<!doctype html><html><head><title>Subscribe</title></head>
    <body><article><h1>Members only</h1><p>Please subscribe to continue.</p></article></body></html>`;
  assert.throws(() => parseArticle(thin, 'https://example.com/paywall'), /too short|readable content/i);
});

test('normalizes whitespace (no giant gaps or tabs)', () => {
  const a = parseArticle(goodHtml, 'https://example.com/story');
  assert.doesNotMatch(a.body, /\n{3,}/);
  assert.doesNotMatch(a.body, /\t/);
});

console.log(`\n✅ ${passed} tests passed\n`);
