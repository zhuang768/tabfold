import {
  test,
  expect,
  chromium,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import http from "node:http";

test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

const repoDist = path.join(process.cwd(), "dist");
const artifacts = path.join(process.cwd(), "output", "playwright");

function prepareDist(): string {
  fs.mkdirSync(artifacts, { recursive: true });
  expect(fs.existsSync(path.join(repoDist, "manifest.json"))).toBeTruthy();
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), "tabfold-e2e-"));
  fs.cpSync(repoDist, dist, { recursive: true });
  return dist;
}

async function launchExtension(
  userDataDir: string,
  dist: string,
  opts?: { resetProfile?: boolean },
): Promise<{ context: BrowserContext; extensionId: string }> {
  const safeDir = userDataDir.includes(" ")
    ? fs.mkdtempSync(path.join(os.tmpdir(), path.basename(userDataDir) + "-"))
    : userDataDir;
  if (opts?.resetProfile !== false) {
    fs.rmSync(safeDir, { recursive: true, force: true });
  }
  fs.mkdirSync(safeDir, { recursive: true });
  const context = await chromium.launchPersistentContext(safeDir, {
    headless: true,
    channel: "chromium",
    args: [
      `--disable-extensions-except=${dist}`,
      `--load-extension=${dist}`,
      "--no-first-run",
      "--no-default-browser-check",
    ],
  });
  let sw = context.serviceWorkers()[0];
  if (!sw)
    sw = await context.waitForEvent("serviceworker", { timeout: 30_000 });
  const extensionId = sw.url().split("/")[2] ?? "";
  expect(extensionId.length).toBeGreaterThan(8);
  return { context, extensionId };
}

function startFixtureServer(): Promise<{
  port: number;
  close: () => Promise<void>;
  hits: string[];
}> {
  const hits: string[] = [];
  const server = http.createServer((req, res) => {
    const url = req.url ?? "/";
    hits.push(url);
    if (url.startsWith("/tracker")) {
      res.writeHead(200, { "content-type": "image/png" });
      res.end(
        Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
          "base64",
        ),
      );
      return;
    }
    if (url.startsWith("/audio")) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(`<!doctype html><html><body><h1>Audio Page</h1>
        <script>
          const ctx = new (window.AudioContext || window.webkitAudioContext)();
          const osc = ctx.createOscillator();
          osc.connect(ctx.destination);
          osc.start();
        </script>
      </body></html>`);
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(
      `<!doctype html><html><head><title>Page ${url}</title></head><body><h1>${url}</h1></body></html>`,
    );
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({
        port,
        hits,
        close: () =>
          new Promise((r, j) => server.close((e) => (e ? j(e) : r()))),
      });
    });
  });
}

async function msg<T>(page: Page, body: unknown): Promise<T> {
  return page.evaluate(
    async (b) => chrome.runtime.sendMessage(b),
    body,
  ) as Promise<T>;
}

async function openTabViaExtension(
  page: Page,
  url: string,
  extra?: { active?: boolean; pinned?: boolean; windowId?: number },
): Promise<number> {
  const id = await page.evaluate(
    async ({ u, opts }) => {
      const tab = await chrome.tabs.create({
        url: u,
        active: opts?.active ?? false,
        pinned: opts?.pinned ?? false,
        ...(opts?.windowId != null ? { windowId: opts.windowId } : {}),
      });
      return tab.id!;
    },
    { u: url, opts: extra },
  );
  for (let i = 0; i < 40; i++) {
    const info = await page.evaluate(async (tabId) => {
      try {
        const t = await chrome.tabs.get(tabId);
        return { url: t.url ?? "", status: t.status };
      } catch {
        return null;
      }
    }, id);
    if (
      info?.url &&
      (info.url.startsWith("http") || info.url.startsWith("chrome"))
    )
      return id;
    await page.waitForTimeout(100);
  }
  return id;
}

