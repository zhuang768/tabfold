import {
  SCHEMA_VERSION,
  UNDO_TTL_MS,
  BATCH_RESTORE_THRESHOLD,
  type Database,
  type Request,
  type Response,
  type SaveResult,
  type RestoreResult,
  type SaveScope,
  type SavedTab,
  type ImportSummary,
} from "../types.js";
import { STRINGS } from "../strings.js";
import { createId } from "../core/id.js";
import {
  findDuplicate,
  isInternalUrl,
  isSavableUrl,
  isWhitelisted,
} from "../core/tabs-logic.js";
import { selectTabsForScope, type TabLike } from "../core/scope.js";
import {
  exportJsonString,
  importJsonText,
  importPlainTextList,
} from "../core/import-export.js";
import { createDemoEntries } from "../core/demo.js";
import { verifyEntriesPresent } from "../core/verify.js";
import {
  CorruptDataError,
  LibraryStore,
  chromeLocalDriver,
} from "./storage.js";

const store = new LibraryStore(chromeLocalDriver());

let storeOverride: LibraryStore | null = null;
export function setStoreForTests(s: LibraryStore | null): void {
  storeOverride = s;
}
function getStore(): LibraryStore {
  return storeOverride ?? store;
}

async function withRetryWrite(
  mutate: (db: Database) => Database,
  opts?: { backupReason?: string },
): Promise<{ db: Database; meta?: ImportSummary }> {
  const s = getStore();
  let lastErr: unknown;
  let meta: ImportSummary | undefined;
  for (let attempt = 0; attempt < 5; attempt++) {
    const db = await s.readDatabase();
    const rev = db.revision;
    if (opts?.backupReason) {
      const bulk =
        opts.backupReason.includes("clear") ||
        opts.backupReason.includes("import") ||
        opts.backupReason.includes("demo") ||
        opts.backupReason.includes("reset") ||
        db.entries.length >= 20;
      if (bulk) {
        await s.createBackup(opts.backupReason, db);
      }
    }
    const next = mutate(structuredClone(db));
    try {
      const written = await s.writeDatabase(next, rev);
      return meta ? { db: written, meta } : { db: written };
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("Concurrent")) throw e;
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error("Write failed after retries");
}

function tabToEntry(tab: chrome.tabs.Tab, now: number): SavedTab {
  const source: SavedTab["source"] = {
    windowId: tab.windowId,
    index: tab.index,
    pinned: Boolean(tab.pinned),
  };
  if (typeof tab.mutedInfo?.muted === "boolean")
    source.muted = tab.mutedInfo.muted;
  if (typeof tab.audible === "boolean") source.audible = tab.audible;
  return {
    schemaVersion: SCHEMA_VERSION,
    id: createId("t"),
    url: tab.url ?? "",
    title: tab.title || tab.url || "Untitled",
    favicon: tab.favIconUrl ?? null,
    savedAt: now,
    source,
    group: "",
    tags: [],
    status: "saved",
  };
}

export async function updateBadge(count: number): Promise<void> {
  const text =
    count <= 0 ? "" : count > 999 ? STRINGS.badgeOverflow : String(count);
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color: "#2F3437" });
  try {
    await chrome.action.setIcon({
      path:
        count > 0
          ? {
              16: "icons/icon-16-active.png",
              32: "icons/icon-32-active.png",
              48: "icons/icon-48-active.png",
              128: "icons/icon-128-active.png",
            }
          : {
              16: "icons/icon-16.png",
              32: "icons/icon-32.png",
              48: "icons/icon-48.png",
              128: "icons/icon-128.png",
            },
    });
  } catch {
    // Icons may be missing during early boot
  }
}

async function refreshBadgeFromDb(): Promise<void> {
  try {
    const db = await getStore().readDatabase();
    await updateBadge(db.entries.length);
  } catch {
    await updateBadge(0);
  }
}

async function ensureWindowSurvives(
  windowId: number,
  closingIds: number[],
): Promise<void> {
  const tabs = await chrome.tabs.query({ windowId });
  const remaining = tabs.filter(
    (t) => t.id != null && !closingIds.includes(t.id),
  );
  if (remaining.length === 0) {
    await chrome.tabs.create({ windowId, url: "chrome://newtab/" });
  }
}

