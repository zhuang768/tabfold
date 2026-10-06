import { STRINGS } from "../strings.js";
import type { BackupMeta, Database, Settings } from "../types.js";
import { applyTheme, downloadText, formatTime, send, text } from "./shared.js";

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

async function load(): Promise<void> {
  const res = await send<{
    database: Database | null;
    backups: BackupMeta[];
    corrupt?: boolean;
    message?: string;
  }>({ type: "get-state" });

  if (!res.ok || !res.data.database) {
    text(
      $("where-data"),
      res.ok ? (res.data.message ?? STRINGS.corruptedBody) : res.error,
    );
    return;
  }

  const settings = res.data.database.settings;
  applyTheme(settings.theme);
  ($("remove-after") as HTMLInputElement).checked = settings.removeAfterRestore;
  ($("default-scope") as HTMLSelectElement).value = settings.defaultScope;
  ($("theme") as HTMLSelectElement).value = settings.theme;
  ($("whitelist") as HTMLTextAreaElement).value = settings.whitelist.join("\n");

  const host = $("backups");
  host.replaceChildren();
  if (!res.data.backups.length) {
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = STRINGS.noBackups;
    host.append(p);
  } else {
    for (const b of res.data.backups) {
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
        await send({ type: "restore-backup", id: b.id });
        await load();
      });
      row.append(info, btn);
      host.append(row);
    }
  }
}

function fillSelects(): void {
  const scope = $("default-scope") as HTMLSelectElement;
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
  text($("btn-save"), "Save settings");
  text($("btn-export"), STRINGS.exportJson);
  text($("btn-export-raw"), STRINGS.exportRaw);
  text($("btn-reset"), STRINGS.clearAllData);

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
    await send({ type: "patch-settings", patch });
    applyTheme(patch.theme ?? "system");
    const msg = $("saved-msg");
    msg.hidden = false;
    window.setTimeout(() => {
      msg.hidden = true;
    }, 1500);
  });

  $("btn-export").addEventListener("click", async () => {
    const res = await send<{ text: string }>({ type: "export-json" });
    if (res.ok)
      downloadText(`tabfold-export-${Date.now()}.json`, res.data.text);
  });
  $("btn-export-raw").addEventListener("click", async () => {
    const res = await send<{ text: string }>({ type: "export-raw" });
    if (res.ok) downloadText(`tabfold-raw-${Date.now()}.json`, res.data.text);
  });
  $("btn-reset").addEventListener("click", async () => {
    if (!window.confirm(STRINGS.confirmReset)) return;
    await send({ type: "reset-all" });
    await load();
  });

  await load();
}

void init();
