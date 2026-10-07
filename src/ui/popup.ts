import { STRINGS } from "../strings.js";
import type { Database, SaveResult, SavedTab } from "../types.js";
import { estimateMemoryFreedMb } from "../core/scope.js";
import { searchEntries, sortEntriesNewestFirst } from "../core/tabs-logic.js";
import {
  applyTheme,
  downloadText,
  formatTime,
  listenStorageReload,
  renderFavicon,
  send,
  text,
} from "./shared.js";

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

let database: Database | null = null;
let query = "";
let undoTimer: number | null = null;
let reloadTimer: number | null = null;

function showStatus(
  message: string,
  kind: "ok" | "warn" | "danger" = "ok",
  undoIds: string[] = [],
  ttlMs = 12_000,
): void {
  const el = $("status");
  el.hidden = false;
  el.className = `banner fold ${kind}`;
  el.replaceChildren();
  const span = document.createElement("span");
  span.textContent = message;
  el.append(span);
  if (undoIds.length) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "btn-undo";
    btn.textContent = STRINGS.undo;
    btn.addEventListener("click", () => void doUndo());
    el.append(btn);
    if (undoTimer) window.clearTimeout(undoTimer);
    undoTimer = window.setTimeout(() => {
      el.querySelectorAll("button").forEach((b) => b.remove());
    }, ttlMs);
  }
}

async function doUndo(): Promise<void> {
  const res = await send<{ message: string }>({ type: "undo" });
  if (res.ok) showStatus(res.data.message, "ok");
  else showStatus(res.error, "warn");
  await load();
}

function renderOnboarding(settings: Database["settings"]): void {
  const box = $("onboarding");
  if (settings.onboardingComplete) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  let step = 0;
  const steps = [
    { title: STRINGS.onboarding1Title, body: STRINGS.onboarding1Body },
    { title: STRINGS.onboarding2Title, body: STRINGS.onboarding2Body },
    { title: STRINGS.onboarding3Title, body: STRINGS.onboarding3Body },
  ];
  const paint = () => {
    box.replaceChildren();
    const h = document.createElement("h2");
    h.textContent = steps[step]!.title;
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = steps[step]!.body;
    const row = document.createElement("div");
    row.className = "row";
    const skip = document.createElement("button");
    skip.type = "button";
    skip.textContent = STRINGS.skip;
    skip.addEventListener("click", () => void finishOnboarding());
    const next = document.createElement("button");
    next.type = "button";
    next.className = "primary";
    next.textContent =
      step === steps.length - 1 ? STRINGS.getStarted : STRINGS.next;
    next.addEventListener("click", () => {
      if (step >= steps.length - 1) void finishOnboarding();
      else {
        step += 1;
        paint();
      }
    });
    row.append(skip, next);
    box.append(h, p, row);
  };
  paint();
}

async function finishOnboarding(): Promise<void> {
  const res = await send({ type: "complete-onboarding" });
  if (res.ok) {
    $("onboarding").hidden = true;
  } else {
    showStatus(res.error, "danger");
  }
}

function renderList(entries: SavedTab[]): void {
  const list = $("list");
  list.replaceChildren();
  if (!entries.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    const t = document.createElement("p");
    t.textContent = STRINGS.emptyTitle;
    const b = document.createElement("p");
    b.className = "muted";
    b.textContent = STRINGS.emptyBody;
    empty.append(t, b);
    list.append(empty);
    return;
  }
  for (const entry of entries) {
    const row = document.createElement("article");
    row.className = "entry";
    row.role = "listitem";
    const icon = document.createElement("div");
    renderFavicon(icon, entry.favicon || entry.url, entry.title);
    row.append(icon);
    const main = document.createElement("div");
    const title = document.createElement("p");
    title.className = "entry-title";
    title.textContent = entry.title;
    const url = document.createElement("p");
    url.className = "entry-url mono";
    url.textContent = entry.url;
    const meta = document.createElement("p");
    meta.className = "entry-meta";
    if (entry.group) {
      const g = document.createElement("span");
      g.className = "tag";
      g.textContent = entry.group;
      meta.append(g);
    }
    meta.append(document.createTextNode(formatTime(entry.savedAt)));
    main.append(title, url, meta);
    row.append(main);
    const actions = document.createElement("div");
    actions.className = "stack";
    const restore = document.createElement("button");
    restore.type = "button";
    restore.className = "btn-restore";
    restore.textContent = STRINGS.restore;
    restore.addEventListener("click", () => {
      row.classList.add("restoring");
      void restoreOne(entry.id);
    });
    const del = document.createElement("button");
    del.type = "button";
    del.className = "danger";
    del.textContent = STRINGS.delete;
    del.addEventListener("click", () => {
      row.classList.add("leaving");
      window.setTimeout(() => void deleteOne(entry.id), 180);
    });
    actions.append(restore, del);
    row.append(actions);
    list.append(row);
  }
}