export async function saveTabs(options: {
  scope: SaveScope;
  tabId?: number;
  confirmedAudio?: boolean;
  confirmedUnsaved?: boolean;
}): Promise<SaveResult> {
  const s = getStore();
  const db = await s.readDatabase();
  const scope = options.scope;

  let anchor: chrome.tabs.Tab | undefined;
  if (options.tabId != null) {
    anchor = await chrome.tabs.get(options.tabId);
  } else {
    const [active] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    anchor = active;
  }
  if (!anchor?.windowId) {
    return {
      saved: 0,
      skipped: [],
      failed: [{ title: "Unknown", url: "", reason: "No active tab" }],
      needsConfirmation: [],
      undoIds: [],
      message: STRINGS.nothingSaved,
    };
  }

  const windowTabs = await chrome.tabs.query({ windowId: anchor.windowId });
  const selected = selectTabsForScope(
    windowTabs as TabLike[],
    scope,
    anchor.id,
  );

  const needsConfirmation: SaveResult["needsConfirmation"] = [];
  const skipped: SaveResult["skipped"] = [];
  const candidates: chrome.tabs.Tab[] = [];

  for (const tab of selected) {
    const url = tab.url ?? "";
    const title = tab.title || url || "Untitled";
    if (tab.id == null) {
      skipped.push({ title, url, reason: "Missing tab id" });
      continue;
    }
    if (isInternalUrl(url) || !isSavableUrl(url)) {
      skipped.push({ title, url, reason: STRINGS.internalPage });
      continue;
    }
    if (tab.pinned) {
      skipped.push({ title, url, reason: STRINGS.pinnedSkip });
      continue;
    }
    if (isWhitelisted(url, db.settings.whitelist)) {
      skipped.push({ title, url, reason: STRINGS.whitelistSkip });
      continue;
    }
    if (findDuplicate(db.entries, url)) {
      skipped.push({ title, url, reason: STRINGS.duplicateUrl });
      continue;
    }
    if (tab.audible && !options.confirmedAudio) {
      needsConfirmation.push({
        tabId: tab.id,
        title,
        url,
        reason: STRINGS.audioConfirm,
      });
      continue;
    }
    candidates.push(tab as chrome.tabs.Tab);
  }

  if (needsConfirmation.length && candidates.length === 0) {
    return {
      saved: 0,
      skipped,
      failed: [],
      needsConfirmation,
      undoIds: [],
      message: STRINGS.audioConfirm,
    };
  }

  if (candidates.length === 0) {
    return {
      saved: 0,
      skipped,
      failed: [],
      needsConfirmation,
      undoIds: [],
      message: skipped[0]?.reason ?? STRINGS.nothingSaved,
    };
  }

  const snapshot = new Map<number, string>();
  for (const t of candidates) {
    if (t.id != null) snapshot.set(t.id, t.url ?? "");
  }

  const now = Date.now();
  const newEntries = candidates.map((t) => tabToEntry(t, now));

  let written: Database;
  try {
    const rev = db.revision;
    const next: Database = {
      ...db,
      entries: [...newEntries, ...db.entries],
      stats: {
        ...db.stats,
        totalSaved: db.stats.totalSaved + newEntries.length,
      },
      undo: { ids: newEntries.map((e) => e.id), expiresAt: now + UNDO_TTL_MS },
    };
    written = await s.writeDatabase(next, rev);
  } catch (e) {
    const reason = e instanceof Error ? e.message : STRINGS.writeFailed;
    return {
      saved: 0,
      skipped,
      failed: candidates.map((t) => ({
        title: t.title || "",
        url: t.url || "",
        reason: STRINGS.writeFailed,
      })),
      needsConfirmation: [],
      undoIds: [],
      message: `${STRINGS.writeFailed} (${reason})`,
    };
  }

  const verify = verifyEntriesPresent(written, newEntries);
  if (!verify.ok) {
    try {
      const rev = written.revision;
      const rolled: Database = {
        ...written,
        entries: written.entries.filter(
          (e) => !newEntries.some((n) => n.id === e.id),
        ),
        stats: {
          ...written.stats,
          totalSaved: Math.max(0, written.stats.totalSaved - newEntries.length),
        },
        undo: null,
      };
      await s.writeDatabase(rolled, rev);
    } catch {
      // Do not close tabs
    }
    return {
      saved: 0,
      skipped,
      failed: newEntries.map((e) => ({
        title: e.title,
        url: e.url,
        reason: STRINGS.verifyFailed,
      })),
      needsConfirmation: [],
      undoIds: [],
      message: STRINGS.verifyFailed,
    };
  }

  const toClose: number[] = [];
  const failed: SaveResult["failed"] = [];
  const entryByTabId = new Map<number, SavedTab>();
  candidates.forEach((t, i) => {
    if (t.id != null) entryByTabId.set(t.id, newEntries[i]!);
  });

  for (const t of candidates) {
    if (t.id == null) continue;
    try {
      const fresh = await chrome.tabs.get(t.id);
      const expected = snapshot.get(t.id);
      if ((fresh.url ?? "") !== expected) {
        failed.push({
          title: t.title || "",
          url: t.url || "",
          reason: STRINGS.urlChanged,
        });
        continue;
      }
      toClose.push(t.id);
    } catch {
      failed.push({
        title: t.title || "",
        url: t.url || "",
        reason: "Tab gone before close",
      });
    }
  }

  const idsToKeep = toClose
    .map((id) => entryByTabId.get(id)?.id)
    .filter((x): x is string => Boolean(x));
  const idsToRevert = newEntries
    .filter((e) => !idsToKeep.includes(e.id))
    .map((e) => e.id);

  if (idsToRevert.length) {
    try {
      const cur = await s.readDatabase();
      await s.writeDatabase(
        {
          ...cur,
          entries: cur.entries.filter((e) => !idsToRevert.includes(e.id)),
          undo: idsToKeep.length
            ? { ids: idsToKeep, expiresAt: now + UNDO_TTL_MS }
            : null,
          stats: {
            ...cur.stats,
            totalSaved: Math.max(0, cur.stats.totalSaved - idsToRevert.length),
          },
        },
        cur.revision,
      );
    } catch {
      // still do not close reverted
    }
  }

  if (toClose.length) {
    await ensureWindowSurvives(anchor.windowId, toClose);
    await chrome.tabs.remove(toClose);
  }

  await refreshBadgeFromDb();

  const saved = idsToKeep.length;
  const totalAttempt = candidates.length;
  let message =
    saved === 0
      ? STRINGS.nothingSaved
      : saved === totalAttempt
        ? saved === 1
          ? STRINGS.savedOne
          : STRINGS.savedN(saved)
        : STRINGS.savedPartial(saved, totalAttempt);

  if (saved > 0 && !options.confirmedUnsaved) {
    message = `${message} ${STRINGS.unsavedHint}`;
  }

  return {
    saved,
    skipped,
    failed,
    needsConfirmation,
    undoIds: idsToKeep,
    message,
  };
}

