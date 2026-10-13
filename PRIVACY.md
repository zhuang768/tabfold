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
- **`chrome.storage.session`**: Stores temporary in-memory session keys with distinct lifecycles:
  - `lastSaveResult` and `lastSaveAt`: Status feedback cache from recent save operations, retained so the popup UI can display save confirmation upon opening; overwritten on subsequent save operations, purged upon browser restart, or cleared immediately upon selecting Delete all Tabfold data.
  - In-flight confirmation tokens & coordination locks: active strictly during the execution of pending user confirmations or multi-step operations; cleared immediately upon operation completion or browser restart.
  - Durable operational tokens (e.g. durable undo records coordinated with local storage): retained strictly within their designated TTL (e.g. 10 seconds) to ensure undo availability across Service Worker idle terminations; cleared upon successful undo execution, TTL expiration, or user reset.
- **Data Deletion ("Delete all Tabfold data")**: Executing the reset action completely purges all Tabfold-owned persistent records in `chrome.storage.local`, all transient tokens, status caches, and publication queues in `chrome.storage.session`, and all in-memory journals and pending confirmations.

Neither storage medium transmits any data over the network; all data remains strictly within your browser profile on your local device.

## Contact

This is an open-source / personal project distributed as-is. For issues, use the project repository’s issue tracker.
