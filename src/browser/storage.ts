import {
  MAX_BACKUPS,
  SCHEMA_VERSION,
  createEmptyDatabase,
  type BackupMeta,
  type Database,
  type Snapshot,
} from "../types.js";
import { STRINGS } from "../strings.js";
import {
  migrateDatabase,
  MigrationError,
  CorruptDatabaseError,
} from "../core/migrate.js";
import { databaseContentMatches } from "../core/verify.js";
import { createId } from "../core/id.js";

export const DB_KEY = "tabfold_database";
export const BACKUPS_KEY = "tabfold_backups";
export const CORRUPT_KEY = "tabfold_corrupt_raw";
export const SALVAGE_KEY = "tabfold_salvage";
export const OPERATION_JOURNAL_KEY = "tabfold_op_journal";
export const RESTORE_JOURNAL_KEY = "tabfold_restore_journal";
export const UNDO_JOURNAL_KEY = "tabfold_undo_journal";
export const INTENT_KEY = "tabfold_op_intent";
export const DURABLE_UNDO_KEY = "tabfold_durable_undo";

export interface StorageDriver {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string[]): Promise<void>;
}

function appendSalvage(existing: unknown, payload: unknown): unknown[] {
  const list: unknown[] = Array.isArray(existing)
    ? [...existing]
    : existing != null
      ? [existing]
      : [];
  const serialized = JSON.stringify(payload);
  if (!list.some((item) => JSON.stringify(item) === serialized)) {
    list.push(payload);
  }
  return list;
}

export function chromeLocalDriver(): StorageDriver {
  return {
    async get(keys) {
      return (await chrome.storage.local.get(keys)) as Record<string, unknown>;
    },
    async set(items) {
      await chrome.storage.local.set(items);
    },
    async remove(keys) {
      await chrome.storage.local.remove(keys);
    },
  };
}

export function memoryDriver(
  initial: Record<string, unknown> = {},
): StorageDriver {
  const store = { ...initial };
  return {
    async get(keys) {
      const out: Record<string, unknown> = {};
      for (const k of keys) {
        if (k in store) out[k] = structuredClone(store[k]);
      }
      return out;
    },
    async set(items) {
      for (const [k, v] of Object.entries(items)) {
        store[k] = structuredClone(v);
      }
    },
    async remove(keys) {
      for (const k of keys) delete store[k];
    },
  };
}

/** Controllable async driver for interleaving tests. */
export function createControllableDriver(
  initial: Record<string, unknown> = {},
): {
  driver: StorageDriver;
  gate: {
    pauseBeforeSet: () => Promise<void>;
    resumeSet: () => void;
    pauseBeforeGet: () => Promise<void>;
    resumeGet: () => void;
  };
} {
  const base = memoryDriver(initial);
  let setWait: Promise<void> | null = null;
  let setRelease: (() => void) | null = null;
  let getWait: Promise<void> | null = null;
  let getRelease: (() => void) | null = null;

  return {
    driver: {
      async get(keys) {
        if (getWait) await getWait;
        return base.get(keys);
      },
      async set(items) {
        if (setWait) await setWait;
        return base.set(items);
      },
      async remove(keys) {
        return base.remove(keys);
      },
    },
    gate: {
      pauseBeforeSet() {
        setWait = new Promise((r) => {
          setRelease = r;
        });
        return Promise.resolve();
      },
      resumeSet() {
        setRelease?.();
        setWait = null;
        setRelease = null;
      },
      pauseBeforeGet() {
        getWait = new Promise((r) => {
          getRelease = r;
        });
        return Promise.resolve();
      },
      resumeGet() {
        getRelease?.();
        getWait = null;
        getRelease = null;
      },
    },
  };
}

export class CorruptDataError extends Error {
  readonly raw: unknown;
  constructor(message: string, raw: unknown) {
    super(message);
    this.name = "CorruptDataError";
    this.raw = raw;
  }
}

export type LockToken = { readonly id: symbol };

