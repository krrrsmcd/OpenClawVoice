// Stage 4 — text normalization: turn an extracted article into a script that
// reads naturally aloud. Removes things that sound bad when spoken (bare URLs,
// citation markers, stray boilerplate), tidies whitespace, and prepends an
// optional spoken intro.

/**
 * @param {{title?: string, author?: string|null, siteName?: string|null, body: string}} article
 * @param {{intro?: boolean}} [opts]
 * @returns {string} speech-ready script
 */
export function normalizeScript(article, opts = {}) {
  const { intro = true } = opts;

  let body = article.body || '';
  body = stripCitationMarkers(body);
  body = stripUrls(body);
  body = stripStandaloneBoilerplate(body);
  body = tidy(body);
  body = ensureParagraphPauses(body);

  const parts = [];
  const introLine = intro ? buildIntro(article) : '';
  if (introLine) parts.push(introLine);
  if (body) parts.push(body);
  return parts.join('\n\n').trim();
}

/** "From <site>, titled <title>, by <author>." — omitting missing pieces. */
export function buildIntro({ title, author, siteName } = {}) {
  const t = (title || '').trim();
  const a = (author || '').trim();
  const s = (siteName || '').trim();
  if (!t && !a && !s) return '';

  const segs = [];
  if (s) segs.push(`From ${s}`);
  if (t) segs.push(`${segs.length ? 'titled ' : ''}${t}`);
  if (a) segs.push(`by ${a}`);
  return capitalize(segs.join(', ').replace(/\s+/g, ' ')) + '.';
}

// --- cleaning rules --------------------------------------------------------

/** Remove numbered citation markers like [1], [12], [3][4]. */
function stripCitationMarkers(text) {
  return text.replace(/\[\d+\]/g, '');
}

/** Remove bare URLs and www-style links that would be read out character by character. */
function stripUrls(text) {
  return text
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, '')
    .replace(/\S+@\S+\.\S+/g, ''); // stray email addresses too
}

/** Drop common standalone junk lines (ads, share prompts) when they're their own line. */
function stripStandaloneBoilerplate(text) {
  const junk = /^(advertisement|sponsored|share this|sign up for.*newsletter.*)$/i;
  return text
    .split('\n')
    .filter((line) => !junk.test(line.trim()))
    .join('\n');
}

/** Collapse whitespace, fix spacing around punctuation, remove empties left by stripping. */
function tidy(text) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ +([.,;:!?])/g, '$1') // no space before punctuation
    .replace(/\(\s*\)/g, '') // empty parens left by URL removal
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** Give each paragraph terminal punctuation so TTS pauses between them (helps headings/list items). */
function ensureParagraphPauses(text) {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => (/[.!?:"'”’)]$/.test(p) ? p : `${p}.`))
    .join('\n\n');
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
