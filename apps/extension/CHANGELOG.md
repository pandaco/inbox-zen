## 0.2.2 (2026-04-12)

### 🚀 Features

- **branding:** integrate new logo and update extension description

## 0.2.1 (2026-04-12)

This was a version bump only for extension to align it with other projects, there were no code changes.

## 0.2.0 (2026-04-11)

### 🚀 Features

- **filters:** replace OTP tab with a quick filter
- **challenge:** move challenge tab to far right and display email snippets
- **extension:** display sender name and email in unread list
- **extension:** add dynamic filter management with persistence
- **extension:** add resizable panel with persistence
- **extension:** extend background stats cache TTL to 24 hours
- **parcels:** improve grouping logic for tracking IDs
- **parcels:** group parcel notifications by generic subject format
- **perf:** global data sync and quota optimization
- **gamification:** add redundancy detection and zero-inbox challenge
- **cleanup:** add expiration filters and batch delete by sender
- **temporal:** add OTP and Parcel tracking tabs
- **unsubscribe:** add list-unsubscribe detection and noise score
- **extension:** add repeated subjects analysis
- **extension:** clarify loading text for fetching emails
- **extension:** implement core services and app ui components
- **extension:** implement content script for gmail ui injection
- **extension:** implement background service for gmail api
- **extension:** implement shared types and models
- **nx:** init nx workspace without @nx/angular plugins

### 🩹 Fixes

- **ui:** enable clickability on all tabs and ensure default filters migration
- **ui:** restore clickability and clean up metadata bar
- **auth:** support users without browser sign-in and improve persistence
- **ui:** show partial results during analysis (streaming fix)
- **auth:** use chrome.identity.getAuthToken for persistent sessions
- **gmail:** fix TDZ error in progressive loading
- **ui:** enforce sorting consistency and fix panel closure
- **search:** support standalone mode for gmail search
- **stats:** correct build error in template and refine gmail api querying
- **extension:** resolve CSP violation by disabling inlineCritical CSS

### 🔥 Performance

- **gmail:** implement parallel workers to saturate API quota for large inboxes
- **gmail:** make progressive loading more aggressive for better UX
- **extension:** implement progressive loading for stats (streaming)
- **gmail:** optimize metadata fetching with backoff and field masking
- **api:** restrict global stats to inbox and optimize metadata crawl

## 0.1.0 (2026-04-11)

### 🚀 Features

- **filters:** replace OTP tab with a quick filter
- **challenge:** move challenge tab to far right and display email snippets
- **extension:** display sender name and email in unread list
- **extension:** add dynamic filter management with persistence
- **extension:** add resizable panel with persistence
- **extension:** extend background stats cache TTL to 24 hours
- **parcels:** improve grouping logic for tracking IDs
- **parcels:** group parcel notifications by generic subject format
- **perf:** global data sync and quota optimization
- **gamification:** add redundancy detection and zero-inbox challenge
- **cleanup:** add expiration filters and batch delete by sender
- **temporal:** add OTP and Parcel tracking tabs
- **unsubscribe:** add list-unsubscribe detection and noise score
- **extension:** add repeated subjects analysis
- **extension:** clarify loading text for fetching emails
- **extension:** implement core services and app ui components
- **extension:** implement content script for gmail ui injection
- **extension:** implement background service for gmail api
- **extension:** implement shared types and models
- **nx:** init nx workspace without @nx/angular plugins

### 🩹 Fixes

- **ui:** enable clickability on all tabs and ensure default filters migration
- **ui:** restore clickability and clean up metadata bar
- **auth:** support users without browser sign-in and improve persistence
- **ui:** show partial results during analysis (streaming fix)
- **auth:** use chrome.identity.getAuthToken for persistent sessions
- **gmail:** fix TDZ error in progressive loading
- **ui:** enforce sorting consistency and fix panel closure
- **search:** support standalone mode for gmail search
- **stats:** correct build error in template and refine gmail api querying
- **extension:** resolve CSP violation by disabling inlineCritical CSS

### 🔥 Performance

- **gmail:** implement parallel workers to saturate API quota for large inboxes
- **gmail:** make progressive loading more aggressive for better UX
- **extension:** implement progressive loading for stats (streaming)
- **gmail:** optimize metadata fetching with backoff and field masking
- **api:** restrict global stats to inbox and optimize metadata crawl