async function createTabSafe(
  entry: SavedTab,
  windowId?: number,
): Promise<chrome.tabs.Tab | null> {
  try {
    return await chrome.tabs.create({
      url: entry.url,
      active: false,
      windowId: windowId != null && windowId >= 0 ? windowId : undefined,
      index: entry.source.index >= 0 ? entry.source.index : undefined,
    });
  } catch {
    try {
      return await chrome.tabs.create({ url: entry.url, active: false });
    } catch {
      return null;
    }
  }
}

export async function restoreEntries(
  ids: string[],
  opts?: { batch?: boolean },
): Promise<
  RestoreResult & { needsBatchChoice?: boolean; pendingCount?: number }
> {
  const s = getStore();
  const db = await s.readDatabase();
  const targets = db.entries.filter((e) => ids.includes(e.id));
  if (!targets.length) {
    return { opened: 0, failed: 0, removed: 0, message: "No matching tabs." };
  }

  if (targets.length >= BATCH_RESTORE_THRESHOLD && opts?.batch === undefined) {
    return {
      opened: 0,
      failed: 0,
      removed: 0,
      message: STRINGS.batchRestorePrompt(targets.length),
      needsBatchChoice: true,
      pendingCount: targets.length,
    };
  }

  const batchSize = opts?.batch ? db.settings.restoreBatchSize : targets.length;
  const ordered = [...targets].sort((a, b) => {
    if (a.source.windowId !== b.source.windowId)
      return a.source.windowId - b.source.windowId;
    return a.source.index - b.source.index;
  });

  let opened = 0;
  let failed = 0;
  const openedIds: string[] = [];

  for (let i = 0; i < ordered.length; i++) {
    const entry = ordered[i]!;
    if (opts?.batch && i > 0 && i % batchSize === 0) {
      await new Promise((r) => setTimeout(r, 400));
    }
    const tab = await createTabSafe(entry, entry.source.windowId);
    if (tab) {
      opened += 1;
      openedIds.push(entry.id);
    } else {
      failed += 1;
    }
  }

  let removed = 0;
  const cur = await s.readDatabase();
  if (db.settings.removeAfterRestore && openedIds.length) {
    const nextEntries = cur.entries.filter((e) => !openedIds.includes(e.id));
    removed = cur.entries.length - nextEntries.length;
    await s.writeDatabase(
      {
        ...cur,
        entries: nextEntries,
        stats: {
          ...cur.stats,
          totalRestored: cur.stats.totalRestored + opened,
        },
      },
      cur.revision,
    );
  } else if (opened) {
    await s.writeDatabase(
      {
        ...cur,
        stats: {
          ...cur.stats,
          totalRestored: cur.stats.totalRestored + opened,
        },
      },
      cur.revision,
    );
  }

  await refreshBadgeFromDb();
  const message =
    failed > 0
      ? STRINGS.restoreFailedSome(opened, failed)
      : STRINGS.restoreOpened(opened);
  return { opened, failed, removed, message };
}