/**
 * Serializes all store mutations inside this service-worker lifetime.
 * Token-based re-entrancy: nested run() calls passing the active holder token
 * execute immediately; external calls without the token wait in FIFO order.
 */
class MutationQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private currentHolder: symbol | null = null;

  run<T>(fn: (token: LockToken) => Promise<T>, token?: LockToken): Promise<T> {
    if (token && this.currentHolder === token.id) {
      return fn(token);
    }
    const lockId = Symbol("mutation-lock");
    const myToken: LockToken = { id: lockId };

    const run = this.tail.then(
      async () => {
        this.currentHolder = lockId;
        try {
          return await fn(myToken);
        } finally {
          this.currentHolder = null;
        }
      },
      async () => {
        this.currentHolder = lockId;
        try {
          return await fn(myToken);
        } finally {
          this.currentHolder = null;
        }
      },
    );

    this.tail = run.then(
      () => undefined,
      () => undefined,
    );

    return run;
  }
}

export class LibraryStore {
  private readonly queue = new MutationQueue();
  private failWrites = false;
  private failReads = false;

  private readonly driver: StorageDriver;

  constructor(driver: StorageDriver) {
    this.driver = driver;
  }

  getDriver(): StorageDriver {
    return this.driver;
  }

  static failing(driver: StorageDriver): LibraryStore {
    const s = new LibraryStore(driver);
    s.failWrites = true;
    return s;
  }

  /** Test helper: next readDatabase throws after raw fetch. */
  setFailReads(v: boolean): void {
    this.failReads = v;
  }

  setFailWrites(v: boolean): void {
    this.failWrites = v;
  }

  /** Run exclusive critical section (save/write/close pipeline uses this). */
  exclusive<T>(
    fn: (token: LockToken) => Promise<T>,
    token?: LockToken,
  ): Promise<T> {
    return this.queue.run(fn, token);
  }

  async readRawDatabase(): Promise<unknown> {
    const data = await this.driver.get([DB_KEY, CORRUPT_KEY, SALVAGE_KEY]);
    if (data[CORRUPT_KEY] != null && data[DB_KEY] == null) {
      throw new CorruptDataError(
        "Previously detected corruption; raw backup retained.",
        data[CORRUPT_KEY],
      );
    }
    return data[DB_KEY] ?? data[SALVAGE_KEY] ?? null;
  }

  async readDatabase(): Promise<Database> {
    if (this.failReads) {
      throw new Error("Simulated read failure");
    }
    const data = await this.driver.get([DB_KEY, CORRUPT_KEY, SALVAGE_KEY]);
    if (data[CORRUPT_KEY] != null && data[DB_KEY] == null) {
      throw new CorruptDataError(
        "Previously detected corruption; raw backup retained.",
        data[CORRUPT_KEY],
      );
    }
    const raw = data[DB_KEY];
    if (raw == null) {
      return createEmptyDatabase();
    }
    const isCurrent =
      typeof (raw as Record<string, unknown> | null)?.schemaVersion ===
        "number" &&
      (raw as Record<string, unknown>).schemaVersion === SCHEMA_VERSION;
    try {
      const result = migrateDatabase(raw, { strictCurrent: isCurrent });
      if (result.didMigrate) {
        // Persist migration under exclusive lock so ids stay stable
        await this.exclusive(async () => {
          const again = await this.driver.get([DB_KEY, SALVAGE_KEY]);
          const currentRaw = again[DB_KEY] ?? raw;
          const currentResult = migrateDatabase(currentRaw);
          const currentVer =
            typeof (currentRaw as Record<string, unknown> | null)
              ?.schemaVersion === "number"
              ? ((currentRaw as Record<string, unknown>)
                  .schemaVersion as number)
              : 0;
          if (currentVer < currentResult.database.schemaVersion) {
            const nextSalvage = appendSalvage(again[SALVAGE_KEY], currentRaw);
            await this.driver.set({
              [SALVAGE_KEY]: nextSalvage,
              [DB_KEY]: currentResult.database,
            });
          }
          const readBackRaw = (await this.driver.get([DB_KEY]))[DB_KEY];
          const readBackResult = migrateDatabase(readBackRaw, {
            strictCurrent: true,
          });
          if (
            !databaseContentMatches(
              currentResult.database,
              readBackResult.database,
            )
          ) {
            throw new Error(STRINGS.migratedContentMismatch);
          }
        });
        const finalRaw = (await this.driver.get([DB_KEY]))[DB_KEY];
        return migrateDatabase(finalRaw, { strictCurrent: true }).database;
      }
      return result.database;
    } catch (e) {
      if (e instanceof MigrationError) {
        const existingSalvage = data[SALVAGE_KEY];
        const toSet: Record<string, unknown> = {
          [CORRUPT_KEY]: raw,
          [SALVAGE_KEY]: appendSalvage(existingSalvage, raw),
        };
        await this.driver.set(toSet);
        throw new CorruptDataError(e.message, raw);
      }
      if (e instanceof CorruptDatabaseError) {
        const existingSalvage = data[SALVAGE_KEY];
        const toSet: Record<string, unknown> = {
          [CORRUPT_KEY]: raw,
          [SALVAGE_KEY]: appendSalvage(existingSalvage, raw),
        };
        await this.driver.set(toSet);
        // Keep DB_KEY so raw export still sees both; UI treats as corrupt
        throw new CorruptDataError(e.message, e.raw);
      }
      throw e;
    }
  }

