import { STRINGS } from "../strings.js";
import type { Database, SaveResult, SavedTab, Settings } from "../types.js";
import { estimateMemoryFreedMb } from "../core/scope.js";
import {
  searchEntries,
  sortEntriesNewestFirst,
  groupNames,
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
let undoTimer: number | null = null;

function showStatus(
  message: string,
  kind: "ok" | "warn" | "danger" = "ok",
  undoIds: string[] = [],
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
    btn.textContent = STRINGS.undo;
    btn.addEventListener("click", () => void doUndo());
    el.append(btn);
    if (undoTimer) window.clearTimeout(undoTimer);
    undoTimer = window.setTimeout(() => {
      // keep message but drop undo affordance after TTL-ish
      const buttons = el.querySelectorAll("button");
      buttons.forEach((b) => b.remove());
    }, 12_000);
  }
}

async function doUndo(): Promise<void> {
  const res = await send<{ message: string }>({ type: "undo" });
  if (res.ok) showStatus(res.data.message, "ok");
  else showStatus(res.error, "warn");
  await load();
}

function renderOnboarding(settings: Settings): void {
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
  await send({ type: "complete-onboarding" });
  $("onboarding").hidden = true;
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

    if (entry.favicon) {
      const img = document.createElement("img");
      img.className = "favicon";
      img.alt = STRINGS.faviconAlt;
      img.width = 28;
      img.height = 28;
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
    meta.append(document.createTextNode(formatTime(entry.savedAt)));
    main.append(title, url, meta);
    row.append(main);

    const actions = document.createElement("div");
    actions.className = "stack";
    const restore = document.createElement("button");
    restore.type = "button";
    restore.textContent = STRINGS.restore;
    restore.addEventListener("click", () => void restoreOne(entry.id));
    const del = document.createElement("button");
    del.type = "button";
    del.className = "danger";
    del.textContent = STRINGS.delete;
    del.addEventListener("click", () => void deleteOne(entry.id));
    actions.append(restore, del);
    row.append(actions);
    list.append(row);
  }
}

async function restoreOne(id: string): Promise<void> {
  const res = await send<{ message: string; needsBatchChoice?: boolean }>({
    type: "restore",
    ids: [id],
  });
  if (!res.ok) {
    showStatus(res.error, "danger");
    return;
  }
  showStatus(res.data.message, "ok");
  await load();
}

async function deleteOne(id: string): Promise<void> {
  await send({ type: "delete", ids: [id] });
  await load();
}

