// CLI: upload a local file to R2 and print its public URL (Stage 6 test).
//   npm run upload -- <localPath> [key]
// Default key: episodes/<filename>. Verifies R2 credentials + public access
// end to end — open the printed URL in a browser to confirm it plays.

import { basename } from 'node:path';
import { uploadMp3, putObject, publicUrlFor } from './storage.js';
import { validateConfig } from './config.js';
import { readFileSync } from 'node:fs';

const [localPath, keyArg] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!localPath) {
  console.error('Usage: npm run upload -- <localPath> [key]');
  process.exit(2);
}

const { ok, missing, config } = validateConfig();
if (!ok) {
  console.error(`Missing required config: ${missing.join(', ')}. Run: npm run check-config`);
  process.exit(1);
}

const isMp3 = localPath.toLowerCase().endsWith('.mp3');
const key = keyArg || (isMp3 ? `episodes/${basename(localPath)}` : basename(localPath));

try {
  const res = isMp3
    ? await uploadMp3(config, localPath, key)
    : await putObject(config, { key, body: readFileSync(localPath), contentType: 'application/octet-stream' });
  console.log(`\n✅ Uploaded → ${res.key}`);
  console.log(`Public URL: ${res.url}\n`);
  console.log('Open that URL in a browser to confirm it plays / loads.');
} catch (err) {
  console.error(`\n❌ Upload failed: ${err.name}: ${err.message}`);
  console.error('Check R2_* credentials, bucket name, and that the token has Object Read & Write.\n');
  process.exit(1);
}
