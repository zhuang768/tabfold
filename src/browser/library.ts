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
  type RestoreMode,
} from "../types.js";
import { STRINGS } from "../strings.js";
import { createId, urlsEqual } from "../core/id.js";
import {
  findDuplicate,
  isInternalUrl,
  isSavableUrl,
  isWhitelisted,
} from "../core/tabs-logic.js";
import {
  selectTabsForScope,
  isValidScope,
  type TabLike,
} from "../core/scope.js";
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

interface ConfirmPayload {
  token: string;
  tabSnapshots: Array<{
    tabId: number;
    url: string;
    title: string;
    audible?: boolean;
  }>;
  scope: SaveScope;
  expiresAt: number;
}

function emptySave(
  partial: Partial<SaveResult> & { message: string },
): SaveResult {
  return {
    saved: 0,
    closed: 0,
    skipped: [],
    failed: [],
    needsConfirmation: [],
    undoIds: [],
    ...partial,
  };
}

async function withMutationWrite(
  mutate: (db: Database) => Database,
  opts?: { backupReason?: string },
): Promise<Database> {
  const s = getStore();
  return s.exclusive(async () => {
    const db = await s.readDatabaseUnlocked();
    const rev = db.revision;
    if (opts?.backupReason) {
      const bulk =
        opts.backupReason.includes("clear") ||
        opts.backupReason.includes("import") ||
        opts.backupReason.includes("demo") ||
        opts.backupReason.includes("reset") ||
        db.entries.length >= 20;
      if (bulk) {
        await s.createBackupUnlocked(opts.backupReason, db);
      }
    }
    const next = mutate(structuredClone(db));
    return s.writeDatabaseUnlocked(next, rev);
  });
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
    favicon: tab.url ?? null,
    savedAt: now,
    source,
    group: "",
    tags: [],
    status: "saved",
  };
}

