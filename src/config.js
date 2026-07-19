// Central config loader + validation for OpenClaw Voice.
// Reads from process.env (populated via `node --env-file=.env ...`).

/**
 * @typedef {Object} ConfigField
 * @property {string} key      Environment variable name.
 * @property {boolean} required Whether it must be present for core functionality.
 * @property {boolean} secret  Whether to mask the value when displaying.
 * @property {string} note     Human description.
 */

/** @type {ConfigField[]} */
export const FIELDS = [
  { key: 'ELEVENLABS_API_KEY', required: true, secret: true, note: 'ElevenLabs API key' },
  { key: 'ELEVENLABS_VOICE_ID', required: true, secret: false, note: 'Default narration voice' },
  { key: 'R2_ACCOUNT_ID', required: true, secret: false, note: 'Cloudflare account ID (S3 endpoint subdomain)' },
  { key: 'R2_ACCESS_KEY_ID', required: true, secret: true, note: 'R2 access key ID' },
  { key: 'R2_SECRET_ACCESS_KEY', required: true, secret: true, note: 'R2 secret access key' },
  { key: 'R2_BUCKET', required: true, secret: false, note: 'R2 bucket name' },
  { key: 'R2_PUBLIC_BASE_URL', required: true, secret: false, note: 'Public base URL for the bucket' },
  // Note: no Telegram credentials here — OpenClaw's gateway owns the Telegram
  // channel; this CLI never talks to Telegram directly.
];

/** Mask a secret for display, keeping a short prefix/suffix for recognition. */
export function maskValue(value) {
  if (!value) return '';
  if (value.length <= 8) return '*'.repeat(value.length);
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

/**
 * Read raw config from the environment and derive computed values.
 * Does not throw — use validateConfig() to enforce required fields.
 */
export function loadConfig(env = process.env) {
  const raw = {};
  for (const { key } of FIELDS) {
    raw[key] = (env[key] ?? '').trim();
  }

  const accountId = raw.R2_ACCOUNT_ID;
  const derived = {
    // S3-compatible endpoint OpenClaw uses to upload to R2.
    r2S3Endpoint: accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '',
    // Public base URL, normalized without a trailing slash.
    r2PublicBaseUrl: raw.R2_PUBLIC_BASE_URL.replace(/\/+$/, ''),
  };

  return { ...raw, ...derived };
}

/**
 * Validate that all required fields are present.
 * @returns {{ ok: boolean, missing: string[], results: Array }}
 */
export function validateConfig(env = process.env) {
  const config = loadConfig(env);
  const results = FIELDS.map((f) => {
    const value = config[f.key];
    const present = value.length > 0;
    return { ...f, present, display: present ? (f.secret ? maskValue(value) : value) : '(missing)' };
  });
  const missing = results.filter((r) => r.required && !r.present).map((r) => r.key);
  return { ok: missing.length === 0, missing, results, config };
}
