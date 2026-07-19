// Stage 5 — local end-to-end pipeline: URL -> finished MP3 on disk.
// Chains extract -> normalize -> synthesize and returns episode metadata that
// later stages (R2 upload, feed publish) will consume.

import { mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { extract } from './extract.js';
import { normalizeScript } from './normalize.js';
import { chunkText, synthesize, TTS_DEFAULTS } from './tts.js';

/** URL-safe slug from a title, with a short unique suffix so filenames never collide. */
export function slugify(title, now = Date.now()) {
  const base = String(title || 'episode')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'episode';
  const suffix = now.toString(36) + Math.random().toString(36).slice(2, 6);
  return `${base}-${suffix}`;
}

/** Estimate duration (seconds) from file size for a CBR MP3 (default 128 kbps). */
export function estimateDurationSec(filePath, outputFormat = TTS_DEFAULTS.outputFormat) {
  const kbps = Number(outputFormat.split('_')[2]) || 128; // mp3_44100_128 -> 128
  const bytes = statSync(filePath).size;
  return Math.round((bytes * 8) / (kbps * 1000));
}

/** "12 min" / "48 sec" / "1 hr 3 min" — a friendly spoken-ish duration. */
export function formatDuration(totalSec) {
  if (totalSec < 60) return `${totalSec} sec`;
  const h = Math.floor(totalSec / 3600);
  const m = Math.round((totalSec % 3600) / 60);
  if (h) return `${h} hr${m ? ` ${m} min` : ''}`;
  return `${m} min`;
}

/** "HH:MM:SS" / "MM:SS" — for the RSS <itunes:duration> tag (Stage 7). */
export function formatHMS(totalSec) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/**
 * Run the full local pipeline for a URL.
 * @param {string} url
 * @param {object} opts
 * @param {string} opts.outDir     Where to write the MP3.
 * @param {string} [opts.apiKey]   ElevenLabs API key (required unless dryRun).
 * @param {string} [opts.voiceId]  ElevenLabs voice ID (required unless dryRun).
 * @param {boolean} [opts.intro]   Prepend the spoken intro (default true).
 * @param {boolean} [opts.dryRun]  Stop before synthesis; return the plan only.
 * @param {(i:number,n:number)=>void} [opts.onProgress]
 * @returns {Promise<object>} episode metadata
 */
/**
 * Synthesize a finished MP3 from an already-obtained article object (used by
 * both the URL path and the pasted-text fallback).
 * @param {{title, author?, siteName?, body, url?}} article
 */
export async function synthesizeArticle(article, opts) {
  const { outDir, apiKey, voiceId, intro = true, onProgress } = opts;

  const script = normalizeScript(article, { intro });
  const chunks = chunkText(script);

  const meta = {
    url: article.url || '',
    title: article.title,
    author: article.author ?? null,
    siteName: article.siteName ?? null,
    slug: slugify(article.title),
    scriptChars: script.length,
    chunks: chunks.length,
  };

  mkdirSync(outDir, { recursive: true });
  const mp3Path = join(outDir, `${meta.slug}.mp3`);

  const result = await synthesize(script, { apiKey, voiceId, outPath: mp3Path, onProgress });
  const durationSec = estimateDurationSec(mp3Path);

  return {
    ...meta,
    mp3Path,
    bytes: statSync(mp3Path).size,
    durationSec,
    duration: formatDuration(durationSec),
    stitch: result.method,
    publishedAt: new Date().toISOString(),
  };
}

/** URL path: extract, then synthesize. Supports dryRun (plan only). */
export async function convert(url, opts) {
  const { intro = true, dryRun = false } = opts;
  const article = await extract(url);

  if (dryRun) {
    const script = normalizeScript(article, { intro });
    return {
      url,
      title: article.title,
      author: article.author,
      siteName: article.siteName,
      slug: slugify(article.title),
      scriptChars: script.length,
      chunks: chunkText(script).length,
      dryRun: true,
    };
  }

  return synthesizeArticle(article, opts);
}