export async function undoLastSave(): Promise<{
  ok: boolean;
  message: string;
}> {
  const s = getStore();
  const db = await s.readDatabase();
  if (!db.undo || Date.now() > db.undo.expiresAt) {
    return { ok: false, message: STRINGS.undoExpired };
  }
  const ids = db.undo.ids;
  const entries = db.entries.filter((e) => ids.includes(e.id));
  const openedIds: string[] = [];
  for (const entry of entries) {
    const tab = await createTabSafe(entry);
    if (tab) openedIds.push(entry.id);
  }
  const cur = await s.readDatabase();
  await s.writeDatabase(
    {
      ...cur,
      entries: cur.entries.filter((e) => !openedIds.includes(e.id)),
      undo: null,
    },
    cur.revision,
  );
  await refreshBadgeFromDb();
  return {
    ok: openedIds.length > 0,
    message: openedIds.length ? STRINGS.undoDone : STRINGS.undoExpired,
  };
}

export async function handleRequest(req: Request): Promise<Response> {
  try {
    const s = getStore();
    switch (req.type) {
      case "get-state": {
        try {
          const database = await s.readDatabase();
          const backups = await s.listBackupMeta();
          return {
            ok: true,
            data: { database, backups, corrupt: false as const },
          };
        } catch (e) {
          if (e instanceof CorruptDataError) {
            return {
              ok: true,
              data: {
                database: null,
                backups: await s.listBackupMeta().catch(() => []),
                corrupt: true as const,
                message: e.message,
              },
            };
          }
          throw e;
        }
      }
      case "save": {
        const db = await s.readDatabase();
        const saveOpts: {
          scope: SaveScope;
          tabId?: number;
          confirmedAudio?: boolean;
          confirmedUnsaved?: boolean;
        } = { scope: req.scope ?? db.settings.defaultScope };
        if (req.tabId != null) saveOpts.tabId = req.tabId;
        if (req.confirmedAudio != null)
          saveOpts.confirmedAudio = req.confirmedAudio;
        if (req.confirmedUnsaved != null)
          saveOpts.confirmedUnsaved = req.confirmedUnsaved;
        const result = await saveTabs(saveOpts);
        return { ok: true, data: result };
      }
      case "restore": {
        const restoreOpts =
          req.batch === undefined ? undefined : { batch: req.batch };
        return { ok: true, data: await restoreEntries(req.ids, restoreOpts) };
      }
      case "restore-group": {
        const db = await s.readDatabase();
        const ids = db.entries
          .filter((e) => e.group === req.group)
          .map((e) => e.id);
        const restoreOpts =
          req.batch === undefined ? undefined : { batch: req.batch };
        return { ok: true, data: await restoreEntries(ids, restoreOpts) };
      }
      case "undo": {
        const r = await undoLastSave();
        return r.ok ? { ok: true, data: r } : { ok: false, error: r.message };
      }
      case "delete": {
        await withRetryWrite((db) => ({
          ...db,
          entries: db.entries.filter((e) => !req.ids.includes(e.id)),
        }));
        await refreshBadgeFromDb();
        return { ok: true, data: { deleted: req.ids.length } };
      }
      case "clear": {
        await withRetryWrite(
          (db) => ({
            ...db,
            entries: [],
            undo: null,
          }),
          { backupReason: "before-clear" },
        );
        await refreshBadgeFromDb();
        return { ok: true, data: { cleared: true } };
      }
      case "reset-all": {
        const cur = await s.readDatabase().catch(() => null);
        if (cur) await s.createBackup("before-reset", cur);
        await s.resetAll();
        await refreshBadgeFromDb();
        return { ok: true, data: { reset: true } };
      }
      case "patch-settings": {
        await withRetryWrite((db) => ({
          ...db,
          settings: {
            ...db.settings,
            ...req.patch,
            whitelist: req.patch.whitelist ?? db.settings.whitelist,
          },
        }));
        return { ok: true, data: { saved: true } };
      }
      case "edit-entry": {
        await withRetryWrite((db) => ({
          ...db,
          entries: db.entries.map((e) =>
            e.id === req.id ? { ...e, group: req.group, tags: req.tags } : e,
          ),
        }));
        return { ok: true, data: { saved: true } };
      }
      case "import-json": {
        let summary: ImportSummary = {
          added: 0,
          skippedDuplicates: 0,
          skippedInvalid: 0,
          migrated: 0,
          message: "",
        };
        await withRetryWrite(
          (db) => {
            const result = importJsonText(req.text, db.entries);
            summary = result.summary;
            return {
              ...db,
              entries: result.entries,
              stats: {
                ...db.stats,
                totalSaved: db.stats.totalSaved + result.summary.added,
              },
            };
          },
          { backupReason: "before-import" },
        );
        await refreshBadgeFromDb();
        return { ok: true, data: { summary } };
      }
      case "import-text": {
        let summary: ImportSummary = {
          added: 0,
          skippedDuplicates: 0,
          skippedInvalid: 0,
          migrated: 0,
          message: "",
        };
        await withRetryWrite(
          (db) => {
            const result = importPlainTextList(req.text, db.entries);
            summary = result.summary;
            return {
              ...db,
              entries: result.entries,
              stats: {
                ...db.stats,
                totalSaved: db.stats.totalSaved + result.summary.added,
              },
            };
          },
          { backupReason: "before-import-text" },
        );
        await refreshBadgeFromDb();
        return { ok: true, data: { summary } };
      }
      case "export-json": {
        const db = await s.readDatabase();
        return { ok: true, data: { text: exportJsonString(db) } };
      }
      case "export-raw": {
        return { ok: true, data: { text: await s.exportRaw() } };
      }
      case "list-backups": {
        return { ok: true, data: { backups: await s.listBackupMeta() } };
      }
      case "restore-backup": {
        await s.restoreBackup(req.id);
        await refreshBadgeFromDb();
        return { ok: true, data: { restored: true } };
      }
      case "load-demo": {
        await withRetryWrite(
          (db) => {
            const demo = createDemoEntries();
            const urls = new Set(db.entries.map((e) => e.url));
            const add = demo.filter((d) => !urls.has(d.url));
            return {
              ...db,
              entries: [...add, ...db.entries],
              stats: {
                ...db.stats,
                totalSaved: db.stats.totalSaved + add.length,
              },
            };
          },
          { backupReason: "before-demo" },
        );
        await refreshBadgeFromDb();
        return { ok: true, data: { message: STRINGS.demoLoaded } };
      }
      case "discard-tab": {
        let tabId = req.tabId;
        if (tabId == null) {
          const [active] = await chrome.tabs.query({
            active: true,
            currentWindow: true,
          });
          tabId = active?.id;
        }
        if (tabId == null) return { ok: false, error: "No tab" };
        await chrome.tabs.discard(tabId);
        return { ok: true, data: { discarded: true } };
      }
      case "open-library": {
        await chrome.tabs.create({ url: chrome.runtime.getURL("list.html") });
        return { ok: true, data: { opened: true } };
      }
      case "complete-onboarding": {
        await withRetryWrite((db) => ({
          ...db,
          settings: { ...db.settings, onboardingComplete: true },
        }));
        return { ok: true, data: { done: true } };
      }
      default: {
        const _exhaustive: never = req;
        void _exhaustive;
        return { ok: false, error: "Unknown request" };
      }
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : STRINGS.errorGeneric;
    return { ok: false, error: message };
  }
}

export async function onActionClicked(tab: chrome.tabs.Tab): Promise<void> {
  const saveOpts: { scope: SaveScope; tabId?: number } = { scope: "current" };
  if (tab.id != null) saveOpts.tabId = tab.id;
  const result = await saveTabs(saveOpts);
  await chrome.storage.session.set({
    lastSaveResult: result,
    lastSaveAt: Date.now(),
  });
  if (result.needsConfirmation.length) {
    await chrome.storage.session.set({
      pendingAudioConfirm: result.needsConfirmation,
    });
  }
  try {
    await chrome.action.setPopup({ popup: "popup.html" });
    await chrome.action.openPopup();
  } catch {
    // Badge / session still hold feedback
  }
  chrome.alarms.create("clear-popup", { delayInMinutes: 0.05 });
}

let menusReady = false;

function setupMenus(): void {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "save-tab",
      title: "Save tab with Tabfold",
      contexts: ["page", "action"],
    });
    chrome.contextMenus.create({
      id: "save-others",
      title: "Save other tabs in window",
      contexts: ["action"],
    });
    chrome.contextMenus.create({
      id: "hibernate",
      title: "Hibernate tab (keep open, free memory)",
      contexts: ["page", "action"],
    });
    chrome.contextMenus.create({
      id: "open-library",
      title: "Open Tabfold library",
      contexts: ["action"],
    });
    menusReady = true;
  });
}

