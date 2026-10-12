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

- **`chrome.storage.local`**: Stores your persistent saved tabs database, settings, lifetime statistics, and rolling local backup snapshots. Uninstalling the extension removes this data. You can export or delete data from Settings at any time.
- **`chrome.storage.session`**: Stores transient in-flight restore journals and operation confirmation tokens to coordinate state during tab operations and prevent duplicate openings if the background worker sleeps. This data lives only in memory/session storage and is automatically cleared upon operation completion or browser restart.

Neither storage medium transmits any data over the network; all data remains strictly within your browser profile on your local device.

## Contact

This is an open-source / personal project distributed as-is. For issues, use the project repository’s issue tracker.
