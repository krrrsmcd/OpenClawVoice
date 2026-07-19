// CLI: text file -> narrated MP3 (Stage 2 manual test harness).
//
//   npm run tts -- <input.txt> <output.mp3>          synthesize for real
//   npm run tts -- --dry-run <input.txt>             chunk only, no API calls
//
// --dry-run prints the chunk plan (count, sizes, char total) so you can verify
// chunking on a long article without spending ElevenLabs credits.

import { readFileSync } from 'node:fs';
import { chunkText, synthesize, TTS_DEFAULTS } from './tts.js';
import { validateConfig } from './config.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const positionals = args.filter((a) => !a.startsWith('--'));
const [inputPath, outputPath] = positionals;

if (!inputPath) {
  console.error('Usage: npm run tts -- [--dry-run] <input.txt> [output.mp3]');
  process.exit(2);
}

const text = readFileSync(inputPath, 'utf8');

if (dryRun) {
  const chunks = chunkText(text);
  const sizes = chunks.map((c) => c.length);
  const total = sizes.reduce((n, s) => n + s, 0);
  console.log(`\nDry run — chunk plan for ${inputPath}\n`);
  console.log(`Input chars      : ${text.length}`);
  console.log(`Chunk cap        : ${TTS_DEFAULTS.maxChars}`);
  console.log(`Chunks           : ${chunks.length}`);
  console.log(`Chunk sizes      : ${sizes.join(', ')}`);
  console.log(`Max chunk size   : ${sizes.length ? Math.max(...sizes) : 0}`);
  console.log(`Billable chars   : ${total}`);
  const over = sizes.filter((s) => s > TTS_DEFAULTS.maxChars);
  if (over.length) {
    console.log(`\n❌ ${over.length} chunk(s) exceed the cap — chunker bug.`);
    process.exit(1);
  }
  console.log('\n✅ All chunks within the cap.\n');
  process.exit(0);
}

if (!outputPath) {
  console.error('Provide an output path: npm run tts -- <input.txt> <output.mp3>');
  process.exit(2);
}

// Real synthesis needs credentials.
const { ok, missing, config } = validateConfig();
if (!ok) {
  console.error(`Missing required config: ${missing.join(', ')}. Run: npm run check-config`);
  process.exit(1);
}

const result = await synthesize(text, {
  apiKey: config.ELEVENLABS_API_KEY,
  voiceId: config.ELEVENLABS_VOICE_ID,
  outPath: outputPath,
  onProgress: (i, n) => process.stdout.write(`\rSynthesizing chunk ${i}/${n}…`),
});

console.log(
  `\n✅ Wrote ${result.outPath}  (${result.chunks} chunk(s), ${result.chars} chars, stitch: ${result.method})`,
);