  /**
   * Atomic-ish write inside the mutation queue:
   * re-read revision under the same exclusive section, set, full read-back verify.
   */
  async writeDatabase(
    db: Database,
    expectedRevision: number,
    token?: LockToken,
  ): Promise<Database> {
    return this.exclusive(
      () => this.writeDatabaseUnlocked(db, expectedRevision),
      token,
    );
  }

  async writeDatabaseUnlocked(
    db: Database,
    expectedRevision: number,
  ): Promise<Database> {
    if (this.failWrites) {
      throw new Error("Simulated write failure");
    }
    if (this.failReads) {
      throw new Error("Simulated read failure");
    }
    const current = await this.readDatabaseUnlocked();
    if (current.revision !== expectedRevision) {
      throw new Error(
        `Concurrent modification (expected ${expectedRevision}, found ${current.revision})`,
      );
    }
    const toWrite: Database = {
      ...db,
      revision: expectedRevision + 1,
      schemaVersion: db.schemaVersion,
    };
    await this.driver.set({ [DB_KEY]: toWrite });
    await this.driver.remove([CORRUPT_KEY]).catch(() => undefined);

    const readRaw = (await this.driver.get([DB_KEY]))[DB_KEY];
    if (
      typeof readRaw !== "object" ||
      readRaw === null ||
      (readRaw as Record<string, unknown>).schemaVersion !== SCHEMA_VERSION ||
      typeof (readRaw as Record<string, unknown>).schemaVersion !== "number" ||
      !Number.isInteger((readRaw as Record<string, unknown>).schemaVersion)
    ) {
      throw new CorruptDataError(
        "Read-back root schemaVersion invalid or missing",
        readRaw,
      );
    }
    const readMigrated = migrateDatabase(readRaw, { strictCurrent: true });
    if (!databaseContentMatches(toWrite, readMigrated.database)) {
      throw new Error(STRINGS.readbackMismatch);
    }
    return readMigrated.database;
  }

