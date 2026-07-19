// Stage 2 — TTS core: chunk text, synthesize each chunk via ElevenLabs,
// stitch the segments into a single MP3.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ElevenLabs defaults. Multilingual v2 is stable for long-form narration.
export const TTS_DEFAULTS = {
  modelId: 'eleven_multilingual_v2',
  outputFormat: 'mp3_44100_128',
  maxChars: 2500, // free-tier per-request cap; safe on all tiers
  voiceSettings: { stability: 0.5, similarity_boost: 0.75 },
};

// ---------------------------------------------------------------------------
// Chunking
// ---------------------------------------------------------------------------

/**
 * Split `text` into chunks no longer than `maxChars`, preferring paragraph
 * boundaries, then sentence boundaries, then (last resort) word boundaries.
 *
 * Guarantees losslessness: every non-whitespace character of `text` appears in
 * the returned chunks, in order. Violations throw rather than passing silently
 * truncated text to the TTS API.
 * @returns {string[]}
 */
export function chunkText(text, maxChars = TTS_DEFAULTS.maxChars) {
  const clean = String(text ?? '').replace(/\r\n/g, '\n').trim();
  if (!clean) return [];

  const chunks = [];
  let cur = '';
  const flush = () => { if (cur.trim()) chunks.push(cur.trim()); cur = ''; };

  for (const rawPara of clean.split(/\n{2,}/)) {
    const para = rawPara.trim();
    if (!para) continue;

    if (para.length > maxChars) {
      // Paragraph too big on its own: flush, then break it down.
      flush();
      for (const piece of splitLongUnit(para, maxChars)) {
        const candidate = cur ? `${cur} ${piece}` : piece;
        if (candidate.length > maxChars) { flush(); cur = piece; }
        else cur = candidate;
      }
      continue;
    }

    const candidate = cur ? `${cur}\n\n${para}` : para;
    if (candidate.length > maxChars) { flush(); cur = para; }
    else cur = candidate;
  }
  flush();

  assertLossless(clean, chunks);
  return chunks;
}

// Sentence segmentation via Intl.Segmenter (built into Node 22). Unlike a regex
// scan, it partitions the input exhaustively — there is no way for a span to
// fall between two matches and disappear. The previous regex required terminal
// punctuation to be followed by whitespace, so text glued together like
// "...of AI.Context, domain..." silently lost everything up to the next match.
const SENTENCE_SEGMENTER = new Intl.Segmenter('en', { granularity: 'sentence' });

/** Break an over-long paragraph into <=maxChars pieces by sentence, then words. */
function splitLongUnit(text, maxChars) {
  const sentences = [...SENTENCE_SEGMENTER.segment(text)].map((s) => s.segment);
  const out = [];
  for (const raw of sentences) {
    const s = raw.trim();
    if (!s) continue;
    if (s.length <= maxChars) { out.push(s); continue; }
    // Hard-split a monster sentence on word boundaries.
    let start = 0;
    while (start < s.length) {
      let end = Math.min(start + maxChars, s.length);
      if (end < s.length) {
        const space = s.lastIndexOf(' ', end);
        if (space > start) end = space;
      }
      out.push(s.slice(start, end).trim());
      start = end;
    }
  }
  return out;
}

/**
 * Guard against silent text loss: the chunks, concatenated, must contain exactly
 * the same non-whitespace characters as the input. Chunking is allowed to change
 * whitespace (it trims and re-joins) but never to drop content.
 * @throws {Error} with the first divergence point when characters go missing.
 */
export function assertLossless(input, chunks) {
  const strip = (s) => s.replace(/\s+/g, '');
  const want = strip(input);
  const got = strip(chunks.join(' '));
  if (want === got) return;

  let i = 0;
  while (i < want.length && i < got.length && want[i] === got[i]) i++;
  const missing = want.length - got.length;
  throw new Error(
    `chunkText dropped text: expected ${want.length} non-space chars, produced ${got.length} ` +
      `(${missing > 0 ? `${missing} missing` : `${-missing} extra`}). ` +
      `First divergence at char ${i}: expected "${want.slice(i, i + 60)}…" ` +
      `but got "${got.slice(i, i + 60)}…"`,
  );
}

