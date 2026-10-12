import { describe, expect, it, vi } from "vitest";
import {
  selectTabsForScope,
  estimateMemoryFreedMb,
  isValidScope,
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
import {
  verifyEntriesPresent,
  databaseContentMatches,
} from "../../src/core/verify.js";
import {
  createEmptyDatabase,
  SCHEMA_VERSION,
  UNDO_TTL_MS,
  type Database,
  type SavedTab,
  type SaveScope,
  type Settings,
  type RestoreMode,
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
  restoreEntries,
  handleRequest,
} from "../../src/browser/library.js";

function entry(
  arg: string | (Partial<SavedTab> & { url: string }),
  maybeUrl?: string,
): SavedTab {
  if (typeof arg === "string") {
    return {
      schemaVersion: SCHEMA_VERSION,
      id: arg,
      url: maybeUrl ?? `https://${arg}.test/`,
      title: arg,
      favicon: null,
      savedAt: 1,
      source: { windowId: 1, index: 0, pinned: false },
      group: "",
      tags: [],
      status: "saved",
    };
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    id: arg.id ?? "id1",
    url: arg.url,
    title: arg.title ?? "T",
    favicon: arg.favicon ?? null,
    savedAt: arg.savedAt ?? 1,
    source: arg.source ?? { windowId: 1, index: 0, pinned: false },
    group: arg.group ?? "",
    tags: arg.tags ?? [],
    status: "saved",
  };
}

const ready = (entries: SavedTab[] = []): Database => ({
  ...createEmptyDatabase(),
  entries,
  settings: {
    ...createEmptyDatabase().settings,
    onboardingComplete: true,
    unsavedHintAcknowledged: true,
  },
});

const tab = (id: number, url: string) => ({
  id,
  url,
  title: String(id),
  windowId: 1,
  index: id - 1,
  pinned: false,
  active: id === 1,
  audible: false,
});

function mock(
  initial: Array<{
    id: number;
    url: string;
    title?: string;
    windowId?: number;
    index?: number;
    pinned?: boolean;
    active?: boolean;
    audible?: boolean;
  }> = [],
) {
  let tabs = structuredClone(initial);
  const created: Array<{
    id: number;
    url?: string;
    windowId?: number;
    active?: boolean;
  }> = [];
  const removed: number[] = [];
  const session: Record<string, unknown> = {};
  vi.stubGlobal("chrome", {
    runtime: {
      id: "test",
      getURL: (p: string) => `chrome-extension://test/${p}`,
    },
    tabs: {
      get: vi.fn(async (id: number) => {
        const t = tabs.find((x) => x.id === id);
        if (!t) throw new Error("Missing tab");
        return structuredClone(t);
      }),
      query: vi.fn(async (q: { windowId?: number; active?: boolean }) =>
        structuredClone(
          tabs.filter(
            (t) =>
              (q.windowId == null || t.windowId === q.windowId) &&
              (!q.active || t.active),
          ),
        ),
      ),
      create: vi.fn(
        async (opts: { url?: string; windowId?: number; active?: boolean }) => {
          const t = {
            id: 100 + created.length,
            url: opts.url ?? "",
            ...opts,
          };
          created.push(t);
          tabs.push(t);
          return t;
        },
      ),
      remove: vi.fn(async (ids: number | number[]) => {
        const arr = Array.isArray(ids) ? ids : [ids];
        removed.push(...arr);
        tabs = tabs.filter((t) => !arr.includes(t.id));
      }),
    },
    storage: {
      session: {
        set: vi.fn(async (x: Record<string, unknown>) =>
          Object.assign(session, structuredClone(x)),
        ),
        get: vi.fn(async () => structuredClone(session)),
        remove: vi.fn(async (key: string | string[]) => {
          for (const k of Array.isArray(key) ? key : [key]) delete session[k];
        }),
      },
    },
    action: {
      setBadgeText: vi.fn(async () => {}),
      setBadgeBackgroundColor: vi.fn(async () => {}),
      setIcon: vi.fn(async () => {}),
    },
  });
  return {
    created,
    removed,
    session,
    tabs: () => tabs,
    patch: (
      id: number,
      p: Partial<{
        id: number;
        url: string;
        title?: string;
        windowId?: number;
        index?: number;
        pinned?: boolean;
        active?: boolean;
        audible?: boolean;
      }>,
    ) => {
      const t = tabs.find((x) => x.id === id);
      if (t) Object.assign(t, p);
    },
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
    ).toBe(false);
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
    const once = importJsonText(text, db.entries);
    expect(once.summary.skippedDuplicates).toBe(1);
    expect(once.summary.added).toBe(0);
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
    expect(result.entries[0]?.title).toBe("Alpha Site");
  });

  it("rejects invalid json without changing entries", () => {
    const existing = [entry({ url: "https://keep.test" })];
    const result = importJsonText("{nope", existing);
    expect(result.entries).toEqual(existing);
    expect(result.summary.added).toBe(0);
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
    const written = await store.exclusive(async (token) => {
      const db = await store.readDatabaseUnlocked();
      await store.createBackup("before-import", db, token);
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
  it("demo data is real local-shaped entries with valid URLs and structure", () => {
    const demo = createDemoEntries(1_700_000_000_000);
    expect(demo.length).toBeGreaterThanOrEqual(3);
    for (const d of demo) {
      expect(d.url.startsWith("https://")).toBe(true);
      expect(new URL(d.url).protocol).toBe("https:");
      expect(d.title.length).toBeGreaterThan(0);
      expect(d.status).toBe("saved");
      expect(d.schemaVersion).toBe(SCHEMA_VERSION);
      expect(typeof d.savedAt).toBe("number");
      expect(d.source.windowId).toBe(-1);
    }
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

describe("Round 2 formal regressions (R201–R208)", () => {
  it("R201: serializes delayed external calls so no closed tab is lost", async () => {
    let paused = false;
    let resolveRelease: () => void = () => undefined;
    const releasePromise = new Promise<void>((r) => {
      resolveRelease = r;
    });
    let resolveEntered: () => void = () => undefined;
    const enteredPromise = new Promise<void>((r) => {
      resolveEntered = r;
    });

    const base = memoryDriver({
      tabfold_database: {
        ...createEmptyDatabase(),
        settings: {
          ...createEmptyDatabase().settings,
          onboardingComplete: true,
          unsavedHintAcknowledged: true,
        },
      },
    });

    const driver = {
      ...base,
      set: async (items: Record<string, unknown>) => {
        const db = items.tabfold_database as {
          entries?: Array<{ url: string }>;
        };
        if (!paused && db?.entries?.[0]?.url === "https://a.test") {
          paused = true;
          resolveEntered();
          await releasePromise;
        }
        return base.set(items);
      },
    };

    const store = new LibraryStore(driver);
    setStoreForTests(store);

    let tabs = [
      {
        id: 1,
        url: "https://a.test",
        title: "A",
        windowId: 1,
        index: 0,
        pinned: false,
        active: true,
      },
      {
        id: 2,
        url: "https://b.test",
        title: "B",
        windowId: 1,
        index: 1,
        pinned: false,
        active: false,
      },
      {
        id: 3,
        url: "chrome://settings",
        title: "Settings",
        windowId: 1,
        index: 2,
        pinned: false,
        active: false,
      },
    ];
    const removed: number[] = [];

    vi.stubGlobal("chrome", {
      runtime: {
        id: "test",
        getURL: (p: string) => `chrome-extension://test/${p}`,
      },
      tabs: {
        get: vi.fn(async (id: number) => {
          const t = tabs.find((x) => x.id === id);
          if (!t) throw new Error("Missing tab");
          return structuredClone(t);
        }),
        query: vi.fn(async (q: { windowId?: number; active?: boolean }) =>
          structuredClone(
            tabs.filter(
              (t) =>
                (q.windowId == null || t.windowId === q.windowId) &&
                (!q.active || t.active),
            ),
          ),
        ),
        remove: vi.fn(async (ids: number[]) => {
          removed.push(...ids);
          tabs = tabs.filter((t) => !ids.includes(t.id));
        }),
      },
      storage: {
        session: {
          get: vi.fn(async () => ({})),
          set: vi.fn(async () => undefined),
          remove: vi.fn(async () => undefined),
        },
      },
      action: {
        setBadgeText: vi.fn(async () => undefined),
        setBadgeBackgroundColor: vi.fn(async () => undefined),
        setIcon: vi.fn(async () => undefined),
      },
    });

    const aPromise = saveTabs({
      scope: "current",
      tabId: 1,
      confirmedUnsaved: true,
    });
    await enteredPromise;
    const bPromise = saveTabs({
      scope: "current",
      tabId: 2,
      confirmedUnsaved: true,
    });

    await new Promise((r) => setTimeout(r, 10));
    resolveRelease();

    const [resA, resB] = await Promise.all([aPromise, bPromise]);
    expect(resA.saved).toBe(1);
    expect(resB.saved).toBe(1);
    expect(removed).toEqual([1, 2]);

    const finalDb = await store.readDatabase();
    expect(finalDb.entries).toHaveLength(2);
    expect(finalDb.entries.map((e) => e.url).sort()).toEqual([
      "https://a.test",
      "https://b.test",
    ]);

    setStoreForTests(null);
    vi.unstubAllGlobals();
  });

  it("R202: isValidScope strictly validates scope and empty save returns error", async () => {
    expect(isValidScope("current")).toBe(true);
    expect(isValidScope("others")).toBe(true);
    expect(isValidScope("window")).toBe(true);
    expect(isValidScope("")).toBe(false);
    expect(isValidScope("invalid")).toBe(false);
    expect(isValidScope(null)).toBe(false);
    expect(isValidScope(undefined)).toBe(false);

    const store = new LibraryStore(
      memoryDriver({ tabfold_database: createEmptyDatabase() }),
    );
    setStoreForTests(store);
    const res = await saveTabs({ scope: "" as unknown as SaveScope });
    expect(res.saved).toBe(0);
    expect(res.message).toBe("Invalid save scope.");
    setStoreForTests(null);
  });

  it("R203: JSON import renumbers duplicate IDs and partial restore failure preserves failed URLs", async () => {
    const payload = JSON.stringify({
      format: "tabfold-json",
      schemaVersion: 2,
      entries: [
        entry({ id: "same", url: "https://ok.test" }),
        entry({ id: "same", url: "https://fail.test" }),
      ],
    });
    const imported = importJsonText(payload, []);
    expect(imported.summary.added).toBe(2);
    expect(imported.entries[0]?.id).not.toBe(imported.entries[1]?.id);

    const store = new LibraryStore(
      memoryDriver({
        tabfold_database: {
          ...createEmptyDatabase(),
          entries: imported.entries,
        },
      }),
    );
    setStoreForTests(store);

    vi.stubGlobal("chrome", {
      tabs: {
        create: vi.fn(async (opts: { url?: string }) => {
          if (opts.url === "https://fail.test")
            throw new Error("Injected open failure");
          return { id: 101, ...opts };
        }),
      },
      action: {
        setBadgeText: vi.fn(async () => undefined),
        setBadgeBackgroundColor: vi.fn(async () => undefined),
        setIcon: vi.fn(async () => undefined),
      },
    });

    const res = await restoreEntries(imported.entries.map((e) => e.id));
    expect(res.opened).toBe(1);
    expect(res.failed).toBe(1);
    const remaining = (await store.readDatabase()).entries;
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.url).toBe("https://fail.test");

    setStoreForTests(null);
    vi.unstubAllGlobals();
  });

  it("R204: corrupt raw is preserved in salvage and exportRaw across backup restoration", async () => {
    const damaged = {
      schemaVersion: 2,
      entries: null,
      recoveryNote: "salvage-data-proof",
    };
    const validDb = {
      ...createEmptyDatabase(),
      entries: [entry({ id: "bak1", url: "https://bak.test" })],
    };
    const store = new LibraryStore(
      memoryDriver({
        tabfold_database: damaged,
        tabfold_backups: [
          { id: "bak-id", createdAt: 1, reason: "test", database: validDb },
        ],
      }),
    );

    await store.restoreBackup("bak-id");
    const exported = await store.exportRaw();
    expect(exported).toContain("salvage-data-proof");
    expect(exported).toContain("https://bak.test");
  });

  it("R205: migration write-back CAS persists schema 2 and id across reads", async () => {
    const raw = {
      schemaVersion: 1,
      tabs: [{ url: "https://legacy.test", title: "Old" }],
    };
    const base = memoryDriver({ tabfold_database: raw });
    const store = new LibraryStore(base);

    const firstRead = await store.readDatabase();
    const storedRaw = (await base.get(["tabfold_database"]))
      .tabfold_database as { schemaVersion?: number };
    expect(storedRaw.schemaVersion).toBe(2);

    const secondRead = await store.readDatabase();
    expect(secondRead.entries[0]?.id).toBe(firstRead.entries[0]?.id);
    expect(secondRead.entries[0]?.url).toBe("https://legacy.test");
  });

  it("R206: databaseContentMatches detects changes in settings, stats, and undo", () => {
    const db = createEmptyDatabase();
    const withDiffSettings = {
      ...db,
      settings: { ...db.settings, theme: "dark" as const },
    };
    expect(databaseContentMatches(db, withDiffSettings)).toBe(false);

    const withDiffStats = {
      ...db,
      stats: { ...db.stats, totalSaved: 10 },
    };
    expect(databaseContentMatches(db, withDiffStats)).toBe(false);

    const withDiffUndo = {
      ...db,
      undo: { ids: ["x"], expiresAt: Date.now() + 5000 },
    };
    expect(databaseContentMatches(db, withDiffUndo)).toBe(false);
  });

  it("R207: distinct paths with trailing slashes are preserved on dedupe", () => {
    expect(urlsEqual("https://site.test/page", "https://site.test/page/")).toBe(
      false,
    );
    const imported = importPlainTextList(
      "https://site.test/page\nhttps://site.test/page/",
      [],
    );
    expect(imported.summary.added).toBe(2);
  });

  it("R208: audio confirm requires token binding and boolean cannot bypass", async () => {
    const store = new LibraryStore(
      memoryDriver({
        tabfold_database: {
          ...createEmptyDatabase(),
          settings: {
            ...createEmptyDatabase().settings,
            onboardingComplete: true,
            unsavedHintAcknowledged: true,
          },
        },
      }),
    );
    setStoreForTests(store);

    vi.stubGlobal("chrome", {
      runtime: {
        id: "test",
        getURL: (p: string) => `chrome-extension://test/${p}`,
      },
      tabs: {
        get: vi.fn(async () => ({
          id: 1,
          url: "https://audio.test",
          title: "Audio",
          windowId: 1,
          index: 0,
          pinned: false,
          active: true,
          audible: true,
        })),
        query: vi.fn(async () => [
          {
            id: 1,
            url: "https://audio.test",
            title: "Audio",
            windowId: 1,
            index: 0,
            pinned: false,
            active: true,
            audible: true,
          },
        ]),
        remove: vi.fn(async () => undefined),
      },
      storage: {
        session: {
          get: vi.fn(async () => ({})),
          set: vi.fn(async () => undefined),
          remove: vi.fn(async () => undefined),
        },
      },
      action: {
        setBadgeText: vi.fn(async () => undefined),
        setBadgeBackgroundColor: vi.fn(async () => undefined),
        setIcon: vi.fn(async () => undefined),
      },
    });

    const bypassResult = await saveTabs({
      scope: "current",
      tabId: 1,
      confirmedAudio: true,
      confirmedUnsaved: true,
    });
    expect(bypassResult.saved).toBe(0);
    expect(bypassResult.needsConfirmation).toHaveLength(1);
    expect(bypassResult.confirmToken).toBeTruthy();

    setStoreForTests(null);
    vi.unstubAllGlobals();
  });
});

describe("Round 3 formal data-layer & runtime regressions (R301–R308)", () => {
  it("R301: runtime empty or invalid scope is rejected without mutation", async () => {
    const store = new LibraryStore(
      memoryDriver({ tabfold_database: createEmptyDatabase() }),
    );
    setStoreForTests(store);
    const res = await handleRequest({
      type: "save",
      scope: "" as unknown as SaveScope,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe("Invalid save scope.");
    }
    const db = await store.readDatabase();
    expect(db.entries).toHaveLength(0);
    setStoreForTests(null);
  });

  it("R302: strict schema rejects malformed status, missing title, and invalid types", () => {
    expect(() =>
      migrateDatabase(
        {
          schemaVersion: 2,
          entries: [
            {
              ...entry({ url: "https://a.test" }),
              status: "restored" as unknown as "saved",
            },
          ],
          settings: createEmptyDatabase().settings,
          stats: createEmptyDatabase().stats,
        },
        { strictCurrent: true },
      ),
    ).toThrow(CorruptDatabaseError);

    expect(() =>
      migrateDatabase(
        {
          schemaVersion: 2,
          entries: [
            {
              ...entry({ url: "https://a.test" }),
              title: 123 as unknown as string,
            },
          ],
          settings: createEmptyDatabase().settings,
          stats: createEmptyDatabase().stats,
        },
        { strictCurrent: true },
      ),
    ).toThrow(CorruptDatabaseError);

    expect(() =>
      migrateDatabase(
        {
          schemaVersion: 2,
          entries: [
            {
              ...entry({ url: "https://a.test" }),
              favicon: 123 as unknown as string,
            },
          ],
          settings: createEmptyDatabase().settings,
          stats: createEmptyDatabase().stats,
        },
        { strictCurrent: true },
      ),
    ).toThrow(CorruptDatabaseError);

    expect(() =>
      migrateDatabase(
        {
          schemaVersion: 2,
          entries: [
            {
              ...entry({ url: "https://a.test" }),
              source: {
                windowId: 1,
                index: "0" as unknown as number,
                pinned: false,
              },
            },
          ],
          settings: createEmptyDatabase().settings,
          stats: createEmptyDatabase().stats,
        },
        { strictCurrent: true },
      ),
    ).toThrow(CorruptDatabaseError);
  });

  it("R303: unsaved acknowledgement requires valid confirmToken binding", async () => {
    const store = new LibraryStore(
      memoryDriver({ tabfold_database: createEmptyDatabase() }),
    );
    setStoreForTests(store);

    vi.stubGlobal("chrome", {
      runtime: {
        id: "test",
        getURL: (p: string) => `chrome-extension://test/${p}`,
      },
      tabs: {
        get: vi.fn(async () => ({
          id: 1,
          url: "https://form.test",
          title: "Form",
          windowId: 1,
          index: 0,
          pinned: false,
          active: true,
        })),
        query: vi.fn(async () => [
          {
            id: 1,
            url: "https://form.test",
            title: "Form",
            windowId: 1,
            index: 0,
            pinned: false,
            active: true,
          },
        ]),
        remove: vi.fn(async () => undefined),
      },
      storage: {
        session: {
          get: vi.fn(async () => ({})),
          set: vi.fn(async () => undefined),
          remove: vi.fn(async () => undefined),
        },
      },
      action: {
        setBadgeText: vi.fn(async () => undefined),
        setBadgeBackgroundColor: vi.fn(async () => undefined),
        setIcon: vi.fn(async () => undefined),
      },
    });

    const res = await saveTabs({
      scope: "current",
      tabId: 1,
      confirmedUnsaved: true,
    });
    expect(res.saved).toBe(0);
    expect(res.needsUnsavedAck).toBe(true);
    expect(res.confirmToken).toBeTruthy();

    setStoreForTests(null);
    vi.unstubAllGlobals();
  });

  it("R304: stats write failure reports a visible warning instead of silent success", async () => {
    const readyDb = {
      ...createEmptyDatabase(),
      settings: {
        ...createEmptyDatabase().settings,
        onboardingComplete: true,
        unsavedHintAcknowledged: true,
      },
    };
    const base = memoryDriver({ tabfold_database: readyDb });
    const driver = {
      ...base,
      set: async (items: Record<string, unknown>) => {
        const candidateDb = items.tabfold_database as
          { stats?: { totalClosed?: number } } | undefined;
        if ((candidateDb?.stats?.totalClosed ?? 0) > 0) {
          throw new Error("Injected close accounting persist failure");
        }
        return base.set(items);
      },
    };

    const store = new LibraryStore(driver);
    setStoreForTests(store);

    vi.stubGlobal("chrome", {
      runtime: {
        id: "test",
        getURL: (p: string) => `chrome-extension://test/${p}`,
      },
      tabs: {
        get: vi.fn(async () => ({
          id: 1,
          url: "https://closed.test",
          title: "Closed",
          windowId: 1,
          index: 0,
          pinned: false,
          active: true,
        })),
        query: vi.fn(async () => [
          {
            id: 1,
            url: "https://closed.test",
            title: "Closed",
            windowId: 1,
            index: 0,
            pinned: false,
            active: true,
          },
          {
            id: 2,
            url: "chrome://settings",
            title: "Settings",
            windowId: 1,
            index: 1,
            pinned: false,
            active: false,
          },
        ]),
        remove: vi.fn(async () => undefined),
        create: vi.fn(async (opts) => ({ id: 100, ...opts })),
      },
      storage: {
        session: {
          get: vi.fn(async () => ({})),
          set: vi.fn(async () => undefined),
          remove: vi.fn(async () => undefined),
        },
      },
      action: {
        setBadgeText: vi.fn(async () => undefined),
        setBadgeBackgroundColor: vi.fn(async () => undefined),
        setIcon: vi.fn(async () => undefined),
      },
    });

    const saveRes = await saveTabs({ scope: "current", tabId: 1 });
    expect(saveRes.saved).toBe(1);
    expect(saveRes.closed).toBe(1);
    expect(saveRes.message).toContain("Warning: stats could not be updated");

    setStoreForTests(null);
    vi.unstubAllGlobals();
  });

  it("R305: backup restore preserves existing corrupted raw salvage across restores", async () => {
    const damaged = {
      schemaVersion: 2,
      entries: null,
      uniqueRaw: "must remain salvage",
    };
    const backupDb = createEmptyDatabase();
    const base = memoryDriver({
      tabfold_database: damaged,
      tabfold_backups: [
        { id: "backup", createdAt: 1, reason: "test", database: backupDb },
      ],
    });
    const store = new LibraryStore(base);

    await store.restoreBackup("backup");
    const first = await store.exportRaw();
    expect(first).toContain("must remain salvage");

    await store.restoreBackup("backup");
    const second = await store.exportRaw();
    expect(second).toContain("must remain salvage");
  });

  it("R307: runtime allowlist rejects unknown settings keys and out-of-range batch size", async () => {
    const store = new LibraryStore(
      memoryDriver({ tabfold_database: createEmptyDatabase() }),
    );
    setStoreForTests(store);

    const unknownKeyRes = await handleRequest({
      type: "patch-settings",
      patch: { arbitraryKey: "hack" } as unknown as Partial<Settings>,
    });
    expect(unknownKeyRes.ok).toBe(false);
    if (!unknownKeyRes.ok) {
      expect(unknownKeyRes.error).toContain("Unknown settings key");
    }

    const badBatchRes = await handleRequest({
      type: "patch-settings",
      patch: { restoreBatchSize: 9999 } as unknown as Partial<Settings>,
    });
    expect(badBatchRes.ok).toBe(false);
    if (!badBatchRes.ok) {
      expect(badBatchRes.error).toContain(
        "restoreBatchSize must be a number between 1 and 500",
      );
    }

    setStoreForTests(null);
  });
});

describe("Round 4 formal regressions (R401–R408)", () => {
  it("R401: constructor entry id opens its URL before removal in restore", async () => {
    const base = memoryDriver({
      tabfold_database: ready([entry("constructor", "https://valuable.test/")]),
    });
    setStoreForTests(new LibraryStore(base));
    const b = mock();
    const response = await restoreEntries(["constructor"]);
    const raw = (await base.get(["tabfold_database"]))
      .tabfold_database as Database;
    expect(b.created).toHaveLength(1);
    expect(b.created[0]?.url).toBe("https://valuable.test/");
    expect(raw.entries).toHaveLength(0);
    expect(response.opened).toBe(1);
    setStoreForTests(null);
  });

  it("R401: __proto__ entry id opens its URL before Undo removes it", async () => {
    const db = ready([entry("__proto__", "https://undo-valuable.test/")]);
    db.undo = { ids: ["__proto__"], expiresAt: Date.now() + 10000 };
    const base = memoryDriver({ tabfold_database: db });
    setStoreForTests(new LibraryStore(base));
    const b = mock();
    const response = await undoLastSave();
    const raw = (await base.get(["tabfold_database"]))
      .tabfold_database as Database;
    expect(b.created).toHaveLength(1);
    expect(b.created[0]?.url).toBe("https://undo-valuable.test/");
    expect(raw.entries).toHaveLength(0);
    expect(response.ok).toBe(true);
    setStoreForTests(null);
  });

  it("R402: malformed persisted metadata does not pass read-back or close source tab", async () => {
    const base = memoryDriver({ tabfold_database: ready() });
    const driver = {
      ...base,
      set: async (items: Record<string, unknown>) => {
        const copy = structuredClone(items) as Record<string, unknown>;
        const db = copy.tabfold_database as Record<string, unknown> | undefined;
        if (db && Array.isArray(db.entries) && db.entries.length) {
          (db.stats as Record<string, unknown>).totalSaved = "1";
          (db.stats as Record<string, unknown>).totalClosed = String(
            (db.stats as Record<string, unknown>).totalClosed,
          );
          (db.settings as Record<string, unknown>).theme = "INVALID";
          if (db.undo) (db.undo as { ids: unknown[] }).ids.push(123);
          delete (db.entries[0] as Record<string, unknown>).group;
          delete (db.entries[0] as Record<string, unknown>).tags;
        }
        return base.set(copy);
      },
    };
    setStoreForTests(new LibraryStore(driver));
    const b = mock([
      tab(1, "https://source.test/"),
      tab(2, "chrome://settings"),
    ]);
    const response = await saveTabs({ scope: "current", tabId: 1 });
    expect(b.removed).toHaveLength(0);
    expect(response.closed).toBe(0);
    setStoreForTests(null);
  });

  it("R403: unsaved acknowledgement alone does not authorize audio tab that becomes audible before close", async () => {
    setStoreForTests(
      new LibraryStore(
        memoryDriver({ tabfold_database: createEmptyDatabase() }),
      ),
    );
    const b = mock([
      tab(1, "https://starts-audio.test/"),
      tab(2, "chrome://settings"),
    ]);
    const original = chrome.tabs.get;
    let reads = 0;
    chrome.tabs.get = vi.fn(async (id: number) => {
      const t = await original(id);
      if (id === 1 && ++reads >= 3) t.audible = true;
      return t;
    });
    const initial = await saveTabs({ scope: "current", tabId: 1 });
    const response = await saveTabs({
      scope: "current",
      ...(initial.confirmToken ? { confirmToken: initial.confirmToken } : {}),
      confirmedUnsaved: true,
    });
    expect(b.removed).toHaveLength(0);
    expect(response.closed).toBe(0);
    setStoreForTests(null);
  });

  it("R404: save read-back failure leaves unclosed tab out of undo", async () => {
    const base = memoryDriver({ tabfold_database: ready() });
    let failNext = false;
    let readFailureUsed = false;
    const driver = {
      ...base,
      set: async (x: Record<string, unknown>) => {
        await base.set(x);
        const db = x.tabfold_database as Database | undefined;
        if (!readFailureUsed && db?.entries?.length) failNext = true;
      },
      get: async (keys: string[]) => {
        if (failNext) {
          failNext = false;
          readFailureUsed = true;
          throw new Error("One read-back failure");
        }
        return base.get(keys);
      },
    };
    setStoreForTests(new LibraryStore(driver));
    const b = mock([
      tab(1, "https://original.test/"),
      tab(2, "chrome://settings"),
    ]);
    await saveTabs({ scope: "current", tabId: 1 });
    const persisted = (await base.get(["tabfold_database"]))
      .tabfold_database as Database;
    const undo = await undoLastSave();
    expect(b.created).toHaveLength(0);
    expect(b.tabs().some((t) => t.id === 1)).toBe(true);
    expect(persisted.undo).toBeNull();
    expect(undo.ok).toBe(false);
    setStoreForTests(null);
  });

  it("R404: partial-close Undo opens only the source actually closed", async () => {
    const base = memoryDriver({ tabfold_database: ready() });
    let fail = true;
    const driver = {
      ...base,
      set: async (x: Record<string, unknown>) => {
        const db = x.tabfold_database as Database | undefined;
        if (fail && db && db.stats && db.stats.totalClosed > 0)
          throw new Error("Postclose write failed");
        return base.set(x);
      },
    };
    setStoreForTests(new LibraryStore(driver));
    const b = mock([
      tab(1, "https://first.test/"),
      tab(2, "https://second.test/"),
      tab(3, "chrome://settings"),
    ]);
    const remove = chrome.tabs.remove;
    chrome.tabs.remove = vi.fn(async (ids: number | number[]) => {
      const arr = Array.isArray(ids) ? ids : [ids];
      await remove([arr[0]!]);
      throw new Error("Partial remove failure");
    }) as unknown as typeof chrome.tabs.remove;
    await saveTabs({ scope: "window", tabId: 1 });
    fail = false;
    const undo = await undoLastSave();
    expect(b.created).toHaveLength(1);
    expect(b.created[0]?.url).toBe("https://first.test/");
    expect(b.tabs().some((t) => t.id === 2)).toBe(true);
    expect(undo.ok).toBe(true);
    setStoreForTests(null);
  });

  it("R405: backup restore read failure after write preserves exact original database", async () => {
    const original = ready([entry("original")]);
    const backup = ready([entry("backup")]);
    const base = memoryDriver({
      tabfold_database: original,
      tabfold_backups: [
        { id: "backup", createdAt: 1, reason: "test", database: backup },
      ],
    });
    let rejectNextGet = false;
    const driver = {
      ...base,
      set: async (items: Record<string, unknown>) => {
        await base.set(items);
        const db = items.tabfold_database as Database | undefined;
        if (db?.entries?.[0]?.id === "backup") rejectNextGet = true;
      },
      get: async (keys: string[]) => {
        if (rejectNextGet) {
          rejectNextGet = false;
          throw new Error("Injected one read failure after restore write");
        }
        return base.get(keys);
      },
    };
    let error: string | null = null;
    try {
      await new LibraryStore(driver).restoreBackup("backup");
    } catch (e) {
      error = String(e);
    }
    const raw = (await base.get(["tabfold_database"])).tabfold_database;
    expect(error).toContain("Injected one read failure after restore write");
    expect(JSON.stringify(raw)).toBe(JSON.stringify(original));
  });

  it("R406: both distinct damaged payloads remain exportable in salvage", async () => {
    const damagedA = {
      schemaVersion: 2,
      entries: null,
      uniqueRaw: "ONLY-A",
    };
    const damagedB = {
      schemaVersion: 2,
      entries: null,
      uniqueRaw: "ONLY-B",
    };
    const base = memoryDriver({
      tabfold_database: damagedA,
      tabfold_backups: [
        { id: "backup", createdAt: 1, reason: "test", database: ready() },
      ],
    });
    const store = new LibraryStore(base);
    await store.restoreBackup("backup");
    await base.set({ tabfold_database: damagedB });
    await store.restoreBackup("backup");
    const raw = await store.exportRaw();
    expect(raw).toContain("ONLY-A");
    expect(raw).toContain("ONLY-B");
  });

  it("R407: rejected journal persistence and DB writes do not cause duplicate opens on retry", async () => {
    const base = memoryDriver({ tabfold_database: ready([entry("retry")]) });
    let fail = true;
    const driver = {
      ...base,
      set: async (x: Record<string, unknown>) => {
        if (fail && x.tabfold_database) throw new Error("DB unavailable");
        return base.set(x);
      },
    };
    setStoreForTests(new LibraryStore(driver));
    const b = mock();
    chrome.storage.session.set = vi.fn(async () => {
      throw new Error("Session unavailable");
    });
    await restoreEntries(["retry"]);
    fail = false;
    await restoreEntries(["retry"]);
    expect(b.created.length).toBe(1);
    setStoreForTests(null);
  });

  it("R407: stale journal reopens missing tab instead of losing URL", async () => {
    const base = memoryDriver({ tabfold_database: ready([entry("retry")]) });
    let fail = true;
    const driver = {
      ...base,
      set: async (x: Record<string, unknown>) => {
        if (fail && x.tabfold_database) throw new Error("DB unavailable");
        return base.set(x);
      },
    };
    setStoreForTests(new LibraryStore(driver));
    const b = mock();
    await restoreEntries(["retry"]);
    expect(b.created[0]).toBeDefined();
    await chrome.tabs.remove([b.created[0]!.id]);
    fail = false;
    await restoreEntries(["retry"]);
    const raw = (await base.get(["tabfold_database"]))
      .tabfold_database as Database;
    const dataLost = b.tabs().length === 0 && raw.entries.length === 0;
    expect(dataLost).toBe(false);
    expect(b.tabs().length).toBe(1);
    setStoreForTests(null);
  });

  it("R408: malformed edit input is rejected before changing persisted database", async () => {
    const original = ready([entry("edited")]);
    const base = memoryDriver({ tabfold_database: original });
    setStoreForTests(new LibraryStore(base));
    mock();
    const response = await handleRequest({
      type: "edit-entry",
      id: "edited",
      group: { bad: "object" } as unknown as string,
      tags: [],
    });
    const raw = (await base.get(["tabfold_database"]))
      .tabfold_database as Database;
    const state = await handleRequest({ type: "get-state" });
    expect(response.ok).toBe(false);
    expect(JSON.stringify(raw)).toBe(JSON.stringify(original));
    if (state.ok && state.data && typeof state.data === "object") {
      expect((state.data as { corrupt?: boolean }).corrupt).toBe(false);
    } else {
      expect.unreachable();
    }
    setStoreForTests(null);
  });

  it("R408: unknown restore mode is rejected before opening or deleting any entries", async () => {
    const rows = Array.from({ length: 16 }, (_, i) => entry("e" + i));
    const base = memoryDriver({ tabfold_database: ready(rows) });
    setStoreForTests(new LibraryStore(base));
    const b = mock();
    const response = await handleRequest({
      type: "restore",
      ids: rows.map((x) => x.id),
      mode: "invalid-mode" as unknown as RestoreMode,
    });
    const raw = (await base.get(["tabfold_database"]))
      .tabfold_database as Database;
    expect(response.ok).toBe(false);
    expect(b.created).toHaveLength(0);
    expect(raw.entries).toHaveLength(16);
    setStoreForTests(null);
  });
});

describe("Round 5 formal regressions (R501–R510)", () => {
  it("R506: write-time strictCurrent rejects missing undo without closing source tab", async () => {
    const base = memoryDriver({ tabfold_database: ready([]) });
    const driver = {
      ...base,
      set: async (items: Record<string, unknown>) => {
        const x = structuredClone(items);
        const db = x.tabfold_database as
          | {
              entries?: unknown[];
              stats?: unknown;
              settings?: { theme?: unknown };
            }
          | undefined;
        if (db?.entries?.length) {
          delete db.stats;
          if (db.settings) delete db.settings.theme;
        }
        await base.set(x);
      },
    };
    setStoreForTests(new LibraryStore(driver));
    const b = mock([
      {
        id: 1,
        url: "https://missing-metadata.test/",
        title: "Tab 1",
        windowId: 1,
        index: 0,
        pinned: false,
        active: true,
        audible: false,
      },
      {
        id: 2,
        url: "chrome://settings",
        title: "Settings",
        windowId: 1,
        index: 1,
        pinned: false,
        active: false,
        audible: false,
      },
    ]);
    const res = await saveTabs({
      scope: "current",
      tabId: 1,
      confirmedUnsaved: true,
      confirmedAudio: true,
    });
    expect(res.closed).toBe(0);
    expect(b.removed.length).toBe(0);
    setStoreForTests(null);
  });

  it("R509: migrateV1Entries renumbers duplicate suffixes to avoid collision", () => {
    const v1 = {
      schemaVersion: 1,
      tabs: [
        { url: "https://first.test/", title: "First", id: "dup" },
        { url: "https://second.test/", title: "Second", id: "dup" },
        { url: "https://third.test/", title: "Third", id: "dup_v1dup_2" },
      ],
    };
    const migrated = migrateDatabase(v1).database;
    const ids = migrated.entries.map((e) => e.id);
    expect(new Set(ids).size).toBe(3);
  });

  it("R510: saveTabs protects moved target window from losing sole tab", async () => {
    const base = memoryDriver({ tabfold_database: ready([]) });
    const b = mock([
      {
        id: 1,
        url: "https://moved.test/",
        title: "Moved",
        windowId: 1,
        index: 0,
        pinned: false,
        active: true,
        audible: false,
      },
      {
        id: 2,
        url: "chrome://settings",
        title: "Settings",
        windowId: 1,
        index: 1,
        pinned: false,
        active: false,
        audible: false,
      },
    ]);
    let reads = 0;
    const get = chrome.tabs.get;
    chrome.tabs.get = vi.fn(async (id: number) => {
      if (id === 1 && ++reads === 2) {
        b.patch(id, { windowId: 2, index: 0 });
      }
      return get(id);
    });
    setStoreForTests(new LibraryStore(base));
    const saved = await saveTabs({ scope: "current", tabId: 1 });
    const newWindowPreserved = b.tabs().some((t) => t.windowId === 2);
    expect(saved.closed === 0 || newWindowPreserved).toBe(true);
    setStoreForTests(null);
  });
});
