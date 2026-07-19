// Stage 7 — feed publish flow. The episode manifest (episodes.json in R2) is
// the source of truth; feed.xml is regenerated from it on every publish.

import { KEYS, getObjectText, putObject, uploadFeed, deleteObject } from './storage.js';
import { renderFeed } from './feed.js';

/** Default retention window: episodes older than this are deleted. */
export const RETENTION_DAYS = 21;

/**
 * Split episodes into keep/remove by age (pure — no I/O). Episodes with an
 * unparseable or missing pubDate are kept (fail-safe: never delete on bad data).
 */
export function partitionByAge(episodes, days = RETENTION_DAYS, now = Date.now()) {
  const cutoff = now - days * 24 * 60 * 60 * 1000;
  const keep = [];
  const remove = [];
  for (const ep of episodes) {
    const t = new Date(ep.pubDate).getTime();
    (Number.isFinite(t) && t < cutoff ? remove : keep).push(ep);
  }
  return { keep, remove };
}

/** Load the episode manifest (newest-first), or [] if none yet. */
export async function loadEpisodes(config, client) {
  const txt = await getObjectText(config, KEYS.manifest, client);
  if (!txt) return [];
  try {
    const data = JSON.parse(txt);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/** Persist the manifest back to R2. */
export async function saveEpisodes(config, episodes, client) {
  await putObject(config, {
    key: KEYS.manifest,
    body: JSON.stringify(episodes, null, 2),
    contentType: 'application/json',
    client,
  });
}

/** Regenerate feed.xml from the given episodes and upload it. */
export async function regenerateFeed(config, episodes, client) {
  const xml = renderFeed(config, episodes);
  const { url } = await uploadFeed(config, xml, client);
  return { feedUrl: url, xml };
}

/**
 * Add an episode to the manifest (newest first, de-duped by slug) and republish
 * the feed. Returns the feed URL and new episode count.
 */
export async function publishEpisode(config, ep, client) {
  const episodes = await loadEpisodes(config, client);
  const next = [ep, ...episodes.filter((e) => e.slug !== ep.slug)];
  await saveEpisodes(config, next, client);
  const { feedUrl, xml } = await regenerateFeed(config, next, client);
  return { feedUrl, count: next.length, xml };
}

/**
 * Remove episodes older than `days` from the manifest, delete their MP3 objects,
 * and republish the feed. Used by the Stage 10 retention job.
 */
export async function pruneOlderThan(config, days = RETENTION_DAYS, client, now = Date.now()) {
  const episodes = await loadEpisodes(config, client);
  const { keep, remove } = partitionByAge(episodes, days, now);

  for (const ep of remove) {
    if (ep.mp3Key) await deleteObject(config, ep.mp3Key, client);
  }
  // Only rewrite the manifest/feed if something actually changed.
  if (remove.length > 0) {
    await saveEpisodes(config, keep, client);
    await regenerateFeed(config, keep, client);
  }
  return { removed: remove.map((e) => e.slug), kept: keep.length };
}