// ---------------------------------------------------------------------------
// Synthesis
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Synthesize one chunk of text to an MP3 Buffer via the ElevenLabs API.
 * Retries transient failures (429 / 5xx / network) with backoff.
 */
export async function synthesizeChunk(text, opts) {
  const {
    apiKey,
    voiceId,
    modelId = TTS_DEFAULTS.modelId,
    outputFormat = TTS_DEFAULTS.outputFormat,
    voiceSettings = TTS_DEFAULTS.voiceSettings,
    retries = 3,
    backoffMs = [1000, 3000, 8000],
  } = opts;

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=${outputFormat}`;
  const body = JSON.stringify({ text, model_id: modelId, voice_settings: voiceSettings });

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body,
      });
      if (res.ok) {
        return Buffer.from(await res.arrayBuffer());
      }
      const detail = await res.text().catch(() => '');
      // Retry only on transient statuses.
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`ElevenLabs ${res.status}: ${detail.slice(0, 200)}`);
      } else {
        throw new Error(`ElevenLabs ${res.status}: ${detail.slice(0, 300)}`);
      }
    } catch (err) {
      lastErr = err;
    }
    if (attempt < retries) await sleep(backoffMs[attempt] ?? 8000);
  }
  throw lastErr ?? new Error('ElevenLabs synthesis failed');
}

// ---------------------------------------------------------------------------
// Stitching
// ---------------------------------------------------------------------------

/** True if an `ffmpeg` binary is available on PATH. */
export function hasFfmpeg() {
  try {
    const r = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return r.status === 0;
  } catch {
    return false;
  }
}

/**
 * Combine MP3 buffers into a single MP3 at `outPath`.
 * Uses ffmpeg's concat demuxer when available (clean joins); otherwise falls
 * back to binary concatenation, which plays fine for same-format MP3 segments.
 */
export function stitchMp3(buffers, outPath) {
  if (buffers.length === 0) throw new Error('nothing to stitch');
  if (buffers.length === 1) { writeFileSync(outPath, buffers[0]); return { method: 'single' }; }

  if (hasFfmpeg()) {
    const dir = mkdtempSync(join(tmpdir(), 'ocv-stitch-'));
    try {
      const listLines = [];
      buffers.forEach((buf, i) => {
        const seg = join(dir, `seg-${String(i).padStart(4, '0')}.mp3`);
        writeFileSync(seg, buf);
        listLines.push(`file '${seg.replace(/'/g, "'\\''")}'`);
      });
      const listPath = join(dir, 'list.txt');
      writeFileSync(listPath, listLines.join('\n'));
      const r = spawnSync(
        'ffmpeg',
        ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', outPath],
        { stdio: 'ignore' },
      );
      if (r.status === 0) return { method: 'ffmpeg' };
      // fall through to binary concat on ffmpeg failure
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  writeFileSync(outPath, Buffer.concat(buffers));
  return { method: 'binary-concat' };
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

/**
 * Full text -> MP3 pipeline: chunk, synthesize each chunk, stitch to `outPath`.
 * @returns {Promise<{outPath: string, chunks: number, chars: number, method: string}>}
 */
export async function synthesize(text, opts) {
  const { onProgress } = opts;
  const chunks = chunkText(text, opts.maxChars ?? TTS_DEFAULTS.maxChars);
  if (chunks.length === 0) throw new Error('no text to synthesize');

  const buffers = [];
  for (let i = 0; i < chunks.length; i++) {
    onProgress?.(i + 1, chunks.length);
    buffers.push(await synthesizeChunk(chunks[i], opts));
  }

  const { method } = stitchMp3(buffers, opts.outPath);
  const chars = chunks.reduce((n, c) => n + c.length, 0);
  return { outPath: opts.outPath, chunks: chunks.length, chars, method };
}