export async function updateBadge(count: number): Promise<void> {
  if (typeof chrome === "undefined" || !chrome.action?.setBadgeText) return;
  const text =
    count <= 0 ? "" : count > 999 ? STRINGS.badgeOverflow : String(count);
  await chrome.action.setBadgeText({ text });
  if (chrome.action.setBadgeBackgroundColor) {
    await chrome.action.setBadgeBackgroundColor({ color: "#2F3437" });
  }
  if (chrome.action.setIcon) {
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
      // ignore missing icons in tests
    }
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

async function storeConfirm(payload: ConfirmPayload): Promise<void> {
  if (typeof chrome !== "undefined" && chrome.storage?.session) {
    await chrome.storage.session.set({ pendingConfirm: payload });
  }
}

async function loadConfirm(token: string): Promise<ConfirmPayload | null> {
  if (typeof chrome === "undefined" || !chrome.storage?.session) return null;
  const data = await chrome.storage.session.get("pendingConfirm");
  const p = data.pendingConfirm as ConfirmPayload | undefined;
  if (!p || p.token !== token) return null;
  if (Date.now() > p.expiresAt) return null;
  return p;
}

async function clearConfirm(): Promise<void> {
  if (typeof chrome !== "undefined" && chrome.storage?.session) {
    await chrome.storage.session.remove("pendingConfirm");
  }
}

const RESTORE_JOURNAL_KEY = "tabfold_restore_journal";
const UNDO_JOURNAL_KEY = "tabfold_undo_journal";

async function getJournal(key: string): Promise<Record<string, number>> {
  try {
    if (typeof chrome === "undefined" || !chrome.storage?.session) return {};
    const data = await chrome.storage.session.get(key);
    const j = data?.[key];
    return typeof j === "object" && j !== null
      ? (j as Record<string, number>)
      : {};
  } catch {
    return {};
  }
}

async function recordJournalEntry(
  key: string,
  id: string,
  tabId: number,
): Promise<void> {
  try {
    if (typeof chrome === "undefined" || !chrome.storage?.session) return;
    const current = await getJournal(key);
    current[id] = tabId;
    await chrome.storage.session.set({ [key]: current });
  } catch {
    // best effort
  }
}

async function clearJournal(key: string): Promise<void> {
  try {
    if (typeof chrome === "undefined" || !chrome.storage?.session) return;
    await chrome.storage.session.remove(key);
  } catch {
    // best effort
  }
}

/**
 * Save pipeline: exclusive lock covers read→write→verify→close decisions.
 * Never closes until verified; concurrent saves serialize (no lost updates).
 */
export async function saveTabs(options: {
  scope: SaveScope;
  tabId?: number;
  tabIds?: number[];
  confirmedAudio?: boolean;
  confirmedUnsaved?: boolean;
  confirmToken?: string;
}): Promise<SaveResult> {
  const s = getStore();

  return s.exclusive(async () => {
    const db = await s.readDatabaseUnlocked();
    let bound: ConfirmPayload | null = null;
    if (options.confirmToken) {
      bound = await loadConfirm(options.confirmToken);
      if (!bound) {
        return emptySave({ message: STRINGS.confirmExpired });
      }
      await clearConfirm();
    }

    if (!isValidScope(options.scope) && !bound && !options.tabIds?.length) {
      return emptySave({ message: "Invalid save scope." });
    }

    let selected: chrome.tabs.Tab[] = [];
    let anchorWindowId: number | undefined;

    if (bound) {
      for (const snap of bound.tabSnapshots) {
        try {
          const tab = await chrome.tabs.get(snap.tabId);
          if ((tab.url ?? "") !== snap.url) {
            return emptySave({
              message: STRINGS.targetChanged,
              failed: [
                {
                  title: snap.title,
                  url: snap.url,
                  reason: STRINGS.urlChanged,
                },
              ],
            });
          }
          if (tab.pinned) {
            return emptySave({
              message: STRINGS.pinnedSkip,
              skipped: [
                {
                  title: snap.title,
                  url: snap.url,
                  reason: STRINGS.pinnedSkip,
                },
              ],
            });
          }
          if (isWhitelisted(tab.url ?? "", db.settings.whitelist)) {
            return emptySave({
              message: STRINGS.whitelistSkip,
              skipped: [
                {
                  title: snap.title,
                  url: snap.url,
                  reason: STRINGS.whitelistSkip,
                },
              ],
            });
          }
          selected.push(tab);
          anchorWindowId = tab.windowId;
        } catch {
          return emptySave({
            message: STRINGS.targetChanged,
            failed: [
              { title: snap.title, url: snap.url, reason: STRINGS.tabGone },
            ],
          });
        }
      }
    } else if (options.tabIds?.length) {
      for (const id of options.tabIds) {
        try {
          const tab = await chrome.tabs.get(id);
          selected.push(tab);
          anchorWindowId = tab.windowId;
        } catch {
          // skip missing
        }
      }
    } else {
      let anchor: chrome.tabs.Tab | undefined;
      if (options.tabId != null) {
        anchor = await chrome.tabs.get(options.tabId).catch(() => undefined);
      } else {
        const [active] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        anchor = active;
      }
      if (!anchor?.windowId) {
        return emptySave({
          message: STRINGS.nothingSaved,
          failed: [{ title: "Unknown", url: "", reason: STRINGS.noActiveTab }],
        });
      }
      // Refuse silently saving the extension's own pages as "current"
      if (
        options.scope === "current" &&
        anchor.url?.startsWith(`chrome-extension://${chrome.runtime.id}`)
      ) {
        return emptySave({ message: STRINGS.pickWebTab });
      }
      anchorWindowId = anchor.windowId;
      const windowTabs = await chrome.tabs.query({ windowId: anchor.windowId });
      selected = selectTabsForScope(
        windowTabs as TabLike[],
        options.scope,
        anchor.id,
      ) as chrome.tabs.Tab[];
    }

    const skipped: SaveResult["skipped"] = [];
    const eligibleTabs: chrome.tabs.Tab[] = [];
    const seenUrls = new Set<string>();

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
      if (
        findDuplicate(db.entries, url) ||
        [...seenUrls].some((u) => urlsEqual(u, url))
      ) {
        skipped.push({ title, url, reason: STRINGS.duplicateUrl });
        continue;
      }
      seenUrls.add(url);
      eligibleTabs.push(tab);
    }

    if (eligibleTabs.length === 0) {
      return emptySave({
        message: skipped.length
          ? (skipped[0]?.reason ?? STRINGS.nothingSaved)
          : STRINGS.nothingSaved,
        skipped,
      });
    }

    // Unsaved-content ack before any close (bound to exact target tabs)
    if (
      !db.settings.unsavedHintAcknowledged &&
      (!bound || !options.confirmedUnsaved)
    ) {
      const token = createId("cfm");
      await storeConfirm({
        token,
        tabSnapshots: eligibleTabs.map((t) => ({
          tabId: t.id!,
          url: t.url ?? "",
          title: t.title || t.url || "Untitled",
          audible: Boolean(t.audible),
        })),
        scope: options.scope,
        expiresAt: Date.now() + 120_000,
      });
      return emptySave({
        message: STRINGS.unsavedHintBefore,
        needsUnsavedAck: true,
        confirmToken: token,
        skipped,
      });
    }

    const needsConfirmation: SaveResult["needsConfirmation"] = [];
    const candidates: chrome.tabs.Tab[] = [];

    for (const tab of eligibleTabs) {
      const url = tab.url ?? "";
      const title = tab.title || url || "Untitled";
      if (tab.audible && (!bound || !options.confirmedAudio)) {
        needsConfirmation.push({
          tabId: tab.id!,
          title,
          url,
          reason: STRINGS.audioConfirm,
        });
        continue;
      }
      candidates.push(tab);
    }

    if (needsConfirmation.length) {
      const token = createId("cfm");
      await storeConfirm({
        token,
        tabSnapshots: [
          ...candidates.map((c) => ({
            tabId: c.id!,
            url: c.url ?? "",
            title: c.title || c.url || "Untitled",
            audible: false,
          })),
          ...needsConfirmation.map((n) => ({
            tabId: n.tabId,
            url: n.url,
            title: n.title,
            audible: true,
          })),
        ],
        scope: options.scope,
        expiresAt: Date.now() + 120_000,
      });
      return emptySave({
        message: STRINGS.audioConfirm,
        skipped,
        needsConfirmation,
        confirmToken: token,
      });
    }

    if (candidates.length === 0) {
      return emptySave({
        message: skipped[0]?.reason ?? STRINGS.nothingSaved,
        skipped,
      });
    }

    const snapshot = new Map<number, string>();
    for (const t of candidates) {
      if (t.id != null) snapshot.set(t.id, t.url ?? "");
    }

    const now = Date.now();
    const newEntries = candidates.map((t) => tabToEntry(t, now));

    let written: Database;
    try {
      const next: Database = {
        ...db,
        entries: [...newEntries, ...db.entries],
        stats: {
          ...db.stats,
          totalSaved: db.stats.totalSaved + newEntries.length,
        },
        undo: {
          ids: newEntries.map((e) => e.id),
          expiresAt: now + UNDO_TTL_MS,
        },
        settings: {
          ...db.settings,
          unsavedHintAcknowledged: true,
        },
      };
      written = await s.writeDatabaseUnlocked(next, db.revision);
    } catch (e) {
      const reason = e instanceof Error ? e.message : STRINGS.writeFailed;
      return emptySave({
        message: `${STRINGS.writeFailed} (${reason})`,
        skipped,
        failed: candidates.map((t) => ({
          title: t.title || "",
          url: t.url || "",
          reason: STRINGS.writeFailed,
        })),
      });
    }

    // Re-read to verify (may inject failReads in tests)
    let verifiedDb: Database;
    try {
      verifiedDb = await s.readDatabaseUnlocked();
    } catch {
      // Roll back best-effort; never close
      try {
        await s.writeDatabaseUnlocked(
          {
            ...written,
            entries: written.entries.filter(
              (e) => !newEntries.some((n) => n.id === e.id),
            ),
            undo: null,
            stats: {
              ...written.stats,
              totalSaved: Math.max(
                0,
                written.stats.totalSaved - newEntries.length,
              ),
            },
          },
          written.revision,
        );
      } catch {
        // keep data; still do not close
      }
      return emptySave({
        message: STRINGS.verifyFailed,
        skipped,
        failed: newEntries.map((e) => ({
          title: e.title,
          url: e.url,
          reason: STRINGS.verifyFailed,
        })),
      });
    }

    const verify = verifyEntriesPresent(verifiedDb, newEntries);
    if (!verify.ok) {
      try {
        await s.writeDatabaseUnlocked(
          {
            ...verifiedDb,
            entries: verifiedDb.entries.filter(
              (e) => !newEntries.some((n) => n.id === e.id),
            ),
            undo: null,
            stats: {
              ...verifiedDb.stats,
              totalSaved: Math.max(
                0,
                verifiedDb.stats.totalSaved - newEntries.length,
              ),
            },
          },
          verifiedDb.revision,
        );
      } catch {
        // do not close
      }
      return emptySave({
        message: STRINGS.verifyFailed,
        skipped,
        failed: newEntries.map((e) => ({
          title: e.title,
          url: e.url,
          reason: STRINGS.verifyFailed,
        })),
      });
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
        if (fresh.pinned) {
          skipped.push({
            title: t.title || "",
            url: t.url || "",
            reason: STRINGS.pinnedSkip,
          });
          continue;
        }
        if (fresh.audible && !options.confirmedAudio && !bound) {
          failed.push({
            title: t.title || "",
            url: t.url || "",
            reason: STRINGS.audioConfirm,
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
        const cur = await s.readDatabaseUnlocked();
        await s.writeDatabaseUnlocked(
          {
            ...cur,
            entries: cur.entries.filter((e) => !idsToRevert.includes(e.id)),
            undo: idsToKeep.length
              ? { ids: idsToKeep, expiresAt: now + UNDO_TTL_MS }
              : null,
            stats: {
              ...cur.stats,
              totalSaved: Math.max(
                0,
                cur.stats.totalSaved - idsToRevert.length,
              ),
            },
          },
          cur.revision,
        );
      } catch {
        // still do not close reverted
      }
    }

    let closed = 0;
    let statsWarning = false;
    if (toClose.length && anchorWindowId != null) {
      try {
        await ensureWindowSurvives(anchorWindowId, toClose);
      } catch {
        try {
          const cur = await s.readDatabaseUnlocked();
          await s.writeDatabaseUnlocked(
            {
              ...cur,
              entries: cur.entries.filter(
                (e) => !newEntries.some((n) => n.id === e.id),
              ),
              undo: null,
              stats: {
                ...cur.stats,
                totalSaved: Math.max(
                  0,
                  cur.stats.totalSaved - newEntries.length,
                ),
              },
            },
            cur.revision,
          );
        } catch {
          // best-effort rollback
        }
        failed.push({
          title: "Window",
          url: "",
          reason: "Could not keep window open",
        });
        return emptySave({
          message: STRINGS.closeFailed,
          skipped,
          failed,
          saved: 0,
          closed: 0,
        });
      }

      const actuallyClosed: number[] = [];
      const actuallyOpen: number[] = [];
      try {
        await chrome.tabs.remove(toClose);
        actuallyClosed.push(...toClose);
      } catch {
        for (const tabId of toClose) {
          try {
            await chrome.tabs.get(tabId);
            actuallyOpen.push(tabId);
          } catch {
            actuallyClosed.push(tabId);
          }
        }
      }
      closed = actuallyClosed.length;

      const actuallyClosedEntryIds = actuallyClosed
        .map((id) => entryByTabId.get(id)?.id)
        .filter((x): x is string => Boolean(x));

      try {
        const cur = await s.readDatabaseUnlocked();
        await s.writeDatabaseUnlocked(
          {
            ...cur,
            stats: {
              ...cur.stats,
              totalClosed: cur.stats.totalClosed + closed,
            },
            undo: actuallyClosedEntryIds.length
              ? { ids: actuallyClosedEntryIds, expiresAt: now + UNDO_TTL_MS }
              : null,
          },
          cur.revision,
        );
      } catch {
        statsWarning = true;
      }

      if (actuallyOpen.length) {
        await clearConfirm();
        await refreshBadgeFromDb();
        return {
          saved: idsToKeep.length,
          closed,
          skipped,
          failed: [
            ...failed,
            ...actuallyOpen.map((id) => {
              const ent = entryByTabId.get(id);
              return {
                title: ent?.title || "",
                url: ent?.url || "",
                reason: STRINGS.closeFailed,
              };
            }),
          ],
          needsConfirmation: [],
          undoIds: actuallyClosedEntryIds,
          message: `${STRINGS.closeFailed} Data was saved; tabs may still be open.${statsWarning ? " (Warning: stats could not be updated)" : ""}`,
        };
      }
    }

    await clearConfirm();
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
    if (statsWarning) {
      message += " (Warning: stats could not be updated)";
    }

    return {
      saved,
      closed,
      skipped,
      failed,
      needsConfirmation: [],
      undoIds: idsToKeep,
      message,
    };
  });
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
  opts?: { mode?: RestoreMode },
): Promise<RestoreResult> {
  const s = getStore();
  return s.exclusive(async () => {
    const db = await s.readDatabaseUnlocked();
    const targets = db.entries.filter((e) => ids.includes(e.id));
    if (!targets.length) {
      return {
        opened: 0,
        failed: 0,
        removed: 0,
        message: STRINGS.noMatchingTabs,
      };
    }

    if (targets.length >= BATCH_RESTORE_THRESHOLD && opts?.mode == null) {
      return {
        opened: 0,
        failed: 0,
        removed: 0,
        message: STRINGS.batchRestorePrompt(targets.length),
        needsBatchChoice: true,
        pendingCount: targets.length,
        pendingIds: targets.map((t) => t.id),
      };
    }

    const batch = opts?.mode === "batch";
    const batchSize = batch ? db.settings.restoreBatchSize : targets.length;
    const ordered = [...targets].sort((a, b) => {
      if (a.source.windowId !== b.source.windowId)
        return a.source.windowId - b.source.windowId;
      return a.source.index - b.source.index;
    });

    let opened = 0;
    let failed = 0;
    const openedIds: string[] = [];
    const journal = await getJournal(RESTORE_JOURNAL_KEY);

    for (let i = 0; i < ordered.length; i++) {
      const entry = ordered[i]!;
      if (batch && i > 0 && i % batchSize === 0) {
        await new Promise((r) => setTimeout(r, 400));
      }
      if (journal[entry.id]) {
        opened += 1;
        openedIds.push(entry.id);
        continue;
      }
      const tab = await createTabSafe(entry, entry.source.windowId);
      if (tab) {
        opened += 1;
        openedIds.push(entry.id);
        if (tab.id != null) {
          await recordJournalEntry(RESTORE_JOURNAL_KEY, entry.id, tab.id);
        }
      } else {
        failed += 1;
      }
    }

    let removed = 0;
    try {
      const cur = await s.readDatabaseUnlocked();
      if (db.settings.removeAfterRestore && openedIds.length) {
        const toRemove = [...openedIds];
        const nextEntries = cur.entries.filter((e) => {
          const idx = toRemove.indexOf(e.id);
          if (idx !== -1) {
            toRemove.splice(idx, 1);
            return false;
          }
          return true;
        });
        removed = cur.entries.length - nextEntries.length;
        await s.writeDatabaseUnlocked(
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
        await clearJournal(RESTORE_JOURNAL_KEY);
      } else if (opened) {
        await s.writeDatabaseUnlocked(
          {
            ...cur,
            stats: {
              ...cur.stats,
              totalRestored: cur.stats.totalRestored + opened,
            },
          },
          cur.revision,
        );
        await clearJournal(RESTORE_JOURNAL_KEY);
      }
    } catch (e) {
      await refreshBadgeFromDb();
      const reason = e instanceof Error ? e.message : "persist failed";
      return {
        opened,
        failed,
        removed: 0,
        message: `${STRINGS.restoreOpened(opened)} ${STRINGS.restorePersistFailed} (${reason})`,
      };
    }

    await refreshBadgeFromDb();
    const message =
      failed > 0
        ? STRINGS.restoreFailedSome(opened, failed)
        : STRINGS.restoreOpened(opened);
    return { opened, failed, removed, message };
  });
}

export async function undoLastSave(): Promise<{
  ok: boolean;
  message: string;
}> {
  const s = getStore();
  return s.exclusive(async () => {
    const db = await s.readDatabaseUnlocked();
    if (!db.undo || Date.now() > db.undo.expiresAt) {
      return { ok: false, message: STRINGS.undoExpired };
    }
    const ids = [...db.undo.ids];
    const expiresAt = db.undo.expiresAt;
    const entries = db.entries.filter((e) => ids.includes(e.id));
    const openedIds: string[] = [];
    const failedIds: string[] = [];
    const journal = await getJournal(UNDO_JOURNAL_KEY);
    for (const entry of entries) {
      if (journal[entry.id]) {
        openedIds.push(entry.id);
        continue;
      }
      const tab = await createTabSafe(entry);
      if (tab) {
        openedIds.push(entry.id);
        if (tab.id != null) {
          await recordJournalEntry(UNDO_JOURNAL_KEY, entry.id, tab.id);
        }
      } else {
        failedIds.push(entry.id);
      }
    }
    const cur = await s.readDatabaseUnlocked();
    await s.writeDatabaseUnlocked(
      {
        ...cur,
        entries: cur.entries.filter((e) => !openedIds.includes(e.id)),
        undo:
          failedIds.length && Date.now() < expiresAt
            ? { ids: failedIds, expiresAt }
            : null,
      },
      cur.revision,
    );
    await clearJournal(UNDO_JOURNAL_KEY);
    await refreshBadgeFromDb();
    if (!openedIds.length) {
      return {
        ok: false,
        message: failedIds.length
          ? STRINGS.undoPartialFail
          : STRINGS.undoExpired,
      };
    }
    return {
      ok: true,
      message: failedIds.length
        ? STRINGS.undoPartial(openedIds.length, failedIds.length)
        : STRINGS.undoDone,
    };
  });
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
        let scope: SaveScope = "current";
        if (req.scope !== undefined) {
          if (!isValidScope(req.scope)) {
            return { ok: false, error: "Invalid save scope." };
          }
          scope = req.scope;
        } else if (req.confirmToken) {
          scope = "current";
        } else {
          try {
            const db = await s.readDatabase();
            scope = isValidScope(db.settings.defaultScope)
              ? db.settings.defaultScope
              : "current";
          } catch {
            scope = "current";
          }
        }
        const saveOpts: Parameters<typeof saveTabs>[0] = { scope };
        if (req.tabId != null) saveOpts.tabId = req.tabId;
        if (req.tabIds) saveOpts.tabIds = req.tabIds;
        if (req.confirmedAudio != null)
          saveOpts.confirmedAudio = req.confirmedAudio;
        if (req.confirmedUnsaved != null)
          saveOpts.confirmedUnsaved = req.confirmedUnsaved;
        if (req.confirmToken) saveOpts.confirmToken = req.confirmToken;
        return { ok: true, data: await saveTabs(saveOpts) };
      }
      case "restore": {
        const mode = req.mode;
        return {
          ok: true,
          data: await restoreEntries(
            req.ids,
            mode != null ? { mode } : undefined,
          ),
        };
      }
      case "restore-group": {
        const db = await s.readDatabase();
        const ids = db.entries
          .filter((e) => e.group === req.group)
          .map((e) => e.id);
        const mode = req.mode;
        return {
          ok: true,
          data: await restoreEntries(ids, mode != null ? { mode } : undefined),
        };
      }
      case "undo": {
        const r = await undoLastSave();
        return r.ok ? { ok: true, data: r } : { ok: false, error: r.message };
      }
      case "delete": {
        await withMutationWrite((db) => ({
          ...db,
          entries: db.entries.filter((e) => !req.ids.includes(e.id)),
        }));
        await refreshBadgeFromDb();
        return { ok: true, data: { deleted: req.ids.length } };
      }
      case "clear": {
        await withMutationWrite((db) => ({ ...db, entries: [], undo: null }), {
          backupReason: "before-clear",
        });
        await refreshBadgeFromDb();
        return { ok: true, data: { cleared: true } };
      }
      case "reset-all": {
        try {
          const cur = await s.readDatabase();
          await s.createBackup("before-reset", cur);
        } catch {
          // still allow reset
        }
        await s.resetAll();
        await refreshBadgeFromDb();
        return { ok: true, data: { reset: true } };
      }
      case "patch-settings": {
        if (!req.patch || typeof req.patch !== "object") {
          return { ok: false, error: "Invalid settings patch." };
        }
        const allowedKeys = new Set([
          "removeAfterRestore",
          "defaultScope",
          "theme",
          "whitelist",
          "onboardingComplete",
          "unsavedHintAcknowledged",
          "restoreBatchSize",
        ]);
        for (const k of Object.keys(req.patch)) {
          if (!allowedKeys.has(k)) {
            return { ok: false, error: `Unknown settings key: ${k}` };
          }
        }
        const patch = req.patch;
        if (
          patch.removeAfterRestore !== undefined &&
          typeof patch.removeAfterRestore !== "boolean"
        ) {
          return { ok: false, error: "removeAfterRestore must be boolean." };
        }
        if (
          patch.defaultScope !== undefined &&
          !isValidScope(patch.defaultScope)
        ) {
          return { ok: false, error: "Invalid defaultScope." };
        }
        if (
          patch.theme !== undefined &&
          patch.theme !== "light" &&
          patch.theme !== "dark" &&
          patch.theme !== "system"
        ) {
          return { ok: false, error: "Invalid theme." };
        }
        if (patch.whitelist !== undefined) {
          if (
            !Array.isArray(patch.whitelist) ||
            patch.whitelist.some((x) => typeof x !== "string")
          ) {
            return {
              ok: false,
              error: "whitelist must be an array of strings.",
            };
          }
        }
        if (
          patch.onboardingComplete !== undefined &&
          typeof patch.onboardingComplete !== "boolean"
        ) {
          return { ok: false, error: "onboardingComplete must be boolean." };
        }
        if (
          patch.unsavedHintAcknowledged !== undefined &&
          typeof patch.unsavedHintAcknowledged !== "boolean"
        ) {
          return {
            ok: false,
            error: "unsavedHintAcknowledged must be boolean.",
          };
        }
        if (patch.restoreBatchSize !== undefined) {
          if (
            typeof patch.restoreBatchSize !== "number" ||
            !Number.isFinite(patch.restoreBatchSize) ||
            patch.restoreBatchSize < 1 ||
            patch.restoreBatchSize > 500
          ) {
            return {
              ok: false,
              error: "restoreBatchSize must be a number between 1 and 500.",
            };
          }
        }
        await withMutationWrite((db) => ({
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
        await withMutationWrite((db) => ({
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
        await withMutationWrite(
          (db) => {
            const result = importJsonText(req.text, db.entries);
            summary = result.summary;
            return {
              ...db,
              entries: result.entries,
              settings:
                result.settings && db.entries.length === 0
                  ? { ...db.settings, ...result.settings }
                  : db.settings,
              stats: {
                ...db.stats,
                totalImported: db.stats.totalImported + result.summary.added,
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
        await withMutationWrite(
          (db) => {
            const result = importPlainTextList(req.text, db.entries);
            summary = result.summary;
            return {
              ...db,
              entries: result.entries,
              stats: {
                ...db.stats,
                totalImported: db.stats.totalImported + result.summary.added,
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
        await withMutationWrite(
          (db) => {
            const demo = createDemoEntries();
            const urls = new Set(db.entries.map((e) => e.url));
            const add = demo.filter((d) => !urls.has(d.url));
            return {
              ...db,
              entries: [...add, ...db.entries],
              stats: {
                ...db.stats,
                totalImported: db.stats.totalImported + add.length,
              },
            };
          },
          { backupReason: "before-demo" },
        );
        await refreshBadgeFromDb();
        return { ok: true, data: { message: STRINGS.demoLoaded } };
      }
      case "discard-tab": {
        if (typeof req.tabId !== "number") {
          return { ok: false, error: "Missing tabId." };
        }
        const tab = await chrome.tabs.get(req.tabId).catch(() => null);
        if (!tab) return { ok: false, error: "Tab not found." };
        if (tab.active) {
          return { ok: false, error: "Cannot hibernate active tab." };
        }
        if (tab.pinned) return { ok: false, error: STRINGS.pinnedSkip };
        if (tab.audible)
          return { ok: false, error: "Cannot hibernate media tabs." };
        if (
          isWhitelisted(
            tab.url ?? "",
            (await s.readDatabase()).settings.whitelist,
          )
        ) {
          return { ok: false, error: STRINGS.whitelistSkip };
        }
        if (tab.url?.startsWith(`chrome-extension://${chrome.runtime.id}`)) {
          return { ok: false, error: STRINGS.pickWebTab };
        }
        await chrome.tabs.discard(req.tabId);
        const check = await chrome.tabs.get(req.tabId).catch(() => null);
        const ok = Boolean(check?.discarded);
        return ok
          ? { ok: true, data: { discarded: true, tabId: req.tabId } }
          : { ok: false, error: STRINGS.hibernateFailed };
      }
      case "list-window-tabs": {
        const tabs = await chrome.tabs.query({ currentWindow: true });
        const list = tabs
          .filter(
            (t) =>
              t.id != null &&
              t.url &&
              isSavableUrl(t.url) &&
              !t.url.startsWith(`chrome-extension://${chrome.runtime.id}`),
          )
          .map((t) => ({
            id: t.id!,
            title: t.title || t.url || "",
            url: t.url!,
            active: Boolean(t.active),
            pinned: Boolean(t.pinned),
            audible: Boolean(t.audible),
            discarded: Boolean(t.discarded),
          }));
        return { ok: true, data: { tabs: list } };
      }
      case "open-library": {
        await chrome.tabs.create({ url: chrome.runtime.getURL("list.html") });
        return { ok: true, data: { opened: true } };
      }
      case "complete-onboarding": {
        await withMutationWrite((db) => ({
          ...db,
          settings: { ...db.settings, onboardingComplete: true },
        }));
        return { ok: true, data: { done: true } };
      }
      case "clear-action-popup": {
        await chrome.action.setPopup({ popup: "" });
        return { ok: true, data: { cleared: true } };
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
  // Ensure next click stays on onClicked (no sticky popup)
  await chrome.action.setPopup({ popup: "" });

  const saveOpts: Parameters<typeof saveTabs>[0] = { scope: "current" };
  if (tab.id != null) saveOpts.tabId = tab.id;
  const result = await saveTabs(saveOpts);
  await chrome.storage.session.set({
    lastSaveResult: result,
    lastSaveAt: Date.now(),
  });

  try {
    await chrome.action.setPopup({ popup: "popup.html" });
    await chrome.action.openPopup();
  } catch {
    await chrome.action.setPopup({ popup: "" });
  }
}

function setupMenus(): void {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "save-tab",
      title: STRINGS.menuSaveTab,
      contexts: ["page", "action"],
    });
    chrome.contextMenus.create({
      id: "save-others",
      title: STRINGS.menuSaveOthers,
      contexts: ["action"],
    });
    chrome.contextMenus.create({
      id: "hibernate",
      title: STRINGS.menuHibernate,
      contexts: ["page", "action"],
    });
    chrome.contextMenus.create({
      id: "open-library",
      title: STRINGS.menuOpenLibrary,
      contexts: ["action"],
    });
  });
}

export function registerServiceWorkerListeners(): void {
  chrome.runtime.onInstalled.addListener(() => {
    void refreshBadgeFromDb();
    setupMenus();
    void chrome.action.setPopup({ popup: "" });
  });

  chrome.runtime.onStartup.addListener(() => {
    void refreshBadgeFromDb();
    setupMenus();
    void chrome.action.setPopup({ popup: "" });
  });

  chrome.action.onClicked.addListener((tab) => {
    void onActionClicked(tab).catch((e) => {
      console.error("onActionClicked failed", e);
    });
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    void handleRequest(message as Request)
      .then(sendResponse)
      .catch((e) => {
        sendResponse({
          ok: false,
          error: e instanceof Error ? e.message : STRINGS.errorGeneric,
        });
      });
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
    })().catch((e) => console.error("command failed", e));
  });

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    void (async () => {
      if (info.menuItemId === "save-tab" && tab?.id != null) {
        const result = await saveTabs({ scope: "current", tabId: tab.id });
        await chrome.storage.session.set({
          lastSaveResult: result,
          lastSaveAt: Date.now(),
        });
        if (result.needsConfirmation.length || result.needsUnsavedAck) {
          try {
            await chrome.action.setPopup({ popup: "popup.html" });
            await chrome.action.openPopup();
          } catch {
            await chrome.action.setPopup({ popup: "" });
          }
        }
      } else if (info.menuItemId === "save-others") {
        const opts: Parameters<typeof saveTabs>[0] = { scope: "others" };
        if (tab?.id != null) opts.tabId = tab.id;
        await saveTabs(opts);
      } else if (info.menuItemId === "open-library") {
        await chrome.tabs.create({ url: chrome.runtime.getURL("list.html") });
      } else if (info.menuItemId === "hibernate" && tab?.id != null) {
        await handleRequest({ type: "discard-tab", tabId: tab.id });
      }
    })().catch((e) => console.error("context menu failed", e));
  });

  setupMenus();
  void chrome.action.setPopup({ popup: "" });
  void refreshBadgeFromDb();
}
