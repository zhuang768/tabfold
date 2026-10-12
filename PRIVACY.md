# Privacy Policy — Tabfold

**Last updated:** 2026-10-12

Tabfold is a browser extension that stores tab information **only on your device**.

## What we store

- URLs, titles, and favicon URLs of tabs you choose to save
- Optional groups, tags, and settings you configure
- Local backup snapshots created before large or destructive changes

## What we do not do

- We do **not** operate a server for Tabfold
- We do **not** collect analytics, accounts, or advertising identifiers
- We do **not** sell or share your data
- We do **not** load remote scripts
- We do **not** use third-party favicon services

## Where data lives

Data is stored locally on your device using Chrome extension APIs:

- **`chrome.storage.local`**: Stores your persistent saved tabs database, settings, lifetime statistics, rolling local backup snapshots, corrupt-data salvage records, durable recovery states, and durable operational intents/journals to ensure tab recovery across unexpected Service Worker restarts. Uninstalling the extension removes this data. You can export your data or delete all Tabfold data from Settings at any time.
- **`chrome.storage.session`**: Stores temporary in-flight confirmation tokens, last save result status cache, and active session journals to coordinate multi-step tab operations and prevent duplicate openings when the background Service Worker sleeps. This data resides only in memory/session storage and is automatically cleared upon operation completion or browser restart.
- **Data Deletion ("Delete all Tabfold data")**: Executing the reset action completely purges all Tabfold-owned persistent records in `chrome.storage.local`, all transient tokens and caches in `chrome.storage.session`, and all in-memory journals and pending confirmations.

Neither storage medium transmits any data over the network; all data remains strictly within your browser profile on your local device.

## Contact

This is an open-source / personal project distributed as-is. For issues, use the project repository’s issue tracker.
