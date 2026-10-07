import {
  SCHEMA_VERSION,
  createEmptyDatabase,
  DEFAULT_SETTINGS,
  DEFAULT_STATS,
  type Database,
  type SavedTab,
  type Settings,
  type UndoState,
} from "../types.js";
import { isAllowedPersistUrl, stableMigratedId } from "./id.js";

export class MigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MigrationError";
  }
}

export class CorruptDatabaseError extends Error {
  readonly raw: unknown;
  constructor(message: string, raw: unknown) {
    super(message);
    this.name = "CorruptDatabaseError";
    this.raw = raw;
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

export interface MigrateResult {
  database: Database;
  /** True when schema/shape changed and must be persisted. */
  didMigrate: boolean;
  /** Non-fatal notes (e.g. dropped undo because expired). */
  warnings: string[];
}

function parseUndo(raw: unknown, now: number): UndoState | null {
  if (!isRecord(raw)) return null;
  if (!Array.isArray(raw.ids) || typeof raw.expiresAt !== "number") return null;
  const ids = raw.ids.filter(
    (x): x is string => typeof x === "string" && x.length > 0,
  );
  if (!ids.length) return null;
  if (raw.expiresAt <= now) return null;
  return { ids, expiresAt: raw.expiresAt };
}

function migrateEntryStrict(
  raw: unknown,
  opts: {
    requireId: boolean;
    allowGenerateStableId: boolean;
    strictCurrent?: boolean;
  },
): { entry: SavedTab } | { invalid: true; reason: string } {
  if (!isRecord(raw)) return { invalid: true, reason: "entry not object" };
  if (raw.schemaVersion !== undefined) {
    if (
      typeof raw.schemaVersion !== "number" ||
      raw.schemaVersion !== SCHEMA_VERSION
    ) {
      return {
        invalid: true,
        reason: `unsupported entry schemaVersion: ${String(raw.schemaVersion)}`,
      };
    }
  } else if (opts.strictCurrent) {
    return { invalid: true, reason: "missing entry schemaVersion" };
  }

  const url = asString(raw.url).trim();
  if (!url || !isAllowedPersistUrl(url)) {
    return { invalid: true, reason: `invalid url: ${url || "(empty)"}` };
  }

  if (opts.strictCurrent) {
    if (typeof raw.title !== "string") {
      return { invalid: true, reason: "title must be a string" };
    }
  } else {
    if (raw.title !== undefined && typeof raw.title !== "string") {
      return { invalid: true, reason: "title must be a string" };
    }
  }
  const title = asString(raw.title, url);

  if (
    typeof raw.savedAt !== "number" ||
    !Number.isFinite(raw.savedAt) ||
    raw.savedAt < 0
  ) {
    return { invalid: true, reason: "missing savedAt" };
  }
  const savedAt = raw.savedAt;

  let id = asString(raw.id).trim();
  if (!id) {
    if (opts.allowGenerateStableId) {
      id = stableMigratedId(url, savedAt, title);
    } else if (opts.requireId) {
      return { invalid: true, reason: "missing id" };
    } else {
      id = stableMigratedId(url, savedAt, title);
    }
  }

  if (opts.strictCurrent) {
    if (raw.favicon !== null && typeof raw.favicon !== "string") {
      return { invalid: true, reason: "favicon must be a string or null" };
    }
    if (raw.status !== "saved") {
      return {
        invalid: true,
        reason: `status must be "saved", got ${String(raw.status)}`,
      };
    }
  } else {
    if (
      raw.favicon !== undefined &&
      raw.favicon !== null &&
      typeof raw.favicon !== "string"
    ) {
      return { invalid: true, reason: "favicon must be a string or null" };
    }
    if (raw.status !== undefined && raw.status !== "saved") {
      return { invalid: true, reason: `invalid status: ${String(raw.status)}` };
    }
  }
  const favicon = typeof raw.favicon === "string" ? raw.favicon : null;

  const sourceRaw = isRecord(raw.source) ? raw.source : null;
  if (!sourceRaw) return { invalid: true, reason: "missing source" };

  if (opts.strictCurrent) {
    if (
      typeof sourceRaw.windowId !== "number" ||
      !Number.isFinite(sourceRaw.windowId)
    ) {
      return { invalid: true, reason: "source.windowId must be a number" };
    }
    if (
      typeof sourceRaw.index !== "number" ||
      !Number.isFinite(sourceRaw.index)
    ) {
      return { invalid: true, reason: "source.index must be a number" };
    }
    if (typeof sourceRaw.pinned !== "boolean") {
      return { invalid: true, reason: "source.pinned must be a boolean" };
    }
  }

  const source: SavedTab["source"] = {
    windowId: asNumber(sourceRaw.windowId, -1),
    index: asNumber(sourceRaw.index, 0),
    pinned: asBool(sourceRaw.pinned, false),
  };
  if (sourceRaw.muted !== undefined) {
    if (typeof sourceRaw.muted !== "boolean") {
      return { invalid: true, reason: "source.muted must be a boolean" };
    }
    source.muted = sourceRaw.muted;
  }
  if (sourceRaw.audible !== undefined) {
    if (typeof sourceRaw.audible !== "boolean") {
      return { invalid: true, reason: "source.audible must be a boolean" };
    }
    source.audible = sourceRaw.audible;
  }

  if (raw.tags !== undefined) {
    if (
      !Array.isArray(raw.tags) ||
      raw.tags.some((t) => typeof t !== "string")
    ) {
      return { invalid: true, reason: "tags must be an array of strings" };
    }
  }
  const tags = Array.isArray(raw.tags) ? raw.tags : [];

  if (raw.group !== undefined && typeof raw.group !== "string") {
    return { invalid: true, reason: "group must be a string" };
  }
  const group = asString(raw.group, "");

  return {
    entry: {
      schemaVersion: SCHEMA_VERSION,
      id,
      url,
      title,
      favicon,
      savedAt,
      source,
      group,
      tags,
      status: "saved",
    },
  };
}

export function migrateSettings(raw: unknown): Settings {
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
    unsavedHintAcknowledged: asBool(raw.unsavedHintAcknowledged, false),
    restoreBatchSize: Math.max(
      1,
      asNumber(raw.restoreBatchSize, DEFAULT_SETTINGS.restoreBatchSize),
    ),
  };
}

function migrateStats(raw: unknown, entryCount: number): Database["stats"] {
  if (!isRecord(raw)) {
    return { ...DEFAULT_STATS, totalSaved: entryCount };
  }
  return {
    totalSaved: asNumber(raw.totalSaved, entryCount),
    totalRestored: asNumber(raw.totalRestored, 0),
    totalClosed: asNumber(raw.totalClosed, asNumber(raw.totalSaved, 0)),
    totalImported: asNumber(raw.totalImported, 0),
  };
}

/**
 * Parse + migrate stored payload.
 * - null → empty (uninitialized), not corruption
 * - newer schema → throw MigrationError (caller keeps raw)
 * - current schema with null/non-array entries or invalid rows → CorruptDatabaseError
 * - v1 → migrate with stable ids, didMigrate=true
 */
export function migrateDatabase(
  raw: unknown,
  nowOrOptions:
    | number
    | {
        now?: number;
        allowDuplicateIds?: boolean;
        strictCurrent?: boolean;
      } = Date.now(),
  options?: { allowDuplicateIds?: boolean; strictCurrent?: boolean },
): MigrateResult {
  const now =
    typeof nowOrOptions === "number"
      ? nowOrOptions
      : (nowOrOptions?.now ?? Date.now());
  const opts =
    typeof nowOrOptions === "object" && nowOrOptions !== null
      ? nowOrOptions
      : (options ?? {});
  if (raw == null) {
    return { database: createEmptyDatabase(), didMigrate: false, warnings: [] };
  }
  if (!isRecord(raw)) {
    throw new CorruptDatabaseError("Database root is not an object", raw);
  }

  if (
    raw.schemaVersion !== undefined &&
    (typeof raw.schemaVersion !== "number" ||
      !Number.isFinite(raw.schemaVersion))
  ) {
    throw new CorruptDatabaseError("schemaVersion must be a number", raw);
  }

  const version = asNumber(raw.schemaVersion, 0);
  if (version > SCHEMA_VERSION) {
    throw new MigrationError(
      `Data was written by a newer Tabfold (schema ${version}). Update the extension before opening it.`,
    );
  }

  const warnings: string[] = [];
  const isV1 =
    version === 1 ||
    (version === 0 && Array.isArray(raw.tabs) && !Array.isArray(raw.entries));

  if (isV1) {
    const tabs = Array.isArray(raw.tabs) ? raw.tabs : [];
    const lenient: SavedTab[] = [];
    for (let i = 0; i < tabs.length; i++) {
      const t = tabs[i];
      if (!isRecord(t))
        throw new CorruptDatabaseError("v1 tab not object", raw);
      const url = asString(t.url).trim();
      if (!isAllowedPersistUrl(url)) {
        throw new CorruptDatabaseError(`v1 invalid url: ${url}`, raw);
      }
      const title = asString(t.title, url);
      const savedAt = asNumber(t.savedAt, 0);
      const id = asString(t.id).trim() || stableMigratedId(url, savedAt, title);
      const sourceRaw = isRecord(t.source) ? t.source : {};
      const source: SavedTab["source"] = {
        windowId: asNumber(sourceRaw.windowId, -1),
        index: asNumber(sourceRaw.index, i),
        pinned: asBool(sourceRaw.pinned, false),
      };
      lenient.push({
        schemaVersion: SCHEMA_VERSION,
        id,
        url,
        title,
        favicon: typeof t.favicon === "string" ? t.favicon : null,
        savedAt,
        source,
        group: asString(t.group, ""),
        tags: Array.isArray(t.tags)
          ? t.tags.filter((x): x is string => typeof x === "string")
          : [],
        status: "saved",
      });
    }
    return {
      database: {
        schemaVersion: SCHEMA_VERSION,
        revision: asNumber(raw.revision, 0),
        entries: lenient,
        settings: migrateSettings(raw.settings),
        stats: migrateStats(raw.stats, lenient.length),
        undo: parseUndo(raw.undo, now),
      },
      didMigrate: true,
      warnings,
    };
  }

  // Current / v2-like schema — strict
  if (!("entries" in raw)) {
    throw new CorruptDatabaseError("Missing entries field", raw);
  }
  if (raw.entries == null) {
    throw new CorruptDatabaseError("entries is null", raw);
  }
  if (!Array.isArray(raw.entries)) {
    throw new CorruptDatabaseError("entries is not an array", raw);
  }

  const entries: SavedTab[] = [];
  const seenIds = new Set<string>();
  for (const item of raw.entries) {
    const r = migrateEntryStrict(item, {
      requireId: version === SCHEMA_VERSION,
      allowGenerateStableId: version < SCHEMA_VERSION,
      strictCurrent: version === SCHEMA_VERSION,
    });
    if ("invalid" in r) {
      throw new CorruptDatabaseError(`Invalid entry: ${r.reason}`, raw);
    }
    if (!opts.allowDuplicateIds && seenIds.has(r.entry.id)) {
      throw new CorruptDatabaseError(`Duplicate entry id: ${r.entry.id}`, raw);
    }
    seenIds.add(r.entry.id);
    entries.push(r.entry);
  }

  const undo = parseUndo(raw.undo, now);
  if (isRecord(raw.undo) && !undo && Array.isArray(raw.undo.ids)) {
    warnings.push("undo expired or invalid — cleared");
  }

  const entryList = raw.entries as unknown[];
  const didMigrate =
    version !== SCHEMA_VERSION ||
    entryList.some(
      (orig) =>
        isRecord(orig) && (!orig.id || orig.schemaVersion !== SCHEMA_VERSION),
    );

  return {
    database: {
      schemaVersion: SCHEMA_VERSION,
      revision: asNumber(raw.revision, 0),
      entries,
      settings: migrateSettings(raw.settings),
      stats: migrateStats(raw.stats, entries.length),
      undo,
    },
    didMigrate,
    warnings,
  };
}

/** Full-field equality for write-then-verify (no silent field drops). */
export function entriesEqualForVerify(a: SavedTab, b: SavedTab): boolean {
  return (
    a.schemaVersion === b.schemaVersion &&
    a.id === b.id &&
    a.url === b.url &&
    a.title === b.title &&
    a.favicon === b.favicon &&
    a.savedAt === b.savedAt &&
    a.group === b.group &&
    a.status === b.status &&
    a.tags.length === b.tags.length &&
    a.tags.every((t, i) => t === b.tags[i]) &&
    a.source.windowId === b.source.windowId &&
    a.source.index === b.source.index &&
    a.source.pinned === b.source.pinned &&
    a.source.muted === b.source.muted &&
    a.source.audible === b.source.audible
  );
}