let isRestoring = false;

async function restoreOne(id: string): Promise<void> {
  if (isRestoring) return;
  isRestoring = true;
  try {
    const res = await send<{ message: string }>({
      type: "restore",
      ids: [id],
      mode: "all",
    });
    if (!res.ok) showStatus(res.error, "danger");
    else showStatus(res.data.message, "ok");
    await load();
  } finally {
    isRestoring = false;
  }
}

async function deleteOne(id: string): Promise<void> {
  const res = await send({ type: "delete", ids: [id] });
  if (!res.ok) showStatus(res.error, "danger");
  await load();
}

async function confirmDialog(message: string): Promise<boolean> {
  const dialog = $("confirm-dialog") as unknown as HTMLDialogElement;
  dialog.returnValue = "";
  text($("confirm-title"), STRINGS.confirmDialogLabel);
  text($("confirm-text"), message);
  text($("confirm-cancel"), STRINGS.cancel);
  text($("confirm-ok"), STRINGS.ok);
  dialog.showModal();
  return await new Promise((resolve) => {
    dialog.addEventListener(
      "close",
      () => resolve(dialog.returnValue === "ok"),
      { once: true },
    );
  });
}

async function batchDialog(
  message: string,
): Promise<"batch" | "all" | "cancel"> {
  const dialog = $("batch-dialog") as unknown as HTMLDialogElement;
  dialog.returnValue = "cancel";
  text($("batch-title"), STRINGS.batchRestoreTitle);
  text($("batch-text"), message);
  text($("batch-cancel"), STRINGS.cancel);
  text($("batch-all"), STRINGS.restoreAllAtOnce);
  text($("batch-ok"), STRINGS.restoreBatch);
  dialog.showModal();
  return await new Promise((resolve) => {
    dialog.addEventListener(
      "close",
      () => {
        const v = dialog.returnValue;
        if (v === "batch" || v === "all") resolve(v);
        else resolve("cancel");
      },
      { once: true },
    );
  });
}

