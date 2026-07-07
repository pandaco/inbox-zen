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
  name: '__MSG_appName__',
  version: pkg.version,
  ...(extensionKey && { key: extensionKey }),
  description: '__MSG_appDesc__',
  default_locale: 'en',
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
    default_title: '__MSG_appName__',
  },
  ...(clientId && {
    oauth2: {
      client_id: clientId,
      scopes: [
        'https://mail.google.com/',
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
      // Only what the panel iframe needs — notably NOT background.js /
      // content-script.js. Lazy routes keep hashed chunk-*.js names even
      // with outputHashing: none, hence the glob.
      resources: ['index.html', 'main.js', 'chunk-*.js', 'styles.css', 'favicon.ico', 'icons/*'],
      matches: ['https://mail.google.com/*'],
    },
  ],
};

writeFileSync(resolve(__dirname, '../public/manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`manifest.json generated (v${pkg.version})`);
