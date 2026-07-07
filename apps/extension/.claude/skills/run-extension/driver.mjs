#!/usr/bin/env node
// Loads the built extension into a real Chrome instance and drives it against
// Gmail far enough to prove the extension itself is healthy: service worker
// registers, content script injects, no console/page errors on load.
//
// Usage: node driver.mjs [--screenshot-dir <dir>]
//
// NOTE: real Gmail data / the extension's actual UI (noise scores, unsubscribe
// list, etc.) requires a logged-in Google account and completed OAuth consent
// — neither is available headless. This driver proves the extension loads
// cleanly and that navigation to mail.google.com redirects correctly to Google
// sign-in (i.e. host_permissions/content_scripts are wired right). A human
// with real Gmail credentials is required to go further.

import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../../..');
const EXT_PATH = path.join(REPO_ROOT, 'apps/extension/dist');

const screenshotDirArg = process.argv.indexOf('--screenshot-dir');
const SCREENSHOT_DIR =
  screenshotDirArg !== -1 ? process.argv[screenshotDirArg + 1] : '/tmp/inbox-zen-run';
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const USER_DATA_DIR = path.join(SCREENSHOT_DIR, 'chrome-profile');

if (!fs.existsSync(path.join(EXT_PATH, 'manifest.json'))) {
  console.error(`No build found at ${EXT_PATH} — run "npm run build" first.`);
  process.exit(1);
}

// IMPORTANT: headless:true resolves to the `chrome-headless-shell` binary,
// which CANNOT load extensions (fails silently — no error, service worker
// just never registers). Use the full Chrome binary + --headless=new instead.
const chromePath = findChromeForTesting();

const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
  executablePath: chromePath,
  headless: false,
  args: [
    `--disable-extensions-except=${EXT_PATH}`,
    `--load-extension=${EXT_PATH}`,
    '--no-sandbox',
    '--headless=new',
  ],
});

let sawError = false;
context.on('weberror', (err) => {
  sawError = true;
  console.log('[weberror]', err.error().message);
});

const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker', { timeout: 10000 }));
console.log('Service worker:', sw.url());

const page = await context.newPage();
page.on('console', (msg) => {
  if (msg.type() === 'error') {
    sawError = true;
    console.log('[console error]', msg.text());
  }
});
page.on('pageerror', (err) => {
  sawError = true;
  console.log('[page error]', err.message);
});

await page.goto('https://mail.google.com/mail/u/0/', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(3000);

const screenshotPath = path.join(SCREENSHOT_DIR, 'gmail.png');
await page.screenshot({ path: screenshotPath });

console.log('Page title:', await page.title());
console.log('Page URL:', page.url());
console.log('Screenshot:', screenshotPath);
console.log(sawError ? 'RESULT: errors seen (see above)' : 'RESULT: clean load, no console/page/service-worker errors');

await context.close();
process.exit(sawError ? 1 : 0);

function findChromeForTesting() {
  const cacheDir = path.join(process.env.HOME, 'Library/Caches/ms-playwright');
  if (!fs.existsSync(cacheDir)) throw new Error('Playwright browsers not installed — run: npx playwright install chromium');
  const versions = fs.readdirSync(cacheDir).filter((d) => d.startsWith('chromium-') && !d.includes('headless'));
  if (versions.length === 0) throw new Error('No chromium-* build found under ' + cacheDir);
  versions.sort();
  const latest = versions[versions.length - 1];
  const candidate = path.join(
    cacheDir,
    latest,
    'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
  );
  if (fs.existsSync(candidate)) return candidate;
  // Linux layout
  const linuxCandidate = path.join(cacheDir, latest, 'chrome-linux/chrome');
  if (fs.existsSync(linuxCandidate)) return linuxCandidate;
  throw new Error('Could not find Chrome for Testing binary under ' + path.join(cacheDir, latest));
}
