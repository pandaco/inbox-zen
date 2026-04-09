# Inbox Zen

Inbox Zen is an intelligent browser extension that integrates directly into the Gmail interface to help you manage your inbox proactively.

## Key Features

- **Sender Analysis:** Quickly identify who is filling your inbox with unread emails.
- **Space Cleaning:** Locate the heaviest emails to free up Google storage space.
- **Seamless Integration:** A discrete floating button and side panel injected directly into Gmail.
- **Quick Actions:** Launch pre-configured Gmail searches with one click from the assistant.
- **Performance:** Uses local caching and request batching for a smooth experience.
- **Maximized View:** Open the assistant in a dedicated new tab for a more comfortable and spacious experience.

## Project Structure

The project is organized within an Nx workspace:

- `apps/extension/`: Source code for the Angular application and extension scripts.
- `apps/extension/src/background/`: Background logic (OAuth2, Gmail API).
- `apps/extension/src/content-script/`: UI injection script for the Gmail interface.
- `apps/extension/src/app/`: Angular application for the side panel.

## Getting Started

1.  Clone the repository.
2.  Install dependencies: `npm install`.
3.  Follow the [Setup Guide](./SETUP.md) to configure your Google Cloud project.
4.  Create a `.env` file at the root with your `GMAIL_CLIENT_ID`.
5.  Build the extension: `npm run build`.
6.  Load the `dist/` folder in Chrome (Developer Mode > Load unpacked).

## Useful Commands

- `npm run start`: Launch the Angular development server.
- `npm run build`: Compile the complete extension.
- `npm run lint`: Run code quality checks.
- `npm run test`: Execute unit tests.