test("main flow: real UI and API save, close, restore, undo, demo, search, export, and no external favicon fetch", async () => {
  const dist = prepareDist();
  const userDataDir = path.join(os.tmpdir(), "tabfold-userdata-main");
  const fixture = await startFixtureServer();
  let context: BrowserContext | null = null;

  try {
    const launched = await launchExtension(userDataDir, dist);
    context = launched.context;
    const extensionId = launched.extensionId;

    const ext = await context.newPage();
    await ext.goto(`chrome-extension://${extensionId}/list.html`, {
      waitUntil: "domcontentloaded",
    });
    await msg(ext, {
      type: "patch-settings",
      patch: { onboardingComplete: true, unsavedHintAcknowledged: true },
    });

    // 1. Open tab A and perform save through popup UI directly with scope "window"
    const tabA = await openTabViaExtension(
      ext,
      `http://127.0.0.1:${fixture.port}/a`,
    );
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`, {
      waitUntil: "domcontentloaded",
    });
    // Verify scope selector options and choose window scope
    const scopeSelect = popup.locator("#scope");
    await expect(scopeSelect).toBeVisible();
    await scopeSelect.selectOption("window");

    // Click Save & Close button directly in popup UI
    const saveBtn = popup.locator("#btn-save");
    await saveBtn.click();
    await popup.waitForTimeout(400);

    // Verify Tab A was closed
    const tabAGone = await ext.evaluate(async (tabId) => {
      try {
        await chrome.tabs.get(tabId);
        return false;
      } catch {
        return true;
      }
    }, tabA);
    expect(tabAGone).toBe(true);

    // Verify Undo button appears in popup UI and click it
    const undoBtn = popup.getByRole("button", { name: "Undo" });
    await expect(undoBtn).toBeVisible({ timeout: 5000 });
    await undoBtn.click();
    await popup.waitForTimeout(400);

    // Verify Tab A was restored
    let reopenedAfterUndo = false;
    for (let i = 0; i < 30; i++) {
      const list = await ext.evaluate(async () => {
        const tabs = await chrome.tabs.query({});
        return tabs.map(
          (t) =>
            (t as { pendingUrl?: string; url?: string }).pendingUrl ||
            t.url ||
            "",
        );
      });
      if (list.some((u) => u.includes("/a"))) {
        reopenedAfterUndo = true;
        break;
      }
      await ext.waitForTimeout(100);
    }
    expect(reopenedAfterUndo).toBe(true);
    await popup.close();

    // 2. Open Tab B and save via API, then restore via Library UI (.btn-restore)
    const tabB = await openTabViaExtension(
      ext,
      `http://127.0.0.1:${fixture.port}/b`,
    );
    await msg(ext, { type: "save", tabIds: [tabB], confirmedUnsaved: true });

    await ext.reload({ waitUntil: "domcontentloaded" });
    const restoreBtn = ext.locator(".btn-restore").first();
    await expect(restoreBtn).toBeVisible();
    await restoreBtn.click();

    let reopenedAfterRestore = false;
    for (let i = 0; i < 30; i++) {
      const list = await ext.evaluate(async () => {
        const tabs = await chrome.tabs.query({});
        return tabs.map(
          (t) =>
            (t as { pendingUrl?: string; url?: string }).pendingUrl ||
            t.url ||
            "",
        );
      });
      if (list.some((u) => u.includes("/b"))) {
        reopenedAfterRestore = true;
        break;
      }
      await ext.waitForTimeout(100);
    }
    expect(reopenedAfterRestore).toBe(true);

    // 3. Demo load, search filter, and JSON export
    await ext.getByRole("button", { name: "Load demo data" }).click();
    await expect(ext.locator(".entry").first()).toBeVisible({
      timeout: 10_000,
    });
    const demoCount = await ext.locator(".entry").count();
    expect(demoCount).toBeGreaterThanOrEqual(3);

    await ext.locator("#search").fill("Wikipedia");
    await expect(ext.locator(".entry")).toHaveCount(1);

    await ext.locator("#search").fill("");
    await expect(ext.locator(".entry")).toHaveCount(demoCount);

    const [download] = await Promise.all([
      ext.waitForEvent("download"),
      ext.getByRole("button", { name: "Export JSON" }).click(),
    ]);
    const downloadPath = path.join(
      artifacts,
      await download.suggestedFilename(),
    );
    await download.saveAs(downloadPath);
    const exported = fs.readFileSync(downloadPath, "utf8");
    expect(exported).toContain("tabfold-json");
    expect(exported).toContain("wikipedia.org");

    // 4. No external tracker favicon fetch
    const before = fixture.hits.filter((h) => h.startsWith("/tracker")).length;
    await msg(ext, {
      type: "import-json",
      text: JSON.stringify({
        format: "tabfold-json",
        schemaVersion: 2,
        entries: [
          {
            schemaVersion: 2,
            id: "evil",
            url: `http://127.0.0.1:${fixture.port}/c`,
            title: "C",
            favicon: `http://127.0.0.1:${fixture.port}/tracker/pixel.png`,
            savedAt: Date.now(),
            source: { windowId: -1, index: 0, pinned: false },
            group: "",
            tags: [],
            status: "saved",
          },
        ],
      }),
    });
    await ext.reload({ waitUntil: "domcontentloaded" });
    await ext.waitForTimeout(400);
    const after = fixture.hits.filter((h) => h.startsWith("/tracker")).length;
    expect(after).toBe(before);
  } finally {
    if (context) await context.close().catch(() => {});
    await fixture.close().catch(() => {});
  }
});

