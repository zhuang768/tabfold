import {
  MAX_BACKUPS,
  createEmptyDatabase,
  type BackupMeta,
  type Database,
  type Snapshot,
} from "../types.js";
import { migrateDatabase, MigrationError } from "../core/migrate.js";
import { createId } from "../core/id.js";

const DB_KEY = "tabfold_database";
const BACKUPS_KEY = "tabfold_backups";
const CORRUPT_KEY = "tabfold_corrupt_raw";

export interface StorageDriver {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string[]): Promise<void>;
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
        if (k in store) out[k] = store[k];
      }
      return out;
    },
    async set(items) {
      Object.assign(store, items);
    },
    async remove(keys) {
      for (const k of keys) delete store[k];
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

export class LibraryStore {
  constructor(
    private readonly driver: StorageDriver,
    private readonly failWrites = false,
  ) {}

  static failing(driver: StorageDriver): LibraryStore {
    return new LibraryStore(driver, true);
  }

  async readDatabase(): Promise<Database> {
    const data = await this.driver.get([DB_KEY, CORRUPT_KEY]);
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
    try {
      return migrateDatabase(raw);
    } catch (e) {
      const msg =
        e instanceof MigrationError
          ? e.message
          : "Database could not be migrated";
      await this.driver.set({ [CORRUPT_KEY]: raw });
      throw new CorruptDataError(msg, raw);
    }
  }

  /**
   * Write database with optimistic concurrency.
   * `expectedRevision` must match the revision that was read before mutation.
   * Stored revision becomes expectedRevision + 1.
   */
  async writeDatabase(
    db: Database,
    expectedRevision: number,
  ): Promise<Database> {
    if (this.failWrites) {
      throw new Error("Simulated write failure");
    }
    const current = await this.readDatabase();
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
    const read = await this.readDatabase();
    if (read.revision !== toWrite.revision) {
      throw new Error("Read-back revision mismatch");
    }
    return read;
  }

  async replaceDatabase(db: Database): Promise<Database> {
    if (this.failWrites) throw new Error("Simulated write failure");
    await this.driver.set({ [DB_KEY]: db });
    await this.driver.remove([CORRUPT_KEY]);
    return this.readDatabase();
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

  async createBackup(reason: string, db: Database): Promise<void> {
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

  async restoreBackup(id: string): Promise<Database> {
    const data = await this.driver.get([BACKUPS_KEY]);
    const existing = Array.isArray(data[BACKUPS_KEY])
      ? (data[BACKUPS_KEY] as Snapshot[])
      : [];
    const found = existing.find((s) => s.id === id);
    if (!found) throw new Error("Backup not found");
    const current = await this.readDatabase().catch(() =>
      createEmptyDatabase(),
    );
    await this.createBackup("before-restore-backup", current);
    return this.replaceDatabase(migrateDatabase(found.database));
  }

  async exportRaw(): Promise<string> {
    const data = await this.driver.get([DB_KEY, CORRUPT_KEY, BACKUPS_KEY]);
    return `${JSON.stringify(data, null, 2)}\n`;
  }

  async resetAll(): Promise<void> {
    await this.driver.remove([DB_KEY, BACKUPS_KEY, CORRUPT_KEY]);
  }
}
