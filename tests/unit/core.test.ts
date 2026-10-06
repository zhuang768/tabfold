import { describe, expect, it, vi } from "vitest";
import {
  selectTabsForScope,
  estimateMemoryFreedMb,
} from "../../src/core/scope.js";
import {
  findDuplicate,
  isInternalUrl,
  isSavableUrl,
  isWhitelisted,
  searchEntries,
} from "../../src/core/tabs-logic.js";
import {
  migrateDatabase,
  MigrationError,
  CorruptDatabaseError,
  entriesEqualForVerify,
} from "../../src/core/migrate.js";
import {
  exportJsonString,
  importJsonText,
  importPlainTextList,
} from "../../src/core/import-export.js";
import { verifyEntriesPresent } from "../../src/core/verify.js";
import {
  createEmptyDatabase,
  SCHEMA_VERSION,
  UNDO_TTL_MS,
  type SavedTab,
} from "../../src/types.js";
import {
  LibraryStore,
  memoryDriver,
  createControllableDriver,
} from "../../src/browser/storage.js";
import { createDemoEntries } from "../../src/core/demo.js";
import {
  urlsEqual,
  stableMigratedId,
  isAllowedPersistUrl,
} from "../../src/core/id.js";
import {
  setStoreForTests,
  saveTabs,
  undoLastSave,
} from "../../src/browser/library.js";

function entry(partial: Partial<SavedTab> & { url: string }): SavedTab {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: partial.id ?? "id1",
    url: partial.url,
    title: partial.title ?? "T",
    favicon: partial.favicon ?? null,
    savedAt: partial.savedAt ?? 1,
    source: partial.source ?? { windowId: 1, index: 0, pinned: false },
    group: partial.group ?? "",
    tags: partial.tags ?? [],
    status: "saved",
  };
}

describe("scope selection", () => {
  const tabs = [
    { id: 1, active: true, url: "https://a.com" },
    { id: 2, active: false, url: "https://b.com" },
    { id: 3, active: false, url: "https://c.com" },
  ];
  it("selects current tab by id", () => {
    expect(selectTabsForScope(tabs, "current", 1).map((t) => t.id)).toEqual([
      1,
    ]);
  });
  it("selects others excluding active", () => {
    expect(selectTabsForScope(tabs, "others", 1).map((t) => t.id)).toEqual([
      2, 3,
    ]);
  });
  it("selects entire window", () => {
    expect(selectTabsForScope(tabs, "window", 1)).toHaveLength(3);
  });
});

describe("url / dedupe / whitelist / search", () => {
  it("detects internal pages and rejects unsafe schemes", () => {
    expect(isInternalUrl("chrome://settings")).toBe(true);
    expect(isSavableUrl("chrome://settings")).toBe(false);
    expect(isAllowedPersistUrl("javascript:alert(1)")).toBe(false);
    expect(isAllowedPersistUrl("data:text/html,hi")).toBe(false);
    expect(isSavableUrl("https://example.com")).toBe(true);
  });

  it("keeps distinct hash routes and only soft-normalizes trailing slash", () => {
    expect(
      urlsEqual("https://app.test/#/note/1", "https://app.test/#/note/2"),
    ).toBe(false);
    expect(
      urlsEqual("https://example.com/path/", "https://example.com/path"),
    ).toBe(true);
    const entries = [entry({ url: "https://app.test/#/note/1" })];
    expect(findDuplicate(entries, "https://app.test/#/note/2")).toBeUndefined();
  });

  it("matches whitelist hosts and subdomains", () => {
    expect(isWhitelisted("https://mail.google.com/u/0", ["google.com"])).toBe(
      true,
    );
    expect(isWhitelisted("https://example.com", ["google.com"])).toBe(false);
  });

  it("searches title url group tags", () => {
    const entries = [
      entry({
        id: "1",
        url: "https://a.com",
        title: "Alpha",
        group: "Work",
        tags: ["later"],
      }),
      entry({ id: "2", url: "https://b.com/docs", title: "Beta" }),
    ];
    expect(searchEntries(entries, "work")).toHaveLength(1);
    expect(searchEntries(entries, "docs")).toHaveLength(1);
    expect(searchEntries(entries, "later")).toHaveLength(1);
  });
});