/** Top-level synchronous registration — required for MV3 service workers. */
export function registerServiceWorkerListeners(): void {
  chrome.runtime.onInstalled.addListener((details) => {
    void refreshBadgeFromDb();
    setupMenus();
    void details;
  });

  chrome.runtime.onStartup.addListener(() => {
    void refreshBadgeFromDb();
    if (!menusReady) setupMenus();
  });

  chrome.action.onClicked.addListener((tab) => {
    void onActionClicked(tab);
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    void handleRequest(message as Request).then(sendResponse);
    return true;
  });

  chrome.commands.onCommand.addListener((command) => {
    void (async () => {
      if (command === "save-current-tab") {
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (tab) await onActionClicked(tab);
      } else if (command === "open-library") {
        await chrome.tabs.create({ url: chrome.runtime.getURL("list.html") });
      }
    })();
  });

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    void (async () => {
      if (info.menuItemId === "save-tab" && tab?.id != null) {
        const result = await saveTabs({ scope: "current", tabId: tab.id });
        await chrome.storage.session.set({
          lastSaveResult: result,
          lastSaveAt: Date.now(),
        });
      } else if (info.menuItemId === "save-others") {
        const opts: { scope: SaveScope; tabId?: number } = { scope: "others" };
        if (tab?.id != null) opts.tabId = tab.id;
        await saveTabs(opts);
      } else if (info.menuItemId === "open-library") {
        await chrome.tabs.create({ url: chrome.runtime.getURL("list.html") });
      } else if (info.menuItemId === "hibernate" && tab?.id != null) {
        await chrome.tabs.discard(tab.id);
      }
    })();
  });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "clear-popup") {
      void chrome.action.setPopup({ popup: "" });
    }
  });

  setupMenus();
  void refreshBadgeFromDb();
}
