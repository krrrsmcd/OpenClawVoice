// Stage 11 — ElevenLabs usage logging. Appends one JSON line per synthesized
// episode so you can see month-to-date character spend against your plan budget.

import { appendFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';

const LOG_DIR = 'logs';
const LOG_FILE = 'logs/usage.jsonl';

/** Default monthly credit budget (paid tier). Override with ELEVENLABS_MONTHLY_CREDITS. */
export const DEFAULT_MONTHLY_BUDGET = 30000;

/** Append a usage record: { ts, title, sourceUrl, chars, chunks }. */
export function appendUsage(record, file = LOG_FILE) {
  mkdirSync(LOG_DIR, { recursive: true });
  appendFileSync(file, JSON.stringify({ ts: new Date().toISOString(), ...record }) + '\n');
}

/** Read all usage records (ignoring malformed lines). */
export function readUsage(file = LOG_FILE) {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/** Sum characters + episode count for the calendar month of `now` (UTC). */
export function monthToDate(records, now = new Date()) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const inMonth = records.filter((r) => {
    const d = new Date(r.ts);
    return d.getUTCFullYear() === y && d.getUTCMonth() === m;
  });
  return {
    episodes: inMonth.length,
    chars: inMonth.reduce((n, r) => n + (Number(r.chars) || 0), 0),
  };
}
