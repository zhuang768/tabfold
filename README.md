# Tabfold

Save tabs. Free memory. Open them later.

Tabfold is a **local-only** Chrome Manifest V3 extension. Click the toolbar icon to save the current tab’s URL, title, and favicon, then close the tab. Restore anytime from the popup or full library page.

**Requirements:** Node.js **≥ 20**, npm, and a system that can run Playwright’s bundled Chromium (macOS / Linux / Windows). Packaging uses Node `fs` + the system `zip` CLI when available (falls back to a pure-JS zip writer). **Minimum Chrome: 127** (for `chrome.action.openPopup`).

## Features

- **One-click save** of the current tab (toolbar icon) with write-then-verify-then-close safety
- Popup + full library list with search, delete, clear (confirm), undo
- Restore one / all / by group; optional remove-after-restore; batch restore cancel is safe
- Save scopes: current tab, other tabs in window, entire window
- JSON export/import + plain `URL | title` text import
- Settings: theme, whitelist, backups, corrupt-data recovery, data location explanation
- Keyboard shortcuts, context menus, badge count
- Hibernate tab via `chrome.tabs.discard` (keeps tab, frees memory)
- First-run onboarding (≤3 steps, skippable) + unsaved-content ack before first close
- Demo data button (real local entries, not fake API results)
- Local favicons via Chrome’s `/_favicon/` API (no outbound image requests)

## Permissions (why each exists)

| Permission         | Why                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------- |
| `storage`          | Persist saved tabs, settings, undo, snapshots                                         |
| `unlimitedStorage` | Headroom for large libraries + rolling backups beyond the default ~10 MB local quota  |
| `tabs`             | Read tab URL/title, close after verified save, restore, discard (hibernate)           |
| `favicon`          | Serve cached favicons from `chrome://favicon` / `/_favicon/` without host permissions |
| `contextMenus`     | Right-click save / hibernate / open library                                           |

No host permissions. No tracking. No remote code. No `alarms` permission (popup binding is cleared immediately after `openPopup`, not via delayed alarms).

## Install (Load unpacked)

1. From a clean checkout:
   ```bash
   npm ci
   npm run icons
   npm run build
   ```
2. Open `chrome://extensions`
3. Enable **Developer mode**
4. **Load unpacked** → select the `dist/` folder in this repo
5. Pin Tabfold. Click the icon on a normal https page to save & close.

## Build & pack

```bash
npm ci
npm run icons   # once, or after icon changes
npm run build   # outputs dist/
npm run pack    # creates tabfold-extension.zip at repo root (contents match dist/)
```

**No environment variables are required.** There is no `.env`.

## Verify (full gate)

```bash
npm ci
npm run format:check
npm run typecheck
npm run lint
npm run test
npm run build
npm run test:e2e
npm run test:perf
npm run pack
npm audit
```

- Unit tests: Vitest
- E2E: Playwright loads the **unpacked** extension in an isolated profile under `/tmp` (no spaces). First run installs Playwright browsers via `npx playwright install chromium` if needed.
- Perf: writes raw samples to `output/supervision/round-1/perf-samples.json`

E2E artifacts: `output/playwright/` (screenshots, traces).

## Privacy

See [PRIVACY.md](./PRIVACY.md). All data stays in `chrome.storage.local` on your device.

## Known limitations

See [docs/KNOWN_LIMITATIONS.md](./docs/KNOWN_LIMITATIONS.md).

## License

MIT
