// CLI: show ElevenLabs usage this month vs. the plan budget (Stage 11).
//   npm run usage

import { readUsage, monthToDate, DEFAULT_MONTHLY_BUDGET } from './usage.js';

const budget = Number(process.env.ELEVENLABS_MONTHLY_CREDITS) || DEFAULT_MONTHLY_BUDGET;
const { episodes, chars } = monthToDate(readUsage());
const remaining = budget - chars;
const pct = Math.round((chars / budget) * 100);

console.log('\nElevenLabs usage — this month\n');
console.log(`Episodes    : ${episodes}`);
console.log(`Characters  : ${chars.toLocaleString()} / ${budget.toLocaleString()} (${pct}%)`);
console.log(`Remaining   : ${remaining.toLocaleString()}`);
if (remaining <= 0) {
  console.log('\n⚠️  Over budget — further narration may fail or incur overage until the monthly reset.');
} else if (pct >= 80) {
  console.log('\n⚠️  Over 80% of the monthly budget used.');
}
console.log('');
