# OpenClaw Voice — Feature Spec

**Owner:** Kris
**Status:** Draft v2 (revised to OpenClaw-native design)
**Date:** 2026-07-18

## Summary

Message a URL to OpenClaw and get back a natural, human-sounding audio narration of that article or blog post — delivered as an episode in a private podcast feed so it plays on the iPhone lock screen with full background controls.

## Goal

Turn "read it later" into "listen to it now" with zero friction: paste a link, keep walking, and the article shows up in my podcast app ready to play.

## User story

> As Kris, I send a URL to OpenClaw from my phone. A minute or two later, a new episode titled after the article appears in my private podcast feed. I open Apple Podcasts (or Overcast), tap play, lock my phone, and listen — pausing and skipping from the lock screen and AirPods like any podcast.

## Chosen architecture

The build runs entirely inside the existing OpenClaw gateway (a self-hosted daemon on Kris's Mac that already bridges chat apps to an AI agent). Decisions that define it:

- **Input:** OpenClaw's **native Telegram channel** — no separate bot to build. Kris already messages the OpenClaw agent via Telegram; a URL sent there is the trigger.
- **Integration:** a **Skill** (`SKILL.md`) teaches the agent to recognize "narrate this URL" and run a standalone Node CLI (`convert.js <url>`) via the built-in **`exec`** tool. The CLI does the extract → TTS → upload → publish work. (OpenClaw also has a built-in `tts` tool, but the CLI calls ElevenLabs directly so it stays self-contained under `exec`.)
- **Voice:** ElevenLabs TTS for the most natural long-form narration. Start on the **free tier** to prototype (see limits below); upgrade when volume demands it.
- **Output:** Private podcast RSS feed, **self-hosted**. The CLI uploads each MP3 to Cloudflare R2 (pennies/month, no egress fees) and generates/serves the RSS XML from the bucket's public URL. Each article becomes an episode — the only reliable way to get iOS lock-screen / background playback, a queue, and native transport controls.
- **Retention job:** an **OpenClaw cron command job** (`openclaw cron`) runs the cleanup CLI daily — no separate scheduler.
- **Scope:** single user (just Kris). No multi-user feeds, accounts, or per-listener feeds in scope.

## End-to-end flow

1. **Trigger** — I send a message containing a URL in my existing OpenClaw Telegram chat. A plain URL is the only input; no flags or options. The skill tells the agent to treat it as a narration request.
2. **Acknowledge** — The agent replies (via its `message` tool): "Got it — converting *[detected title]*…" so I know it's working.
3. **Run the CLI** — The agent runs `node convert.js <url>` via the `exec` tool. The remaining steps happen inside that CLI.
4. **Fetch & extract** — The CLI fetches the page and extracts readable article text (title, author, body), stripping nav, ads, comments, and boilerplate.
5. **Clean for narration** — Normalize text for speech: drop URLs, handle images/captions, convert lists and headings into natural spoken transitions, strip footnote clutter.
6. **Synthesize** — Send cleaned text to ElevenLabs, receive an MP3. Chunk long articles (≤2,500 chars/request) and stitch segments so there are no hard cutoffs.
7. **Store** — Upload the MP3 to Cloudflare R2 at a stable, unguessable public URL.
8. **Publish** — Prepend a new `<item>` to the private RSS feed (title, author, source link, duration, pubDate, MP3 enclosure) and re-upload the feed to R2.
9. **Notify** — The CLI prints a result the agent relays: "Done — *[title]* (12 min) is in your feed."
10. **Listen** — The podcast app picks up the new episode on its next refresh (or a manual pull-to-refresh). Play, lock, background, AirPods controls all work natively.

## Components

| Component | Responsibility | Candidate tech |
|---|---|---|
| Trigger channel | Receive URLs, send status replies | OpenClaw **native Telegram channel** (no custom bot) |
| Skill | Teach the agent to recognize a narration request and run the CLI | `SKILL.md` in the OpenClaw workspace, using the `exec` tool |
| CLI (orchestrator) | Extract → normalize → TTS → upload → publish | Standalone Node CLI (`convert.js`), run via `exec` |
| Article extractor | HTML → clean readable text | `@mozilla/readability` + jsdom (Node) |
| Text normalizer | Article text → speech-ready script | Rules + optional LLM cleanup pass |
| TTS | Script → MP3 | ElevenLabs API (called directly by the CLI) |
| Storage | Host MP3 files durably | Cloudflare R2 |
| Feed generator | Maintain private RSS XML | RSS builder in the CLI |
| Feed host | Serve RSS at a private URL | R2 public URL (`r2.dev` or custom domain) |
| Retention | Delete episodes after 21 days | OpenClaw `cron` command job → cleanup CLI |

## Prerequisites & credentials

Accounts (both created): **ElevenLabs** and **Cloudflare R2**. The values below are gathered during setup and supplied to OpenClaw as secrets — never commit real values to the spec or code; store them in a secret store / password manager.

| Credential | Where it comes from | Notes |
|---|---|---|
| `ELEVENLABS_API_KEY` | ElevenLabs → Developers → API Keys → Create Key | Restricted key with Text-to-Speech enabled; optional credit cap. Shown once — copy immediately. |
| `ELEVENLABS_VOICE_ID` | ElevenLabs → Voices → My Voices → ⋮ → Copy Voice ID | The default narration voice. |
| `R2_BUCKET` | Cloudflare → R2 Object Storage → Create bucket | e.g. `openclaw-voice`. |
| `R2_ACCOUNT_ID` / `R2_S3_ENDPOINT` | R2 overview / token page | Endpoint is `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`. |
| `R2_ACCESS_KEY_ID` | R2 → Manage API Tokens → Create API Token | Object Read & Write, scoped to the bucket. |
| `R2_SECRET_ACCESS_KEY` | Same token creation step | Shown once — copy immediately. |
| `R2_PUBLIC_BASE_URL` | R2 bucket → Settings → Public Access | The `r2.dev` public URL (or a custom domain later). Feed + MP3 URLs are built from this. |

## The lock-screen requirement (why podcast feed)

iOS does not let arbitrary audio auto-play or reliably background-play from Messages, Files, or most inbox apps. A podcast subscription is the sanctioned path: subscribed episodes get full background audio, lock-screen artwork and transport controls, CarPlay, AirPods, and Siri. The tradeoff is that I subscribe once to a private feed URL and new articles arrive as episodes rather than as direct file replies.

**Feed privacy:** the feed URL should be unguessable (long random token in the path) and served over HTTPS. Optionally add basic-auth or a signed token if the podcast app supports it. Treat the feed URL like a password.

## Voice & narration quality

- **Voice:** one chosen ElevenLabs voice as the default; make it configurable.
- **Model:** use a long-form / multilingual model tuned for stability over expressiveness to avoid drift on long reads.
- **Intro:** optional short spoken header — "From [source], titled [title], by [author]" — before the body.
- **Pacing:** insert natural pauses at paragraph and section breaks.

### ElevenLabs tier constraints (build for these from day one)

- **Current plan:** paid tier with **~30,000 credits/month** (1 credit ≈ 1 character on Multilingual v2) — roughly a few average articles per month. Watch the monthly budget on long pieces (a single long Wikipedia article can be ~35k chars, i.e. more than a month's credits on its own).
- **Per-request cap:** the pipeline chunks each generation to **≤2,500 characters** and stitches segments. This was the free-tier per-request limit; it's kept as a safe default on the paid tier too.
- **Cost awareness:** `convert --dry-run <url>` reports script length and estimated credits before you spend them. Track characters per job (see Cost control) so you can see when you're nearing the monthly budget.

## Input format

- **Plain URL only.** No command flags, options, or overrides. Every article uses the default voice and the auto-detected title, and is always narrated in full.

## Edge cases & handling

- **Paywalled / login-required pages:** extraction fails → the CLI exits with a clear message the agent relays, asking for pasted text as a fallback.
- **Non-article URLs** (video, PDF, homepage): detect and reply with a clear message; PDF support can be a later add.
- **Very long articles:** always narrate the **full article** (no summarizing). Chunk for TTS and stitch; there is no length cap and no auto-summary mode.
- **Duplicate URL:** not handled — sending the same URL twice simply produces two episodes. (No duplicate detection in scope.)
- **TTS or fetch failure:** retry with backoff; on final failure, the CLI reports the error plainly and the agent relays it.
- **Cost control:** ElevenLabs bills per character — log characters/cost per job; optional monthly cap.

## Non-functional requirements

- **Reliability:** failed jobs never fail silently — the CLI exits non-zero with a message the agent relays to Telegram.
- **Retention:** each episode is **deleted 21 days after it is published** — both the MP3 in storage and the `<item>` in the feed. An OpenClaw `cron` command job runs the cleanup CLI daily. Simple, self-contained, no playback tracking required.
- **Security:** secrets (ElevenLabs key, R2 creds) in the CLI's `.env` / OpenClaw's secret handling; feed URL unguessable. OpenClaw's own Telegram credentials are managed by the gateway, not this project.

## Decisions (resolved)

- **Feed & storage host:** self-host the RSS + MP3s (own object storage + generated feed).
- **Retention:** delete each episode 21 days after publish (daily cleanup job).
- **Article length:** always narrate the full article; no summary mode.
- **Users:** single user (Kris) only.
- **Integration:** a Skill (`SKILL.md`) + the built-in `exec` tool run a standalone Node CLI. Trigger is OpenClaw's native Telegram channel (no custom bot); retention is an OpenClaw `cron` command job. Zero added infrastructure or marginal cost.

## Open questions

None — all major decisions are resolved. Remaining detail (specific ElevenLabs voice ID, R2 vs. B2 bucket choice, exact intro wording) can be settled during implementation.

## Suggested build phases

- **Phase 1 (MVP):** Telegram URL → extract → ElevenLabs → MP3 in storage → single private RSS feed → subscribe in Apple Podcasts. Full articles only, one voice, minimal error replies.
- **Phase 2:** better extraction fallbacks (paywall/login handling + paste-text fallback) and ElevenLabs cost/usage logging.

## Definition of done (MVP)

Sending any standard article URL to the Telegram bot results, within a couple of minutes, in a playable episode in my private podcast feed that plays on my iPhone with the screen locked and correct title/artwork on the lock screen.
