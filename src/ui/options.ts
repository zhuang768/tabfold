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

function showMsg(el: HTMLElement, message: string, ok: boolean): void {
  el.hidden = false;
  el.textContent = message;
  el.className = ok ? "muted" : "banner danger";
}

async function load(): Promise<void> {
  const res = await send<{
    database: Database | null;
    backups: BackupMeta[];
    corrupt?: boolean;
    message?: string;
  }>({ type: "get-state" });

  if (!res.ok) {
    text($("where-data"), res.error);
    return;
  }

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
      info.textContent = `${formatTime(b.createdAt)} · ${b.reason} · ${b.entryCount} tabs`;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = STRINGS.restoreBackup;
      btn.addEventListener("click", async () => {
        if (
          !window.confirm(`Restore snapshot from ${formatTime(b.createdAt)}?`)
        )
          return;
        const r = await send({ type: "restore-backup", id: b.id });
        if (!r.ok) {
          showMsg($("saved-msg"), r.error, false);
          return;
        }
        await load();
      });
      row.append(info, btn);
      host.append(row);
    }
  }

  if (res.data.corrupt || !res.data.database) {
    text($("where-data"), `${STRINGS.corruptedBody} ${res.data.message ?? ""}`);
    $("settings-form").hidden = true;
    return;
  }

  $("settings-form").hidden = false;
  text($("where-data"), STRINGS.whereDataStored);
  const settings = res.data.database.settings;
  applyTheme(settings.theme);
  ($("remove-after") as HTMLInputElement).checked = settings.removeAfterRestore;
  ($("default-scope") as HTMLSelectElement).value = settings.defaultScope;
  ($("theme") as HTMLSelectElement).value = settings.theme;
  ($("whitelist") as HTMLTextAreaElement).value = settings.whitelist.join("\n");
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
  text($("title"), STRINGS.settingsTitle);
  text($("label-remove"), STRINGS.removeAfterRestore);
  text($("label-scope"), STRINGS.defaultScope);
  text($("label-theme"), STRINGS.theme);
  text($("label-whitelist"), STRINGS.whitelist);
  text($("whitelist-hint"), STRINGS.whitelistHint);
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

  $("btn-save").addEventListener("click", async () => {
    const patch: Partial<Settings> = {
      removeAfterRestore: ($("remove-after") as HTMLInputElement).checked,
      defaultScope: ($("default-scope") as HTMLSelectElement)
        .value as Settings["defaultScope"],
      theme: ($("theme") as HTMLSelectElement).value as Settings["theme"],
      whitelist: ($("whitelist") as HTMLTextAreaElement).value
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean),
    };
    const res = await send({ type: "patch-settings", patch });
    if (!res.ok) {
      showMsg($("saved-msg"), res.error || STRINGS.settingsSaveFailed, false);
      return;
    }
    applyTheme(patch.theme ?? "system");
    showMsg($("saved-msg"), STRINGS.settingsSaved, true);
    window.setTimeout(() => {
      $("saved-msg").hidden = true;
    }, 1500);
  });

  $("btn-export").addEventListener("click", async () => {
    const res = await send<{ text: string }>({ type: "export-json" });
    if (res.ok)
      downloadText(`tabfold-export-${Date.now()}.json`, res.data.text);
    else showMsg($("saved-msg"), res.error, false);
  });
  $("btn-export-raw").addEventListener("click", async () => {
    const res = await send<{ text: string }>({ type: "export-raw" });
    if (res.ok) downloadText(`tabfold-raw-${Date.now()}.json`, res.data.text);
    else showMsg($("saved-msg"), res.error, false);
  });
  $("btn-reset").addEventListener("click", async () => {
    if (!window.confirm(STRINGS.confirmReset)) return;
    const res = await send({ type: "reset-all" });
    if (!res.ok) showMsg($("saved-msg"), res.error, false);
    await load();
  });

  listenStorageReload(() => void load());
  await load();
}

void init();
