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

- **`chrome.storage.local`**: Stores your persistent saved tabs database, settings, lifetime statistics, rolling local backup snapshots (up to 5), corrupt-data salvage records, durable recovery states, and operational intents/journals to ensure safe recovery across unexpected Service Worker restarts. Interrupted journals and recovery states are retained locally until explicitly overwritten by subsequent operations, safely consumed, or purged via reset. Uninstalling the extension removes this data. You can export your data or delete all Tabfold data from Settings at any time.
- **`chrome.storage.session`**: Stores temporary session-scoped storage keys with distinct lifecycles:
  - `lastSaveResult` and `lastSaveAt`: Status feedback cache from recent save operations, retained so the popup UI can display save confirmation upon opening; overwritten on subsequent save operations, purged upon browser restart, or cleared immediately upon selecting Delete all Tabfold data.
  - In-flight confirmation tokens (`pendingConfirm`) & coordination journals: active during pending user confirmations or multi-step operations. Unconfirmed tokens expire logically based on timestamp; physical removal occurs upon subsequent operation consumption, explicit cancellation, browser restart, or user reset.
  - Durable operational tokens (e.g. durable undo records coordinated between session and local storage): valid for 12 seconds (`UNDO_TTL_MS = 12000`) to guarantee undo availability across Service Worker idle terminations. When 12 seconds have elapsed, subsequent undo requests are strictly rejected as expired; physical storage records remain until overwritten by subsequent operations, consumed upon successful undo, cleared upon browser restart (session), or cleared via user reset.
- **In-Memory Realm Execution Queue**: Save feedback and session publication are serialized sequentially through an in-memory runtime Promise queue (`withSessionPublication`) to guarantee order of execution. This queue exists strictly within JavaScript memory in the active Service Worker realm; it is not a persistent key stored in `chrome.storage.session`.
- **Data Deletion ("Delete all Tabfold data")**: Executing the reset action completely purges all Tabfold-owned persistent records in `chrome.storage.local`, all transient tokens and status caches in `chrome.storage.session` (after completing in-flight publication serialization), and all in-memory journals, intents, and pending confirmations. Post-reset epoch checks guarantee that obsolete in-flight actions cannot recreate pre-reset confirmation data.

Neither storage medium transmits any data over the network; all data remains strictly within your browser profile on your local device.

## Contact

This is an open-source / personal project distributed as-is. For issues, use the project repository’s issue tracker.