describe("migration + corruption", () => {
  it("migrates v1 tabs with stable ids across reads", () => {
    const raw = {
      schemaVersion: 1,
      tabs: [{ url: "https://example.com", title: "Ex", savedAt: 42 }],
    };
    const a = migrateDatabase(raw).database.entries[0]!;
    const b = migrateDatabase(raw).database.entries[0]!;
    expect(a.id).toBe(b.id);
    expect(a.id).toBe(stableMigratedId("https://example.com", 42, "Ex"));
    expect(a.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it("rejects newer schema without wiping", () => {
    expect(() => migrateDatabase({ schemaVersion: 99, entries: [] })).toThrow(
      MigrationError,
    );
  });

  it("treats null entries as corruption not empty", () => {
    expect(() =>
      migrateDatabase({
        schemaVersion: 2,
        revision: 0,
        entries: null,
        settings: {},
        stats: {},
      }),
    ).toThrow(CorruptDatabaseError);
  });

  it("rejects mixed invalid entries instead of silent drop", () => {
    expect(() =>
      migrateDatabase({
        schemaVersion: 2,
        revision: 0,
        entries: [
          {
            url: "https://ok.test",
            title: "Ok",
            savedAt: 1,
            id: "x",
            source: { windowId: 1, index: 0, pinned: false },
          },
          { nope: true },
        ],
        settings: {},
        stats: {},
      }),
    ).toThrow(CorruptDatabaseError);
  });

  it("preserves valid undo across migrate", () => {
    const expiresAt = Date.now() + 10_000;
    const db = migrateDatabase({
      schemaVersion: 2,
      revision: 1,
      entries: [],
      settings: {},
      stats: {},
      undo: { ids: ["a"], expiresAt },
    }).database;
    expect(db.undo?.ids).toEqual(["a"]);
  });

  it("creates empty db from null", () => {
    expect(migrateDatabase(null).database.entries).toEqual([]);
  });
});

describe("import / export", () => {
  it("round-trips json preserving ids into empty library", () => {
    const db = createEmptyDatabase();
    db.entries = [
      entry({
        id: "keep-me",
        url: "https://one.test",
        title: "One",
        group: "Work",
        tags: ["a"],
        source: { windowId: 9, index: 3, pinned: false },
      }),
    ];
    const text = exportJsonString(db);
    const intoEmpty = importJsonText(text, []);
    expect(intoEmpty.summary.added).toBe(1);
    expect(intoEmpty.entries[0]?.id).toBe("keep-me");
    expect(intoEmpty.entries[0]?.group).toBe("Work");
    expect(intoEmpty.entries[0]?.tags).toEqual(["a"]);
    expect(intoEmpty.entries[0]?.source.windowId).toBe(9);
  });

  it("imports v1 export entries (not zero)", () => {
    const payload = JSON.stringify({
      format: "tabfold-json",
      schemaVersion: 1,
      entries: [{ url: "https://legacy.test", title: "Legacy", savedAt: 99 }],
    });
    const result = importJsonText(payload, []);
    expect(result.summary.added).toBe(1);
    expect(result.entries[0]?.url).toBe("https://legacy.test");
  });

  it("rejects unsafe urls on json import", () => {
    const payload = JSON.stringify({
      format: "tabfold-json",
      schemaVersion: 2,
      entries: [
        {
          id: "bad",
          url: "javascript:alert(1)",
          title: "x",
          savedAt: 1,
          source: { windowId: 1, index: 0, pinned: false },
          group: "",
          tags: [],
          status: "saved",
          schemaVersion: 2,
          favicon: null,
        },
      ],
    });
    // migrate throws corrupt OR import counts invalid
    const result = importJsonText(payload, []);
    expect(result.summary.added).toBe(0);
  });

  it("imports url | title plain text", () => {
    const text =
      "https://alpha.test | Alpha Site\nhttps://beta.test Beta Site\nnot-a-url\n";
    const result = importPlainTextList(text, []);
    expect(result.summary.added).toBe(2);
    expect(result.summary.skippedInvalid).toBe(1);
  });

  it("rejects invalid json without changing entries", () => {
    const existing = [entry({ url: "https://keep.test" })];
    const result = importJsonText("{nope", existing);
    expect(result.entries).toEqual(existing);
  });
});

describe("verify full fields", () => {
  it("detects source/group/tags mismatch", () => {
    const a = entry({
      id: "x",
      url: "https://x.test",
      group: "A",
      tags: ["t"],
    });
    const b = { ...a, group: "B" };
    expect(entriesEqualForVerify(a, b)).toBe(false);
    const db = createEmptyDatabase();
    db.entries = [a];
    expect(verifyEntriesPresent(db, [{ ...a, tags: ["other"] }]).ok).toBe(
      false,
    );
  });
});

describe("storage transaction + concurrency (C01)", () => {
  it("simulated write failure leaves store empty", async () => {
    const driver = memoryDriver();
    const failing = LibraryStore.failing(driver);
    const db = createEmptyDatabase();
    db.entries = [entry({ url: "https://fail.test" })];
    await expect(failing.writeDatabase(db, 0)).rejects.toThrow(
      /Simulated write failure/,
    );
    const okStore = new LibraryStore(driver);
    expect((await okStore.readDatabase()).entries).toHaveLength(0);
  });

  it("serializes parallel writes so both entries survive", async () => {
    const store = new LibraryStore(memoryDriver());
    setStoreForTests(store);

    const tabsA = {
      id: 1,
      windowId: 10,
      index: 0,
      url: "https://a.example/",
      title: "A",
      pinned: false,
      audible: false,
    };
    const tabsB = {
      id: 2,
      windowId: 10,
      index: 1,
      url: "https://b.example/",
      title: "B",
      pinned: false,
      audible: false,
    };

    const chromeMock = {
      tabs: {
        get: vi.fn(async (id: number) => (id === 1 ? tabsA : tabsB)),
        query: vi.fn(async () => [tabsA, tabsB]),
        create: vi.fn(async () => ({ id: 99 })),
        remove: vi.fn(async () => undefined),
      },
      action: {
        setBadgeText: vi.fn(async () => undefined),
        setBadgeBackgroundColor: vi.fn(async () => undefined),
        setIcon: vi.fn(async () => undefined),
        setPopup: vi.fn(async () => undefined),
        openPopup: vi.fn(async () => undefined),
      },
      storage: {
        session: {
          set: vi.fn(async () => undefined),
          get: vi.fn(async () => ({})),
          remove: vi.fn(async () => undefined),
        },
      },
      runtime: { id: "testid" },
    };
    vi.stubGlobal("chrome", chromeMock);

    // Mark unsaved hint acknowledged via direct write
    const empty = await store.readDatabase();
    await store.writeDatabase(
      {
        ...empty,
        settings: {
          ...empty.settings,
          unsavedHintAcknowledged: true,
          onboardingComplete: true,
        },
      },
      empty.revision,
    );

    const p1 = saveTabs({ scope: "current", tabId: 1, confirmedUnsaved: true });
    const p2 = saveTabs({ scope: "current", tabId: 2, confirmedUnsaved: true });
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.saved + r2.saved).toBe(2);
    expect(r1.closed + r2.closed).toBe(2);
    const final = await store.readDatabase();
    expect(final.entries).toHaveLength(2);
    expect(final.entries.map((e) => e.url).sort()).toEqual([
      "https://a.example/",
      "https://b.example/",
    ]);
    expect(chromeMock.tabs.remove).toHaveBeenCalled();

    setStoreForTests(null);
    vi.unstubAllGlobals();
  });

  it("read-back failure does not close tabs", async () => {
    const store = new LibraryStore(memoryDriver());
    setStoreForTests(store);
    const tab = {
      id: 7,
      windowId: 1,
      index: 0,
      url: "https://keep.example/",
      title: "Keep",
      pinned: false,
      audible: false,
    };
    vi.stubGlobal("chrome", {
      tabs: {
        get: vi.fn(async () => tab),
        query: vi.fn(async () => [tab]),
        create: vi.fn(),
        remove: vi.fn(),
      },
      action: {
        setBadgeText: vi.fn(async () => undefined),
        setBadgeBackgroundColor: vi.fn(async () => undefined),
        setIcon: vi.fn(async () => undefined),
      },
      storage: {
        session: {
          set: vi.fn(),
          get: vi.fn(async () => ({})),
          remove: vi.fn(),
        },
      },
      runtime: { id: "testid" },
    });

    const empty = await store.readDatabase();
    await store.writeDatabase(
      {
        ...empty,
        settings: { ...empty.settings, unsavedHintAcknowledged: true },
      },
      empty.revision,
    );

    // Fail the verify re-read after write by flipping failReads mid-flight is hard;
    // instead fail writes after first success using setFailReads on second read inside exclusive.
    const orig = store.readDatabaseUnlocked.bind(store);
    let reads = 0;
    store.readDatabaseUnlocked = async () => {
      reads += 1;
      // first read (load db) ok; after write the verify read fails
      if (reads >= 3) throw new Error("Simulated read failure");
      return orig();
    };

    const result = await saveTabs({
      scope: "current",
      tabId: 7,
      confirmedUnsaved: true,
    });
    expect(result.saved).toBe(0);
    expect(chrome.tabs.remove).not.toHaveBeenCalled();

    setStoreForTests(null);
    vi.unstubAllGlobals();
  });
});

describe("mutation queue reentrancy (C01 nested backup)", () => {
  it("exclusive + createBackup does not deadlock", async () => {
    const store = new LibraryStore(memoryDriver());
    const empty = await store.readDatabase();
    const written = await store.exclusive(async () => {
      const db = await store.readDatabaseUnlocked();
      await store.createBackup("before-import", db);
      return store.writeDatabaseUnlocked(
        {
          ...db,
          entries: [
            {
              schemaVersion: 2,
              id: "n1",
              url: "https://nested.example/",
              title: "Nested",
              favicon: null,
              savedAt: Date.now(),
              source: { windowId: -1, index: 0, pinned: false },
              group: "",
              tags: [],
              status: "saved",
            },
          ],
        },
        db.revision,
      );
    });
    expect(written.entries).toHaveLength(1);
    const backups = await store.listBackupMeta();
    expect(backups.length).toBeGreaterThan(0);
    expect(empty.revision).toBeLessThan(written.revision);
  });
});

describe("undo persistence (C02)", () => {
  it("keeps undo after remigrate/read and undo opens tab", async () => {
    const store = new LibraryStore(memoryDriver());
    const e = entry({
      id: "u1",
      url: "https://undo.example/",
      title: "UndoMe",
    });
    const db = createEmptyDatabase();
    const withUndo = {
      ...db,
      entries: [e],
      undo: { ids: ["u1"], expiresAt: Date.now() + UNDO_TTL_MS },
      settings: { ...db.settings, unsavedHintAcknowledged: true },
    };
    await store.writeDatabase(withUndo, 0);
    const again = await store.readDatabase();
    expect(again.undo?.ids).toEqual(["u1"]);

    setStoreForTests(store);
    vi.stubGlobal("chrome", {
      tabs: {
        create: vi.fn(async () => ({ id: 5 })),
        get: vi.fn(),
        query: vi.fn(),
        remove: vi.fn(),
      },
      action: {
        setBadgeText: vi.fn(async () => undefined),
        setBadgeBackgroundColor: vi.fn(async () => undefined),
        setIcon: vi.fn(async () => undefined),
      },
      runtime: { id: "testid" },
    });
    const r = await undoLastSave();
    expect(r.ok).toBe(true);
    expect((await store.readDatabase()).entries).toHaveLength(0);
    setStoreForTests(null);
    vi.unstubAllGlobals();
  });
});

describe("memory estimate + demo", () => {
  it("estimates from closed count not open entries", () => {
    expect(estimateMemoryFreedMb(10)).toBe(500);
    expect(estimateMemoryFreedMb(0)).toBe(0);
  });
  it("demo data is real local-shaped entries", () => {
    const demo = createDemoEntries(1_700_000_000_000);
    expect(demo.length).toBeGreaterThanOrEqual(3);
  });
});

describe("controllable driver exists for interleaving", () => {
  it("pauses set", async () => {
    const { driver, gate } = createControllableDriver();
    await gate.pauseBeforeSet();
    let done = false;
    const p = driver.set({ a: 1 }).then(() => {
      done = true;
    });
    expect(done).toBe(false);
    gate.resumeSet();
    await p;
    expect(done).toBe(true);
  });
});
