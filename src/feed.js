// Stage 7 — RSS feed rendering. Turns the episode manifest into a valid
// podcast RSS 2.0 feed (with iTunes tags) that Apple Podcasts / Overcast accept.

import { formatHMS } from './pipeline.js';

/** Default channel-level metadata. Override per field if desired. */
export const CHANNEL = {
  title: 'OpenClaw Voice',
  description: 'Articles and blog posts narrated on demand by OpenClaw.',
  author: 'OpenClaw',
  language: 'en-us',
  category: 'Technology',
  explicit: false,
};

/** Escape text for XML element/attribute content. */
export function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** RFC-822 date string for <pubDate> (e.g. "Fri, 18 Jul 2026 12:00:00 GMT"). */
export function rfc822(date) {
  return new Date(date).toUTCString();
}

/**
 * Render one <item> from an episode record.
 * @param {{title,author,description?,sourceUrl,mp3Url,bytes,durationSec,slug,pubDate}} ep
 */
export function renderItem(ep) {
  const desc = ep.description || `Narrated audio of "${ep.title}".`;
  const lines = [
    '    <item>',
    `      <title>${escapeXml(ep.title)}</title>`,
    `      <description>${escapeXml(desc)}</description>`,
  ];
  if (ep.sourceUrl) lines.push(`      <link>${escapeXml(ep.sourceUrl)}</link>`);
  lines.push(`      <guid isPermaLink="false">${escapeXml(ep.slug)}</guid>`);
  lines.push(`      <pubDate>${rfc822(ep.pubDate)}</pubDate>`);
  if (ep.author) lines.push(`      <itunes:author>${escapeXml(ep.author)}</itunes:author>`);
  if (Number.isFinite(ep.durationSec)) {
    lines.push(`      <itunes:duration>${formatHMS(ep.durationSec)}</itunes:duration>`);
  }
  lines.push(
    `      <enclosure url="${escapeXml(ep.mp3Url)}" length="${ep.bytes || 0}" type="audio/mpeg"/>`,
  );
  lines.push('    </item>');
  return lines.join('\n');
}

/**
 * Render the full feed. Episodes should already be newest-first.
 * @param {{r2PublicBaseUrl:string}} config
 * @param {Array} episodes
 * @param {object} [channel]
 */
export function renderFeed(config, episodes, channel = CHANNEL) {
  const link = (config.r2PublicBaseUrl || '').replace(/\/+$/, '') + '/';
  const items = episodes.map(renderItem).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
     xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
     xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${escapeXml(channel.title)}</title>
    <link>${escapeXml(link)}</link>
    <language>${escapeXml(channel.language)}</language>
    <description>${escapeXml(channel.description)}</description>
    <itunes:author>${escapeXml(channel.author)}</itunes:author>
    <itunes:explicit>${channel.explicit ? 'true' : 'false'}</itunes:explicit>
    <itunes:category text="${escapeXml(channel.category)}"/>
    <lastBuildDate>${rfc822(Date.now())}</lastBuildDate>
${items}
  </channel>
</rss>
`;
}
