// Plain assert-based tests for the chunker and stitcher (no framework, no API).
//   node src/tts.test.js   (or: npm run test:tts)

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chunkText, stitchMp3 } from './tts.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`  ok  ${name}`); };

const MAX = 2500;
const noneOver = (chunks) => chunks.every((c) => c.length <= MAX);

test('empty / whitespace input yields no chunks', () => {
  assert.deepEqual(chunkText(''), []);
  assert.deepEqual(chunkText('   \n\n  '), []);
});

test('short text is a single chunk', () => {
  const chunks = chunkText('Hello world. This is a short article.');
  assert.equal(chunks.length, 1);
  assert.match(chunks[0], /^Hello world/);
});

test('paragraphs pack together under the cap', () => {
  const para = 'A'.repeat(1000);
  const chunks = chunkText([para, para, para].join('\n\n'));
  assert.ok(noneOver(chunks));
  // 3x1000 + separators should be 2 chunks (2000+ fits, third overflows)
  assert.equal(chunks.length, 2);
});

test('a paragraph longer than the cap is split by sentences', () => {
  const sentence = 'This is a sentence that is reasonably long. ';
  const big = sentence.repeat(120); // ~5000 chars, one paragraph
  const chunks = chunkText(big);
  assert.ok(noneOver(chunks), 'no chunk exceeds cap');
  assert.ok(chunks.length >= 2);
});

test('a single sentence longer than the cap is hard-split on words', () => {
  const monster = 'word '.repeat(1000).trim(); // ~5000 chars, no sentence breaks
  const chunks = chunkText(monster);
  assert.ok(noneOver(chunks), 'no chunk exceeds cap');
  // hard split must not cut a word in half
  assert.ok(chunks.every((c) => !c.startsWith(' ') && !c.endsWith(' ')));
});

test('exact-cap boundary is respected', () => {
  const chunks = chunkText('B'.repeat(MAX));
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].length, MAX);
  const chunks2 = chunkText('B'.repeat(MAX + 1));
  assert.ok(noneOver(chunks2));
});

test('no text is lost (char count is preserved for word-split case)', () => {
  const words = Array.from({ length: 800 }, (_, i) => `w${i}`).join(' ');
  const chunks = chunkText(words);
  const rejoined = chunks.join(' ').split(/\s+/).sort().join(' ');
  const original = words.split(/\s+/).sort().join(' ');
  assert.equal(rejoined, original);
});

test('stitchMp3 binary-concats multiple buffers in order', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ocv-test-'));
  const out = join(dir, 'out.mp3');
  try {
    // Not real MP3s — just verifying concat order/bytes on the fallback path.
    const a = Buffer.from([1, 2, 3]);
    const b = Buffer.from([4, 5, 6]);
    const { method } = stitchMp3([a, b], out);
    const bytes = readFileSync(out);
    if (method === 'binary-concat') {
      assert.deepEqual([...bytes], [1, 2, 3, 4, 5, 6]);
    } else {
      // ffmpeg present: it will reject non-MP3 input and fall back, but if it
      // somehow produced output, at least assert the file is non-empty.
      assert.ok(bytes.length > 0);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('stitchMp3 with one buffer writes it unchanged', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ocv-test-'));
  const out = join(dir, 'one.mp3');
  try {
    stitchMp3([Buffer.from([9, 9, 9])], out);
    assert.deepEqual([...readFileSync(out)], [9, 9, 9]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

console.log(`\n✅ ${passed} tests passed\n`);