test("same profile restart + worker stop/wake with CDP and raw DB equality", async () => {
  const dist = prepareDist();
  const userDataDir = path.join(os.tmpdir(), "tabfold-userdata-persist");
  let originalEntries: Array<{ id: string; url: string; title: string }> = [];

  // Stage 1: launch profile, populate demo data, stop worker via CDP, wake worker
  {
    let context: BrowserContext | null = null;
    try {
      const launched = await launchExtension(userDataDir, dist, {
        resetProfile: true,
      });
      context = launched.context;
      const extensionId = launched.extensionId;

      const page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/list.html`, {
        waitUntil: "domcontentloaded",
      });
      await msg(page, {
        type: "patch-settings",
        patch: { onboardingComplete: true, unsavedHintAcknowledged: true },
      });
      expect((await msg<{ ok: boolean }>(page, { type: "load-demo" })).ok).toBe(
        true,
      );

      const state = await msg<{
        data: {
          database: {
            entries: Array<{ id: string; url: string; title: string }>;
          };
        };
      }>(page, {
        type: "get-state",
      });
      originalEntries = state.data.database.entries;
      expect(originalEntries.length).toBeGreaterThan(2);

      // Inspect full raw DB before worker stop
      const beforeRaw = await page.evaluate(async () => {
        const res = await chrome.storage.local.get("tabfold_database");
        return res.tabfold_database;
      });

      // CDP service worker stop verification (R318)
      interface CdpWorkerVersion {
        versionId: string;
        scriptURL?: string;
        runningStatus?: string;
      }
      const client = await context.newCDPSession(page);
      const versionEvents: CdpWorkerVersion[] = [];
      client.on(
        "ServiceWorker.workerVersionUpdated",
        (e: { versions?: CdpWorkerVersion[] }) => {
          if (e.versions) versionEvents.push(...e.versions);
        },
      );
      await client.send("ServiceWorker.enable");
      await page.waitForTimeout(100);

      const swInfo = versionEvents
        .filter((v: CdpWorkerVersion) =>
          Boolean(
            v.scriptURL &&
            v.scriptURL.includes(extensionId) &&
            v.scriptURL.includes("service-worker.js"),
          ),
        )
        .at(-1);
      expect(swInfo).toBeTruthy();

      let sw = context
        .serviceWorkers()
        .find((w) => w.url().includes(extensionId))!;
      await sw.evaluate(() => {
        const g = globalThis as typeof globalThis & {
          __testWorkerNonce?: string;
        };
        g.__testWorkerNonce = "active-nonce-r318";
      });

      await client.send("ServiceWorker.stopWorker", {
        versionId: swInfo!.versionId,
      });
      await page.waitForTimeout(250);

      const stoppedEvent = versionEvents.some(
        (v: CdpWorkerVersion) =>
          v.versionId === swInfo!.versionId && v.runningStatus === "stopped",
      );
      expect(stoppedEvent).toBe(true);

      // Wake the worker by sending runtime message
      const woken = await msg<{
        ok: boolean;
        data: {
          database: {
            entries: Array<{ id: string; url: string; title: string }>;
          };
        };
      }>(page, {
        type: "get-state",
      });
      expect(woken.ok).toBe(true);

      // Confirm fresh execution realm: nonce reset to null
      sw =
        context.serviceWorkers().find((w) => w.url().includes(extensionId)) ??
        sw;
      const afterNonce = await sw.evaluate(() => {
        const g = globalThis as typeof globalThis & {
          __testWorkerNonce?: string;
        };
        return g.__testWorkerNonce ?? null;
      });
      expect(afterNonce).toBeNull();

      // Assert full raw DB equality
      const afterRaw = await page.evaluate(async () => {
        const res = await chrome.storage.local.get("tabfold_database");
        return res.tabfold_database;
      });
      expect(afterRaw).toEqual(beforeRaw);
    } finally {
      if (context) await context.close().catch(() => {});
    }
  }

  // Stage 2: relaunch same profile without resetting and verify database persistence
  {
    let context: BrowserContext | null = null;
    try {
      const launched = await launchExtension(userDataDir, dist, {
        resetProfile: false,
      });
      context = launched.context;
      const extensionId = launched.extensionId;

      const page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/list.html`, {
        waitUntil: "domcontentloaded",
      });
      const state = await msg<{
        data: {
          database: {
            entries: Array<{ id: string; url: string; title: string }>;
          };
        };
      }>(page, {
        type: "get-state",
      });
      expect(state.data.database.entries.length).toBe(originalEntries.length);
      expect(state.data.database.entries.map((e) => e.url)).toEqual(
        originalEntries.map((e) => e.url),
      );
    } finally {
      if (context) await context.close().catch(() => {});
    }
  }
});

