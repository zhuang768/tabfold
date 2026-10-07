import { STRINGS } from "../strings.js";
import type {
  Database,
  ImportSummary,
  SaveResult,
  SavedTab,
} from "../types.js";
import { estimateMemoryFreedMb } from "../core/scope.js";
import {
  groupNames,
  searchEntries,
  sortEntriesNewestFirst,
} from "../core/tabs-logic.js";
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
let groupFilter = "";
let undoTimer: number | null = null;

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
  if (res.ok) {
    showStatus(res.data.message, "ok");
    await load();
  } else {
    showStatus(res.error, "danger");
  }
}

function renderStats(db: Database): void {
  const mb = estimateMemoryFreedMb(db.stats.totalClosed);
  text(
    $("stats"),
    `${STRINGS.statsOpen}: ${db.entries.length} · ${STRINGS.statsSaved}: ${db.stats.totalClosed} · ${STRINGS.statsRestored}: ${db.stats.totalRestored} · ${STRINGS.statsImported}: ${db.stats.totalImported} · ${STRINGS.estimatedMemoryClosed(mb)}. ${STRINGS.estimateDisclaimer}`,
  );
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

let isRestoring = false;

async function restoreWithGuard(ids: string[]): Promise<void> {
  if (isRestoring || !ids.length) return;
  isRestoring = true;
  try {
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
  }
}

function renderGroups(db: Database): void {
  const host = $("groups");
  host.replaceChildren();
  const names = groupNames(db.entries);
  const filter = $("group-filter") as HTMLSelectElement;
  const current = filter.value;
  filter.replaceChildren();
  const all = document.createElement("option");
  all.value = "";
  all.textContent = STRINGS.allGroups;
  filter.append(all);
  for (const g of names) {
    const o = document.createElement("option");
    o.value = g;
    o.textContent = g;
    filter.append(o);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = `${STRINGS.restoreGroup}: ${g}`;
    btn.addEventListener("click", () => void restoreGroup(g));
    host.append(btn);
  }
  filter.value = current;
}

async function restoreGroup(group: string): Promise<void> {
  if (!database) return;
  const ids = database.entries
    .filter((e) => e.group === group)
    .map((e) => e.id);
  await restoreWithGuard(ids);
}

function renderList(entries: SavedTab[]): void {
  const list = $("list");
  list.replaceChildren();
  if (!entries.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = STRINGS.emptyTitle;
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
    for (const t of entry.tags) {
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = t;
      meta.append(tag);
    }
    meta.append(document.createTextNode(` ${formatTime(entry.savedAt)}`));
    main.append(title, url, meta);
    row.append(main);
    const actions = document.createElement("div");
    actions.className = "row";
    const restore = document.createElement("button");
    restore.type = "button";
    restore.className = "btn-restore";
    restore.textContent = STRINGS.restore;
    restore.addEventListener("click", async () => {
      row.classList.add("restoring");
      try {
        await restoreWithGuard([entry.id]);
      } catch {
        row.classList.remove("restoring");
      }
    });
    const edit = document.createElement("button");
    edit.type = "button";
    edit.textContent = STRINGS.edit;
    edit.addEventListener("click", () => openEdit(entry));
    const del = document.createElement("button");
    del.type = "button";
    del.className = "danger";
    del.textContent = STRINGS.delete;
    del.addEventListener("click", () => {
      row.classList.add("leaving");
      window.setTimeout(async () => {
        const res = await send({ type: "delete", ids: [entry.id] });
        if (!res.ok) {
          row.classList.remove("leaving");
          showStatus(res.error, "danger");
        }
        await load();
      }, 180);
    });
    actions.append(restore, edit, del);
    row.append(actions);
    list.append(row);
  }
}

function openEdit(entry: SavedTab): void {
  const dialog = $("edit-dialog") as unknown as HTMLDialogElement;
  dialog.returnValue = "";
  ($("edit-id") as HTMLInputElement).value = entry.id;
  ($("edit-group") as HTMLInputElement).value = entry.group;
  ($("edit-tags") as HTMLInputElement).value = entry.tags.join(", ");
  dialog.showModal();
}

function paint(): void {
  if (!database) return;
  let entries = searchEntries(database.entries, query);
  if (groupFilter) entries = entries.filter((e) => e.group === groupFilter);
  renderList(sortEntriesNewestFirst(entries));
}

async function refreshTargets(): Promise<void> {
  const select = $("target-tab") as HTMLSelectElement;
  select.replaceChildren();
  const res = await send<{
    tabs: Array<{
      id: number;
      title: string;
      url: string;
      discarded?: boolean;
    }>;
  }>({ type: "list-window-tabs" });
  if (!res.ok) {
    showStatus(res.error, "danger");
    return;
  }
  if (!res.data.tabs.length) {
    const o = document.createElement("option");
    o.value = "";
    o.textContent = STRINGS.pickWebTab;
    select.append(o);
    return;
  }
  for (const t of res.data.tabs) {
    const o = document.createElement("option");
    o.value = String(t.id);
    o.textContent = `${t.title} — ${t.url}${t.discarded ? STRINGS.hibernatedSuffix : ""}`;
    select.append(o);
  }
}

async function load(): Promise<void> {
  const res = await send<{
    database: Database | null;
    backups?: unknown[];
    corrupt?: boolean;
    message?: string;
  }>({ type: "get-state" });
  if (!res.ok) {
    database = null;
    $("list").replaceChildren();
    const select = $("target-tab") as HTMLSelectElement;
    select.replaceChildren();
    select.value = "";
    showStatus(res.error, "danger");
    return;
  }
  if (!res.data.database) {
    database = null;
    $("list").replaceChildren();
    const select = $("target-tab") as HTMLSelectElement;
    select.replaceChildren();
    select.value = "";
    showStatus(res.data.message ?? STRINGS.corruptedTitle, "danger");
    return;
  }
  database = res.data.database;
  applyTheme(database.settings.theme);
  renderStats(database);
  renderGroups(database);
  paint();

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
  await refreshTargets();
}

async function init(): Promise<void> {
  text($("subtitle"), STRINGS.tagline);
  text($("btn-save"), STRINGS.saveSelectedTab);
  text($("btn-hibernate"), STRINGS.discardTab);
  text($("btn-restore-all"), STRINGS.restoreAll);
  text($("btn-settings"), STRINGS.openSettings);
  text($("btn-export"), STRINGS.exportJson);
  text($("btn-import-json"), STRINGS.importJson);
  text($("btn-import-text"), STRINGS.importText);
  text($("btn-demo"), STRINGS.loadDemo);
  text($("btn-clear"), STRINGS.clearAll);
  text($("targets-title"), STRINGS.pickTarget);
  text($("btn-refresh-targets"), STRINGS.refreshTargets);
  text($("edit-title"), STRINGS.editDialogTitle);
  text($("label-group"), STRINGS.groupLabel);
  text($("label-tags"), STRINGS.tagsHint);
  text($("edit-cancel"), STRINGS.cancel);
  text($("edit-save"), STRINGS.save);
  ($("search") as HTMLInputElement).placeholder = STRINGS.searchPlaceholder;

  $("btn-save").addEventListener("click", async () => {
    const id = Number(($("target-tab") as HTMLSelectElement).value);
    if (!id) {
      showStatus(STRINGS.pickWebTab, "warn");
      return;
    }
    const res = await send<SaveResult>({
      type: "save",
      scope: "current",
      tabIds: [id],
    });
    let currentRes = res;
    let attempts = 0;
    while (currentRes.ok && attempts++ < 5) {
      if (currentRes.data.needsUnsavedAck && currentRes.data.confirmToken) {
        const ok = window.confirm(STRINGS.unsavedHintBefore);
        if (!ok) {
          showStatus(STRINGS.nothingSaved, "warn");
          return;
        }
        currentRes = await send<SaveResult>({
          type: "save",
          confirmToken: currentRes.data.confirmToken,
          confirmedUnsaved: true,
        });
        continue;
      }
      if (
        currentRes.data.needsConfirmation.length &&
        currentRes.data.confirmToken
      ) {
        const ok = window.confirm(STRINGS.audioConfirm);
        if (!ok) {
          showStatus(STRINGS.nothingSaved, "warn");
          return;
        }
        currentRes = await send<SaveResult>({
          type: "save",
          confirmedAudio: true,
          confirmedUnsaved: true,
          confirmToken: currentRes.data.confirmToken,
        });
        continue;
      }
      break;
    }
    if (!currentRes.ok) {
      showStatus(currentRes.error, "danger");
      return;
    }
    showStatus(
      currentRes.data.message,
      currentRes.data.saved ? "ok" : "warn",
      currentRes.data.undoIds,
    );
    await load();
  });

  $("btn-hibernate").addEventListener("click", async () => {
    const id = Number(($("target-tab") as HTMLSelectElement).value);
    if (!id) {
      showStatus(STRINGS.pickWebTab, "warn");
      return;
    }
    const res = await send({ type: "discard-tab", tabId: id });
    showStatus(
      res.ok ? STRINGS.hibernateOk : res.error,
      res.ok ? "ok" : "danger",
    );
    await refreshTargets();
  });

  $("btn-refresh-targets").addEventListener(
    "click",
    () => void refreshTargets(),
  );
  $("btn-restore-all").addEventListener("click", async () => {
    if (!database?.entries.length || isRestoring) return;
    const btn = $("btn-restore-all");
    btn.setAttribute("aria-busy", "true");
    try {
      await restoreWithGuard(database.entries.map((e) => e.id));
    } finally {
      btn.removeAttribute("aria-busy");
    }
  });
  $("btn-settings").addEventListener(
    "click",
    () => void chrome.runtime.openOptionsPage(),
  );
  $("btn-export").addEventListener("click", async () => {
    const res = await send<{ text: string }>({ type: "export-json" });
    if (res.ok)
      downloadText(`tabfold-export-${Date.now()}.json`, res.data.text);
    else showStatus(res.error, "danger");
  });
  $("btn-import-json").addEventListener("click", () =>
    $("import-json").click(),
  );
  $("btn-import-text").addEventListener("click", () =>
    $("import-text").click(),
  );
  $("btn-demo").addEventListener("click", async () => {
    const res = await send<{ message: string }>({ type: "load-demo" });
    if (res.ok) showStatus(res.data.message, "ok");
    else showStatus(res.error, "danger");
    await load();
  });
  $("btn-clear").addEventListener("click", async () => {
    if (!window.confirm(STRINGS.confirmClear)) return;
    const res = await send({ type: "clear" });
    if (res.ok) showStatus(STRINGS.cleared, "ok");
    else showStatus(res.error || STRINGS.clearFailed, "danger");
    await load();
  });
  $("search").addEventListener("input", (e) => {
    query = (e.target as HTMLInputElement).value;
    paint();
  });
  $("group-filter").addEventListener("change", (e) => {
    groupFilter = (e.target as HTMLSelectElement).value;
    paint();
  });
  $("import-json").addEventListener("change", async (e) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const textContent = await file.text();
      const res = await send<{ summary: ImportSummary }>({
        type: "import-json",
        text: textContent,
      });
      if (res.ok) showStatus(res.data.summary.message, "ok");
      else showStatus(res.error, "danger");
      await load();
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "object" &&
              err !== null &&
              "message" in err &&
              typeof (err as { message: unknown }).message === "string"
            ? (err as { message: string }).message
            : "File read failed";
      showStatus(msg, "danger");
    } finally {
      input.value = "";
    }
  });
  $("import-text").addEventListener("change", async (e) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const textContent = await file.text();
      const res = await send<{ summary: ImportSummary }>({
        type: "import-text",
        text: textContent,
      });
      if (res.ok) showStatus(res.data.summary.message, "ok");
      else showStatus(res.error, "danger");
      await load();
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "object" &&
              err !== null &&
              "message" in err &&
              typeof (err as { message: unknown }).message === "string"
            ? (err as { message: string }).message
            : "File read failed";
      showStatus(msg, "danger");
    } finally {
      input.value = "";
    }
  });
  ($("edit-dialog") as unknown as HTMLDialogElement).addEventListener(
    "close",
    () => {
      const dialog = $("edit-dialog") as unknown as HTMLDialogElement;
      if (dialog.returnValue !== "save") return;
      const id = ($("edit-id") as HTMLInputElement).value;
      const group = ($("edit-group") as HTMLInputElement).value.trim();
      const tags = ($("edit-tags") as HTMLInputElement).value
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      void send({ type: "edit-entry", id, group, tags }).then(async (res) => {
        if (!res.ok) showStatus(res.error, "danger");
        await load();
      });
    },
  );

  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
      e.preventDefault();
      $("search").focus();
    }
  });

  let reloadTimer: number | undefined;
  listenStorageReload(() => {
    if (reloadTimer) window.clearTimeout(reloadTimer);
    reloadTimer = window.setTimeout(() => void load(), 50);
  });

  await load();
}

void init();
