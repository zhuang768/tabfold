/** Shared domain types for Tabfold. Schema version is bumped when persisted shape changes. */

export const SCHEMA_VERSION = 2 as const;

export type SaveScope = "current" | "others" | "window";
export type Theme = "system" | "light" | "dark";
export type EntryStatus = "saved";

export interface TabSource {
  windowId: number;
  index: number;
  pinned: boolean;
  muted?: boolean;
  audible?: boolean;
}

export interface SavedTab {
  schemaVersion: typeof SCHEMA_VERSION;
  id: string;
  url: string;
  title: string;
  /** Favicon URL from Chrome tab API only — never a third-party favicon service. */
  favicon: string | null;
  savedAt: number;
  source: TabSource;
  group: string;
  tags: string[];
  status: EntryStatus;
}

export interface Settings {
  removeAfterRestore: boolean;
  defaultScope: SaveScope;
  theme: Theme;
  whitelist: string[];
  onboardingComplete: boolean;
  /** Preferred restore batch size when user opts into batching. */
  restoreBatchSize: number;
}

export interface Stats {
  totalSaved: number;
  totalRestored: number;
}

export interface UndoState {
  ids: string[];
  expiresAt: number;
}

export interface Database {
  schemaVersion: typeof SCHEMA_VERSION;
  revision: number;
  entries: SavedTab[];
  settings: Settings;
  stats: Stats;
  undo: UndoState | null;
}

export interface Snapshot {
  id: string;
  createdAt: number;
  reason: string;
  database: Database;
}

export interface BackupMeta {
  id: string;
  createdAt: number;
  reason: string;
  entryCount: number;
}

export interface LibraryState {
  database: Database;
  backups: BackupMeta[];
}

export interface SkippedTab {
  title: string;
  url: string;
  reason: string;
}

export interface FailedTab {
  title: string;
  url: string;
  reason: string;
}

export interface SaveResult {
  saved: number;
  skipped: SkippedTab[];
  failed: FailedTab[];
  /** Tabs that need user confirmation (e.g. audible) before save. */
  needsConfirmation: Array<{
    tabId: number;
    title: string;
    url: string;
    reason: string;
  }>;
  undoIds: string[];
  message: string;
}

export interface RestoreResult {
  opened: number;
  failed: number;
  removed: number;
  message: string;
}

export interface ImportSummary {
  added: number;
  skippedDuplicates: number;
  skippedInvalid: number;
  migrated: number;
  message: string;
}

export interface ExportPayload {
  format: "tabfold-json";
  schemaVersion: typeof SCHEMA_VERSION;
  exportedAt: number;
  entries: SavedTab[];
  settings?: Partial<Settings>;
}

export type Request =
  | { type: "get-state" }
  | {
      type: "save";
      scope?: SaveScope;
      tabId?: number;
      confirmedAudio?: boolean;
      confirmedUnsaved?: boolean;
    }
  | { type: "restore"; ids: string[]; batch?: boolean }
  | { type: "restore-group"; group: string; batch?: boolean }
  | { type: "undo" }
  | { type: "delete"; ids: string[] }
  | { type: "clear" }
  | { type: "reset-all" }
  | { type: "patch-settings"; patch: Partial<Settings> }
  | { type: "edit-entry"; id: string; group: string; tags: string[] }
  | { type: "import-json"; text: string }
  | { type: "import-text"; text: string }
  | { type: "export-json" }
  | { type: "export-raw" }
  | { type: "list-backups" }
  | { type: "restore-backup"; id: string }
  | { type: "load-demo" }
  | { type: "discard-tab"; tabId?: number }
  | { type: "open-library" }
  | { type: "complete-onboarding" };

export type Response<T = unknown> =
  { ok: true; data: T } | { ok: false; error: string; detail?: string };

export interface CorruptionReport {
  corrupt: true;
  message: string;
  rawExportAvailable: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  removeAfterRestore: true,
  defaultScope: "current",
  theme: "system",
  whitelist: [],
  onboardingComplete: false,
  restoreBatchSize: 10,
};

export const DEFAULT_STATS: Stats = {
  totalSaved: 0,
  totalRestored: 0,
};

export function createEmptyDatabase(): Database {
  return {
    schemaVersion: SCHEMA_VERSION,
    revision: 0,
    entries: [],
    settings: { ...DEFAULT_SETTINGS, whitelist: [] },
    stats: { ...DEFAULT_STATS },
    undo: null,
  };
}

export const MAX_BACKUPS = 5;
export const UNDO_TTL_MS = 12_000;
export const BATCH_RESTORE_THRESHOLD = 15;
export const ESTIMATED_MB_PER_TAB = 50;