  /** Read without taking the queue (caller must already hold exclusive). */
  async readDatabaseUnlocked(): Promise<Database> {
    if (this.failReads) {
      throw new Error("Simulated read failure");
    }
    const data = await this.driver.get([DB_KEY, CORRUPT_KEY, SALVAGE_KEY]);
    if (data[CORRUPT_KEY] != null && data[DB_KEY] == null) {
      throw new CorruptDataError(
        "Previously detected corruption; raw backup retained.",
        data[CORRUPT_KEY],
      );
    }
    const raw = data[DB_KEY];
    if (raw == null) return createEmptyDatabase();
    const isCurrent =
      typeof (raw as Record<string, unknown> | null)?.schemaVersion ===
        "number" &&
      (raw as Record<string, unknown>).schemaVersion === SCHEMA_VERSION;
    try {
      const result = migrateDatabase(raw, { strictCurrent: isCurrent });
      if (result.didMigrate) {
        const again = await this.driver.get([DB_KEY, SALVAGE_KEY]);
        const currentRaw = again[DB_KEY] ?? raw;
        const currentResult = migrateDatabase(currentRaw);
        const currentVer =
          typeof (currentRaw as Record<string, unknown> | null)
            ?.schemaVersion === "number"
            ? ((currentRaw as Record<string, unknown>).schemaVersion as number)
            : 0;
        if (currentVer < currentResult.database.schemaVersion) {
          const nextSalvage = appendSalvage(again[SALVAGE_KEY], currentRaw);
          await this.driver.set({
            [SALVAGE_KEY]: nextSalvage,
            [DB_KEY]: currentResult.database,
          });
        }
        const readBackRaw = (await this.driver.get([DB_KEY]))[DB_KEY];
        const readBackResult = migrateDatabase(readBackRaw, {
          strictCurrent: true,
        });
        if (
          !databaseContentMatches(
            currentResult.database,
            readBackResult.database,
          )
        ) {
          throw new Error(STRINGS.migratedContentMismatch);
        }
        return readBackResult.database;
      }
      return result.database;
    } catch (e) {
      if (e instanceof MigrationError || e instanceof CorruptDatabaseError) {
        const existingSalvage = data[SALVAGE_KEY];
        const toSet: Record<string, unknown> = {
          [CORRUPT_KEY]: raw,
          [SALVAGE_KEY]: appendSalvage(existingSalvage, raw),
        };
        await this.driver.set(toSet);
        throw new CorruptDataError(
          e instanceof Error ? e.message : "Corrupt database",
          raw,
        );
      }
      throw e;
    }
  }

  async replaceDatabaseUnlocked(db: Database): Promise<Database> {
    if (this.failWrites) throw new Error("Simulated write failure");
    await this.driver.set({ [DB_KEY]: db });
    await this.driver.remove([CORRUPT_KEY]);
    return this.readDatabaseUnlocked();
  }

  async replaceDatabase(db: Database, token?: LockToken): Promise<Database> {
    return this.exclusive(() => this.replaceDatabaseUnlocked(db), token);
  }

  async listBackupMeta(): Promise<BackupMeta[]> {
    const data = await this.driver.get([BACKUPS_KEY]);
    const raw = data[BACKUPS_KEY];
    if (!Array.isArray(raw)) return [];
    return raw
      .map((s) => {
        if (typeof s !== "object" || s == null) return null;
        const o = s as Snapshot;
        return {
          id: o.id,
          createdAt: o.createdAt,
          reason: o.reason,
          entryCount: Array.isArray(o.database?.entries)
            ? o.database.entries.length
            : 0,
        } satisfies BackupMeta;
      })
      .filter((x): x is BackupMeta => x !== null);
  }

  async createBackupUnlocked(reason: string, db: Database): Promise<void> {
    const data = await this.driver.get([BACKUPS_KEY]);
    const existing = Array.isArray(data[BACKUPS_KEY])
      ? (data[BACKUPS_KEY] as Snapshot[])
      : [];
    const snap: Snapshot = {
      id: createId("bak"),
      createdAt: Date.now(),
      reason,
      database: structuredClone(db),
    };
    const next = [snap, ...existing].slice(0, MAX_BACKUPS);
    await this.driver.set({ [BACKUPS_KEY]: next });
  }

  async createBackup(
    reason: string,
    db: Database,
    token?: LockToken,
  ): Promise<void> {
    return this.exclusive(() => this.createBackupUnlocked(reason, db), token);
  }

