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
  type UndoState,
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
  DB_KEY,
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
    const s = getStore();
    const data = await s.getDriver().get([DB_KEY]);
    const raw = data?.[DB_KEY] as { entries?: unknown[] } | undefined;
    if (raw && Array.isArray(raw.entries)) {
      await updateBadge(raw.entries.length);
      return;
    }
  } catch {
    // fallback
  }
  await updateBadge(0);
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
const OPERATION_JOURNAL_KEY = "tabfold_op_journal";
const DURABLE_UNDO_KEY = "tabfold_durable_undo";
const INTENT_KEY = "tabfold_op_intent";

const inMemoryJournals: Record<string, Record<string, number>> = Object.create(
  null,
);

function createCleanDict(): Record<string, number> {
  return Object.create(null) as Record<string, number>;
}

async function getJournal(key: string): Promise<Record<string, number>> {
  const result = createCleanDict();
  if (inMemoryJournals[key]) {
    for (const id of Object.getOwnPropertyNames(inMemoryJournals[key])) {
      const v = inMemoryJournals[key][id];
      if (typeof v === "number" && Number.isFinite(v) && v > 0) {
        result[id] = v;
      }
    }
  }
  try {
    if (typeof chrome !== "undefined" && chrome.storage?.session) {
      const data = await chrome.storage.session.get(key);
      const raw = data?.[key];
      if (typeof raw === "object" && raw !== null) {
        for (const id of Object.getOwnPropertyNames(raw)) {
          const v = Reflect.get(raw, id);
          if (typeof v === "number" && Number.isFinite(v) && v > 0) {
            result[id] = v;
          }
        }
      }
    }
  } catch {
    // best effort session read
  }
  try {
    const s = getStore();
    const data = await s.getDriver().get([key, OPERATION_JOURNAL_KEY]);
    const raw = data?.[key] ?? data?.[OPERATION_JOURNAL_KEY];
    if (typeof raw === "object" && raw !== null) {
      for (const id of Object.getOwnPropertyNames(raw)) {
        const v = Reflect.get(raw, id);
        if (typeof v === "number" && Number.isFinite(v) && v > 0) {
          result[id] = v;
        }
      }
    }
  } catch (e) {
    throw new Error(
      `${STRINGS.journalReadUnavailable}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  return result;
}

function serializePlainDict(
  current: Record<string, number>,
): Record<string, number> {
  const plain: Record<string, number> = {};
  for (const k of Object.getOwnPropertyNames(current)) {
    const v = Reflect.get(current, k);
    if (typeof v === "number" && Number.isFinite(v) && v > 0) {
      Object.defineProperty(plain, k, {
        value: v,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
  }
  return plain;
}

async function recordJournalEntry(
  key: string,
  id: string,
  tabId: number,
): Promise<void> {
  if (!inMemoryJournals[key]) {
    inMemoryJournals[key] = createCleanDict();
  }
  inMemoryJournals[key][id] = tabId;
  const current = await getJournal(key).catch(() => createCleanDict());
  current[id] = tabId;
  const plain = serializePlainDict(current);

  let sessionOk = false;
  let driverOk = false;
  let sessionErr: unknown = null;
  let driverErr: unknown = null;

  try {
    if (typeof chrome !== "undefined" && chrome.storage?.session) {
      await chrome.storage.session.set({ [key]: plain });
      sessionOk = true;
    }
  } catch (e) {
    sessionErr = e;
  }

  try {
    const s = getStore();
    await s.getDriver().set({ [key]: plain, [OPERATION_JOURNAL_KEY]: plain });
    driverOk = true;
  } catch (e) {
    driverErr = e;
  }

  if (!sessionOk && !driverOk) {
    const err =
      driverErr || sessionErr || new Error(STRINGS.auxStorageUnavailable);
    throw err;
  }
}

async function clearJournal(key: string): Promise<void> {
  delete inMemoryJournals[key];
  try {
    if (typeof chrome !== "undefined" && chrome.storage?.session) {
      await chrome.storage.session.remove(key);
    }
  } catch {
    // best effort
  }
  try {
    const s = getStore();
    await s.getDriver().remove([key, OPERATION_JOURNAL_KEY]);
  } catch {
    // best effort
  }
}

function getJournalTabId(
  journal: Record<string, number>,
  id: string,
): number | null {
  if (Object.prototype.hasOwnProperty.call(journal, id)) {
    const desc = Object.getOwnPropertyDescriptor(journal, id);
    const v = desc?.value ?? Reflect.get(journal, id);
    if (typeof v === "number" && Number.isFinite(v) && v > 0) {
      return v;
    }
  }
  return null;
}

interface OperationIntent {
  opId: string;
  entryId?: string;
  url?: string;
  windowId?: number;
  timestamp: number;
  tabIds?: number[];
  entryIds?: string[];
  urls?: string[];
  expiresAt?: number;
}

let inMemoryIntent: OperationIntent | null = null;
let resetEpoch = 0;
let sessionPublicationQueue: Promise<void> = Promise.resolve();

function withSessionPublication<T>(task: () => Promise<T>): Promise<T> {
  const next = sessionPublicationQueue.then(task, task);
  sessionPublicationQueue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

async function recordIntent(intent: OperationIntent): Promise<void> {
  inMemoryIntent = intent;
  let driverSaved = false;
  let sessionSaved = false;
  let driverErr: unknown = null;
  let sessionErr: unknown = null;

  try {
    const s = getStore();
    await s.getDriver().set({ [INTENT_KEY]: intent });
    const readBack = (await s.getDriver().get([INTENT_KEY]))[INTENT_KEY] as
      OperationIntent | undefined;
    if (
      readBack &&
      (intent.opId === "save"
        ? Array.isArray(readBack.entryIds) &&
          readBack.entryIds.length === (intent.entryIds?.length ?? 0)
        : readBack.url === intent.url && readBack.entryId === intent.entryId)
    ) {
      driverSaved = true;
    }
  } catch (e) {
    driverErr = e;
  }

  try {
    if (typeof chrome !== "undefined" && chrome.storage?.session) {
      await chrome.storage.session.set({ [INTENT_KEY]: intent });
      sessionSaved = true;
    }
  } catch (e) {
    sessionErr = e;
  }

  if (!driverSaved && !sessionSaved) {
    const err =
      driverErr || sessionErr || new Error(STRINGS.auxStorageUnavailable);
    throw err;
  }
}

async function clearIntent(): Promise<void> {
  inMemoryIntent = null;
  try {
    const s = getStore();
    await s.getDriver().remove([INTENT_KEY]);
  } catch {
    // best effort
  }
  try {
    if (typeof chrome !== "undefined" && chrome.storage?.session) {
      await chrome.storage.session.remove([INTENT_KEY]);
    }
  } catch {
    // best effort
  }
}

export async function getPendingIntent(): Promise<OperationIntent | null> {
  if (inMemoryIntent) return inMemoryIntent;
  try {
    if (typeof chrome !== "undefined" && chrome.storage?.session) {
      const sess = await chrome.storage.session.get(INTENT_KEY);
      if (sess[INTENT_KEY] && typeof sess[INTENT_KEY] === "object") {
        return sess[INTENT_KEY] as OperationIntent;
      }
    }
  } catch {
    // best effort
  }
  try {
    const s = getStore();
    const data = await s.getDriver().get([INTENT_KEY]);
    if (data[INTENT_KEY] && typeof data[INTENT_KEY] === "object") {
      return data[INTENT_KEY] as OperationIntent;
    }
  } catch {
    // best effort
  }
  return null;
}

async function reconstructPendingSaveUndo(
  db: Database,
): Promise<UndoState | null> {
  const intent = await getPendingIntent();
  if (
    !intent ||
    intent.opId !== "save" ||
    !Array.isArray(intent.tabIds) ||
    !Array.isArray(intent.entryIds) ||
    !intent.entryIds.length
  ) {
    return null;
  }
  if (typeof intent.expiresAt === "number" && intent.expiresAt <= Date.now()) {
    await clearIntent().catch(() => undefined);
    return null;
  }

  const actuallyClosedEntryIds: string[] = [];
  if (typeof chrome !== "undefined" && chrome.tabs?.get) {
    let queryTabs: chrome.tabs.Tab[] = [];
    if (chrome.tabs.query) {
      try {
        const res = chrome.tabs.query({});
        queryTabs = (
          res && typeof (res as Promise<unknown>).then === "function"
            ? await (res as Promise<chrome.tabs.Tab[]>).catch(() => [])
            : Array.isArray(res)
              ? res
              : []
        ) as chrome.tabs.Tab[];
      } catch {
        // ignore query failure
      }
    }

    for (let i = 0; i < intent.tabIds.length; i++) {
      const tabId = intent.tabIds[i];
      const entryId = intent.entryIds[i];
      if (tabId != null && entryId != null) {
        try {
          await chrome.tabs.get(tabId);
        } catch (err: unknown) {
          if (queryTabs.some((t) => t.id === tabId)) {
            continue;
          }
          const errMsg = err instanceof Error ? err.message : String(err);
          const isDefiniteMissing =
            /no tab with id/i.test(errMsg) ||
            /missing tab/i.test(errMsg) ||
            /tab not found/i.test(errMsg);
          if (isDefiniteMissing) {
            actuallyClosedEntryIds.push(entryId);
          }
        }
      }
    }
  } else {
    actuallyClosedEntryIds.push(...intent.entryIds);
  }

  const existingIds = new Set(db.entries.map((e) => e.id));
  const validEntryIds = actuallyClosedEntryIds.filter((id) =>
    existingIds.has(id),
  );
  if (!validEntryIds.length) {
    return null;
  }

  const expiresAt =
    typeof intent.expiresAt === "number" && intent.expiresAt > Date.now()
      ? intent.expiresAt
      : (intent.timestamp ?? Date.now()) + UNDO_TTL_MS;

  const reconstructed: UndoState = {
    ids: validEntryIds,
    expiresAt,
  };

  try {
    const s = getStore();
    await s.getDriver().set({ [DURABLE_UNDO_KEY]: reconstructed });
    if (typeof chrome !== "undefined" && chrome.storage?.session) {
      await chrome.storage.session.set({ [DURABLE_UNDO_KEY]: reconstructed });
    }
  } catch {
    // best effort
  }

  return reconstructed;
}

async function verifyTabAlive(
  tabId: number,
  expectedUrl?: string,
): Promise<boolean> {
  if (typeof chrome === "undefined" || !chrome.tabs?.get) return false;
  try {
    const t = await chrome.tabs.get(tabId);
    if (!t) return false;
    if (expectedUrl) {
      return t.url === expectedUrl || t.pendingUrl === expectedUrl;
    }
    return true;
  } catch {
    return false;
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
      return emptySave({ message: STRINGS.invalidScope });
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
        undo: db.undo,
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

    const affectedWindowIds = new Set<number>();
    if (anchorWindowId != null && anchorWindowId >= 0) {
      affectedWindowIds.add(anchorWindowId);
    }

    for (const t of candidates) {
      if (t.id == null) continue;
      try {
        const fresh = await chrome.tabs.get(t.id);
        if (fresh.windowId != null && fresh.windowId >= 0) {
          affectedWindowIds.add(fresh.windowId);
        }
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
        const audioConfirmed = Boolean(options.confirmedAudio && bound);
        if (fresh.audible && !audioConfirmed) {
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
    if (toClose.length) {
      for (const wId of affectedWindowIds) {
        try {
          await ensureWindowSurvives(wId, toClose);
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
      }

      const actuallyClosed: number[] = [];
      const actuallyOpen: number[] = [];

      const targetEntryIds = toClose
        .map((id) => entryByTabId.get(id)?.id)
        .filter((x): x is string => Boolean(x));
      const targetUrls = toClose
        .map((id) => entryByTabId.get(id)?.url)
        .filter((x): x is string => Boolean(x));
      const saveTimestamp = Date.now();
      try {
        await recordIntent({
          opId: "save",
          tabIds: toClose,
          entryIds: targetEntryIds,
          urls: targetUrls,
          timestamp: saveTimestamp,
          expiresAt: saveTimestamp + UNDO_TTL_MS,
        });
      } catch {
        return emptySave({
          message: `${STRINGS.writeFailed} (${STRINGS.auxStorageUnavailable})`,
          skipped,
          failed: candidates.map((t) => ({
            title: t.title || "",
            url: t.url || "",
            reason: STRINGS.writeFailed,
          })),
        });
      }

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

      const closeTimestamp = Date.now();
      const durableUndoState: UndoState | null = actuallyClosedEntryIds.length
        ? {
            ids: actuallyClosedEntryIds,
            expiresAt: closeTimestamp + UNDO_TTL_MS,
          }
        : null;
      if (durableUndoState) {
        try {
          await s.getDriver().set({ [DURABLE_UNDO_KEY]: durableUndoState });
          if (typeof chrome !== "undefined" && chrome.storage?.session) {
            await chrome.storage.session.set({
              [DURABLE_UNDO_KEY]: durableUndoState,
            });
          }
        } catch {
          // best effort durable undo
        }
      }

      try {
        const cur = await s.readDatabaseUnlocked();
        await s.writeDatabaseUnlocked(
          {
            ...cur,
            stats: {
              ...cur.stats,
              totalClosed: cur.stats.totalClosed + closed,
            },
            undo: durableUndoState,
          },
          cur.revision,
        );
      } catch {
        statsWarning = true;
        try {
          const cur2 = await s.readDatabaseUnlocked();
          await s.writeDatabaseUnlocked(
            {
              ...cur2,
              undo: durableUndoState,
            },
            cur2.revision,
          );
        } catch {
          // ignore
        }
      }
      await clearIntent().catch(() => undefined);

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
          message: `${STRINGS.closeFailed}${STRINGS.savedTabsSomeNotClosed}${statsWarning ? STRINGS.statsUpdateWarning : ""}`,
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
      message += STRINGS.statsUpdateWarning;
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
    let journal: Record<string, number>;
    let undoJournal: Record<string, number>;
    try {
      journal = await getJournal(RESTORE_JOURNAL_KEY);
      undoJournal = await getJournal(UNDO_JOURNAL_KEY);
    } catch (e) {
      return {
        opened: 0,
        failed: targets.length,
        removed: 0,
        message:
          e instanceof Error ? e.message : STRINGS.journalReadUnavailable,
      };
    }

    for (let i = 0; i < ordered.length; i++) {
      const entry = ordered[i]!;
      if (batch && i > 0 && i % batchSize === 0) {
        await new Promise((r) => setTimeout(r, 400));
      }
      const existingTabId =
        getJournalTabId(journal, entry.id) ??
        getJournalTabId(undoJournal, entry.id);
      if (
        existingTabId != null &&
        (await verifyTabAlive(existingTabId, entry.url))
      ) {
        opened += 1;
        openedIds.push(entry.id);
        continue;
      }

      let adoptedTab: chrome.tabs.Tab | null = null;
      const activeIntent = await getPendingIntent();
      const hasIntentForEntry =
        activeIntent &&
        activeIntent.opId === "restore" &&
        activeIntent.entryId === entry.id;

      if (
        hasIntentForEntry &&
        typeof chrome !== "undefined" &&
        chrome.tabs?.query
      ) {
        try {
          const res = chrome.tabs.query({});
          const openTabs: chrome.tabs.Tab[] = (
            res && typeof (res as Promise<unknown>).then === "function"
              ? await (res as Promise<chrome.tabs.Tab[]>).catch(() => [])
              : Array.isArray(res)
                ? res
                : []
          ) as chrome.tabs.Tab[];
          const match = openTabs.find(
            (t) =>
              (t.url === entry.url || t.pendingUrl === entry.url) &&
              t.id != null,
          );
          if (match && match.id != null) {
            adoptedTab = match;
          }
        } catch {
          // ignore query failure
        }
      }

      let tab: chrome.tabs.Tab | null = adoptedTab;
      if (!tab) {
        try {
          await recordIntent({
            opId: "restore",
            entryId: entry.id,
            url: entry.url,
            windowId: entry.source.windowId,
            timestamp: Date.now(),
          });
          tab = await createTabSafe(entry, entry.source.windowId);
        } catch {
          await clearIntent().catch(() => undefined);
          failed += 1;
          continue;
        }
      }
      if (tab) {
        opened += 1;
        openedIds.push(entry.id);
        if (tab.id != null) {
          try {
            await recordJournalEntry(RESTORE_JOURNAL_KEY, entry.id, tab.id);
          } catch {
            // auxiliary recording failed
          }
        }
        await clearIntent().catch(() => undefined);
      } else {
        await clearIntent().catch(() => undefined);
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
      const reason = e instanceof Error ? e.message : STRINGS.persistFailed;
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
    const now = Date.now();
    let dbCandidate: UndoState | null = null;
    if (
      db.undo &&
      db.undo.expiresAt > now &&
      Array.isArray(db.undo.ids) &&
      db.undo.ids.length > 0
    ) {
      dbCandidate = db.undo;
    }

    let durableCandidate: UndoState | null = null;
    try {
      const durable = (await s.getDriver().get([DURABLE_UNDO_KEY]))[
        DURABLE_UNDO_KEY
      ] as UndoState | undefined;
      if (
        durable &&
        typeof durable === "object" &&
        Array.isArray(durable.ids) &&
        typeof durable.expiresAt === "number" &&
        durable.expiresAt > now
      ) {
        durableCandidate = durable;
      }
    } catch {
      // best effort
    }
    if (!durableCandidate) {
      try {
        if (typeof chrome !== "undefined" && chrome.storage?.session) {
          const sess = await chrome.storage.session.get(DURABLE_UNDO_KEY);
          const durable = sess[DURABLE_UNDO_KEY] as UndoState | undefined;
          if (
            durable &&
            typeof durable === "object" &&
            Array.isArray(durable.ids) &&
            typeof durable.expiresAt === "number" &&
            durable.expiresAt > now
          ) {
            durableCandidate = durable;
          }
        }
      } catch {
        // best effort
      }
    }

    if (!dbCandidate && !durableCandidate) {
      const pendingUndo = await reconstructPendingSaveUndo(db);
      if (pendingUndo) {
        durableCandidate = pendingUndo;
      }
    }

    let chosenUndo: UndoState | null = null;
    let chosenSource: "db" | "durable" | null = null;
    if (dbCandidate && durableCandidate) {
      if (durableCandidate.expiresAt >= dbCandidate.expiresAt) {
        chosenUndo = durableCandidate;
        chosenSource = "durable";
      } else {
        chosenUndo = dbCandidate;
        chosenSource = "db";
      }
    } else if (durableCandidate) {
      chosenUndo = durableCandidate;
      chosenSource = "durable";
    } else if (dbCandidate) {
      chosenUndo = dbCandidate;
      chosenSource = "db";
    }

    if (!chosenUndo || Date.now() > chosenUndo.expiresAt) {
      return { ok: false, message: STRINGS.undoExpired };
    }
    const ids = [...chosenUndo.ids];
    const expiresAt = chosenUndo.expiresAt;
    const entries = db.entries.filter((e) => ids.includes(e.id));
    const openedIds: string[] = [];
    const failedIds: string[] = [];
    let journal: Record<string, number>;
    let restoreJournal: Record<string, number>;
    try {
      journal = await getJournal(UNDO_JOURNAL_KEY);
      restoreJournal = await getJournal(RESTORE_JOURNAL_KEY);
    } catch (e) {
      return {
        ok: false,
        message:
          e instanceof Error ? e.message : STRINGS.journalReadUnavailable,
      };
    }

    for (const entry of entries) {
      const existingTabId =
        getJournalTabId(journal, entry.id) ??
        getJournalTabId(restoreJournal, entry.id);
      if (
        existingTabId != null &&
        (await verifyTabAlive(existingTabId, entry.url))
      ) {
        openedIds.push(entry.id);
        continue;
      }

      let adoptedTab: chrome.tabs.Tab | null = null;
      const activeIntent = await getPendingIntent();
      const hasIntentForEntry =
        activeIntent &&
        activeIntent.opId === "undo" &&
        activeIntent.entryId === entry.id;

      if (
        hasIntentForEntry &&
        typeof chrome !== "undefined" &&
        chrome.tabs?.query
      ) {
        try {
          const res = chrome.tabs.query({});
          const openTabs: chrome.tabs.Tab[] = (
            res && typeof (res as Promise<unknown>).then === "function"
              ? await (res as Promise<chrome.tabs.Tab[]>).catch(() => [])
              : Array.isArray(res)
                ? res
                : []
          ) as chrome.tabs.Tab[];
          const match = openTabs.find(
            (t) =>
              (t.url === entry.url || t.pendingUrl === entry.url) &&
              t.id != null,
          );
          if (match && match.id != null) {
            adoptedTab = match;
          }
        } catch {
          // ignore query failure
        }
      }

      let tab: chrome.tabs.Tab | null = adoptedTab;
      if (!tab) {
        try {
          await recordIntent({
            opId: "undo",
            entryId: entry.id,
            url: entry.url,
            timestamp: Date.now(),
          });
          tab = await createTabSafe(entry);
        } catch {
          await clearIntent().catch(() => undefined);
          failedIds.push(entry.id);
          continue;
        }
      }
      if (tab) {
        openedIds.push(entry.id);
        if (tab.id != null) {
          try {
            await recordJournalEntry(UNDO_JOURNAL_KEY, entry.id, tab.id);
          } catch {
            // auxiliary recording failed
          }
        }
        await clearIntent().catch(() => undefined);
      } else {
        await clearIntent().catch(() => undefined);
        failedIds.push(entry.id);
      }
    }
    const cur = await s.readDatabaseUnlocked();
    const remainingUndoIds = failedIds.filter((id) =>
      cur.entries.some((e) => e.id === id),
    );
    const hasRemaining = remainingUndoIds.length > 0 && Date.now() < expiresAt;

    const nextUndoInDb: UndoState | null = hasRemaining
      ? { ids: remainingUndoIds, expiresAt }
      : cur.undo &&
          cur.undo.expiresAt > Date.now() &&
          cur.undo.expiresAt > expiresAt
        ? cur.undo
        : null;

    await s.writeDatabaseUnlocked(
      {
        ...cur,
        entries: cur.entries.filter((e) => !openedIds.includes(e.id)),
        undo: nextUndoInDb,
      },
      cur.revision,
    );
    await clearJournal(UNDO_JOURNAL_KEY);
    await clearJournal(RESTORE_JOURNAL_KEY);

    if (hasRemaining) {
      const remainingDurable: UndoState = {
        ids: remainingUndoIds,
        expiresAt,
      };
      try {
        await s.getDriver().set({ [DURABLE_UNDO_KEY]: remainingDurable });
        if (typeof chrome !== "undefined" && chrome.storage?.session) {
          await chrome.storage.session.set({
            [DURABLE_UNDO_KEY]: remainingDurable,
          });
        }
      } catch {
        // best effort
      }
    } else {
      if (
        chosenSource === "durable" ||
        !durableCandidate ||
        durableCandidate.expiresAt <= expiresAt
      ) {
        try {
          await s.getDriver().remove([DURABLE_UNDO_KEY]);
          if (typeof chrome !== "undefined" && chrome.storage?.session) {
            await chrome.storage.session.remove([DURABLE_UNDO_KEY]);
          }
        } catch {
          // best effort
        }
      }
    }
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
          await reconstructPendingSaveUndo(database);
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
        if (
          req.tabId !== undefined &&
          (typeof req.tabId !== "number" || !Number.isInteger(req.tabId))
        ) {
          return { ok: false, error: STRINGS.missingTabId };
        }
        if (
          req.tabIds !== undefined &&
          (!Array.isArray(req.tabIds) ||
            req.tabIds.some(
              (t) => typeof t !== "number" || !Number.isInteger(t),
            ))
        ) {
          return { ok: false, error: STRINGS.invalidTabIds };
        }
        if (
          req.confirmedAudio !== undefined &&
          typeof req.confirmedAudio !== "boolean"
        ) {
          return { ok: false, error: STRINGS.confirmedAudioBoolean };
        }
        if (
          req.confirmedUnsaved !== undefined &&
          typeof req.confirmedUnsaved !== "boolean"
        ) {
          return { ok: false, error: STRINGS.confirmedUnsavedBoolean };
        }
        if (
          req.confirmToken !== undefined &&
          typeof req.confirmToken !== "string"
        ) {
          return { ok: false, error: STRINGS.confirmTokenString };
        }
        let scope: SaveScope = "current";
        if (req.scope !== undefined) {
          if (!isValidScope(req.scope)) {
            return { ok: false, error: STRINGS.invalidScope };
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
        if (
          !Array.isArray(req.ids) ||
          req.ids.some((x) => typeof x !== "string")
        ) {
          return { ok: false, error: STRINGS.invalidIdsArray };
        }
        const mode = req.mode as unknown as string;
        if (mode !== undefined && mode !== "all" && mode !== "batch") {
          return { ok: false, error: STRINGS.invalidRestoreMode };
        }
        return {
          ok: true,
          data: await restoreEntries(
            req.ids,
            mode != null ? { mode: mode as RestoreMode } : undefined,
          ),
        };
      }
      case "restore-group": {
        if (typeof req.group !== "string") {
          return { ok: false, error: STRINGS.groupMustBeString };
        }
        const mode = req.mode as unknown as string;
        if (mode !== undefined && mode !== "all" && mode !== "batch") {
          return { ok: false, error: STRINGS.invalidRestoreMode };
        }
        const db = await s.readDatabase();
        const ids = db.entries
          .filter((e) => e.group === req.group)
          .map((e) => e.id);
        return {
          ok: true,
          data: await restoreEntries(
            ids,
            mode != null ? { mode: mode as RestoreMode } : undefined,
          ),
        };
      }
      case "undo": {
        const r = await undoLastSave();
        return r.ok ? { ok: true, data: r } : { ok: false, error: r.message };
      }
      case "delete": {
        if (
          !Array.isArray(req.ids) ||
          req.ids.some((x) => typeof x !== "string")
        ) {
          return { ok: false, error: STRINGS.invalidIdsArray };
        }
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
        resetEpoch++;
        try {
          const cur = await s.readDatabase();
          await s.createBackup("before-reset", cur);
        } catch {
          // still allow reset
        }
        await s.resetAll();
        for (const k of Object.keys(inMemoryJournals)) {
          delete inMemoryJournals[k];
        }
        inMemoryIntent = null;
        await clearConfirm();
        await withSessionPublication(async () => {
          if (typeof chrome !== "undefined" && chrome.storage?.session) {
            try {
              await chrome.storage.session.clear();
            } catch {
              await chrome.storage.session.remove([
                "pendingConfirm",
                "lastSaveResult",
                "lastSaveAt",
                DURABLE_UNDO_KEY,
                INTENT_KEY,
                RESTORE_JOURNAL_KEY,
                UNDO_JOURNAL_KEY,
                OPERATION_JOURNAL_KEY,
              ]);
            }
          }
        });
        await refreshBadgeFromDb();
        return { ok: true, data: { reset: true } };
      }
      case "patch-settings": {
        if (!req.patch || typeof req.patch !== "object") {
          return { ok: false, error: STRINGS.invalidSettingsPatch };
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
            return { ok: false, error: STRINGS.unknownSettingsKey(k) };
          }
        }
        const patch = req.patch;
        if (
          patch.removeAfterRestore !== undefined &&
          typeof patch.removeAfterRestore !== "boolean"
        ) {
          return { ok: false, error: STRINGS.removeAfterRestoreBoolean };
        }
        if (
          patch.defaultScope !== undefined &&
          !isValidScope(patch.defaultScope)
        ) {
          return { ok: false, error: STRINGS.invalidDefaultScope };
        }
        if (
          patch.theme !== undefined &&
          patch.theme !== "light" &&
          patch.theme !== "dark" &&
          patch.theme !== "system"
        ) {
          return { ok: false, error: STRINGS.invalidTheme };
        }
        if (patch.whitelist !== undefined) {
          if (
            !Array.isArray(patch.whitelist) ||
            patch.whitelist.some((x) => typeof x !== "string")
          ) {
            return {
              ok: false,
              error: STRINGS.whitelistMustBeStringArray,
            };
          }
        }
        if (
          patch.onboardingComplete !== undefined &&
          typeof patch.onboardingComplete !== "boolean"
        ) {
          return { ok: false, error: STRINGS.onboardingCompleteBoolean };
        }
        if (
          patch.unsavedHintAcknowledged !== undefined &&
          typeof patch.unsavedHintAcknowledged !== "boolean"
        ) {
          return {
            ok: false,
            error: STRINGS.unsavedHintAcknowledgedBoolean,
          };
        }
        if (patch.restoreBatchSize !== undefined) {
          if (
            typeof patch.restoreBatchSize !== "number" ||
            !Number.isInteger(patch.restoreBatchSize) ||
            patch.restoreBatchSize < 1 ||
            patch.restoreBatchSize > 500
          ) {
            return {
              ok: false,
              error: STRINGS.invalidBatchSize,
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
        if (
          typeof req.id !== "string" ||
          !req.id.trim() ||
          typeof req.group !== "string" ||
          !Array.isArray(req.tags) ||
          req.tags.some((t) => typeof t !== "string")
        ) {
          return { ok: false, error: STRINGS.invalidEditParams };
        }
        await withMutationWrite((db) => ({
          ...db,
          entries: db.entries.map((e) =>
            e.id === req.id ? { ...e, group: req.group, tags: req.tags } : e,
          ),
        }));
        return { ok: true, data: { saved: true } };
      }
      case "import-json": {
        if (typeof req.text !== "string") {
          return { ok: false, error: STRINGS.textMustBeString };
        }
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
        if (typeof req.text !== "string") {
          return { ok: false, error: STRINGS.textMustBeString };
        }
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
        if (typeof req.id !== "string" || !req.id.trim()) {
          return { ok: false, error: STRINGS.invalidBackupId };
        }
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
          return { ok: false, error: STRINGS.missingTabId };
        }
        const tab = await chrome.tabs.get(req.tabId).catch(() => null);
        if (!tab) return { ok: false, error: STRINGS.tabNotFound };
        if (tab.active) {
          return { ok: false, error: STRINGS.cannotHibernateActive };
        }
        if (tab.pinned) return { ok: false, error: STRINGS.pinnedSkip };
        if (tab.audible)
          return { ok: false, error: STRINGS.cannotHibernateMedia };
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
        return { ok: false, error: STRINGS.unknownRequest };
      }
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : STRINGS.errorGeneric;
    return { ok: false, error: message };
  }
}

export async function onActionClicked(tab: chrome.tabs.Tab): Promise<void> {
  const currentEpoch = resetEpoch;
  // Ensure next click stays on onClicked (no sticky popup)
  await chrome.action.setPopup({ popup: "" });

  const saveOpts: Parameters<typeof saveTabs>[0] = { scope: "current" };
  if (tab.id != null) saveOpts.tabId = tab.id;
  const result = await saveTabs(saveOpts);
  if (currentEpoch !== resetEpoch) return;

  await withSessionPublication(async () => {
    if (currentEpoch !== resetEpoch) return;
    await chrome.storage.session.set({
      lastSaveResult: result,
      lastSaveAt: Date.now(),
    });
  });
  if (currentEpoch !== resetEpoch) return;

  try {
    await chrome.action.setPopup({ popup: "popup.html" });
    if (currentEpoch !== resetEpoch) return;
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

  async function handleContextMenuSave(
    opts: Parameters<typeof saveTabs>[0],
  ): Promise<void> {
    const currentEpoch = resetEpoch;
    const result = await saveTabs(opts);
    if (currentEpoch !== resetEpoch) return;
    try {
      await withSessionPublication(async () => {
        if (currentEpoch !== resetEpoch) return;
        await chrome.storage.session.set({
          lastSaveResult: result,
          lastSaveAt: Date.now(),
        });
      });
      if (currentEpoch !== resetEpoch) return;
    } catch {
      // session storage fallback
    }
    if (currentEpoch !== resetEpoch) return;
    if (result.needsConfirmation.length || result.needsUnsavedAck) {
      try {
        await chrome.action.setPopup({ popup: "popup.html" });
        if (currentEpoch !== resetEpoch) return;
        await chrome.action.openPopup();
      } catch {
        await chrome.action.setPopup({ popup: "" });
      }
    }
  }

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    void (async () => {
      if (info.menuItemId === "save-tab" && tab?.id != null) {
        await handleContextMenuSave({ scope: "current", tabId: tab.id });
      } else if (info.menuItemId === "save-others") {
        const opts: Parameters<typeof saveTabs>[0] = { scope: "others" };
        if (tab?.id != null) opts.tabId = tab.id;
        await handleContextMenuSave(opts);
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
