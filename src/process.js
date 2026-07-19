// Stage 8 + 11 — full automated path: (URL or pasted text) -> live feed episode.
// Chains synthesize -> upload MP3 -> publish feed, and logs ElevenLabs usage.

import { convert, synthesizeArticle } from './pipeline.js';
import { uploadMp3, KEYS } from './storage.js';
import { publishEpisode } from './publish.js';
import { appendUsage } from './usage.js';

/** Map pipeline metadata + upload result into a feed episode record. */
export function buildEpisodeRecord(meta, { mp3Url, mp3Key }) {
  return {
    slug: meta.slug,
    title: meta.title,
    author: meta.author,
    sourceUrl: meta.url,
    mp3Url,
    mp3Key,
    bytes: meta.bytes,
    durationSec: meta.durationSec,
    pubDate: meta.publishedAt,
  };
}

/** Shared tail: upload the MP3, publish the feed, log usage. */
async function finishEpisode(config, meta) {
  const mp3Key = KEYS.episode(meta.slug);
  const { url: mp3Url } = await uploadMp3(config, meta.mp3Path, mp3Key);
  const ep = buildEpisodeRecord(meta, { mp3Url, mp3Key });
  const { feedUrl, count } = await publishEpisode(config, ep);

  // Cost visibility: record characters sent to ElevenLabs for this episode.
  try {
    appendUsage({ title: meta.title, sourceUrl: meta.url, chars: meta.scriptChars, chunks: meta.chunks });
  } catch {
    // Never fail an episode over a logging hiccup.
  }

  return { ...meta, mp3Url, mp3Key, feedUrl, episodeCount: count };
}

/** URL path: extract -> synthesize -> upload -> publish. */
export async function processUrl(url, opts) {
  const { config, outDir = './out', intro = true, onProgress } = opts;
  const meta = await convert(url, {
    outDir,
    apiKey: config.ELEVENLABS_API_KEY,
    voiceId: config.ELEVENLABS_VOICE_ID,
    intro,
    onProgress,
  });
  return finishEpisode(config, meta);
}

/**
 * Pasted-text fallback: narrate text the user provides directly (for sites that
 * block automated fetching). No extraction step.
 * @param {{title:string, text:string, author?:string, sourceUrl?:string}} input
 */
export async function processText(input, opts) {
  const { config, outDir = './out', intro = true, onProgress } = opts;
  const article = {
    title: input.title,
    author: input.author ?? null,
    siteName: null,
    body: input.text,
    url: input.sourceUrl || '',
  };
  const meta = await synthesizeArticle(article, {
    outDir,
    apiKey: config.ELEVENLABS_API_KEY,
    voiceId: config.ELEVENLABS_VOICE_ID,
    intro,
    onProgress,
  });
  return finishEpisode(config, meta);
}