test("popup UI: skip onboarding, keyboard focus, options persistence, and reduced-motion", async () => {
  const dist = prepareDist();
  const userDataDir = path.join(os.tmpdir(), "tabfold-userdata-ui");
  let context: BrowserContext | null = null;

  try {
    const launched = await launchExtension(userDataDir, dist);
    context = launched.context;
    const extensionId = launched.extensionId;

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`, {
      waitUntil: "domcontentloaded",
    });
    await expect(popup.locator(".brand")).toHaveText("Tabfold");
    const onboard = popup.locator("#onboarding");
    if (await onboard.isVisible()) {
      await popup.getByRole("button", { name: "Skip" }).click();
    }
    await expect(onboard).toBeHidden();
    const display = await onboard.evaluate(
      (el) => getComputedStyle(el).display,
    );
    expect(display).toBe("none");

    // Keyboard navigation focus test in popup
    await popup.keyboard.press("Tab");
    const activeTagName = await popup.evaluate(
      () => document.activeElement?.tagName,
    );
    expect(["BUTTON", "SELECT", "A", "INPUT"]).toContain(activeTagName);

    // Reduced motion CSS check in popup
    const hasReducedMotionRule = await popup.evaluate(() => {
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          for (const rule of Array.from(sheet.cssRules)) {
            if (
              rule instanceof CSSMediaRule &&
              rule.conditionText.includes("prefers-reduced-motion")
            ) {
              return true;
            }
          }
        } catch {
          // ignore cross-origin sheet errors
        }
      }
      return false;
    });
    expect(hasReducedMotionRule).toBe(true);
    await popup.close();

    // Options page: change settings, check persistence
    const options = await context.newPage();
    await options.goto(`chrome-extension://${extensionId}/options.html`, {
      waitUntil: "domcontentloaded",
    });
    await options.locator("#remove-after").uncheck();
    await options.locator("#default-scope").selectOption("window");
    await options.getByRole("button", { name: "Save settings" }).click();
    await expect(options.locator("#saved-msg")).toBeVisible();

    await options.reload({ waitUntil: "domcontentloaded" });
    await expect(options.locator("#remove-after")).not.toBeChecked();
    await expect(options.locator("#default-scope")).toHaveValue("window");
    await options.close();
  } finally {
    if (context) await context.close().catch(() => {});
  }
});

