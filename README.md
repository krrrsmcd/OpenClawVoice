# OpenClaw Voice

Turn a web article into a narrated podcast episode in your own private feed —
so you can listen on your phone with the screen locked.

A standalone Node.js CLI that runs the whole pipeline: extract the article text,
narrate it with ElevenLabs, upload the audio to Cloudflare R2, and publish a
private RSS feed you subscribe to in any podcast app. Use it straight from the
terminal, or install the included [OpenClaw](https://openclaw.ai) skill to
trigger it by sending a URL in Telegram.

See [`docs/spec.md`](docs/spec.md) and [`docs/build-plan.md`](docs/build-plan.md)
for the full design and staged build plan.

## Setup

### What you need first

This will not run without accounts on two paid-ish services — **ElevenLabs**
(text-to-speech) and **Cloudflare R2** (object storage for the audio and feed).
Both are quick to create, and R2's free tier easily covers personal use.

| Requirement | Notes |
|---|---|
| **ElevenLabs account** | Provides the voice. Free tier is ~10,000 characters/month (roughly one article); paid tiers start around $5/mo. |
| **Cloudflare R2 account** | Hosts the MP3s and the RSS feed. Create a bucket and enable its public URL. Free tier is ample; no egress fees. |
| **Node.js ≥ 22** | Requires built-in `--env-file` support. Tested on v24. |
| **ffmpeg** *(recommended)* | Used to stitch audio chunks cleanly. Without it there's a working fallback, but joins are slightly rougher. macOS: `brew install ffmpeg`. |
| **A podcast app** | Anything that accepts a feed URL — Apple Podcasts, Overcast, etc. This is what gives you lock-screen playback. |

### Steps

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the env template and fill in your values:

   ```bash
   cp .env.example .env
   ```

   `.env` is gitignored — never commit it. The seven required values:

   | Variable | Where to get it |
   |---|---|
   | `ELEVENLABS_API_KEY` | ElevenLabs → Developers → API Keys → Create Key (shown once) |
   | `ELEVENLABS_VOICE_ID` | ElevenLabs → Voices → My Voices → ⋮ → Copy Voice ID |
   | `R2_ACCOUNT_ID` | Cloudflare → R2 → Overview → **Account ID** (32-char hex; *not* the `pub-…` hash in your public URL) |
   | `R2_ACCESS_KEY_ID` | R2 → Manage R2 API Tokens → Create API Token (**Object Read & Write**) |
   | `R2_SECRET_ACCESS_KEY` | Same token screen (shown once) |
   | `R2_BUCKET` | Your bucket name, e.g. `openclaw-voice` |
   | `R2_PUBLIC_BASE_URL` | R2 bucket → Settings → Public Access, e.g. `https://pub-xxxx.r2.dev` (no trailing slash) |

   Tip: create the API token first — that screen shows the access key, the
   secret, and the S3 endpoint containing your account ID all at once, so the
   three values are guaranteed to match.

3. Verify everything loads:

   ```bash
   npm run check-config
   ```

   You should see every required field marked `ok` and a green “All required config
   present.” Secrets are masked in the output; the R2 S3 endpoint is derived from your
   account ID automatically. Exit code is `0` on success, `1` if anything required is missing.

## Commands

```bash
npm install                       # first-time: install dependencies
npm run check-config              # verify credentials load
npm run test:tts                  # unit tests for chunker + stitcher (no API)
npm run test:extract              # offline tests for article extraction
npm run tts -- --dry-run a.txt    # chunk plan only, no ElevenLabs calls
npm run tts -- a.txt out.mp3      # synthesize a text file to MP3 (uses credits)
npm run extract -- <url>          # inspect what the extractor pulls from a URL
```

Stitching uses `ffmpeg` if it's on PATH (clean joins); otherwise it falls back
to binary MP3 concatenation. On macOS: `brew install ffmpeg` (recommended).

## Project layout

```
src/
  config.js       Loads + validates env config; derives the R2 S3 endpoint.
  checkConfig.js  `npm run check-config` — status report + pass/fail.
  tts.js          Chunk text, synthesize via ElevenLabs, stitch to one MP3.
  synthesize.js   CLI wrapper (+ --dry-run chunk planner).
  tts.test.js     Unit tests for chunking + stitching.
  extract.js      URL -> { title, author, body } via Readability + jsdom.
  extractUrl.js   CLI to inspect extraction of a URL.
  extract.test.js Offline extraction tests.
  normalize.js    Article -> speech-ready script (intro, strip URLs/citations).
  normalizeUrl.js CLI to preview the script for a URL.
  normalize.test.js Offline normalizer tests.
  pipeline.js     convert(url): extract→normalize→synthesize; slug + duration.
  convert.js      CLI: URL -> MP3 on disk (+ --dry-run planner).
  pipeline.test.js Offline tests for slug + duration helpers.
  storage.js      R2 upload/delete/get + public-URL builder (S3 API).
  uploadFile.js   CLI: upload a local file to R2, print public URL.
  storage.test.js Offline tests for URL/key building.
  feed.js         Render episodes -> podcast RSS 2.0 (iTunes tags).
  publish.js      Manifest (episodes.json) + regenerate/upload feed.xml; prune.
  feed.test.js    Offline RSS rendering + well-formedness tests.
  process.js      Full chain: convert -> upload -> publish.
  processUrl.js   CLI: `npm run process -- <url>` (URL -> live feed episode).
  process.test.js Offline test for episode-record mapping.
  cleanup.js      CLI: delete episodes older than 21 days (cron target).
  publish.test.js Offline tests for retention partitioning.
  processTextCli.js CLI: narrate pasted text (fallback for blocked sites).
  usage.js        ElevenLabs usage logging (logs/usage.jsonl).
  usageReport.js  CLI: `npm run usage` — month-to-date chars vs budget.
  usage.test.js   Offline tests for usage aggregation.
skill/
  narrate-url/SKILL.md  OpenClaw skill: send a URL in Telegram -> episode.
```

## OpenClaw skill (trigger from Telegram)

Install the skill so sending a URL to your OpenClaw agent (Telegram) runs the
pipeline via the `exec` tool — no terminal needed.

```bash
# 1. Copy the skill into your OpenClaw workspace
mkdir -p ~/.openclaw/workspace/skills/narrate-url
cp skill/narrate-url/SKILL.md ~/.openclaw/workspace/skills/narrate-url/

# 2. Set the project path: get it, then edit the copied SKILL.md
pwd   # copy this absolute path
nano ~/.openclaw/workspace/skills/narrate-url/SKILL.md
#     replace PROJECT_DIR (in the `cd "PROJECT_DIR"` line) with that path

# 3. Verify OpenClaw sees it
openclaw skills list          # should list "narrate-url"

# 4. Start a fresh session so the skill loads (skills snapshot at session start)
#    send "/new" in chat, or: openclaw gateway restart
```

Then from your phone, send an article URL in your OpenClaw Telegram chat. The
agent acknowledges, runs `npm run process`, and replies when the episode is in
your feed. The first run may prompt you to approve the `exec` command.

Test locally without Telegram:

```bash
openclaw agent --message "narrate https://en.wikipedia.org/wiki/RSS"
```

## Retention cleanup (auto-delete after 21 days)

Episodes older than 21 days are removed from R2 and the feed by `cleanup.js`.
Preview first, then register a daily OpenClaw cron job:

```bash
npm run cleanup -- --dry-run      # show what would be deleted, change nothing
npm run cleanup                   # delete now (default 21 days; --days N to override)

# Register a daily cron job (3am host time) — runs on the Gateway host:
openclaw cron create "0 3 * * *" \
  --name "openclaw-voice cleanup" \
  --command "npm run cleanup" \
  --command-cwd "/absolute/path/to/openclaw-voice"

# Verify / run once now:
openclaw cron list
openclaw cron run <jobId> --wait
```

Run all offline tests: `npm test` (42 tests).

## Build status

- [x] Stage 0 — feed → lock-screen playback proven
- [x] Stage 1 — project scaffold & config validation
- [x] Stage 2 — TTS core (ElevenLabs, chunk + stitch)
- [x] Stage 3 — article extraction (`@mozilla/readability` + jsdom)
- [x] Stage 4 — text normalization for speech
- [x] Stage 5 — local end-to-end (`npm run convert -- <url>`)
- [x] Stage 6 — R2 upload (`npm run upload -- <file>`)
- [x] Stage 7 — RSS feed generation (feed.js + publish.js)
- [x] Stage 8 — full automated path (`npm run process -- <url>`)
- [x] Stage 9 — OpenClaw skill (Telegram trigger, `skill/narrate-url`)
- [x] Stage 10 — retention via OpenClaw cron (`npm run cleanup`)
- [x] Stage 11 — hardening: paste-text fallback + usage logging  ← done

All stages complete. Optional next: better fetch via OpenClaw's browser tool for
JS-heavy sites; publish the skill to ClawHub.
