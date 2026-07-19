// CLI: preview the speech-ready script for a URL (extract -> normalize).
//   npm run normalize -- <url>
//   npm run normalize -- --no-intro <url>

import { extract } from './extract.js';
import { normalizeScript } from './normalize.js';

const args = process.argv.slice(2);
const intro = !args.includes('--no-intro');
const url = args.find((a) => !a.startsWith('--'));

if (!url) {
  console.error('Usage: npm run normalize -- [--no-intro] <url>');
  process.exit(2);
}

try {
  const article = await extract(url);
  const script = normalizeScript(article, { intro });
  console.log(`\nSource : ${article.title}`);
  console.log(`Raw    : ${article.length} chars   Script: ${script.length} chars\n`);
  console.log('--- script ---\n');
  console.log(script);
  console.log('');
} catch (err) {
  console.error(`\n❌ ${err.message}\n`);
  process.exit(1);
}
