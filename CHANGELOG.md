## 0.2.4 (2026-07-07)

### 🚀 Features

- unified watch mode for the extension dev loop ([b28560b](https://github.com/pandaco/inbox-zen/commit/b28560b))
- add FR/EN i18n, dark mode, and split the stats UI ([6bbb263](https://github.com/pandaco/inbox-zen/commit/6bbb263))
- recoverable trash+undo, delta sync, and a Quick Clean tab ([0852c00](https://github.com/pandaco/inbox-zen/commit/0852c00))
- add K/T keyboard shortcuts to the Challenge tab ([959c00f](https://github.com/pandaco/inbox-zen/commit/959c00f))

### 🩹 Fixes

- harden OAuth token handling and upgrade to full Gmail scope ([eb5c6bd](https://github.com/pandaco/inbox-zen/commit/eb5c6bd))

### 🔥 Performance

- replace per-tick stats recompute with incremental accumulator ([88235e4](https://github.com/pandaco/inbox-zen/commit/88235e4))

## 0.2.3 (2026-07-06)

### 🚀 Features

- add GitHub Actions release workflow ([307731b](https://github.com/pandaco/inbox-zen/commit/307731b))

### 🩹 Fixes

- patch npm audit vulnerabilities in build toolchain and angular runtime ([c144b4d](https://github.com/pandaco/inbox-zen/commit/c144b4d))
- upgrade nx to v23 and angular to v22, clearing remaining audit vulns ([37796a0](https://github.com/pandaco/inbox-zen/commit/37796a0))
- correct CI Node version pin and add lint/test steps ([dc6ad64](https://github.com/pandaco/inbox-zen/commit/dc6ad64))
- stop mislabeling the build artifact zip as .crx ([9567d62](https://github.com/pandaco/inbox-zen/commit/9567d62))

## 0.2.2 (2026-04-12)

### 🚀 Features

- **branding:** integrate new logo and update extension description

## 0.2.1 (2026-04-12)

This was a version bump only, there were no code changes.

## 0.2.0 (2026-04-11)

### 🚀 Features

- **challenge:** move challenge tab to far right and display email snippets
- **cleanup:** add expiration filters and batch delete by sender
- **extension:** implement shared types and models
- **extension:** implement background service for gmail api
- **extension:** implement content script for gmail ui injection
- **extension:** implement core services and app ui components
- **extension:** clarify loading text for fetching emails
- **extension:** add repeated subjects analysis
- **extension:** extend background stats cache TTL to 24 hours
- **extension:** add resizable panel with persistence
- **extension:** add dynamic filter management with persistence
- **extension:** display sender name and email in unread list
- **filters:** replace OTP tab with a quick filter
- **gamification:** add redundancy detection and zero-inbox challenge
- **nx:** init nx workspace without @nx/angular plugins
- **parcels:** group parcel notifications by generic subject format
- **parcels:** improve grouping logic for tracking IDs
- **perf:** global data sync and quota optimization
- **temporal:** add OTP and Parcel tracking tabs
- **ui:** add button to open extension in a new tab
- **unsubscribe:** add list-unsubscribe detection and noise score

### 🩹 Fixes

- **auth:** use chrome.identity.getAuthToken for persistent sessions
- **auth:** support users without browser sign-in and improve persistence
- **extension:** resolve CSP violation by disabling inlineCritical CSS
- **gmail:** fix TDZ error in progressive loading
- **search:** support standalone mode for gmail search
- **stats:** correct build error in template and refine gmail api querying
- **ui:** enforce sorting consistency and fix panel closure
- **ui:** show partial results during analysis (streaming fix)
- **ui:** restore clickability and clean up metadata bar
- **ui:** enable clickability on all tabs and ensure default filters migration

### 🔥 Performance

- **api:** restrict global stats to inbox and optimize metadata crawl
- **extension:** implement progressive loading for stats (streaming)
- **gmail:** optimize metadata fetching with backoff and field masking
- **gmail:** make progressive loading more aggressive for better UX
- **gmail:** implement parallel workers to saturate API quota for large inboxes