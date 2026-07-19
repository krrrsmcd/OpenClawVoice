// Offline tests for usage logging + month-to-date aggregation.
//   node src/usage.test.js   (or: npm run test:usage)

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendUsage, readUsage, monthToDate } from './usage.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`  ok  ${name}`); };

test('append + read round-trips records', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ocv-usage-'));
  const file = join(dir, 'usage.jsonl');
  try {
    appendUsage({ title: 'A', chars: 1000, chunks: 1 }, file);
    appendUsage({ title: 'B', chars: 2500, chunks: 2 }, file);
    const recs = readUsage(file);
    assert.equal(recs.length, 2);
    assert.equal(recs[0].title, 'A');
    assert.equal(recs[1].chars, 2500);
    assert.ok(recs[0].ts, 'timestamp is added');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('readUsage returns [] when the file does not exist', () => {
  assert.deepEqual(readUsage('/tmp/definitely-not-here-ocv.jsonl'), []);
});

test('monthToDate sums only the current UTC month', () => {
  const now = new Date('2026-07-18T00:00:00.000Z');
  const records = [
    { ts: '2026-07-01T10:00:00.000Z', chars: 5000 },
    { ts: '2026-07-17T10:00:00.000Z', chars: 3000 },
    { ts: '2026-06-30T10:00:00.000Z', chars: 9999 }, // previous month, excluded
  ];
  const { episodes, chars } = monthToDate(records, now);
  assert.equal(episodes, 2);
  assert.equal(chars, 8000);
});

test('monthToDate tolerates missing chars', () => {
  const now = new Date('2026-07-18T00:00:00.000Z');
  const { chars } = monthToDate([{ ts: '2026-07-05T00:00:00.000Z' }], now);
  assert.equal(chars, 0);
});

console.log(`\n✅ ${passed} tests passed\n`);
