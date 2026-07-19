// CLI: URL -> live episode in the feed (Stage 8, and the command the OpenClaw
// skill will run).
//   npm run process -- <url>
//   npm run process -- --no-intro <url>
//
// The final "Done — ..." line is what the agent relays back to Telegram.

import { processUrl } from './process.js';
import { validateConfig } from './config.js';
import { formatDuration } from './pipeline.js';

const args = process.argv.slice(2);
const intro = !args.includes('--no-intro');
const url = args.find((a) => !a.startsWith('--'));

if (!url) {
  console.error('Usage: npm run process -- [--no-intro] <url>');
  process.exit(2);
}

const { ok, missing, config } = validateConfig();
if (!ok) {
  console.error(`Missing required config: ${missing.join(', ')}. Run: npm run check-config`);
  process.exit(1);
}

try {
  const r = await processUrl(url, {
    config,
    intro,
    onProgress: (i, n) => process.stdout.write(`\rSynthesizing chunk ${i}/${n}…`),
  });

  console.log(`\n\nEpisode : ${r.title}`);
  console.log(`MP3     : ${r.mp3Url}`);
  console.log(`Feed    : ${r.feedUrl}  (${r.episodeCount} episode(s))`);
  // Final line = the message the OpenClaw skill relays to Telegram.
  console.log(`\nDone — "${r.title}" (${r.duration}) is in your feed.`);
} catch (err) {
  console.error(`\n❌ Failed: ${err.message}`);
  process.exit(1);
}
