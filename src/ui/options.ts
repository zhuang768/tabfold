import { STRINGS } from "../strings.js";
import type { BackupMeta, Database, Settings } from "../types.js";
import {
  applyTheme,
  downloadText,
  formatTime,
  listenStorageReload,
  send,
  text,
} from "./shared.js";

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

let isFormDirty = false;
let statusGen = 0;

function showStatus(
  message: string,
  kind: "ok" | "warn" | "danger" = "ok",
): void {
  statusGen++;
  const el = $("status");
  el.hidden = false;
  el.className = `banner fold ${kind}`;
  el.textContent = message;
}

let isLoaded = false;
let loadGeneration = 0;

async function load(): Promise<void> {
  const gen = ++loadGeneration;
  const res = await send<{
    database: Database | null;
    backups: BackupMeta[];
    corrupt?: boolean;
    message?: string;
  }>({ type: "get-state" });

  if (gen !== loadGeneration) return;

  if (!res.ok) {
    isLoaded = false;
    text($("where-data"), res.error);
    showStatus(res.error, "danger");
    return;
  }
  isLoaded = true;

  // Always show backups even when corrupt (C03)
  const host = $("backups");
  host.replaceChildren();
  const backups = res.data.backups ?? [];
  if (!backups.length) {
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = STRINGS.noBackups;
    host.append(p);
  } else {
    for (const b of backups) {
      const row = document.createElement("div");
      row.className = "row";
      const info = document.createElement("span");
      info.textContent = `${formatTime(b.createdAt)} · ${STRINGS.backupReasonLabel(b.reason)} · ${STRINGS.backupTabsCount(b.entryCount)}`;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = STRINGS.restoreBackup;
      btn.addEventListener("click", async () => {
        if (
          !window.confirm(
            STRINGS.confirmRestoreSnapshot(formatTime(b.createdAt)),
          )
        )
          return;
        const r = await send({ type: "restore-backup", id: b.id });
        if (!r.ok) {
          showStatus(r.error, "danger");
          return;
        }
        isFormDirty = false;
        showStatus(STRINGS.settingsSaved, "ok");
        await load();
      });
      row.append(info, btn);
      host.append(row);
    }
  }

  if (res.data.corrupt || !res.data.database) {
    text($("where-data"), `${STRINGS.corruptedBody} ${res.data.message ?? ""}`);
    $("settings-form").hidden = true;
    showStatus(res.data.message ?? STRINGS.corruptedTitle, "danger");
    return;
  }

  $("settings-form").hidden = false;
  text($("where-data"), STRINGS.whereDataStored);
  const settings = res.data.database.settings;
  applyTheme(settings.theme);

  if (!isFormDirty) {
    ($("remove-after") as HTMLInputElement).checked =
      settings.removeAfterRestore;
    ($("default-scope") as HTMLSelectElement).value = settings.defaultScope;
    ($("theme") as HTMLSelectElement).value = settings.theme;
    ($("whitelist") as HTMLTextAreaElement).value =
      settings.whitelist.join("\n");
  }
}

function fillSelects(): void {
  const scope = $("default-scope") as HTMLSelectElement;
  if (scope.options.length) return;
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
  const theme = $("theme") as HTMLSelectElement;
  for (const [v, label] of [
    ["system", STRINGS.themeSystem],
    ["light", STRINGS.themeLight],
    ["dark", STRINGS.themeDark],
  ] as const) {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = label;
    theme.append(o);
  }
}

