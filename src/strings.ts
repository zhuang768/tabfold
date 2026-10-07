/** All user-visible product strings (English). Keep additions here. */

export const STRINGS = {
  appName: "Tabfold",
  tagline: "Save tabs. Free memory. Open them later.",
  shortDescription:
    "Save tabs, free memory, restore when you need them. Local-only.",

  // Actions
  saveThisTab: "Save this tab",
  saveSelectedTab: "Save selected tab",
  saveOthers: "Save other tabs in window",
  saveWindow: "Save all tabs in window",
  restore: "Restore",
  restoreAll: "Restore all",
  restoreGroup: "Restore group",
  undo: "Undo",
  delete: "Delete",
  clearAll: "Clear all",
  confirmClear: "Clear all saved tabs? This cannot be undone.",
  confirmClearYes: "Yes, clear all",
  cancel: "Cancel",
  exportJson: "Export JSON",
  importJson: "Import JSON",
  importText: "Import URL | title text",
  loadDemo: "Load demo data",
  openFullList: "Open full list",
  openSettings: "Settings",
  discardTab: "Hibernate tab",
  skip: "Skip",
  next: "Next",
  getStarted: "Get started",
  searchPlaceholder: "Search title or URL",
  save: "Save",
  restoreBatch: "Open in batches",
  restoreAllAtOnce: "Open all at once",
  edit: "Edit",
  ok: "OK",
  hibernatedSuffix: " (hibernated)",
  noInactiveTabs: "No inactive background tabs available to hibernate.",
  activeCannotHibernate:
    "The active tab cannot be hibernated. Pick another tab in the full list.",
  backupReasonBeforeRestore: "before-restore-backup",
  backupReasonBeforeReset: "before-reset",
  backupReasonBeforeImport: "before-import",
  backupReasonBeforeClear: "before-clear",
  pickTarget: "Choose a tab to save or hibernate",
  refreshTargets: "Refresh tab list",

  // Feedback
  savedOne: "Saved 1 tab.",
  savedN: (n: number) => `Saved ${n} tabs.`,
  savedPartial: (ok: number, total: number) =>
    `Saved ${ok} of ${total} tabs. ${total - ok} could not be saved.`,
  nothingSaved: "Nothing was saved.",
  duplicateUrl: "Already saved — this URL is in your list.",
  writeFailed: "Could not save. The tab was left open.",
  verifyFailed: "Save could not be verified. The tab was left open.",
  urlChanged: "The tab changed while saving. It was left open.",
  closeFailed: "Could not close the tab after saving.",
  internalPage: "Browser pages (chrome://, edge://, …) cannot be saved.",
  pinnedSkip: "Pinned tabs stay open by default.",
  audioConfirm: "This tab is playing media. Save and close it anyway?",
  unsavedHintBefore:
    "Tabfold saves the address, not form fields. Save any important work on the page first, then confirm.",
  unsavedHintRemember: "Got it — continue saving",
  targetChanged: "The tab changed since you confirmed. Nothing was closed.",
  confirmExpired: "Confirmation expired. Try again.",
  pickWebTab: "Pick a normal web page tab first (not Tabfold itself).",
  lastTabHandled:
    "Last tab in the window — opened a new tab so the window stays open.",
  whitelistSkip: "This site is on your whitelist.",
  incognitoDenied:
    "Tabfold needs permission to work in Incognito. Enable it in chrome://extensions.",
  restoreOpened: (n: number) => `Opened ${n} tab${n === 1 ? "" : "s"}.`,
  restoreFailedSome: (ok: number, fail: number) =>
    `Opened ${ok}, failed ${fail}.`,
  restorePersistFailed:
    "Tabs opened, but updating the saved list failed. Check for duplicates before restoring again.",
  noMatchingTabs: "No matching tabs.",
  undoDone: "Restored the tab you just saved.",
  undoExpired: "Undo window expired.",
  undoPartialFail: "Could not reopen the saved tab(s).",
  undoPartial: (ok: number, fail: number) =>
    `Undid ${ok}; ${fail} still need attention.`,
  emptyTitle: "No saved tabs yet",
  emptyBody: "Click the Tabfold icon to save the current tab and free memory.",
  loading: "Loading…",
  errorGeneric: "Something went wrong.",
  messagingFailed: "Could not reach Tabfold background. Try again.",
  settingsSaved: "Saved.",
  settingsSaveFailed: "Could not save settings.",
  cleared: "Cleared.",
  clearFailed: "Could not clear saved tabs.",
  hibernateOk: "Tab hibernated.",
  hibernateFailed: "Could not hibernate this tab.",
  corruptedTitle: "Saved data looks damaged",
  corruptedBody:
    "Your tabs were not deleted. Export a raw backup, then restore from a snapshot if you have one.",
  exportRaw: "Export raw backup",
  restoreBackup: "Restore backup",
  batchRestorePrompt: (n: number) =>
    `You are about to open ${n} tabs. Choose how to continue.`,
  batchRestoreTitle: "Open many tabs?",
  estimatedMemoryClosed: (mb: number) =>
    `Est. ~${mb} MB from closed tabs (estimate only)`,
  estimatedNotClosed:
    "Import/demo entries are not counted as freed memory — nothing was closed.",
  estimateDisclaimer:
    "Memory figures are estimates (~50 MB per closed tab). Real savings vary by site. Not measured live.",
  whereDataStored:
    "All data stays in this browser on your device via chrome.storage.local. Nothing is sent to a server. Favicons use Chrome’s local cache API — Tabfold does not fetch icons from the open web.",
  clearAllData: "Delete all Tabfold data",
  confirmReset: "Delete every saved tab, setting, and backup on this device?",
  demoLoaded: "Demo data loaded. It is real local data — clear it anytime.",
  groupLabel: "Group",
  tagsLabel: "Tags",
  tagsHint: "Tags (comma separated)",
  statsSaved: "Tabs saved & closed (lifetime)",
  statsRestored: "Tabs restored (lifetime)",
  statsImported: "Imported / demo entries (lifetime)",
  statsOpen: "Currently saved",
  badgeOverflow: "999+",
  allGroups: "All groups",
  editDialogTitle: "Edit group & tags",
  shortcutsTitle: "Shortcuts",
  shortcutsBody:
    "Customize in chrome://extensions/shortcuts — Save current tab, Open library.",
  versionLine: "Tabfold v1.0.0 · local-only · no tracking",
  backupsTitle: "Local snapshots",
  noBackups: "No snapshots yet. Large changes create them automatically.",
  footerCount: (shown: number, total: number, est: string) =>
    `${shown}/${total} · ${est}`,

  // Onboarding
  onboarding1Title: "One click frees memory",
  onboarding1Body:
    "Click the Tabfold icon to save the current tab’s address, title, and icon, then close it. Forms are not saved — store important work first.",
  onboarding2Title: "Find it when you need it",
  onboarding2Body:
    "Open the list from the popup or full page. Search, restore one, or restore all.",
  onboarding3Title: "Your data stays here",
  onboarding3Body:
    "Everything is stored locally. Export anytime. No accounts, no tracking.",

  // Settings
  settingsTitle: "Settings",
  removeAfterRestore: "Remove from list after restore",
  defaultScope: "Default save scope for popup:",
  theme: "Theme",
  themeSystem: "System",
  themeLight: "Light",
  themeDark: "Dark",
  whitelist: "Whitelist (never save these hosts)",
  whitelistHint: "One hostname per line, e.g. mail.google.com",
  backups: "Local snapshots",
  scopeCurrent: "Current tab",
  scopeOthers: "Other tabs in window",
  scopeWindow: "All tabs in window",
  saveSettings: "Save settings",
  whereDataTitle: "Where is my data stored?",
  backupReasonLabels: {
    manual: "Manual snapshot",
    "before-import": "Automatic snapshot before import",
    "before-import-text": "Automatic snapshot before text import",
    "before-clear": "Automatic snapshot before clearing tabs",
    "before-restore": "Automatic snapshot before restore",
    "before-restore-backup": "Automatic snapshot before restoring snapshot",
    "before-migration": "Automatic snapshot before migration",
    "before-reset": "Automatic snapshot before reset",
    "before-demo": "Automatic snapshot before loading demo",
  } as Record<string, string>,
  backupReasonLabel: (reason: string): string =>
    STRINGS.backupReasonLabels[reason] ?? reason,
  backupTabsCount: (n: number): string => (n === 1 ? "1 tab" : `${n} tabs`),
  confirmRestoreSnapshot: (timeStr: string): string =>
    `Restore snapshot from ${timeStr}?`,

  // System & errors
  tabGone: "Tab is no longer available.",
  noActiveTab: "No active tab found.",
  missingTabId: "Missing tabId.",
  tabNotFound: "Tab not found.",
  cannotHibernateActive: "Cannot hibernate active tab.",
  cannotHibernateMedia: "Cannot hibernate media tabs.",
  invalidSettingsPatch: "Invalid settings patch.",
  invalidBatchSize: "restoreBatchSize must be a number between 1 and 500.",
  searchLabel: "Search saved tabs",

  // Menus / a11y
  menuSaveTab: "Save tab with Tabfold",
  menuSaveOthers: "Save other tabs in window",
  menuHibernate: "Hibernate tab (keep open, free memory)",
  menuOpenLibrary: "Open Tabfold library",
  commandSaveDesc: "Save current tab",
  commandLibraryDesc: "Open Tabfold library",
  closeDialog: "Close dialog",
  faviconAlt: "Site icon",
  statusRegion: "Status messages",
  confirmDialogLabel: "Confirmation",
  editDialogLabel: "Edit saved tab",
  actionDefaultTitle: "Save current tab with Tabfold",
} as const;

export type StringKey = keyof typeof STRINGS;