  async restoreBackupUnlocked(id: string): Promise<Database> {
    const data = await this.driver.get([
      BACKUPS_KEY,
      DB_KEY,
      CORRUPT_KEY,
      SALVAGE_KEY,
    ]);
    const existing = Array.isArray(data[BACKUPS_KEY])
      ? (data[BACKUPS_KEY] as Snapshot[])
      : [];
    const found = existing.find((s) => s.id === id);
    if (!found) throw new Error(STRINGS.backupNotFound);

    // Preserve current raw before restore (even if corrupt) in durable salvage
    const currentRaw = data[DB_KEY] ?? data[CORRUPT_KEY] ?? data[SALVAGE_KEY];
    if (currentRaw != null) {
      await this.driver.set({
        [SALVAGE_KEY]: appendSalvage(data[SALVAGE_KEY], currentRaw),
      });
      try {
        const cur = migrateDatabase(currentRaw).database;
        const snap: Snapshot = {
          id: createId("bak"),
          createdAt: Date.now(),
          reason: "before-restore-backup",
          database: structuredClone(cur),
        };
        const next = [snap, ...existing].slice(0, MAX_BACKUPS);
        await this.driver.set({ [BACKUPS_KEY]: next });
      } catch {
        // if corrupt, already recorded in salvage
      }
    }

    let restored: Database;
    try {
      restored = migrateDatabase(found.database).database;
    } catch (e) {
      throw new Error(
        e instanceof Error
          ? `${STRINGS.backupNotUsable}: ${e.message}`
          : STRINGS.backupNotUsable,
      );
    }

    const rollback = async () => {
      const restoreMap: Record<string, unknown> = {};
      if (data[DB_KEY] !== undefined) {
        restoreMap[DB_KEY] = data[DB_KEY];
      }
      if (data[CORRUPT_KEY] !== undefined) {
        restoreMap[CORRUPT_KEY] = data[CORRUPT_KEY];
      }
      if (Object.keys(restoreMap).length > 0) {
        await this.driver.set(restoreMap);
      }
    };

    try {
      await this.driver.set({ [DB_KEY]: restored });
      if (data[CORRUPT_KEY] !== undefined) {
        await this.driver.remove([CORRUPT_KEY]);
      }
      const readBack = await this.readDatabaseUnlocked();
      if (!databaseContentMatches(restored, readBack)) {
        throw new Error(STRINGS.backupContentMismatch);
      }
    } catch (err) {
      await rollback().catch(() => undefined);
      throw err;
    }

    return restored;
  }

  async restoreBackup(id: string, token?: LockToken): Promise<Database> {
    return this.exclusive(() => this.restoreBackupUnlocked(id), token);
  }

  async exportRaw(): Promise<string> {
    const data = await this.driver.get([
      DB_KEY,
      CORRUPT_KEY,
      BACKUPS_KEY,
      SALVAGE_KEY,
      OPERATION_JOURNAL_KEY,
      RESTORE_JOURNAL_KEY,
      UNDO_JOURNAL_KEY,
      INTENT_KEY,
      DURABLE_UNDO_KEY,
    ]);
    return `${JSON.stringify(data, null, 2)}\n`;
  }

  async resetAllUnlocked(): Promise<void> {
    await this.driver.remove([
      DB_KEY,
      BACKUPS_KEY,
      CORRUPT_KEY,
      SALVAGE_KEY,
      OPERATION_JOURNAL_KEY,
      RESTORE_JOURNAL_KEY,
      UNDO_JOURNAL_KEY,
      INTENT_KEY,
      DURABLE_UNDO_KEY,
    ]);
  }

  async resetAll(token?: LockToken): Promise<void> {
    return this.exclusive(() => this.resetAllUnlocked(), token);
  }

  /** Peek whether corruption marker exists (for UI even when DB unreadable). */
  async hasCorruptionMarker(): Promise<boolean> {
    const data = await this.driver.get([CORRUPT_KEY]);
    return data[CORRUPT_KEY] != null;
  }
}
