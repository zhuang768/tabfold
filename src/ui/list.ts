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
  letterAvatar,
  send,
  text,
} from "./shared.js";

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

let database: Database | null = null;
let query = "";
let groupFilter = "";

function showStatus(
  message: string,
  kind: "ok" | "warn" | "danger" = "ok",
): void {
  const el = $("status");
  el.hidden = false;
  el.className = `banner ${kind}`;
  el.textContent = message;
}

function renderStats(db: Database): void {
  const mb = estimateMemoryFreedMb(db.entries.length);
  text(
    $("stats"),
    `${STRINGS.statsSaved}: ${db.stats.totalSaved} · ${STRINGS.statsRestored}: ${db.stats.totalRestored} · ${STRINGS.estimatedMemory(mb)} · ${STRINGS.estimateDisclaimer}`,
  );
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
  all.textContent = "All groups";
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
  const res = await send<{ message: string; needsBatchChoice?: boolean }>({
    type: "restore-group",
    group,
    batch: false,
  });
  if (res.ok) showStatus(res.data.message, "ok");
  else showStatus(res.error, "danger");
  await load();
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

    if (entry.favicon) {
      const img = document.createElement("img");
      img.className = "favicon";
      img.alt = "";
      img.referrerPolicy = "no-referrer";
      img.src = entry.favicon;
      img.addEventListener("error", () => {
        const fb = document.createElement("div");
        fb.className = "favicon-fallback";
        fb.textContent = letterAvatar(entry.title);
        img.replaceWith(fb);
      });
      row.append(img);
    } else {
      const fb = document.createElement("div");
      fb.className = "favicon-fallback";
      fb.textContent = letterAvatar(entry.title);
      row.append(fb);
    }

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
    restore.textContent = STRINGS.restore;
    restore.addEventListener("click", async () => {
      const res = await send<{ message: string }>({
        type: "restore",
        ids: [entry.id],
        batch: false,
      });
      if (res.ok) showStatus(res.data.message, "ok");
      await load();
    });
    const edit = document.createElement("button");
    edit.type = "button";
    edit.textContent = "Edit";
    edit.addEventListener("click", () => openEdit(entry));
    const del = document.createElement("button");
    del.type = "button";
    del.className = "danger";
    del.textContent = STRINGS.delete;
    del.addEventListener("click", async () => {
      await send({ type: "delete", ids: [entry.id] });
      await load();
    });
    actions.append(restore, edit, del);
    row.append(actions);
    list.append(row);
  }
}

function openEdit(entry: SavedTab): void {
  ($("edit-id") as HTMLInputElement).value = entry.id;
  ($("edit-group") as HTMLInputElement).value = entry.group;
  ($("edit-tags") as HTMLInputElement).value = entry.tags.join(", ");
  ($("edit-dialog") as unknown as HTMLDialogElement).showModal();
}

function paint(): void {
  if (!database) return;
  let entries = searchEntries(database.entries, query);
  if (groupFilter) entries = entries.filter((e) => e.group === groupFilter);
  renderList(sortEntriesNewestFirst(entries));
}

async function load(): Promise<void> {
  const res = await send<{
    database: Database | null;
    corrupt?: boolean;
    message?: string;
  }>({
    type: "get-state",
  });
  if (!res.ok || !res.data.database) {
    showStatus(
      res.ok ? (res.data.message ?? STRINGS.corruptedTitle) : res.error,
      "danger",
    );
    return;
  }
  database = res.data.database;
  applyTheme(database.settings.theme);
  renderStats(database);
  renderGroups(database);
  paint();
}

async function init(): Promise<void> {
  text($("subtitle"), STRINGS.tagline);
  text($("btn-save"), STRINGS.saveThisTab);
  text($("btn-restore-all"), STRINGS.restoreAll);
  text($("btn-settings"), STRINGS.openSettings);
  text($("btn-export"), STRINGS.exportJson);
  text($("btn-demo"), STRINGS.loadDemo);
  text($("btn-clear"), STRINGS.clearAll);
  ($("search") as HTMLInputElement).placeholder = STRINGS.searchPlaceholder;

  $("btn-save").addEventListener("click", async () => {
    const res = await send<SaveResult>({
      type: "save",
      scope: "current",
      confirmedUnsaved: true,
    });
    if (res.ok) showStatus(res.data.message, res.data.saved ? "ok" : "warn");
    await load();
  });
  $("btn-restore-all").addEventListener("click", async () => {
    if (!database) return;
    const ids = database.entries.map((e) => e.id);
    if (ids.length >= 15) {
      const batch = window.confirm(
        `${STRINGS.batchRestorePrompt(ids.length)}\n\nOK = open in batches\nCancel = open all at once`,
      );
      const res = await send<{ message: string }>({
        type: "restore",
        ids,
        batch,
      });
      if (res.ok) showStatus(res.data.message, "ok");
    } else {
      const res = await send<{ message: string }>({
        type: "restore",
        ids,
        batch: false,
      });
      if (res.ok) showStatus(res.data.message, "ok");
    }
    await load();
  });
  $("btn-settings").addEventListener(
    "click",
    () => void chrome.runtime.openOptionsPage(),
  );
  $("btn-export").addEventListener("click", async () => {
    const res = await send<{ text: string }>({ type: "export-json" });
    if (res.ok)
      downloadText(`tabfold-export-${Date.now()}.json`, res.data.text);
  });
  $("btn-demo").addEventListener("click", async () => {
    const res = await send<{ message: string }>({ type: "load-demo" });
    if (res.ok) showStatus(res.data.message, "ok");
    await load();
  });
  $("btn-clear").addEventListener("click", async () => {
    if (!window.confirm(STRINGS.confirmClear)) return;
    await send({ type: "clear" });
    showStatus("Cleared.", "ok");
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
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const textContent = await file.text();
    const res = await send<{ summary: ImportSummary }>({
      type: "import-json",
      text: textContent,
    });
    if (res.ok) showStatus(res.data.summary.message, "ok");
    else showStatus(res.error, "danger");
    await load();
    (e.target as HTMLInputElement).value = "";
  });
  $("import-text").addEventListener("change", async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const textContent = await file.text();
    const res = await send<{ summary: ImportSummary }>({
      type: "import-text",
      text: textContent,
    });
    if (res.ok) showStatus(res.data.summary.message, "ok");
    else showStatus(res.error, "danger");
    await load();
    (e.target as HTMLInputElement).value = "";
  });
  $("edit-form").addEventListener("submit", (e) => {
    const form = e.target as HTMLFormElement;
    // method=dialog — check submitter
    void form;
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
      void send({ type: "edit-entry", id, group, tags }).then(() => load());
    },
  );

  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
      e.preventDefault();
      $("search").focus();
    }
  });

  await load();
}

void init();
