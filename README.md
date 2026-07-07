# 🧘 Inbox Zen: Regain Serenity in Your Gmail Inbox

**Inbox Zen** is an intelligent browser extension designed to transform your email management. Stop being overwhelmed by the noise: identify, sort, and clean up your inbox in just a few clicks.

---

## 🚀 Why Inbox Zen?

Gmail is a great tool, but it quickly accumulates thousands of useless messages that clutter your mental and digital space. Inbox Zen intelligently analyzes your Inbox to highlight what deserves to be deleted or archived.

### ✨ Key Features

#### 📧 Intelligent Sender Analysis
- **Noise Score**: Immediately identify the "noisiest" senders based on the frequency and recency of their emails.
- **1-Click Unsubscribe**: Automatic detection of `List-Unsubscribe` links to unsubscribe without even opening the email.

#### 🧹 Cleaning Up Ephemeral Emails
- **OTP Shortcuts**: Identify verification codes and temporary passwords that have already expired (> 24h).
- **Parcel Tracking**: Group all your delivery notifications. The extension is smart enough to group similar messages even if tracking numbers differ.
- **Past Invites**: Find old calendar invitations (`.ics`) that are no longer useful.

#### 🕰 Expiration Filters
- **Old Messages**: Target emails over a year old that are sitting in your inbox without any labels.
- **Redundant Threads**: Detect long-winded conversations that clutter your view.

#### ⚡ "Inbox Zero Challenge" Mode
A fast and fun sorting mode! Process your oldest messages one by one with an instant decision interface: **Keep** or **Discard**. This is the most effective method to clear a saturated inbox.

#### 🔍 Quick & Customizable Filters
Direct access to powerful searches: "Newsletters", "Unsubscribe links", and many others for surgical cleaning.

---

## 🛠 Performance & Privacy

- **Performance**: Single Inbox crawl to save Gmail API quota.
- **Customizable Interface**: Resize the pop-in according to your needs (width and height). Your preferences are automatically remembered.
- **Comfort View**: A dedicated button allows you to switch from "Pop-in" mode (within Gmail) to a full-screen tab for more spacious sorting.
- **Privacy First**: Your data stays with you. The extension communicates directly with the Gmail API without an intermediary server.

---

## 💻 Installation (Developers)

1. **Clone the repository**: `git clone https://github.com/your-account/inbox-zen.git`
2. **Install dependencies**: `npm install`
3. **Build the project**: `npm run build`
4. **Load in Chrome**:
   - Go to `chrome://extensions/`
   - Enable **Developer Mode**
   - Click on **Load unpacked**
   - Select the `apps/extension/dist` folder

---

## 📜 Useful Commands

- `npm run build`: Compile the full extension into `apps/extension/dist`.
- `npm run lint`: Check code quality.
- `npm run test`: Run unit tests.

### Development loop

> ⚠️ `ng serve` is **not** usable for extension development: the app relies on
> `chrome.runtime` / `chrome.storage` / `chrome.identity`, which don't exist at
> `localhost:4200`.

1. Create a `.env` at the repo root with your `GMAIL_CLIENT_ID` (see [SETUP.md](SETUP.md)).
2. From `apps/extension`, run `npm run watch` — rebuilds the Angular UI **and** the
   background/content-script bundles (with source maps) on every change.
3. Load `apps/extension/dist` via **Load unpacked** at `chrome://extensions` (once).
4. After each change: click **↻ Reload** on the extension card, then refresh Gmail.

---

*Transform your digital chaos into a haven of peace with Inbox Zen.* 🕊️
