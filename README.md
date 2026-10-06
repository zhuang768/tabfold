# Tabfold

Save tabs. Free memory. Open them later.

Tabfold is a **local-only** Chrome Manifest V3 extension. Click the toolbar icon to save the current tab’s URL, title, and favicon, then close the tab. Restore anytime from the popup or full library page.

## Features

- **One-click save** of the current tab (toolbar icon) with write-then-verify-then-close safety
- Popup + full library list with search, delete, clear (confirm), undo
- Restore one / all / by group; optional remove-after-restore
- Save scopes: current tab, other tabs in window, entire window
- JSON export/import + plain `URL | title` text import
- Settings: theme, whitelist, backups, data location explanation
- Keyboard shortcuts, context menus, badge count
- Hibernate tab via `chrome.tabs.discard` (keeps tab, frees memory)
- First-run onboarding (≤3 steps, skippable)
- Demo data button (real local entries, not fake API results)

## Permissions (why each exists)

| Permission         | Why                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------ |
| `storage`          | Persist saved tabs, settings, undo, snapshots                                        |
| `unlimitedStorage` | Headroom for large libraries + rolling backups beyond the default ~10 MB local quota |
| `tabs`             | Read tab URL/title/favicon, close after verified save, restore, discard (hibernate)  |
| `alarms`           | Clear temporary popup binding after icon-click feedback (MV3-safe timers)            |
| `contextMenus`     | Right-click save / hibernate / open library                                          |

No host permissions. No tracking. No remote code.

## Install (Load unpacked)

1. Build (or use a release `dist/`):
   ```bash
   npm install
   npm run icons
   npm run build
   ```
2. Open `chrome://extensions`
3. Enable **Developer mode**
4. **Load unpacked** → select the `dist/` folder in this repo
5. Pin Tabfold. Click the icon on a normal https page to save & close.

## Build

```bash
npm install
npm run icons   # once, or after icon changes
npm run build   # outputs dist/
npm run pack    # creates tabfold-extension.zip at repo root
```

**No environment variables are required.** There is no `.env`.

## Privacy

See [PRIVACY.md](./PRIVACY.md). All data stays in `chrome.storage.local` on your device.

## Test

```bash
npm run typecheck
npm run lint
npm run test          # Vitest unit tests
npm run test:e2e      # Playwright loads the unpacked extension in an isolated profile
```

E2E artifacts: `output/playwright/` (screenshots, traces, isolated user-data dir).

## Known limitations

See [docs/KNOWN_LIMITATIONS.md](./docs/KNOWN_LIMITATIONS.md).

## License

MIT