async function init(): Promise<void> {
  document.title = STRINGS.settingsPageTitle;
  if (typeof document.querySelector === "function") {
    const brandEl = document.querySelector(".brand");
    if (brandEl) text(brandEl, STRINGS.appName);
  }

  text($("title"), STRINGS.settingsTitle);
  text($("label-remove"), STRINGS.removeAfterRestore);
  text($("label-scope"), STRINGS.defaultScope);
  text($("label-theme"), STRINGS.theme);
  text($("label-whitelist"), STRINGS.whitelist);
  text($("whitelist-hint"), STRINGS.whitelistHint);
  text($("where-title"), STRINGS.whereDataTitle);
  text($("where-data"), STRINGS.whereDataStored);
  text($("backups-title"), STRINGS.backups);
  text($("btn-save"), STRINGS.saveSettings);
  text($("btn-export"), STRINGS.exportJson);
  text($("btn-export-raw"), STRINGS.exportRaw);
  text($("btn-reset"), STRINGS.clearAllData);
  text($("shortcuts-title"), STRINGS.shortcutsTitle);
  text($("shortcuts-body"), STRINGS.shortcutsBody);
  text($("version-line"), STRINGS.versionLine);

  fillSelects();

  $("remove-after").addEventListener("change", () => {
    isFormDirty = true;
  });
  $("default-scope").addEventListener("change", () => {
    isFormDirty = true;
  });
  $("theme").addEventListener("change", () => {
    isFormDirty = true;
  });
  $("whitelist").addEventListener("input", () => {
    isFormDirty = true;
  });

  $("btn-save").addEventListener("click", async () => {
    if (!isLoaded) {
      showStatus(STRINGS.settingsSaveFailed, "warn");
      return;
    }
    const submittedForm = {
      removeAfterRestore: ($("remove-after") as HTMLInputElement).checked,
      defaultScope: ($("default-scope") as HTMLSelectElement).value,
      theme: ($("theme") as HTMLSelectElement).value,
      whitelist: ($("whitelist") as HTMLTextAreaElement).value,
    };
    const patch: Partial<Settings> = {
      removeAfterRestore: submittedForm.removeAfterRestore,
      defaultScope: submittedForm.defaultScope as Settings["defaultScope"],
      theme: submittedForm.theme as Settings["theme"],
      whitelist: submittedForm.whitelist
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean),
    };
    const res = await send({ type: "patch-settings", patch });
    if (!res.ok) {
      showStatus(res.error || STRINGS.settingsSaveFailed, "danger");
      return;
    }
    const currentForm = {
      removeAfterRestore: ($("remove-after") as HTMLInputElement).checked,
      defaultScope: ($("default-scope") as HTMLSelectElement).value,
      theme: ($("theme") as HTMLSelectElement).value,
      whitelist: ($("whitelist") as HTMLTextAreaElement).value,
    };
    const isUnchangedDuringSave =
      currentForm.removeAfterRestore === submittedForm.removeAfterRestore &&
      currentForm.defaultScope === submittedForm.defaultScope &&
      currentForm.theme === submittedForm.theme &&
      currentForm.whitelist === submittedForm.whitelist;
    if (isUnchangedDuringSave) {
      isFormDirty = false;
    }
    applyTheme(patch.theme ?? "system");
    showStatus(STRINGS.settingsSaved, "ok");
    const savedGen = statusGen;
    const savedMsg = $("saved-msg");
    if (savedMsg) {
      savedMsg.hidden = false;
      savedMsg.textContent = STRINGS.settingsSaved;
      window.setTimeout(() => {
        savedMsg.hidden = true;
      }, 1500);
    }
    window.setTimeout(() => {
      if (statusGen === savedGen) {
        $("status").hidden = true;
      }
    }, 1500);
  });

  $("btn-export").addEventListener("click", async () => {
    const res = await send<{ text: string }>({ type: "export-json" });
    if (res.ok)
      downloadText(`tabfold-export-${Date.now()}.json`, res.data.text);
    else showStatus(res.error, "danger");
  });
  $("btn-export-raw").addEventListener("click", async () => {
    const res = await send<{ text: string }>({ type: "export-raw" });
    if (res.ok) downloadText(`tabfold-raw-${Date.now()}.json`, res.data.text);
    else showStatus(res.error, "danger");
  });
  $("btn-reset").addEventListener("click", async () => {
    if (!window.confirm(STRINGS.confirmReset)) return;
    const res = await send({ type: "reset-all" });
    if (!res.ok) {
      showStatus(res.error, "danger");
    } else {
      isFormDirty = false;
      showStatus(STRINGS.cleared, "ok");
    }
    await load();
  });

  listenStorageReload(() => void load());
  await load();
}

void init();
