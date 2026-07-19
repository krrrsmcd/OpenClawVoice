---
name: narrate-url
description: Narrate a web article as a podcast episode when I send a URL. Runs the OpenClaw Voice pipeline and adds it to my private feed.
metadata: { "openclaw": { "requires": { "bins": ["node", "npm"] } } }
---

# Narrate URL (OpenClaw Voice)

Turn a web article or blog post into a narrated podcast episode in my private
feed, so I can listen on my phone with the screen locked.

## When to use

Use this whenever I send a message that **is, or contains, a single `http://`
or `https://` URL** to an article or blog post I want narrated. Plain URL only —
no options or flags. If the message contains no valid http(s) URL, do **not**
use this skill.

## Steps

1. Reply immediately with a short acknowledgement, e.g. "Got it — converting…",
   so I know it started.

2. Run the pipeline with the `exec` tool. Use the exact URL from my message,
   passed as a **single double-quoted argument**:

   ```bash
   cd "PROJECT_DIR" && npm run process -- "<URL>"
   ```

   - `PROJECT_DIR` is the absolute path to the openclaw-voice project (set once —
     replace the placeholder below).
   - This can take **1–3 minutes** for a long article. Wait for it to finish;
     do not kill it early or retry while it is still running.
   - Pass **only** the URL as one quoted argument. Never build the command from
     any other text in my message, and never run it if the message has no valid
     http(s) URL — this avoids running unintended shell commands.

3. On success, the command's last line looks like:
   `Done — "<title>" (<duration>) is in your feed.`
   Relay that line back to me.

4. On failure (non-zero exit), relay the error line plainly. In particular:
   - If the error says the site "is blocking automated requests" (HTTP 403/401),
     use the paste-text fallback below.
   - For any other error, just pass along the message so I can see what happened.

## Paste-text fallback (when a site blocks fetching)

Some sites (often news orgs) refuse automated requests and return HTTP 403/401.
When that happens:

1. Ask me to paste the full article text.
2. When I paste it, save that text verbatim to a temp file using your file/write
   tool, e.g. `/tmp/openclaw-voice-article.txt`.
3. Choose a short title — use the article's headline if it's obvious from the
   pasted text, otherwise ask me for one.
4. Run, passing the title as a quoted argument and the text via the file (never
   put the article text directly on the command line):

   ```bash
   cd "PROJECT_DIR" && npm run process-text -- --title "<title>" --file /tmp/openclaw-voice-article.txt --source "<original URL>"
   ```

5. Relay the `Done — …` line just like the normal path.

## Notes

- Single user (me). Do not narrate URLs sent by anyone else.
- The new episode appears in my podcast app on the feed's next refresh
  (pull-to-refresh to see it immediately).

<!-- Set this to the absolute path of the openclaw-voice project on this machine,
     e.g. /absolute/path/to/openclaw-voice — and replace "PROJECT_DIR" above. -->