async function confirmDialog(message: string): Promise<boolean> {
  const dialog = $("confirm-dialog") as unknown as HTMLDialogElement;
  text($("confirm-text"), message);
  dialog.showModal();
  return await new Promise((resolve) => {
    dialog.addEventListener(
      "close",
      () => resolve(dialog.returnValue === "ok"),
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
    list.replaceChildren();
    const err = document.createElement("div");
    err.className = "error-box";
    err.textContent = res.error;
    list.append(err);
    return;
  }

  if (res.data.corrupt || !res.data.database) {
    list.replaceChildren();
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
    const opts: Array<[string, string]> = [
      ["current", STRINGS.scopeCurrent],
      ["others", STRINGS.scopeOthers],
      ["window", STRINGS.scopeWindow],
    ];
    for (const [v, label] of opts) {
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
  const mb = estimateMemoryFreedMb(database.entries.length);
  text(
    $("count"),
    `${filtered.length}/${database.entries.length} · ${STRINGS.estimatedMemory(mb)}`,
  );

  // Groups quick actions
  const groups = groupNames(database.entries);
  void groups;
}

async function saveWithScope(): Promise<void> {
  const scope = ($("scope") as HTMLSelectElement).value as
    "current" | "others" | "window";
  const res = await send<SaveResult>({ type: "save", scope });
  if (!res.ok) {
    showStatus(res.error, "danger");
    return;
  }
  const data = res.data;
  if (data.needsConfirmation.length) {
    const ok = await confirmDialog(STRINGS.audioConfirm);
    if (!ok) {
      showStatus(STRINGS.nothingSaved, "warn");
      return;
    }
    const again = await send<SaveResult>({
      type: "save",
      scope,
      confirmedAudio: true,
      confirmedUnsaved: true,
    });
    if (again.ok) {
      showStatus(
        again.data.message,
        again.data.saved ? "ok" : "warn",
        again.data.undoIds,
      );
    }
  } else {
    showStatus(data.message, data.saved ? "ok" : "warn", data.undoIds);
  }
  await load();
}

async function init(): Promise<void> {
  text($("tagline"), STRINGS.tagline);
  text($("btn-save"), STRINGS.saveThisTab);
  text($("btn-hibernate"), STRINGS.discardTab);
  text($("btn-restore-all"), STRINGS.restoreAll);
  text($("btn-export"), STRINGS.exportJson);
  text($("btn-demo"), STRINGS.loadDemo);
  text($("btn-library"), STRINGS.openFullList);
  text($("btn-settings"), STRINGS.openSettings);
  ($("search") as HTMLInputElement).placeholder = STRINGS.searchPlaceholder;

  // Show last save result from action click
  const session = await chrome.storage.session.get([
    "lastSaveResult",
    "lastSaveAt",
  ]);
  const last = session.lastSaveResult as SaveResult | undefined;
  const at = session.lastSaveAt as number | undefined;
  if (last && at && Date.now() - at < 15_000) {
    showStatus(last.message, last.saved ? "ok" : "warn", last.undoIds);
    if (last.needsConfirmation?.length) {
      const ok = await confirmDialog(STRINGS.audioConfirm);
      if (ok) {
        const again = await send<SaveResult>({
          type: "save",
          scope: "current",
          confirmedAudio: true,
          confirmedUnsaved: true,
        });
        if (again.ok)
          showStatus(
            again.data.message,
            again.data.saved ? "ok" : "warn",
            again.data.undoIds,
          );
      }
    }
    await chrome.storage.session.remove([
      "lastSaveResult",
      "pendingAudioConfirm",
    ]);
  }

  $("btn-save").addEventListener("click", () => void saveWithScope());
  $("btn-hibernate").addEventListener("click", async () => {
    const res = await send({ type: "discard-tab" });
    showStatus(
      res.ok ? "Tab hibernated." : res.error,
      res.ok ? "ok" : "danger",
    );
  });
  $("btn-library").addEventListener(
    "click",
    () => void send({ type: "open-library" }),
  );
  $("btn-settings").addEventListener("click", () => {
    void chrome.runtime.openOptionsPage();
  });
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
  $("btn-restore-all").addEventListener("click", async () => {
    if (!database?.entries.length) return;
    const ids = database.entries.map((e) => e.id);
    const res = await send<{
      message: string;
      needsBatchChoice?: boolean;
      pendingCount?: number;
    }>({ type: "restore", ids });
    if (!res.ok) {
      showStatus(res.error, "danger");
      return;
    }
    if (res.data.needsBatchChoice) {
      const useBatches = await confirmDialog(
        `${res.data.message}\n\nOK = open in batches, Cancel = open all at once`,
      );
      const again = await send<{ message: string }>({
        type: "restore",
        ids,
        batch: useBatches,
      });
      if (again.ok) showStatus(again.data.message, "ok");
      else showStatus(again.error, "danger");
    } else {
      showStatus(res.data.message, "ok");
    }
    await load();
  });
  $("search").addEventListener("input", (e) => {
    query = (e.target as HTMLInputElement).value;
    if (!database) return;
    renderList(sortEntriesNewestFirst(searchEntries(database.entries, query)));
  });

  // Keyboard: / focuses search
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
      e.preventDefault();
      $("search").focus();
    }
  });

  await load();
}

void init();
