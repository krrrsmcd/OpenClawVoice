# OpenClaw Voice

Message a URL to OpenClaw, get a narrated podcast episode in your private feed.
Built to run inside the OpenClaw runtime (Node.js, macOS).

See `openclaw-voice-spec.md` and `openclaw-voice-build-plan.md` for the full design and staged plan.

## Repo safety (secrets never get committed)

No tracked file contains real credentials, URLs, or paths — everything
environment-specific lives in `.env`, which is gitignored. A pre-commit hook
enforces this. Enable it once after cloning:

```bash
git config core.hooksPath .githooks
```

It blocks any commit that stages an `.env` file or contains a real R2 bucket
URL, ElevenLabs key, or personal home path. Use placeholders in docs
(`/absolute/path/to/openclaw-voice`, `https://pub-xxxx.r2.dev`).

## Requirements

- Node.js ≥ 22 (tested on the runtime's v24; `--env-file` support required)
- Accounts: ElevenLabs, Cloudflare R2

## Setup

1. Copy the env template and fill in your real values:

   ```bash
   cp .env.example .env
   ```

   Fill in: ElevenLabs API key + voice ID, and R2 account ID, access key, secret,
   bucket, and public base URL. (`.env` is gitignored — never commit it.)

2. Verify everything loads:

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
