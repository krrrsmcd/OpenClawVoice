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
  body = speakMath(body);
  body = stripCitationMarkers(body);
  body = stripUrls(body);
  body = stripStandaloneBoilerplate(body);
  body = flattenFormulaCase(body);
  body = speakSymbols(body);
  body = capitalizeSentences(body);
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
 * Turn LaTeX/MathJax expressions into spoken English. Left as-is, TTS reads
 * them as literal backslash soup ("backslash text open brace Success...").
 *
 * Only unambiguous delimiters are handled: \(...\), \[...\] and $$...$$.
 * Single-$ math is deliberately left alone because it collides with ordinary
 * prices ("$5 to $10"). Anything we can't verbalize is dropped rather than
 * narrated.
 */
export function speakMath(text) {
  const say = (_m, inner) => {
    const spoken = verbalizeLatex(inner);
    return spoken ? ` ${spoken} ` : '';
  };
  return text
    .replace(/\\\(([\s\S]*?)\\\)/g, say)
    .replace(/\\\[([\s\S]*?)\\\]/g, say)
    .replace(/\$\$([\s\S]*?)\$\$/g, say)
    // Leftover bare commands if a delimiter was missing.
    .replace(/\\(?:text|mathrm)\s*\{([^{}]*)\}/g, '$1')
    .replace(/\\(?:frac|times|cdot|left|right)\b\s*/g, '');
}

/**
 * Convert a LaTeX fragment to a spoken sentence. Fractions are read using the
 * article's own vocabulary ("the numerator is X, the denominator is Y"), which
 * is clearer aloud than "over" and unambiguous about what sits above the line.
 * Terms are lowercased so the voice reads them as prose rather than as a list
 * of proper nouns, which is what made the delivery choppy.
 */
function verbalizeLatex(latex) {
  let s = latex;

  // \frac{A}{B} -> "the numerator is A. The denominator is B"
  s = replaceFractions(s);

  s = s
    // Terms are lowercased so the voice reads them as prose, not as a list of
    // proper nouns — that capitalisation is what made the delivery choppy.
    .replace(/\\(?:text|mathrm)\s*\{([^{}]*)\}/g, (_m, body) => body.toLowerCase())
    .replace(/\\times\b/g, ' times ')
    .replace(/\\cdot\b/g, ' times ')
    .replace(/\\div\b/g, ' divided by ')
    .replace(/\\(?:left|right|,|;|!|quad|qquad)\b/g, '')
    .replace(/\s*=\s*/g, ' equals the following. ')
    .replace(/[{}\\]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // If anything unreadable survived, say nothing rather than narrate symbols.
  if (!s || /[\\{}^_]/.test(s)) return '';

  s = s.replace(/\s+([.,])/g, '$1');
  if (!/[.!?]$/.test(s)) s += '.';
  return capitalizeSentences(s);
}

/**
 * Capitalize the first letter of each sentence. Applied after the formula
 * lowercasing so that only the *interior* terms stay lowercase — a sentence
 * still opens with a capital.
 */
function capitalizeSentences(s) {
  return s.replace(/(^|\n|[.!?]["'”’)]?\s+)([a-z])/g, (_m, lead, ch) => lead + ch.toUpperCase());
}

/** Rewrite every \frac{A}{B}, matching braces so nested groups survive. */
function replaceFractions(input) {
  let s = input;
  let guard = 0;
  while (s.includes('\\frac') && guard++ < 20) {
    const i = s.indexOf('\\frac');
    const num = readGroup(s, i + '\\frac'.length);
    if (!num) break;
    const den = readGroup(s, num.end);
    if (!den) break;
    const spoken = `the numerator is ${num.body.trim()}. The denominator is ${den.body.trim()}`;
    s = s.slice(0, i) + spoken + s.slice(den.end);
  }
  return s;
}

/** Read a {...} group starting at or after `from`, honouring nesting. */
function readGroup(s, from) {
  const start = s.indexOf('{', from);
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}' && --depth === 0) {
      return { body: s.slice(start + 1, i), end: i + 1 };
    }
  }
  return null;
}

// A standalone formula line: only words joined by ×, and short enough to be a
// label rather than a sentence. The article's failure-mode headings look like
// "Machine × No Problem Understanding × Practice" (7 words). The word-count cap
// keeps ordinary prose that happens to contain × out of scope.
const FORMULA_LINE = /^[A-Za-z][A-Za-z'’-]*(?: [A-Za-z][A-Za-z'’-]*)*(?: *[×✕✖] *[A-Za-z][A-Za-z'’-]*(?: [A-Za-z][A-Za-z'’-]*)*)+[.?!]?$/;
const FORMULA_MAX_WORDS = 8;

/**
 * Lowercase the terms of a standalone formula line. "Machine Understanding
 * times Problem Understanding" reads as a choppy list of proper nouns; the
 * lowercase form flows as prose, with a much shorter beat after "times".
 * Sentence case is restored afterwards by capitalizeSentences.
 *
 * Runs before speakSymbols so the × itself is the signal that a line is a
 * formula — far more reliable than pattern-matching the word "times", which
 * appears in ordinary prose ("three times Monday", "The New York Times").
 */
function flattenFormulaCase(text) {
  return text
    .split('\n')
    .map((line) => {
      const l = line.trim();
      if (!FORMULA_LINE.test(l)) return line;
      const words = l.replace(/[×✕✖]/g, ' ').trim().split(/\s+/).length;
      return words <= FORMULA_MAX_WORDS ? l.toLowerCase() : line;
    })
    .join('\n');
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