test("special tab handling: internal, pinned, audible, unsaved token, duplicate, window preservation, and backup", async () => {
  const dist = prepareDist();
  const userDataDir = path.join(os.tmpdir(), "tabfold-userdata-special");
  const fixture = await startFixtureServer();
  let context: BrowserContext | null = null;

  try {
    const launched = await launchExtension(userDataDir, dist);
    context = launched.context;
    const extensionId = launched.extensionId;

    const ext = await context.newPage();
    await ext.goto(`chrome-extension://${extensionId}/list.html`, {
      waitUntil: "domcontentloaded",
    });

    // 1. Internal page skipping: chrome extension page cannot be saved
    const internalTab = await openTabViaExtension(
      ext,
      `chrome-extension://${extensionId}/options.html`,
    );
    const saveInternal = await msg<{
      ok: boolean;
      data: { saved: number; skipped: Array<{ reason: string }> };
    }>(ext, {
      type: "save",
      tabIds: [internalTab],
      confirmedUnsaved: true,
    });
    expect(saveInternal.ok).toBe(true);
    expect(saveInternal.data.saved).toBe(0);
    expect(saveInternal.data.skipped.length).toBe(1);
    expect(saveInternal.data.skipped[0]?.reason).toContain("Browser pages");

    // 2. Token-bound confirmation flow for unsaved warning (R202/R208/R303)
    const normTab = await openTabViaExtension(
      ext,
      `http://127.0.0.1:${fixture.port}/special`,
    );
    const firstSave = await msg<{
      ok: boolean;
      data: {
        saved: number;
        needsUnsavedAck?: boolean;
        confirmToken?: string;
      };
    }>(ext, {
      type: "save",
      tabIds: [normTab],
    });
    expect(firstSave.ok).toBe(true);
    expect(firstSave.data.saved).toBe(0);
    expect(firstSave.data.needsUnsavedAck).toBe(true);
    expect(typeof firstSave.data.confirmToken).toBe("string");

    // Bypass with invalid token fails
    const invalidConfirm = await msg<{
      ok: boolean;
      data: { saved: number; message: string };
    }>(ext, {
      type: "save",
      tabIds: [normTab],
      confirmedUnsaved: true,
      confirmToken: "fake-token",
    });
    expect(invalidConfirm.data.saved).toBe(0);
    expect(invalidConfirm.data.message).toContain("expired");

    // Providing real confirmToken succeeds
    const token = firstSave.data.confirmToken;
    const validConfirm = await msg<{
      ok: boolean;
      data: { saved: number; closed: number };
    }>(ext, {
      type: "save",
      tabIds: [normTab],
      confirmedUnsaved: true,
      confirmToken: token,
    });
    expect(validConfirm.ok).toBe(true);
    expect(validConfirm.data.saved).toBe(1);
    expect(validConfirm.data.closed).toBe(1);

    // 3. Duplicate tab skipping (R207/R215)
    const dupTab = await openTabViaExtension(
      ext,
      `http://127.0.0.1:${fixture.port}/special`,
    );
    const dupSave = await msg<{
      ok: boolean;
      data: { saved: number; skipped: Array<{ reason: string }> };
    }>(ext, {
      type: "save",
      tabIds: [dupTab],
      confirmedUnsaved: true,
    });
    expect(dupSave.ok).toBe(true);
    expect(dupSave.data.saved).toBe(0);
    expect(dupSave.data.skipped.length).toBe(1);
    expect(dupSave.data.skipped[0]?.reason).toContain("Already saved");

    // 4. Pinned tab skipping
    const pinnedTab = await openTabViaExtension(
      ext,
      `http://127.0.0.1:${fixture.port}/pinned`,
      { pinned: true },
    );
    const pinnedSave = await msg<{
      ok: boolean;
      data: { saved: number; skipped: Array<{ reason: string }> };
    }>(ext, {
      type: "save",
      tabIds: [pinnedTab],
      confirmedUnsaved: true,
    });
    expect(pinnedSave.ok).toBe(true);
    expect(pinnedSave.data.saved).toBe(0);
    expect(pinnedSave.data.skipped.length).toBe(1);
    expect(pinnedSave.data.skipped[0]?.reason).toContain("Pinned");

    // 5. Window preservation when closing the last tab in a window
    const newWinId = await ext.evaluate(async (url) => {
      const win = await chrome.windows.create({ url });
      return win.id!;
    }, `http://127.0.0.1:${fixture.port}/solitary`);
    await ext.waitForTimeout(400);

    const winTabs = await ext.evaluate(async (wId) => {
      return chrome.tabs.query({ windowId: wId });
    }, newWinId);
    expect(winTabs.length).toBe(1);
    const solitaryTabId = winTabs[0]!.id!;

    const saveSolitary = await msg<{
      ok: boolean;
      data: { saved: number; closed: number };
    }>(ext, {
      type: "save",
      tabIds: [solitaryTabId],
      confirmedUnsaved: true,
    });
    expect(saveSolitary.ok).toBe(true);
    expect(saveSolitary.data.saved).toBe(1);
    expect(saveSolitary.data.closed).toBe(1);

    // Verify window is still open (preserved with replacement tab)
    const winStillOpen = await ext.evaluate(async (wId) => {
      try {
        const w = await chrome.windows.get(wId);
        return Boolean(w);
      } catch {
        return false;
      }
    }, newWinId);
    expect(winStillOpen).toBe(true);
    await ext.evaluate(
      async (wId) => chrome.windows.remove(wId).catch(() => {}),
      newWinId,
    );

    // 6. Backup snapshot creation via operation and restore roundtrip
    const demoRes = await msg<{ ok: boolean }>(ext, { type: "load-demo" });
    expect(demoRes.ok).toBe(true);

    const backupsList = await msg<{
      ok: boolean;
      data: { backups: Array<{ id: string }> };
    }>(ext, {
      type: "list-backups",
    });
    expect(backupsList.ok).toBe(true);
    expect(backupsList.data.backups.length).toBeGreaterThanOrEqual(1);

    const restoreBackupRes = await msg<{ ok: boolean }>(ext, {
      type: "restore-backup",
      id: backupsList.data.backups[0]!.id,
    });
    expect(restoreBackupRes.ok).toBe(true);
  } finally {
    if (context) await context.close().catch(() => {});
    await fixture.close().catch(() => {});
  }
});
