// CLI: narrate pasted article text (Stage 11 fallback for sites that block
// fetching). Text comes from a file so it never goes through the shell.
//   npm run process-text -- --title "Headline" --file /tmp/article.txt [--source <url>]

import { readFileSync } from 'node:fs';
import { processText } from './process.js';
import { validateConfig } from './config.js';

const args = process.argv.slice(2);
function flag(name) {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : undefined;
}

const title = flag('--title');
const file = flag('--file');
const sourceUrl = flag('--source') || '';
const intro = !args.includes('--no-intro');

if (!title || !file) {
  console.error('Usage: npm run process-text -- --title "Headline" --file <path> [--source <url>]');
  process.exit(2);
}

let text;
try {
  text = readFileSync(file, 'utf8');
} catch (err) {
  console.error(`Could not read text file: ${err.message}`);
  process.exit(1);
}
if (text.trim().length < 200) {
  console.error('The pasted text looks too short to narrate (need at least ~200 characters).');
  process.exit(1);
}

const { ok, missing, config } = validateConfig();
if (!ok) {
  console.error(`Missing required config: ${missing.join(', ')}. Run: npm run check-config`);
  process.exit(1);
}

try {
  const r = await processText(
    { title, text, sourceUrl },
    { config, intro, onProgress: (i, n) => process.stdout.write(`\rSynthesizing chunk ${i}/${n}…`) },
  );
  console.log(`\n\nEpisode : ${r.title}`);
  console.log(`Feed    : ${r.feedUrl}  (${r.episodeCount} episode(s))`);
  console.log(`\nDone — "${r.title}" (${r.duration}) is in your feed.`);
} catch (err) {
  console.error(`\n❌ Failed: ${err.message}`);
  process.exit(1);
}
