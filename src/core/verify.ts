import type { Database, SavedTab } from "../types.js";
import { entriesEqualForVerify } from "./migrate.js";

/**
 * After writing new entries, verify each expected entry is present and fully equal.
 */
export function verifyEntriesPresent(
  db: Database,
  expected: SavedTab[],
): { ok: true } | { ok: false; missingIds: string[]; mismatchedIds: string[] } {
  const missingIds: string[] = [];
  const mismatchedIds: string[] = [];
  for (const exp of expected) {
    const found = db.entries.find((e) => e.id === exp.id);
    if (!found) {
      missingIds.push(exp.id);
      continue;
    }
    if (!entriesEqualForVerify(found, exp)) {
      mismatchedIds.push(exp.id);
    }
  }
  if (missingIds.length || mismatchedIds.length) {
    return { ok: false, missingIds, mismatchedIds };
  }
  return { ok: true };
}

/** Deep comparison used after write read-back: entries, settings, stats, and undo state. */
export function databaseContentMatches(
  written: Database,
  read: Database,
): boolean {
  if (written.revision !== read.revision) return false;
  if (written.schemaVersion !== read.schemaVersion) return false;
  if (written.entries.length !== read.entries.length) return false;
  for (let i = 0; i < written.entries.length; i++) {
    const e = written.entries[i]!;
    const f = read.entries[i];
    if (!f || !entriesEqualForVerify(e, f)) return false;
  }
  if (JSON.stringify(written.settings) !== JSON.stringify(read.settings)) {
    return false;
  }
  if (JSON.stringify(written.stats) !== JSON.stringify(read.stats)) {
    return false;
  }
  if (written.undo === null) {
    if (read.undo !== null) return false;
  } else {
    if (read.undo === null) return false;
    if (written.undo.expiresAt !== read.undo.expiresAt) return false;
    if (written.undo.ids.length !== read.undo.ids.length) return false;
    for (let i = 0; i < written.undo.ids.length; i++) {
      if (written.undo.ids[i] !== read.undo.ids[i]) return false;
    }
  }
  return true;
}
