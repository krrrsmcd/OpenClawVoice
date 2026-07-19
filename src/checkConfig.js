// `npm run check-config` — verifies all credentials load and reports status.
// Exits 0 if every required field is present, 1 otherwise.

import { validateConfig } from './config.js';

const { ok, missing, results, config } = validateConfig();

console.log('\nOpenClaw Voice — config check\n');

const pad = (s, n) => s.padEnd(n);
console.log(pad('STATUS', 8) + pad('FIELD', 24) + 'VALUE');
console.log('-'.repeat(64));

for (const r of results) {
  const icon = r.present ? '  ok  ' : (r.required ? ' MISS ' : ' skip ');
  console.log(pad(icon, 8) + pad(r.key, 24) + r.display);
}

console.log('-'.repeat(64));
console.log(`Derived R2 S3 endpoint : ${config.r2S3Endpoint || '(unavailable — R2_ACCOUNT_ID missing)'}`);
console.log(`Derived public base URL: ${config.r2PublicBaseUrl || '(missing)'}`);

if (ok) {
  console.log('\n✅ All required config present.\n');
  process.exit(0);
} else {
  console.log(`\n❌ Missing required: ${missing.join(', ')}`);
  console.log('   Fill these in your .env (see .env.example), then re-run.\n');
  process.exit(1);
}
