// Stage 6 — Cloudflare R2 storage (S3-compatible API).
// Uploads MP3s and the feed, returns public URLs, and deletes objects (used by
// the Stage 10 retention job).

import { readFileSync } from 'node:fs';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';

/** Object keys used in the bucket. */
export const KEYS = {
  feed: 'feed.xml',
  manifest: 'episodes.json',
  episode: (slug) => `episodes/${slug}.mp3`,
};

const CONTENT_TYPES = {
  mp3: 'audio/mpeg',
  feed: 'application/rss+xml; charset=utf-8',
};

/** Build an S3 client pointed at the R2 endpoint. */
export function makeClient(config) {
  return new S3Client({
    region: 'auto',
    endpoint: config.r2S3Endpoint, // https://<account>.r2.cloudflarestorage.com
    credentials: {
      accessKeyId: config.R2_ACCESS_KEY_ID,
      secretAccessKey: config.R2_SECRET_ACCESS_KEY,
    },
  });
}

/** Public URL for an object key, given the configured public base URL. */
export function publicUrlFor(config, key) {
  const base = config.r2PublicBaseUrl.replace(/\/+$/, '');
  const encoded = String(key).split('/').map(encodeURIComponent).join('/');
  return `${base}/${encoded}`;
}

/**
 * Upload a buffer/string to R2.
 * @returns {Promise<{key: string, url: string}>}
 */
export async function putObject(config, { key, body, contentType, client }) {
  const s3 = client ?? makeClient(config);
  await s3.send(
    new PutObjectCommand({
      Bucket: config.R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  return { key, url: publicUrlFor(config, key) };
}

/** Upload a local MP3 file at the given key (default: episodes/<slug>.mp3). */
export async function uploadMp3(config, localPath, key, client) {
  return putObject(config, {
    key,
    body: readFileSync(localPath),
    contentType: CONTENT_TYPES.mp3,
    client,
  });
}

/** Upload the RSS feed XML (string) at feed.xml. */
export async function uploadFeed(config, xml, client) {
  return putObject(config, {
    key: KEYS.feed,
    body: xml,
    contentType: CONTENT_TYPES.feed,
    client,
  });
}

/** Fetch an object's text, or null if it doesn't exist yet. */
export async function getObjectText(config, key, client) {
  const s3 = client ?? makeClient(config);
  try {
    const r = await s3.send(new GetObjectCommand({ Bucket: config.R2_BUCKET, Key: key }));
    return await r.Body.transformToString();
  } catch (err) {
    if (err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404) return null;
    throw err;
  }
}

/** Delete an object by key (retention cleanup). */
export async function deleteObject(config, key, client) {
  const s3 = client ?? makeClient(config);
  await s3.send(new DeleteObjectCommand({ Bucket: config.R2_BUCKET, Key: key }));
  return { key, deleted: true };
}

/** True if an object exists (best-effort; used for sanity checks). */
export async function objectExists(config, key, client) {
  const s3 = client ?? makeClient(config);
  try {
    await s3.send(new HeadObjectCommand({ Bucket: config.R2_BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}
