import { describe, expect, it } from "vitest";
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
import { migrateDatabase, MigrationError } from "../../src/core/migrate.js";
import {
  exportJsonString,
  importJsonText,
  importPlainTextList,
} from "../../src/core/import-export.js";
import { verifyEntriesPresent } from "../../src/core/verify.js";
import {
  createEmptyDatabase,
  SCHEMA_VERSION,
  type SavedTab,
} from "../../src/types.js";
import { LibraryStore, memoryDriver } from "../../src/browser/storage.js";
import { createDemoEntries } from "../../src/core/demo.js";
import { urlsEqual, normalizeUrl } from "../../src/core/id.js";

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
  it("detects internal pages", () => {
    expect(isInternalUrl("chrome://settings")).toBe(true);
    expect(isSavableUrl("chrome://settings")).toBe(false);
    expect(isSavableUrl("https://example.com")).toBe(true);
  });

  it("dedupes by normalized url", () => {
    const entries = [entry({ url: "https://example.com/path/" })];
    expect(findDuplicate(entries, "https://example.com/path")).toBeTruthy();
    expect(urlsEqual("https://a.com/#x", "https://a.com/")).toBe(true);
    expect(normalizeUrl("https://a.com/#x")).toBe("https://a.com/");
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

describe("migration", () => {
  it("migrates v1 tabs array", () => {
    const db = migrateDatabase({
      schemaVersion: 1,
      tabs: [{ url: "https://example.com", title: "Ex" }],
    });
    expect(db.schemaVersion).toBe(SCHEMA_VERSION);
    expect(db.entries).toHaveLength(1);
    expect(db.entries[0]?.url).toBe("https://example.com");
  });

  it("rejects newer schema without wiping", () => {
    expect(() => migrateDatabase({ schemaVersion: 99, entries: [] })).toThrow(
      MigrationError,
    );
  });

  it("creates empty db from null", () => {
    expect(migrateDatabase(null).entries).toEqual([]);
  });
});

describe("import / export", () => {
  it("round-trips json export/import without duplicates", () => {
    const db = createEmptyDatabase();
    db.entries = [entry({ id: "a", url: "https://one.test", title: "One" })];
    const text = exportJsonString(db);
    const once = importJsonText(text, db.entries);
    expect(once.summary.skippedDuplicates).toBe(1);
    expect(once.summary.added).toBe(0);
    const intoEmpty = importJsonText(text, []);
    expect(intoEmpty.summary.added).toBe(1);
    expect(intoEmpty.entries[0]?.url).toBe("https://one.test");
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

describe("verify + write-then-verify failure", () => {
  it("verifyEntriesPresent detects missing", () => {
    const db = createEmptyDatabase();
    const e = entry({ id: "x", url: "https://x.test" });
    expect(verifyEntriesPresent(db, [e]).ok).toBe(false);
    db.entries = [e];
    expect(verifyEntriesPresent(db, [e]).ok).toBe(true);
  });

  it("simulated write failure leaves store empty (no close path)", async () => {
    const driver = memoryDriver();
    const failing = LibraryStore.failing(driver);
    const db = createEmptyDatabase();
    db.entries = [entry({ url: "https://fail.test" })];
    await expect(failing.writeDatabase(db, 0)).rejects.toThrow(
      /Simulated write failure/,
    );
    const okStore = new LibraryStore(driver);
    const read = await okStore.readDatabase();
    expect(read.entries).toHaveLength(0);
  });

  it("optimistic concurrency rejects stale revision", async () => {
    const store = new LibraryStore(memoryDriver());
    const db = await store.readDatabase();
    await store.writeDatabase(
      { ...db, entries: [entry({ url: "https://a.test" })] },
      0,
    );
    await expect(
      store.writeDatabase(
        { ...db, entries: [entry({ url: "https://b.test" })] },
        0,
      ),
    ).rejects.toThrow(/Concurrent/);
  });

  it("read-back after write matches content", async () => {
    const store = new LibraryStore(memoryDriver());
    const e = entry({ id: "keep", url: "https://keep.test", title: "Keep" });
    const db = createEmptyDatabase();
    const written = await store.writeDatabase({ ...db, entries: [e] }, 0);
    expect(verifyEntriesPresent(written, [e]).ok).toBe(true);
  });
});

describe("memory estimate + demo", () => {
  it("estimates memory and marks formula", () => {
    expect(estimateMemoryFreedMb(10)).toBe(500);
    expect(estimateMemoryFreedMb(0)).toBe(0);
  });

  it("demo data is real local-shaped entries", () => {
    const demo = createDemoEntries(1_700_000_000_000);
    expect(demo.length).toBeGreaterThanOrEqual(3);
    expect(demo.every((d) => d.url.startsWith("http"))).toBe(true);
  });
});
