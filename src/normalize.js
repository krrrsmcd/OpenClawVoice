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
  body = stripMath(body);
  body = stripCitationMarkers(body);
  body = stripUrls(body);
  body = stripStandaloneBoilerplate(body);
  body = speakSymbols(body);
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

/**
 * Remove LaTeX/MathJax expressions, which TTS reads out as literal backslash
 * soup ("backslash text open brace Success..."). Only unambiguous delimiters
 * are stripped: \(...\), \[...\], and $$...$$. Single-$ math is deliberately
 * left alone because it collides with ordinary prices ("$5 to $10").
 */
function stripMath(text) {
  return text
    .replace(/\\\((.|\n)*?\\\)/g, '')
    .replace(/\\\[(.|\n)*?\\\]/g, '')
    .replace(/\$\$(.|\n)*?\$\$/g, '')
    // Leftover bare commands if a delimiter was missing.
    .replace(/\\(?:text|frac|mathrm|times|cdot)\b\s*/g, '');
}

/** Remove numbered citation markers like [1], [12], [3][4]. */
function stripCitationMarkers(text) {
  return text.replace(/\[\d+\]/g, '');
}

/** Spell out symbols that TTS otherwise skips or mispronounces. */
function speakSymbols(text) {
  return text
    .replace(/\s*[×✕✖]\s*/g, ' times ')
    .replace(/\s*÷\s*/g, ' divided by ');
}

/** Remove bare URLs and www-style links that would be read out character by character. */
function stripUrls(text) {
  return text
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, '')
    .replace(/\S+@\S+\.\S+/g, ''); // stray email addresses too
}

/** Drop common standalone junk lines (ads, share prompts) when they're their own line. */
function stripStandaloneBoilerplate(text) {
  const junk =
    /^(advertisement|sponsored|share this|share|sign up for.*newsletter.*|discussion about this post|ready for more\??|leave a comment|subscribe|subscribe now|upgrade to paid|thanks for reading.*|previous|next)[.!]?$/i;
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

const ENDS_SENTENCE = /[.!?:"'”’)]$/;

/** Give each paragraph terminal punctuation so TTS pauses between them (helps headings/list items). */
function ensureParagraphPauses(text) {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(punctuateLabelLines)
    .map((p) => (ENDS_SENTENCE.test(p) ? p : `${p}.`))
    .join('\n\n');
}

/**
 * Inside a paragraph, a short unpunctuated line followed by a new sentence is
 * almost always a label — a list-item lead-in separated by a <br>, e.g.
 *
 *   Machine × No Problem Understanding × Practice
 *   Fast iteration in the wrong direction.
 *
 * Without terminal punctuation the two run together when spoken. Kept
 * deliberately narrow (short line, next line starts a sentence) so genuine
 * mid-sentence line wraps aren't broken up.
 */
function punctuateLabelLines(paragraph) {
  const lines = paragraph.split('\n');
  if (lines.length < 2) return paragraph;

  return lines
    .map((line, i) => {
      const l = line.trim();
      const next = (lines[i + 1] || '').trim();
      if (!l || !next) return l;
      const looksLikeLabel = l.length <= 100 && !ENDS_SENTENCE.test(l) && /^[“"(A-Z0-9]/.test(next);
      return looksLikeLabel ? `${l}.` : l;
    })
    .join('\n');
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
