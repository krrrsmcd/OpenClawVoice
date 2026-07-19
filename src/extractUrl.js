// CLI: inspect what the extractor pulls from a URL (Stage 3 test harness).
//   npm run extract -- <url>
// Prints title, author, site, char count, and a body preview so you can
// eyeball extraction quality before wiring it into the pipeline.

import { extract } from './extract.js';

const url = process.argv[2];
if (!url) {
  console.error('Usage: npm run extract -- <url>');
  process.exit(2);
}

try {
  const a = await extract(url);
  console.log(`\nTitle : ${a.title}`);
  console.log(`Author: ${a.author ?? '(none found)'}`);
  console.log(`Site  : ${a.siteName ?? '(unknown)'}`);
  console.log(`Length: ${a.length} chars`);
  console.log(`\n--- body preview (first 500 chars) ---\n`);
  console.log(a.body.slice(0, 500) + (a.body.length > 500 ? '…' : ''));
  console.log('');
} catch (err) {
  console.error(`\n❌ Extraction failed: ${err.message}\n`);
  process.exit(1);
}
