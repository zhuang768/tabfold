import {
  SCHEMA_VERSION,
  type Database,
  type ExportPayload,
  type ImportSummary,
  type SavedTab,
} from "../types.js";
import { createId, urlsEqual, isAllowedPersistUrl } from "./id.js";
import {
  migrateDatabase,
  MigrationError,
  CorruptDatabaseError,
} from "./migrate.js";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function buildExportPayload(db: Database): ExportPayload {
  return {
    format: "tabfold-json",
    schemaVersion: SCHEMA_VERSION,
    exportedAt: Date.now(),
    entries: db.entries,
    settings: {
      removeAfterRestore: db.settings.removeAfterRestore,
      defaultScope: db.settings.defaultScope,
      theme: db.settings.theme,
      whitelist: [...db.settings.whitelist],
      unsavedHintAcknowledged: db.settings.unsavedHintAcknowledged,
    },
  };
}

export function exportJsonString(db: Database): string {
  return `${JSON.stringify(buildExportPayload(db), null, 2)}\n`;
}

function rejectImport(
  existing: SavedTab[],
  message: string,
): {
  entries: SavedTab[];
  summary: ImportSummary;
} {
  return {
    entries: existing,
    summary: {
      added: 0,
      skippedDuplicates: 0,
      skippedInvalid: 1,
      migrated: 0,
      message,
    },
  };
}

/**
 * Import Tabfold JSON / raw DB / v1 tabs.
 * Empty target: preserve ids and all fields for round-trip.
 * Non-empty: skip duplicates by conservative URL equality; keep existing ids.
 */
export function importJsonText(
  text: string,
  existing: SavedTab[],
): { entries: SavedTab[]; summary: ImportSummary } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return rejectImport(existing, "Invalid JSON — nothing imported.");
  }

  let incoming: SavedTab[] = [];
  let migrated = 0;
  const intoEmpty = existing.length === 0;

  try {
    if (
      isRecord(parsed) &&
      parsed.format === "tabfold-json" &&
      Array.isArray(parsed.entries)
    ) {
      const schemaVersion =
        typeof parsed.schemaVersion === "number"
          ? parsed.schemaVersion
          : SCHEMA_VERSION;
      // Prefer entries path even when schemaVersion is 1
      const shaped =
        schemaVersion === 1 && !Array.isArray(parsed.tabs)
          ? {
              ...parsed,
              schemaVersion: 1,
              tabs: parsed.entries,
              entries: undefined,
            }
          : {
              schemaVersion,
              entries: parsed.entries,
              revision: 0,
              settings: parsed.settings,
              stats: { totalSaved: 0, totalRestored: 0 },
              undo: null,
            };
      // For format tabfold-json with entries + schema 1, migrate via v2-like with allowGenerateStableId
      if (schemaVersion === 1 && Array.isArray(parsed.entries)) {
        const asV1 = {
          schemaVersion: 1,
          tabs: parsed.entries,
          settings: parsed.settings,
          revision: 0,
        };
        const db = migrateDatabase(asV1).database;
        incoming = db.entries;
        migrated = incoming.length;
      } else {
        const db = migrateDatabase(shaped).database;
        incoming = db.entries;
        if (schemaVersion < SCHEMA_VERSION) migrated = incoming.length;
      }
      void shaped;
    } else if (
      isRecord(parsed) &&
      Array.isArray(parsed.tabs) &&
      !Array.isArray(parsed.entries)
    ) {
      const db = migrateDatabase(parsed).database;
      incoming = db.entries;
      migrated = incoming.length;
    } else if (isRecord(parsed) && Array.isArray(parsed.entries)) {
      const db = migrateDatabase(parsed).database;
      incoming = db.entries;
      if (asNumber(parsed.schemaVersion, SCHEMA_VERSION) < SCHEMA_VERSION) {
        migrated = incoming.length;
      }
    } else if (Array.isArray(parsed)) {
      const db = migrateDatabase({ schemaVersion: 1, tabs: parsed }).database;
      incoming = db.entries;
      migrated = incoming.length;
    } else {
      return rejectImport(
        existing,
        "Unrecognized JSON shape — nothing imported.",
      );
    }
  } catch (e) {
    const msg =
      e instanceof MigrationError || e instanceof CorruptDatabaseError
        ? e.message
        : "Import failed.";
    return rejectImport(existing, msg);
  }

  let added = 0;
  let skippedDuplicates = 0;
  let skippedInvalid = 0;
  const merged = [...existing];

  for (const entry of incoming) {
    if (!isAllowedPersistUrl(entry.url)) {
      skippedInvalid += 1;
      continue;
    }
    if (merged.some((e) => urlsEqual(e.url, entry.url))) {
      skippedDuplicates += 1;
      continue;
    }
    if (intoEmpty) {
      merged.push({
        ...entry,
        schemaVersion: SCHEMA_VERSION,
        status: "saved",
      });
    } else {
      merged.push({
        ...entry,
        id:
          entry.id && !merged.some((e) => e.id === entry.id)
            ? entry.id
            : createId("t"),
        schemaVersion: SCHEMA_VERSION,
        status: "saved",
      });
    }
    added += 1;
  }

  return {
    entries: merged,
    summary: {
      added,
      skippedDuplicates,
      skippedInvalid,
      migrated,
      message: `Imported ${added}. Skipped ${skippedDuplicates} duplicate(s), ${skippedInvalid} invalid.`,
    },
  };
}

function asNumber(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/**
 * OneTab-style plain list: `url | title`, `url title`, or url-per-line.
 * Source: OneTab export uses "URL | title" lines (community docs / export samples).
 */
export function importPlainTextList(
  text: string,
  existing: SavedTab[],
): { entries: SavedTab[]; summary: ImportSummary } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  let added = 0;
  let skippedDuplicates = 0;
  let skippedInvalid = 0;
  const merged = [...existing];
  const now = Date.now();

  for (const line of lines) {
    let url = "";
    let title = "";
    if (line.includes("|")) {
      const [u, ...rest] = line.split("|");
      url = (u ?? "").trim();
      title = rest.join("|").trim();
    } else {
      const m = line.match(/^(https?:\/\/\S+)\s*(.*)$/i);
      if (m) {
        url = m[1] ?? "";
        title = (m[2] ?? "").trim();
      } else {
        url = line;
      }
    }

    if (!isAllowedPersistUrl(url)) {
      skippedInvalid += 1;
      continue;
    }
    if (merged.some((e) => urlsEqual(e.url, url))) {
      skippedDuplicates += 1;
      continue;
    }
    merged.push({
      schemaVersion: SCHEMA_VERSION,
      id: createId("t"),
      url,
      title: title || url,
      favicon: null,
      savedAt: now,
      source: { windowId: -1, index: 0, pinned: false },
      group: "",
      tags: [],
      status: "saved",
    });
    added += 1;
  }

  return {
    entries: merged,
    summary: {
      added,
      skippedDuplicates,
      skippedInvalid,
      migrated: 0,
      message: `Imported ${added} from text. Skipped ${skippedDuplicates} duplicate(s), ${skippedInvalid} invalid.`,
    },
  };
}
