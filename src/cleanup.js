// Stage 10 — retention cleanup. Deletes episodes older than the retention
// window (default 21 days): removes their MP3 from R2 and drops them from the
// feed. Run daily by an OpenClaw cron command job.
//
//   npm run cleanup                 delete episodes older than 21 days
//   npm run cleanup -- --days 30    override the window
//   npm run cleanup -- --dry-run    show what would be deleted, change nothing

import { validateConfig } from './config.js';
import { loadEpisodes, pruneOlderThan, partitionByAge, RETENTION_DAYS } from './publish.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const daysArg = args.indexOf('--days');
const days = daysArg !== -1 ? Number(args[daysArg + 1]) : RETENTION_DAYS;

if (!Number.isFinite(days) || days <= 0) {
  console.error('Invalid --days value; must be a positive number.');
  process.exit(2);
}

const { ok, missing, config } = validateConfig();
if (!ok) {
  console.error(`Missing required config: ${missing.join(', ')}. Run: npm run check-config`);
  process.exit(1);
}

try {
  if (dryRun) {
    const episodes = await loadEpisodes(config);
    const { keep, remove } = partitionByAge(episodes, days);
    console.log(`\nDry run — retention ${days} days`);
    console.log(`Would delete ${remove.length}, keep ${keep.length}.`);
    for (const e of remove) console.log(`  - ${e.slug}  (${e.pubDate})`);
    console.log('');
    process.exit(0);
  }

  const { removed, kept } = await pruneOlderThan(config, days);
  if (removed.length === 0) {
    console.log(`Cleanup: nothing older than ${days} days. ${kept} episode(s) kept.`);
  } else {
    console.log(`Cleanup: deleted ${removed.length} episode(s) older than ${days} days; ${kept} kept.`);
    for (const slug of removed) console.log(`  - ${slug}`);
  }
} catch (err) {
  console.error(`\n❌ Cleanup failed: ${err.message}`);
  process.exit(1);
}
