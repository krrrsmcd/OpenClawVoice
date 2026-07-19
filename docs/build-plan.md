# OpenClaw Voice — Build Plan

**Owner:** Kris
**Companion to:** `openclaw-voice-spec.md`
**Approach:** build in thin, testable slices. Each stage ends with a concrete test you can run before moving on. The riskiest assumption (self-hosted feed plays on the iPhone lock screen) is proven **first**, before any real code.

---

## Stage 0 — De-risk spike: prove the feed → lock-screen path (do this first)

**Why first:** if a self-hosted RSS feed won't play on your locked iPhone, the whole architecture is wrong — better to find out in 30 minutes than after building the pipeline.

**Tasks**
1. Manually record or download any sample MP3 (a minute of talking is fine). Rename it `test.mp3`.
2. Upload `test.mp3` to your R2 bucket and enable the public URL. Open the URL in a browser — confirm it plays.
3. Hand-write a minimal `feed.xml` (one `<channel>`, one `<item>` whose `<enclosure>` points at the MP3's public URL). Upload it to R2.
4. In Apple Podcasts on your iPhone: **Library → ⋯ → Add a Show by URL** → paste the public feed URL.

**✅ Test / milestone:** the episode appears, downloads, and **plays with the screen locked**, showing title + controls on the lock screen. If this works, the premise is proven and everything after is "just" automation.

---

## Stage 1 — Project scaffold & config

**Goal:** a runnable project inside the OpenClaw runtime that loads all secrets.

**Tasks**
1. Create the project/module in the OpenClaw runtime.
2. Wire up config from a secret store: `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `R2_ACCOUNT_ID`/endpoint, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL`.
3. Add a `check-config` command that validates every value is present and non-empty.

**✅ Test:** run `check-config` → it confirms all credentials load, and fails loudly if one is missing.

---

## Stage 2 — TTS core (ElevenLabs)

**Goal:** text in → one playable MP3 out, with chunking + stitching (the trickiest piece, so build it early).

**Tasks**
1. Function: `synthesize(text) → mp3_path`.
2. Chunk text to **≤ 2,500 characters** per request (free-tier cap), splitting on sentence/paragraph boundaries.
3. Call ElevenLabs per chunk with your voice ID; save each segment.
4. Stitch segments into a single MP3 (concatenate; ensure clean joins, no clipped words).

**✅ Test:** (a) a one-paragraph string → a playable MP3. (b) a 6,000-character string → a single MP3 that plays start-to-finish with no gaps or cut-off words at chunk boundaries.

---

## Stage 3 — Article extraction

**Goal:** URL in → clean title, author, and body text out.

**Tasks**
1. Function: `extract(url) → {title, author, body}`.
2. Use `@mozilla/readability` + `jsdom` (Node); strip nav, ads, comments, boilerplate.

**✅ Test:** run against 3–4 real articles (a news site, a personal blog, a Substack). Eyeball each: title correct, body complete, no junk navigation text.

---

## Stage 4 — Text normalization for speech

**Goal:** article body → speech-ready script that sounds natural read aloud.

**Tasks**
1. Function: `normalize({title, author, body}) → script`.
2. Handle URLs (drop or say "link"), headings/lists (natural spoken transitions), images/footnotes (skip or read alt text).
3. Prepend the optional intro line: "From [source], titled [title], by [author]."

**✅ Test:** diff raw vs. normalized text on your sample articles; run one normalized script through Stage 2 and listen — it should read smoothly, no spoken "http://…" garble.

---

## Stage 5 — Local end-to-end pipeline (URL → MP3 on disk)

**Goal:** glue Stages 3 → 4 → 2 into one command, no cloud yet.

**Tasks**
1. Function/command: `convert(url) → mp3_path` chaining extract → normalize → synthesize.

**✅ Test:** run `convert <url>` on a real article → a finished narrated MP3 on disk that you can play locally end to end.

---

## Stage 6 — R2 upload

**Goal:** push the MP3 to storage and get a public URL.

**Tasks**
1. Function: `upload(mp3_path) → public_url` via the R2 S3 endpoint.
2. Use stable, unguessable object keys (e.g. random slug + date).

**✅ Test:** run it, then open the returned public URL in a browser and confirm the narration plays.

---

## Stage 7 — RSS feed generation

**Goal:** maintain the private feed and publish it to R2.

**Tasks**
1. Function: `publish(episode)` prepends a new `<item>` (title, author, source link, pubDate, duration, `<enclosure>` = MP3 public URL) to `feed.xml`.
2. Store `feed.xml` in R2; keep the feed URL unguessable (long random token in the path) and HTTPS-only.
3. Re-upload the updated feed after each publish.

**✅ Test:** run publish for a real episode, then pass the feed URL through a podcast feed validator (e.g. Podbase/CastFeedValidator) → valid, no errors.

---

## Stage 8 — Full automated path minus Telegram

**Goal:** one command does everything: `convert(url)` → upload → publish → live in the feed.

**Tasks**
1. Chain Stages 5 → 6 → 7 into a single `process(url)`.

**✅ Test:** run `process <url>`, then pull-to-refresh the feed you subscribed to in Stage 0 → the new article appears as an episode and plays on the locked phone. **This is the MVP working end to end, minus the trigger.**

---

## Stage 9 — OpenClaw skill (Telegram trigger via the gateway)

**Goal:** send a URL in your existing OpenClaw Telegram chat and have the agent run the pipeline — no custom bot.

**Tasks**
1. Write a `SKILL.md` in the OpenClaw workspace that tells the agent: when the user sends a message that is (or contains) a URL to narrate, reply "Got it — converting…", then run `node <path>/convert.js <url>` via the `exec` tool, and relay the CLI's final line ("Done — [title] ([duration]) is in your feed") or its error.
2. Confirm the `exec` tool is enabled for the agent and the CLI path/creds are reachable from the gateway.
3. Keep it plain-URL only; the skill ignores non-URL chatter.

**✅ Test:** from your iPhone, send a real article URL in your OpenClaw Telegram chat → the agent acknowledges, runs the CLI, and the episode lands in your feed with a "Done" reply. **Full MVP loop complete.**

---

## Stage 10 — Retention via OpenClaw cron

**Goal:** auto-delete episodes 21 days after publish, using OpenClaw's built-in scheduler.

**Tasks**
1. Write a `cleanup.mjs` that lists feed items, finds any with `pubDate` > 21 days old, deletes the R2 MP3 object, removes the `<item>` from `feed.xml`, and re-uploads the feed.
2. Register it as an OpenClaw cron command job, e.g.:
   ```bash
   openclaw cron create "0 3 * * *" \
     --name "openclaw-voice cleanup" \
     --command "npm run cleanup" \
     --command-cwd "/absolute/path/to/openclaw-voice"
   ```

**✅ Test:** seed an item with a backdated pubDate (8 days ago), then `openclaw cron run <jobId> --wait` → the MP3 is gone from R2 and the item is gone from the feed; a current episode is untouched.

---

## Stage 11 — Hardening (spec Phase 2)

**Goal:** graceful failure and cost visibility.

**Tasks**
1. Extraction fallbacks: on paywall/login/parse failure, reply with a clear message and accept pasted article text instead.
2. Retries with backoff on fetch and ElevenLabs calls; on final failure, a plain error reply — never fail silently.
3. Cost/usage logging: record characters sent to ElevenLabs per article so you can see when you're nearing the free-tier limit.

**✅ Test:** send a known paywalled URL and a garbage URL → each gets a helpful reply, not a crash. Check the log shows character counts per job.

---

## Suggested execution order (summary)

0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11

**Natural stopping points:** after **Stage 8** you have a working system you drive by command; after **Stage 9** you have the full "text a URL, get a podcast episode" MVP; Stages 10–11 make it durable and pleasant to live with.
