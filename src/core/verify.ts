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

/** Deep-ish snapshot compare used after write read-back. */
export function databaseContentMatches(
  written: Database,
  read: Database,
): boolean {
  if (written.revision !== read.revision) return false;
  if (written.schemaVersion !== read.schemaVersion) return false;
  if (written.entries.length !== read.entries.length) return false;
  for (const e of written.entries) {
    const f = read.entries.find((x) => x.id === e.id);
    if (!f || !entriesEqualForVerify(e, f)) return false;
  }
  return true;
}
