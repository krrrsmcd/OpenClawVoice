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

console.log(`\n✅ ${passed} tests passed\n`);
