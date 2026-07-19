// Offline tests for the speech normalizer.
//   node src/normalize.test.js   (or: npm run test:normalize)

import assert from 'node:assert/strict';
import { normalizeScript, buildIntro } from './normalize.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`  ok  ${name}`); };

test('intro includes site, title, and author when present', () => {
  const intro = buildIntro({ siteName: 'Example News', title: 'A Big Story', author: 'Jane Doe' });
  assert.equal(intro, 'From Example News, titled A Big Story, by Jane Doe.');
});

test('intro gracefully omits missing pieces', () => {
  assert.equal(buildIntro({ title: 'Solo Title' }), 'Solo Title.');
  assert.equal(buildIntro({ title: 'T', author: 'A' }), 'T, by A.');
  assert.equal(buildIntro({}), '');
});

test('citation markers are removed', () => {
  const out = normalizeScript({ body: 'The sky is blue.[1] Water is wet.[23]' }, { intro: false });
  assert.doesNotMatch(out, /\[\d+\]/);
  assert.match(out, /The sky is blue\. Water is wet\./);
});

test('bare URLs and emails are stripped', () => {
  const out = normalizeScript(
    { body: 'See https://example.com/path?q=1 for more, or mail me@example.com now.' },
    { intro: false },
  );
  assert.doesNotMatch(out, /https?:\/\//);
  assert.doesNotMatch(out, /@example\.com/);
  assert.doesNotMatch(out, /\(\s*\)/);
});

test('standalone boilerplate lines are dropped', () => {
  const body = 'Real opening paragraph here.\n\nAdvertisement\n\nReal closing paragraph here.';
  const out = normalizeScript({ body }, { intro: false });
  assert.doesNotMatch(out, /Advertisement/);
  assert.match(out, /Real opening/);
  assert.match(out, /Real closing/);
});

test('each paragraph gets terminal punctuation for pauses', () => {
  const body = 'A Heading With No Period\n\nThen a normal sentence.';
  const out = normalizeScript({ body }, { intro: false });
  const paras = out.split(/\n{2,}/);
  assert.ok(paras.every((p) => /[.!?:"'”’)]$/.test(p)), 'every paragraph ends with punctuation');
});

test('whitespace is tidied (no triple newlines, no double spaces)', () => {
  const body = 'One.\n\n\n\nTwo    spaced.\n\nThree .';
  const out = normalizeScript({ body }, { intro: false });
  assert.doesNotMatch(out, /\n{3,}/);
  assert.doesNotMatch(out, /  +/);
  assert.doesNotMatch(out, / \./); // space-before-period fixed
});

test('full article with intro reads cleanly end to end', () => {
  const article = {
    siteName: 'The Example',
    title: 'On Listening',
    author: 'A. Writer',
    body: 'First point about audio.[1]\n\nSecond point, see https://x.com/y.\n\nAdvertisement\n\nFinal thought',
  };
  const out = normalizeScript(article);
  assert.match(out, /^From The Example, titled On Listening, by A\. Writer\./);
  assert.doesNotMatch(out, /\[1\]|https?:\/\/|Advertisement/);
  assert.match(out, /Final thought\.$/);
});

// --- math -------------------------------------------------------------------

test('LaTeX expressions are stripped, not read aloud', () => {
  const out = normalizeScript({
    body: 'Here is the model.\n\n\\(\\text{Success} = \\frac{\\text{A}}{\\text{B}}\\)\n\nAnd the rest of it.',
  }, { intro: false });
  assert.doesNotMatch(out, /\\text|\\frac|\\\(|\\\)/);
  assert.match(out, /Here is the model\./);
  assert.match(out, /And the rest of it\./);
});

test('display math with $$ is stripped', () => {
  const out = normalizeScript({ body: 'Before.\n\n$$x = y + z$$\n\nAfter.' }, { intro: false });
  assert.doesNotMatch(out, /\$\$|x = y/);
  assert.match(out, /Before\./);
});

test('ordinary prices are NOT mangled by the math rule', () => {
  const out = normalizeScript(
    { body: 'The plan costs $5 per month, or $50 a year if you pay up front.' },
    { intro: false },
  );
  assert.match(out, /\$5 per month/);
  assert.match(out, /\$50 a year/);
});

// --- symbols ----------------------------------------------------------------

test('multiplication signs are spoken as words', () => {
  const out = normalizeScript({ body: 'Machine × Problem × Practice is the numerator here.' }, { intro: false });
  assert.match(out, /Machine times Problem times Practice/);
  assert.doesNotMatch(out, /×/);
});

// --- pauses -----------------------------------------------------------------

test('a short label line gets terminal punctuation so TTS pauses', () => {
  const out = normalizeScript(
    { body: 'Machine × No Problem Understanding\nFast iteration in the wrong direction.' },
    { intro: false },
  );
  assert.match(out, /Machine times No Problem Understanding\.\nFast iteration/);
});

test('a mid-sentence line wrap is left alone', () => {
  const long = 'This is a genuinely long clause that simply wrapped across a line break in the source markup and should not be broken';
  const out = normalizeScript({ body: `${long}\ninto two separate sentences by the normalizer.` }, { intro: false });
  assert.doesNotMatch(out, /be broken\./);
});

test('every paragraph ends with terminal punctuation', () => {
  const out = normalizeScript({ body: 'A heading\n\nSome body text here.\n\nAnother heading' }, { intro: false });
  for (const p of out.split(/\n{2,}/)) {
    assert.match(p, /[.!?:"'”’)]$/, `paragraph lacks terminal punctuation: ${p}`);
  }
});

// --- boilerplate ------------------------------------------------------------

test('substack footer boilerplate is dropped', () => {
  const out = normalizeScript(
    { body: 'Real closing paragraph of the article.\n\nDiscussion about this post\n\nReady for more?\n\nLeave a comment' },
    { intro: false },
  );
  assert.doesNotMatch(out, /Discussion about this post|Ready for more|Leave a comment/i);
  assert.match(out, /Real closing paragraph/);
});

test('boilerplate words inside a real sentence are kept', () => {
  const out = normalizeScript(
    { body: 'We had a long discussion about this post and decided to subscribe to the idea.' },
    { intro: false },
  );
  assert.match(out, /long discussion about this post/);
});

console.log(`\n✅ ${passed} tests passed\n`);
