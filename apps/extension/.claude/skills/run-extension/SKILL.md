---
name: run-extension
description: Build, run, and drive the Inbox Zen Chrome extension (apps/extension). Use when asked to run, start, build, or screenshot the extension, or verify it loads cleanly against Gmail.
---

Inbox Zen is a Manifest V3 Chrome extension (Angular popup + background
service worker + Gmail content script). It is driven by loading it
unpacked into a real Chrome instance via Playwright and navigating to
`mail.google.com` — there is no standalone server to `curl`.

Driver: `apps/extension/.claude/skills/run-extension/driver.mjs`. All
paths below are relative to the repo root (not this skill directory).

## Prerequisites

Playwright is already a devDependency of `apps/extension` (added for
this driver). One-time browser download if not already cached:

```bash
npx playwright install chromium
```

## Build

```bash
npm run build   # from repo root — runs `nx build extension`
```

Output: `apps/extension/dist/` (manifest.json, background.js,
content-script.js, Angular popup bundle).

## Run (agent path)

```bash
node apps/extension/.claude/skills/run-extension/driver.mjs
```

What it does: launches a real (non-headless-shell) Chrome with the
built extension loaded unpacked, waits for the background service
worker to register, navigates to `https://mail.google.com/mail/u/0/`,
and screenshots the result. Prints `RESULT: clean load, ...` or
`RESULT: errors seen` based on whether any service-worker/page/console
errors fired.

Screenshot lands at `/tmp/inbox-zen-run/gmail.png` (override with
`--screenshot-dir <dir>`).

Since there's no logged-in Google account in this environment, the
page will redirect to `accounts.google.com` sign-in — that's the
expected, successful outcome. It confirms `host_permissions` /
`content_scripts` in the manifest are wired correctly and the
extension's background/content scripts loaded without throwing. It
does **not** exercise the extension's actual UI (noise scores,
unsubscribe list, Inbox Zero mode) — that requires a real Google
account completing OAuth consent, which needs a human. See
[SETUP.md](../../../../../SETUP.md) at repo root for the OAuth setup
steps if you need to go further with real credentials.

## Run (human path)

```bash
npm run build
```

Then in Chrome: `chrome://extensions` → enable Developer mode → Load
unpacked → select `apps/extension/dist`. Open Gmail, click the gear
icon bottom-right → Connect with Google.

## Test

```bash
nx test extension   # from repo root
```

---

## Gotchas

- **`headless: true` silently can't load extensions.** Playwright's
  `headless: true` resolves to the separate `chrome-headless-shell`
  binary, which has no extension support at all — `--load-extension`
  is accepted but the service worker never registers, with zero error
  output anywhere (not even verbose `--enable-logging=stderr`). It
  looks exactly like a broken extension. Fix: pass `executablePath`
  pointing at the full "Chrome for Testing" binary under
  `~/Library/Caches/ms-playwright/chromium-*/chrome-mac-arm64/...`,
  set `headless: false`, and add `--headless=new` as a Chrome arg
  instead — that's Chrome's own headless mode, which does support
  extensions and needs no display server. `driver.mjs` handles this
  via `findChromeForTesting()`.
- **Relative paths passed to `--load-extension` resolve against the
  Node process's `cwd`, not the script's directory.** If you `cd` into
  the skill directory before running a one-off script, a relative
  `apps/extension/dist` silently points nowhere and Chrome just... has
  no extension loaded, no error. `driver.mjs` resolves `EXT_PATH` from
  `import.meta.url`, not `cwd`, to avoid this.

## Troubleshooting

- **`No build found at .../dist`**: run `npm run build` first.
- **`Could not find Chrome for Testing binary`**: run
  `npx playwright install chromium`.
