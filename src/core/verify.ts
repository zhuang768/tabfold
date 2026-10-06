import type { Database, SavedTab } from "../types.js";
import { entriesEqualForVerify } from "./migrate.js";

/**
 * After writing new entries, verify each expected entry is present and equal.
 * Used by the write-then-verify-then-close pipeline.
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

/**
 * Optimistic concurrency: caller reads revision R, mutates, writes only if still R.
 */
export function assertRevision(db: Database, expectedRevision: number): void {
  if (db.revision !== expectedRevision) {
    throw new Error(
      `Concurrent modification (expected revision ${expectedRevision}, got ${db.revision})`,
    );
  }
}

export function bumpRevision(db: Database): Database {
  return { ...db, revision: db.revision + 1 };
}
