import {
  SCHEMA_VERSION,
  type Database,
  type ExportPayload,
  type ImportSummary,
  type SavedTab,
} from "../types.js";
import { createId, urlsEqual } from "./id.js";
import { migrateDatabase, MigrationError } from "./migrate.js";
import { isSavableUrl } from "./tabs-logic.js";

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
    },
  };
}

export function exportJsonString(db: Database): string {
  return `${JSON.stringify(buildExportPayload(db), null, 2)}\n`;
}

/**
 * Parse Tabfold JSON or a raw Database dump. Does not mutate existing DB —
 * returns a new entries list + summary.
 */
export function importJsonText(
  text: string,
  existing: SavedTab[],
): { entries: SavedTab[]; summary: ImportSummary } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return {
      entries: existing,
      summary: {
        added: 0,
        skippedDuplicates: 0,
        skippedInvalid: 0,
        migrated: 0,
        message: "Invalid JSON — nothing imported.",
      },
    };
  }

  let incoming: SavedTab[] = [];
  let migrated = 0;

  try {
    if (
      isRecord(parsed) &&
      parsed.format === "tabfold-json" &&
      Array.isArray(parsed.entries)
    ) {
      const db = migrateDatabase({
        schemaVersion:
          typeof parsed.schemaVersion === "number" ? parsed.schemaVersion : 1,
        entries: parsed.entries,
        revision: 0,
        settings: parsed.settings,
        stats: { totalSaved: 0, totalRestored: 0 },
        undo: null,
      });
      incoming = db.entries;
      if (
        typeof parsed.schemaVersion === "number" &&
        parsed.schemaVersion < SCHEMA_VERSION
      ) {
        migrated = incoming.length;
      }
    } else if (
      isRecord(parsed) &&
      (Array.isArray(parsed.entries) || Array.isArray(parsed.tabs))
    ) {
      const db = migrateDatabase(parsed);
      incoming = db.entries;
      migrated = incoming.length;
    } else if (Array.isArray(parsed)) {
      const db = migrateDatabase({ schemaVersion: 1, tabs: parsed });
      incoming = db.entries;
      migrated = incoming.length;
    } else {
      return {
        entries: existing,
        summary: {
          added: 0,
          skippedDuplicates: 0,
          skippedInvalid: 1,
          migrated: 0,
          message: "Unrecognized JSON shape — nothing imported.",
        },
      };
    }
  } catch (e) {
    const msg = e instanceof MigrationError ? e.message : "Import failed.";
    return {
      entries: existing,
      summary: {
        added: 0,
        skippedDuplicates: 0,
        skippedInvalid: 1,
        migrated: 0,
        message: msg,
      },
    };
  }

  let added = 0;
  let skippedDuplicates = 0;
  let skippedInvalid = 0;
  const merged = [...existing];

  for (const entry of incoming) {
    if (!isSavableUrl(entry.url) && !entry.url.startsWith("http")) {
      // Allow http(s) via isSavableUrl; skip clearly bad
      if (!entry.url) {
        skippedInvalid += 1;
        continue;
      }
    }
    if (!entry.url) {
      skippedInvalid += 1;
      continue;
    }
    if (merged.some((e) => urlsEqual(e.url, entry.url))) {
      skippedDuplicates += 1;
      continue;
    }
    merged.push({
      ...entry,
      id: createId("t"),
      schemaVersion: SCHEMA_VERSION,
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
      migrated,
      message: `Imported ${added}. Skipped ${skippedDuplicates} duplicate(s), ${skippedInvalid} invalid.`,
    },
  };
}

/**
 * Common OneTab-style / plain list formats:
 * - `https://example.com | Title`
 * - `https://example.com Title`
 * - one URL per line
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

    if (!isSavableUrl(url)) {
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
