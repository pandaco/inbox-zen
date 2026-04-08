# Setup Guide — Inbox Zen Extension

## Step 1 — Create a Google Cloud project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click the project selector in the top-left (next to the Google Cloud logo)
3. In the popup, click **New project** (top-right)
4. Project name: `inbox-zen` → click **Create**
5. Wait a few seconds, then select the project in the selector

---

## Step 2 — Enable the Gmail API

1. In the left menu, click **APIs & Services** → **Library**
2. Search for `Gmail API`, click it, then click **Enable**

---

## Step 3 — Configure Google Auth Platform

Go to **APIs & Services** → **Google Auth Platform** (or search "Google Auth Platform" in the top search bar).

You will see a menu with: Overview, Branding, Audience, Clients, Data Access, Settings.

### 3a — Branding

1. Click **Branding** in the left menu
2. **App name**: `Inbox Zen`
3. **Support email**: select your email address
4. Scroll down to **Developer contact information** → enter your email address
5. Click **Save**

### 3b — Audience

1. Click **Audience** in the left menu
2. Choose **External** (allows any Google account)
3. Click **Save**
4. Further down, in the **Test users** section, click **+ Add users**
5. Enter your Gmail address → click **Add** → **Save**

### 3c — Data Access

1. Click **Data Access** in the left menu
2. Click **Add or remove scopes**
3. In the panel that opens, type `gmail.readonly` in the search box
4. Check `https://www.googleapis.com/auth/gmail.readonly`
5. Click **Update** then **Save**

---

## Step 4 — Get the Chrome extension ID

1. In Chrome, go to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right)
3. Find the **Inbox Zen** card and copy the **ID** shown below it
   - Example: `abcdefghijklmnopqrstuvwxyzabcdef` (32 characters)

---

## Step 5 — Create the OAuth client

1. Click **Clients** in the left menu
2. Click **Create OAuth client** (or **+ Create credentials** → **OAuth client ID**)
3. **Application type**: choose **Web application**
4. **Name**: `Inbox Zen Extension`
5. Under **Authorized redirect URIs**, click **+ Add URI** and enter:
   ```
   https://YOUR_EXTENSION_ID.chromiumapp.org/
   ```
   Replace `YOUR_EXTENSION_ID` with the ID copied in step 4.
6. Click **Create**
7. Copy the **Client ID** shown in the popup — it looks like:
   ```
   123456789012-abcdefghijklmnopqrstuvwxyzabcd.apps.googleusercontent.com
   ```

---

## Step 6 — Configure the project

Create a `.env` file at the project root:

```
GMAIL_CLIENT_ID=123456789012-abcdefghijklmnopqrstuvwxyzabcd.apps.googleusercontent.com
EXTENSION_KEY=your_optional_extension_key_here
```

> This file is in `.gitignore` — it will never be committed.
> Note: `EXTENSION_KEY` is optional but recommended to keep your Chrome Extension ID stable across machines. You can find it in the `manifest.json` after packing the extension once in Chrome.

---

## Step 7 — Build and reload the extension

```bash
npm run build
```

Then in Chrome:
1. Go to `chrome://extensions`
2. Click **↻ Reload** on the Inbox Zen card
3. Go back to Gmail and refresh the page
4. Click the blue ⚙️ button in the bottom-right → **Connect with Google**
**Connect with Google**
