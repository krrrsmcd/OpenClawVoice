// Stage 3 — article extraction: URL -> { title, author, body }.
// Uses Mozilla Readability (the engine behind Firefox Reader View) over a
// jsdom-parsed DOM, so we get the same clean article text a reader view shows.

import { JSDOM } from 'jsdom';
import { Readability, isProbablyReaderable } from '@mozilla/readability';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0 Safari/537.36 OpenClawVoice/0.1';

// Minimum readable characters before we treat extraction as a success.
// Below this, the page is almost certainly a paywall, login wall, or non-article.
const MIN_BODY_CHARS = 400;

/** Fetch raw HTML for a URL with a browser-like User-Agent. */
export async function fetchHtml(url, { timeoutMs = 20000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      // Full browser-like header set — many sites 403 requests that omit these.
      headers: {
        'User-Agent': USER_AGENT,
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
      },
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!res.ok) {
      const hint =
        res.status === 403 || res.status === 401
          ? ' — the site is blocking automated requests; paste the article text instead'
          : '';
      throw new Error(`fetch failed: HTTP ${res.status}${hint}`);
    }
    const ctype = res.headers.get('content-type') || '';
    if (!ctype.includes('html')) {
      throw new Error(`unsupported content type: ${ctype || 'unknown'} (only HTML articles are supported)`);
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Parse already-fetched HTML into a clean article. Separated from fetching so
 * it can be unit-tested offline.
 * @returns {{title: string, author: string|null, body: string, siteName: string|null, length: number, url: string}}
 */
export function parseArticle(html, url) {
  const dom = new JSDOM(html, { url });
  const doc = dom.window.document;

  stripCaptionNodes(doc);

  const article = new Readability(doc).parse();
  if (!article) {
    throw new Error('could not extract an article from this page (no readable content found)');
  }

  const body = normalizeWhitespace(article.textContent || '');
  if (body.length < MIN_BODY_CHARS) {
    throw new Error(
      `extracted text too short (${body.length} chars) — likely a paywall, login wall, or non-article page`,
    );
  }

  return {
    url,
    title: (article.title || '').trim() || 'Untitled',
    author: cleanByline(article.byline),
    siteName: (article.siteName || '').trim() || null,
    body,
    length: body.length,
  };
}

/** Fetch + parse a URL into a clean article. */
export async function extract(url, opts = {}) {
  const html = await fetchHtml(url, opts);
  return parseArticle(html, url);
}

/** Quick heuristic (no full parse) for whether a page looks like an article. */
export function looksReadable(html, url) {
  const doc = new JSDOM(html, { url }).window.document;
  return isProbablyReaderable(doc);
}

// --- helpers ---------------------------------------------------------------

// Selectors for image/figure captions across common CMSes and Wikipedia.
// Removed before Readability runs so caption text never reaches the narration.
const CAPTION_SELECTORS = [
  'figcaption',
  '.thumbcaption', // Wikipedia (legacy)
  '.wp-caption-text', // WordPress
  '.image-caption',
  '.photo-caption',
  '.media-caption',
  '[class*="caption" i]',
  '[itemprop="caption"]',
].join(', ');

/** Remove image/figure caption elements from the document in place. */
function stripCaptionNodes(doc) {
  for (const node of doc.querySelectorAll(CAPTION_SELECTORS)) {
    node.remove();
  }
}

function normalizeWhitespace(text) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cleanByline(byline) {
  if (!byline) return null;
  const b = String(byline).replace(/^\s*by\s+/i, '').trim();
  return b || null;
}
