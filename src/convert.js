// CLI: URL -> finished narrated MP3 on disk (Stage 5).
//   npm run convert -- <url> [outDir]        default outDir: ./out
//   npm run convert -- --dry-run <url>       extract+normalize+plan, no synthesis
//   npm run convert -- --no-intro <url>      skip the spoken intro
//
// Prints machine-readable-ish summary lines; the last line on success is the
// "Done — ..." message the OpenClaw skill will relay to Telegram.

import { convert, formatDuration } from './pipeline.js';
import { chunkText } from './tts.js';
import { validateConfig } from './config.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const intro = !args.includes('--no-intro');
const positionals = args.filter((a) => !a.startsWith('--'));
const url = positionals[0];
const outDir = positionals[1] || './out';

if (!url) {
  console.error('Usage: npm run convert -- [--dry-run] [--no-intro] <url> [outDir]');
  process.exit(2);
}

// Rough ElevenLabs cost signal (multilingual v2 = 1 credit/char).
const estimateCredits = (chars) => chars;

try {
  if (dryRun) {
    const m = await convert(url, { outDir, intro, dryRun: true });
    console.log(`\nDry run — ${url}\n`);
    console.log(`Title       : ${m.title}`);
    console.log(`Author      : ${m.author ?? '(none)'}`);
    console.log(`Site        : ${m.siteName ?? '(unknown)'}`);
    console.log(`Slug        : ${m.slug}`);
    console.log(`Script chars: ${m.scriptChars}`);
    console.log(`Chunks      : ${m.chunks}`);
    console.log(`Est. credits: ~${estimateCredits(m.scriptChars)} (ElevenLabs, multilingual v2)`);
    console.log('\n✅ Plan looks good. Drop --dry-run to synthesize.\n');
    process.exit(0);
  }

  const { ok, missing, config } = validateConfig();
  if (!ok) {
    console.error(`Missing required config: ${missing.join(', ')}. Run: npm run check-config`);
    process.exit(1);
  }

  const m = await convert(url, {
    outDir,
    apiKey: config.ELEVENLABS_API_KEY,
    voiceId: config.ELEVENLABS_VOICE_ID,
    intro,
    onProgress: (i, n) => process.stdout.write(`\rSynthesizing chunk ${i}/${n}…`),
  });

  console.log(`\n\nEpisode : ${m.title}`);
  console.log(`File    : ${m.mp3Path}`);
  console.log(`Duration: ${m.duration}  (${m.chunks} chunk(s), stitch: ${m.stitch})`);
  // Final line = the message the skill relays back to Telegram.
  console.log(`\nDone — "${m.title}" (${m.duration}) is ready.`);
} catch (err) {
  console.error(`\n❌ Conversion failed: ${err.message}`);
  process.exit(1);
}
