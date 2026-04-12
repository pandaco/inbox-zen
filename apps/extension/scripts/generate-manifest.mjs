import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));

config({ path: resolve(__dirname, '../../../.env') });

const pkg = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf-8'));

const clientId = process.env['GMAIL_CLIENT_ID'];
if (!clientId) {
  console.warn('Warning: GMAIL_CLIENT_ID is not set in .env — OAuth will not work.');
}

const extensionKey = process.env['EXTENSION_KEY'];

const manifest = {
  manifest_version: 3,
  name: 'Inbox Zen',
  version: pkg.version,
  ...(extensionKey && { key: extensionKey }),
  description: 'Identify and clean up heavy, redundant, and unread emails to regain serenity in your Gmail inbox.',
  permissions: ['storage', 'identity'],
  host_permissions: [
    'https://mail.google.com/*',
    'https://www.googleapis.com/*',
  ],
  background: {
    service_worker: 'background.js',
  },
  content_scripts: [
    {
      matches: ['https://mail.google.com/*'],
      js: ['content-script.js'],
      run_at: 'document_idle',
    },
  ],
  action: {
    default_title: 'Inbox Zen',
  },
  ...(clientId && {
    oauth2: {
      client_id: clientId,
      scopes: [
        'https://www.googleapis.com/auth/gmail.readonly',
      ],
    },
  }),
  icons: {
    16: 'icons/icon16.png',
    32: 'icons/icon32.png',
    48: 'icons/icon48.png',
    128: 'icons/icon128.png',
  },
  web_accessible_resources: [
    {
      resources: ['*.html', '*.js', '*.css', '*.ico'],
      matches: ['https://mail.google.com/*'],
    },
  ],
};

writeFileSync(resolve(__dirname, '../public/manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`manifest.json generated (v${pkg.version})`);