async function load(): Promise<void> {
  const list = $("list");
  list.replaceChildren();
  const loading = document.createElement("div");
  loading.className = "loading muted";
  loading.textContent = STRINGS.loading;
  list.append(loading);

  const res = await send<{
    database: Database | null;
    corrupt?: boolean;
    message?: string;
  }>({ type: "get-state" });

  if (!res.ok) {
    database = null;
    list.replaceChildren();
    text($("count"), "");
    showStatus(res.error, "danger");
    return;
  }

  if (res.data.corrupt || !res.data.database) {
    database = null;
    list.replaceChildren();
    text($("count"), "");
    showStatus(res.data.message ?? STRINGS.corruptedTitle, "danger");
    const box = document.createElement("div");
    box.className = "error-box stack";
    const p = document.createElement("p");
    p.textContent = STRINGS.corruptedBody;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = STRINGS.exportRaw;
    btn.addEventListener("click", async () => {
      const raw = await send<{ text: string }>({ type: "export-raw" });
      if (raw.ok) downloadText("tabfold-raw-backup.json", raw.data.text);
      else showStatus(raw.error, "danger");
    });
    box.append(p, btn);
    list.append(box);
    return;
  }

  database = res.data.database;
  applyTheme(database.settings.theme);
  renderOnboarding(database.settings);

  const scope = $("scope") as HTMLSelectElement;
  if (!scope.options.length) {
    for (const [v, label] of [
      ["current", STRINGS.scopeCurrent],
      ["others", STRINGS.scopeOthers],
      ["window", STRINGS.scopeWindow],
    ] as const) {
      const o = document.createElement("option");
      o.value = v;
      o.textContent = label;
      scope.append(o);
    }
  }
  scope.value = database.settings.defaultScope;

  const filtered = sortEntriesNewestFirst(
    searchEntries(database.entries, query),
  );
  renderList(filtered);
  const mb = estimateMemoryFreedMb(database.stats.totalClosed);
  text(
    $("count"),
    STRINGS.footerCount(
      filtered.length,
      database.entries.length,
      STRINGS.estimatedMemoryClosed(mb),
    ),
  );

  const statusEl = $("status");
  const hasExistingStatus =
    !statusEl.hidden &&
    (statusEl.textContent.trim().length > 0 || statusEl.children.length > 0);
  if (
    database.undo &&
    database.undo.expiresAt > Date.now() &&
    database.undo.ids.length > 0 &&
    !hasExistingStatus
  ) {
    const count = database.undo.ids.length;
    const msg = count === 1 ? STRINGS.savedOne : STRINGS.savedN(count);
    const remainingMs = Math.max(0, database.undo.expiresAt - Date.now());
    showStatus(msg, "ok", database.undo.ids, remainingMs);
  }
}

async function handleSaveResult(data: SaveResult): Promise<void> {
  if (data.needsUnsavedAck && data.confirmToken) {
    const ok = await confirmDialog(STRINGS.unsavedHintBefore);
    if (!ok) {
      showStatus(STRINGS.nothingSaved, "warn");
      return;
    }
    const again = await send<SaveResult>({
      type: "save",
      confirmToken: data.confirmToken,
      confirmedUnsaved: true,
      confirmedAudio: false,
    });
    if (again.ok) await handleSaveResult(again.data);
    else showStatus(again.error, "danger");
    return;
  }
  if (data.needsConfirmation.length && data.confirmToken) {
    const ok = await confirmDialog(STRINGS.audioConfirm);
    if (!ok) {
      showStatus(STRINGS.nothingSaved, "warn");
      return;
    }
    const again = await send<SaveResult>({
      type: "save",
      confirmedAudio: true,
      confirmedUnsaved: true,
      confirmToken: data.confirmToken,
    });
    if (again.ok) await handleSaveResult(again.data);
    else showStatus(again.error, "danger");
    return;
  }
  showStatus(data.message, data.saved ? "ok" : "warn", data.undoIds);
  await load();
}

async function saveWithScope(): Promise<void> {
  const scope = ($("scope") as HTMLSelectElement).value as
    "current" | "others" | "window";
  const res = await send<SaveResult>({ type: "save", scope });
  if (!res.ok) {
    showStatus(res.error, "danger");
    return;
  }
  await handleSaveResult(res.data);
}

function initScopeSelect(): void {
  const scope = $("scope") as HTMLSelectElement;
  if (!scope.options.length) {
    for (const [v, label] of [
      ["current", STRINGS.scopeCurrent],
      ["others", STRINGS.scopeOthers],
      ["window", STRINGS.scopeWindow],
    ] as const) {
      const o = document.createElement("option");
      o.value = v;
      o.textContent = label;
      scope.append(o);
    }
  }
}

