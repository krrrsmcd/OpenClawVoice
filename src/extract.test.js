// Offline tests for parseArticle (no network). Feeds constructed HTML through
// Readability and checks title/author/body extraction and failure handling.
//   node src/extract.test.js   (or: npm run test:extract)

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseArticle } from './extract.js';
import { normalizeScript } from './normalize.js';
import { chunkText } from './tts.js';

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

// --- block structure --------------------------------------------------------
// Readability's textContent flattens every block element with no separator, so
// paragraphs arrive glued together ("...of AI.Context, domain..."). That kills
// TTS pauses and feeds the sentence splitter text it can silently drop.

test('adjacent paragraphs are separated, never glued together', () => {
  const a = parseArticle(goodHtml, 'https://example.com/story');
  assert.doesNotMatch(a.body, /article\.This is paragraph/, 'paragraphs must not be glued');
  assert.match(a.body, /\n\n/, 'body should contain paragraph breaks');
  assert.ok(a.body.split(/\n{2,}/).length >= 8, 'each source paragraph is its own block');
});

test('list items become separate blocks', () => {
  const withList = goodHtml.replace(
    '<article>',
    '<article><ul><li>First failure mode.</li><li>Second failure mode.</li></ul>',
  );
  const a = parseArticle(withList, 'https://example.com/story');
  assert.doesNotMatch(a.body, /mode\.Second/, 'list items must not run together');
  assert.match(a.body, /First failure mode\.\s*\n/);
});

test('<br> inside a block becomes a line break', () => {
  const withBr = goodHtml.replace('<article>', '<article><p>Label here<br>Description follows.</p>');
  const a = parseArticle(withBr, 'https://example.com/story');
  assert.match(a.body, /Label here\nDescription follows\./);
});

test('nested blocks do not produce runaway blank lines', () => {
  const nested = goodHtml.replace(
    '<article>',
    '<article><div><div><section><p>Deeply nested paragraph of content.</p></section></div></div>',
  );
  const a = parseArticle(nested, 'https://example.com/story');
  assert.doesNotMatch(a.body, /\n{3,}/);
});

test('content is not stripped merely for having "caption" in a class name', () => {
  const withPanel = goodHtml.replace(
    '<article>',
    '<article><div class="caption-panel"><p>This substantive passage lives in a div whose ' +
      'class name happens to contain the word caption, and must survive extraction.</p></div>',
  );
  const a = parseArticle(withPanel, 'https://example.com/story');
  assert.match(a.body, /must survive extraction/);
});

// --- real-world fixture -----------------------------------------------------
// Saved copy of the Substack article that surfaced both bugs. Guards the exact
// sentence that went missing from the narrated audio.

test('substack fixture keeps block structure and loses no sentences', () => {
  const html = readFileSync(new URL('../samples/substack-article.html', import.meta.url), 'utf8');
  const a = parseArticle(html, 'https://cutlefish.substack.com/p/tbm-431');

  assert.ok(a.body.split(/\n{2,}/).length >= 18, 'article should yield many paragraphs');
  assert.doesNotMatch(a.body, /AI\.Context/, 'paragraphs must not be glued by a period');
  assert.match(a.body, /Can slip into “it is magic” thinking\./);
  assert.match(a.body, /Said another way, you have to get past the “magic” of AI\./);
  assert.match(a.body, /You get resistance out of rational self-preservation\./);
});

test('substack fixture survives chunking without losing text', () => {
  const html = readFileSync(new URL('../samples/substack-article.html', import.meta.url), 'utf8');
  const a = parseArticle(html, 'https://cutlefish.substack.com/p/tbm-431');
  const script = normalizeScript(a);
  const chunks = chunkText(script); // throws if lossy

  const nonSpace = (s) => s.replace(/\s+/g, '');
  assert.equal(nonSpace(chunks.join(' ')), nonSpace(script));
  assert.match(chunks.join(' '), /Can slip into “it is magic” thinking\./);
});

console.log(`\n✅ ${passed} tests passed\n`);
