import {
  SCHEMA_VERSION,
  createEmptyDatabase,
  DEFAULT_SETTINGS,
  DEFAULT_STATS,
  type Database,
  type SavedTab,
  type Settings,
} from "../types.js";
import { createId } from "./id.js";

export class MigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MigrationError";
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function asNumber(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function migrateEntry(raw: unknown): SavedTab | null {
  if (!isRecord(raw)) return null;
  const url = asString(raw.url).trim();
  if (!url) return null;
  const sourceRaw = isRecord(raw.source) ? raw.source : {};
  const tags = Array.isArray(raw.tags)
    ? raw.tags.filter((t): t is string => typeof t === "string")
    : [];
  const source: SavedTab["source"] = {
    windowId: asNumber(sourceRaw.windowId, -1),
    index: asNumber(sourceRaw.index, 0),
    pinned: asBool(sourceRaw.pinned, false),
  };
  if (typeof sourceRaw.muted === "boolean") source.muted = sourceRaw.muted;
  if (typeof sourceRaw.audible === "boolean")
    source.audible = sourceRaw.audible;
  return {
    schemaVersion: SCHEMA_VERSION,
    id: asString(raw.id) || createId("t"),
    url,
    title: asString(raw.title, url),
    favicon: typeof raw.favicon === "string" ? raw.favicon : null,
    savedAt: asNumber(raw.savedAt, Date.now()),
    source,
    group: asString(raw.group, ""),
    tags,
    status: "saved",
  };
}

function migrateSettings(raw: unknown): Settings {
  if (!isRecord(raw)) return { ...DEFAULT_SETTINGS, whitelist: [] };
  const scope = raw.defaultScope;
  const defaultScope =
    scope === "current" || scope === "others" || scope === "window"
      ? scope
      : DEFAULT_SETTINGS.defaultScope;
  const theme =
    raw.theme === "light" || raw.theme === "dark" || raw.theme === "system"
      ? raw.theme
      : "system";
  const whitelist = Array.isArray(raw.whitelist)
    ? raw.whitelist.filter((h): h is string => typeof h === "string")
    : [];
  return {
    removeAfterRestore: asBool(
      raw.removeAfterRestore,
      DEFAULT_SETTINGS.removeAfterRestore,
    ),
    defaultScope,
    theme,
    whitelist,
    onboardingComplete: asBool(raw.onboardingComplete, false),
    restoreBatchSize: Math.max(
      1,
      asNumber(raw.restoreBatchSize, DEFAULT_SETTINGS.restoreBatchSize),
    ),
  };
}

/**
 * Migrate any known stored payload to the current Database schema.
 * Unknown newer major versions refuse to silently wipe — caller should surface corruption/export UI.
 */
export function migrateDatabase(raw: unknown): Database {
  if (raw == null) {
    return createEmptyDatabase();
  }
  if (!isRecord(raw)) {
    throw new MigrationError("Database root is not an object");
  }

  const version = asNumber(raw.schemaVersion, 0);
  if (version > SCHEMA_VERSION) {
    throw new MigrationError(
      `Data was written by a newer Tabfold (schema ${version}). Update the extension before opening it.`,
    );
  }

  // v1 shape: { tabs: [...] } without settings wrapper
  if (version === 1 || (version === 0 && Array.isArray(raw.tabs))) {
    const tabs = Array.isArray(raw.tabs) ? raw.tabs : [];
    const entries = tabs
      .map(migrateEntry)
      .filter((e): e is SavedTab => e !== null);
    return {
      schemaVersion: SCHEMA_VERSION,
      revision: asNumber(raw.revision, 0),
      entries,
      settings: migrateSettings(raw.settings),
      stats: {
        totalSaved: asNumber(
          isRecord(raw.stats) ? raw.stats.totalSaved : 0,
          entries.length,
        ),
        totalRestored: asNumber(
          isRecord(raw.stats) ? raw.stats.totalRestored : 0,
          0,
        ),
      },
      undo: null,
    };
  }

  if (version === 0 && Array.isArray(raw.entries)) {
    // Untagged but already v2-like
  } else if (version !== 0 && version !== SCHEMA_VERSION && version !== 1) {
    // Future handling already covered; unknown old versions try best-effort below
  }

  const entryList = Array.isArray(raw.entries) ? raw.entries : [];
  const entries = entryList
    .map(migrateEntry)
    .filter((e): e is SavedTab => e !== null);

  // Detect total garbage: claimed to have data but nothing parseable and keys look wrong
  if (entryList.length > 0 && entries.length === 0 && !("settings" in raw)) {
    throw new MigrationError("Entries present but none could be parsed");
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    revision: asNumber(raw.revision, 0),
    entries,
    settings: migrateSettings(raw.settings),
    stats: {
      totalSaved: asNumber(
        isRecord(raw.stats) ? raw.stats.totalSaved : DEFAULT_STATS.totalSaved,
        0,
      ),
      totalRestored: asNumber(
        isRecord(raw.stats)
          ? raw.stats.totalRestored
          : DEFAULT_STATS.totalRestored,
        0,
      ),
    },
    undo: null,
  };
}

export function entriesEqualForVerify(a: SavedTab, b: SavedTab): boolean {
  return (
    a.id === b.id &&
    a.url === b.url &&
    a.title === b.title &&
    a.favicon === b.favicon &&
    a.savedAt === b.savedAt
  );
}