async function init(): Promise<void> {
  initScopeSelect();
  // Clear sticky action popup so next toolbar click saves again (C10)
  void send({ type: "clear-action-popup" });

  text($("tagline"), STRINGS.tagline);
  text($("btn-save"), STRINGS.saveThisTab);
  text($("btn-hibernate"), STRINGS.discardTab);
  text($("btn-restore-all"), STRINGS.restoreAll);
  text($("btn-export"), STRINGS.exportJson);
  text($("btn-demo"), STRINGS.loadDemo);
  text($("btn-library"), STRINGS.openFullList);
  text($("btn-settings"), STRINGS.openSettings);
  text($("label-search"), STRINGS.searchLabel);
  ($("search") as HTMLInputElement).placeholder = STRINGS.searchPlaceholder;

  $("btn-save").addEventListener("click", () => void saveWithScope());
  $("btn-hibernate").addEventListener("click", async () => {
    const tabs = await send<{
      tabs: Array<{
        id: number;
        title: string;
        active: boolean;
        discarded: boolean;
      }>;
    }>({
      type: "list-window-tabs",
    });
    if (!tabs.ok || !tabs.data.tabs.length) {
      showStatus(STRINGS.pickWebTab, "warn");
      return;
    }
    const currentTab = tabs.data.tabs.find((t) => t.active);
    if (currentTab) {
      showStatus(STRINGS.activeCannotHibernate, "warn");
      return;
    }
    showStatus(STRINGS.pickWebTab, "warn");
  });
  $("btn-library").addEventListener(
    "click",
    () => void send({ type: "open-library" }),
  );
  $("btn-settings").addEventListener(
    "click",
    () => void chrome.runtime.openOptionsPage(),
  );

  try {
    const session = await chrome.storage.session.get([
      "lastSaveResult",
      "lastSaveAt",
    ]);
    const last = session?.lastSaveResult as SaveResult | undefined;
    const at = session?.lastSaveAt as number | undefined;
    if (last && at && Date.now() - at < 15_000) {
      await handleSaveResult(last);
      await chrome.storage.session.remove([
        "lastSaveResult",
        "pendingAudioConfirm",
      ]);
    }
  } catch {
    // Session read error non-fatal
  }
  $("btn-export").addEventListener("click", async () => {
    const res = await send<{ text: string }>({ type: "export-json" });
    if (res.ok)
      downloadText(`tabfold-export-${Date.now()}.json`, res.data.text);
    else showStatus(res.error, "danger");
  });
  $("btn-demo").addEventListener("click", async () => {
    const res = await send<{ message: string }>({ type: "load-demo" });
    if (res.ok) showStatus(res.data.message, "ok");
    else showStatus(res.error, "danger");
    await load();
  });
  $("btn-restore-all").addEventListener("click", async () => {
    if (!database?.entries.length || isRestoring) return;
    isRestoring = true;
    const btn = $("btn-restore-all");
    btn.setAttribute("aria-busy", "true");
    try {
      const ids = database.entries.map((e) => e.id);
      const res = await send<{
        message: string;
        needsBatchChoice?: boolean;
        pendingIds?: string[];
      }>({ type: "restore", ids });
      if (!res.ok) {
        showStatus(res.error, "danger");
        return;
      }
      if (res.data.needsBatchChoice) {
        const choice = await batchDialog(res.data.message);
        if (choice === "cancel") {
          showStatus(STRINGS.nothingSaved, "warn");
          return;
        }
        const again = await send<{ message: string }>({
          type: "restore",
          ids: res.data.pendingIds ?? ids,
          mode: choice,
        });
        if (again.ok) showStatus(again.data.message, "ok");
        else showStatus(again.error, "danger");
      } else {
        showStatus(res.data.message, "ok");
      }
      await load();
    } finally {
      isRestoring = false;
      btn.removeAttribute("aria-busy");
    }
  });
  $("search").addEventListener("input", (e) => {
    query = (e.target as HTMLInputElement).value;
    if (!database) return;
    renderList(sortEntriesNewestFirst(searchEntries(database.entries, query)));
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
      e.preventDefault();
      $("search").focus();
    }
  });

  listenStorageReload(() => {
    if (reloadTimer) window.clearTimeout(reloadTimer);
    reloadTimer = window.setTimeout(() => void load(), 50);
  });

  await load();
}

void init();
