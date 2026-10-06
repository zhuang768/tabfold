/** All user-visible product strings (English). Keep additions here. */

export const STRINGS = {
  appName: "Tabfold",
  tagline: "Save tabs. Free memory. Open them later.",

  // Actions
  saveThisTab: "Save this tab",
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
  internalPage: "Browser pages (chrome://, edge://, …) cannot be saved.",
  pinnedSkip: "Pinned tabs stay open by default.",
  audioConfirm: "This tab is playing media. Save and close it anyway?",
  unsavedHint:
    "If this page has unsaved work, save it first. Tabfold cannot read page forms without broad site access.",
  lastTabHandled:
    "Last tab in the window — opened a new tab so the window stays open.",
  whitelistSkip: "This site is on your whitelist.",
  incognitoDenied:
    "Tabfold needs permission to work in Incognito. Enable it in chrome://extensions.",
  restoreOpened: (n: number) => `Opened ${n} tab${n === 1 ? "" : "s"}.`,
  restoreFailedSome: (ok: number, fail: number) =>
    `Opened ${ok}, failed ${fail}.`,
  undoDone: "Restored the tab you just saved.",
  undoExpired: "Undo window expired.",
  emptyTitle: "No saved tabs yet",
  emptyBody: "Click the Tabfold icon to save the current tab and free memory.",
  loading: "Loading…",
  errorGeneric: "Something went wrong.",
  corruptedTitle: "Saved data looks damaged",
  corruptedBody:
    "Your tabs were not deleted. Export a raw backup, then restore from a snapshot if you have one.",
  exportRaw: "Export raw backup",
  restoreBackup: "Restore backup",
  batchRestorePrompt: (n: number) =>
    `You are about to open ${n} tabs at once. Opening in batches uses less memory.`,
  estimatedMemory: (mb: number) => `Est. ~${mb} MB freed (estimate only)`,
  estimateDisclaimer:
    "Memory figures are estimates (~50 MB per saved tab). Real savings vary by site. Not measured live.",
  whereDataStored:
    "All data stays in this browser on your device via chrome.storage.local. Nothing is sent to a server.",
  clearAllData: "Delete all Tabfold data",
  confirmReset: "Delete every saved tab, setting, and backup on this device?",
  demoLoaded: "Demo data loaded. It is real local data — clear it anytime.",
  groupLabel: "Group",
  tagsLabel: "Tags",
  statsSaved: "Tabs saved (lifetime)",
  statsRestored: "Tabs restored (lifetime)",
  badgeOverflow: "999+",

  // Onboarding
  onboarding1Title: "One click frees memory",
  onboarding1Body:
    "Click the Tabfold icon to save the current tab’s address, title, and icon, then close it.",
  onboarding2Title: "Find it when you need it",
  onboarding2Body:
    "Open the list from the popup or full page. Search, restore one, or restore all.",
  onboarding3Title: "Your data stays here",
  onboarding3Body:
    "Everything is stored locally. Export anytime. No accounts, no tracking.",

  // Settings
  settingsTitle: "Settings",
  removeAfterRestore: "Remove from list after restore",
  defaultScope: "Default save scope",
  theme: "Theme",
  themeSystem: "System",
  themeLight: "Light",
  themeDark: "Dark",
  whitelist: "Whitelist (never save these hosts)",
  whitelistHint: "One hostname per line, e.g. mail.google.com",
  backups: "Local snapshots",
  noBackups: "No snapshots yet. Large changes create them automatically.",
  scopeCurrent: "Current tab",
  scopeOthers: "Other tabs in window",
  scopeWindow: "All tabs in window",

  // A11y
  closeDialog: "Close dialog",
  faviconAlt: "Site icon",
} as const;

export type StringKey = keyof typeof STRINGS;
