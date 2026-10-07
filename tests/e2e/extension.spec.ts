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
  // Always use a path WITHOUT spaces for Chrome stability.
  const safeDir = userDataDir.includes(" ")
    ? fs.mkdtempSync(path.join(os.tmpdir(), path.basename(userDataDir) + "-"))
    : userDataDir;
  if (opts?.resetProfile !== false) {
    fs.rmSync(safeDir, { recursive: true, force: true });
  }
  fs.mkdirSync(safeDir, { recursive: true });
  const context = await chromium.launchPersistentContext(safeDir, {
    headless: false,
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
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(`<!doctype html><html><body><h1>${url}</h1></body></html>`);
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

/** Open a real tab via Chrome API so Playwright does not own/await its lifecycle. */
async function openTabViaExtension(page: Page, url: string): Promise<number> {
  const id = await page.evaluate(async (u) => {
    const tab = await chrome.tabs.create({ url: u, active: false });
    return tab.id!;
  }, url);
  // Wait until the tab finishes loading enough for url to be available
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

test("main flow: save close restore undo + no external favicon fetch", async () => {
  const dist = prepareDist();
  const userDataDir = path.join(os.tmpdir(), "tabfold-userdata-main");
  const fixture = await startFixtureServer();
  const { context, extensionId } = await launchExtension(userDataDir, dist);

  const ext = await context.newPage();
  await ext.goto(`chrome-extension://${extensionId}/list.html`, {
    waitUntil: "domcontentloaded",
  });
  await msg(ext, {
    type: "patch-settings",
    patch: { onboardingComplete: true, unsavedHintAcknowledged: true },
  });

  const tabA = await openTabViaExtension(
    ext,
    `http://127.0.0.1:${fixture.port}/a`,
  );
  const saveRes = await msg<{
    ok: boolean;
    data: { saved: number; closed: number; undoIds: string[]; message: string };
  }>(ext, { type: "save", tabIds: [tabA], confirmedUnsaved: true });
  expect(saveRes.ok, saveRes.data?.message).toBe(true);
  expect(saveRes.data.saved).toBe(1);
  expect(saveRes.data.closed).toBe(1);
  expect(saveRes.data.undoIds.length).toBe(1);

  // Tab should be gone
  const gone = await ext.evaluate(async (tabId) => {
    try {
      await chrome.tabs.get(tabId);
      return false;
    } catch {
      return true;
    }
  }, tabA);
  expect(gone).toBe(true);

  const state1 = await msg<{
    data: {
      database: {
        entries: Array<{ url: string }>;
        undo: { ids: string[] } | null;
      };
    };
  }>(ext, { type: "get-state" });
  expect(state1.data.database.entries.some((e) => e.url.includes("/a"))).toBe(
    true,
  );
  expect(state1.data.database.undo?.ids.length).toBeGreaterThan(0);

  const undo = await msg<{ ok: boolean; error?: string }>(ext, {
    type: "undo",
  });
  expect(undo.ok, undo.error).toBe(true);

  // Assert accurate reopened URL for undo (R214/R215)
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

  const state2 = await msg<{ data: { database: { entries: unknown[] } } }>(
    ext,
    {
      type: "get-state",
    },
  );
  expect(state2.data.database.entries).toHaveLength(0);

  const tabB = await openTabViaExtension(
    ext,
    `http://127.0.0.1:${fixture.port}/b`,
  );
  await msg(ext, { type: "save", tabIds: [tabB], confirmedUnsaved: true });
  const state3 = await msg<{
    data: { database: { entries: Array<{ id: string }> } };
  }>(ext, {
    type: "get-state",
  });
  const id = state3.data.database.entries[0]!.id;
  const restored = await msg<{ data: { opened: number } }>(ext, {
    type: "restore",
    ids: [id],
    mode: "all",
  });
  expect(restored.data.opened).toBe(1);

  // Assert accurate reopened URL for restore and DB cleanup (R214/R215)
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
  const stateAfterRestore = await msg<{
    data: { database: { entries: unknown[] } };
  }>(ext, { type: "get-state" });
  expect(stateAfterRestore.data.database.entries).toHaveLength(0);

  // Restore real UI demo load, search filter, and JSON export download assertions (R214/R215)
  await ext.getByRole("button", { name: "Load demo data" }).click();
  await expect(ext.locator(".entry").first()).toBeVisible({ timeout: 10_000 });
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
  const downloadPath = path.join(artifacts, await download.suggestedFilename());
  await download.saveAs(downloadPath);
  const exported = fs.readFileSync(downloadPath, "utf8");
  expect(exported).toContain("tabfold-json");
  expect(exported).toContain("wikipedia.org");

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
  await ext.screenshot({
    path: path.join(artifacts, "library-no-external-favicon.png"),
  });

  await context.close();
  await fixture.close();
});

test("same profile restart + worker stop/wake", async () => {
  const dist = prepareDist();
  const userDataDir = path.join(os.tmpdir(), "tabfold-userdata-persist");
  let originalEntries: Array<{ id: string; url: string; title: string }> = [];

  {
    const { context, extensionId } = await launchExtension(userDataDir, dist, {
      resetProfile: true,
    });
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

    const client = await context.newCDPSession(page);
    const { targetInfos } = await client.send("Target.getTargets");
    const swTarget = targetInfos.find(
      (t) => t.type === "service_worker" && t.url.includes(extensionId),
    );
    expect(swTarget).toBeTruthy();
    await client.send("Target.closeTarget", { targetId: swTarget!.targetId });
    await page.waitForTimeout(400);
    const woken = await msg<{
      data: {
        database: {
          entries: Array<{ id: string; url: string; title: string }>;
        };
      };
    }>(page, {
      type: "get-state",
    });
    expect(woken.data.database.entries).toEqual(originalEntries);
    await context.close();
  }

  {
    const { context, extensionId } = await launchExtension(userDataDir, dist, {
      resetProfile: false,
    });
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
    // Deep verification of entries across profile restart (R214/R215/R216)
    expect(state.data.database.entries.length).toBe(originalEntries.length);
    expect(state.data.database.entries.map((e) => e.url)).toEqual(
      originalEntries.map((e) => e.url),
    );
    await page.screenshot({ path: path.join(artifacts, "after-restart.png") });
    await context.close();
  }
});

test("popup skip hides onboarding; options save ok", async () => {
  const dist = prepareDist();
  const userDataDir = path.join(os.tmpdir(), "tabfold-userdata-ui");
  const { context, extensionId } = await launchExtension(userDataDir, dist);
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
  const display = await onboard.evaluate((el) => getComputedStyle(el).display);
  expect(display).toBe("none");
  await popup.screenshot({
    path: path.join(artifacts, "popup-after-skip.png"),
  });

  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`, {
    waitUntil: "domcontentloaded",
  });
  // Change settings and verify persistence (R214/R215)
  await options.locator("#remove-after").uncheck();
  await options.locator("#default-scope").selectOption("window");
  await options.getByRole("button", { name: "Save settings" }).click();
  await expect(options.locator("#saved-msg")).toBeVisible();

  // Reload options page and assert values persisted
  await options.reload({ waitUntil: "domcontentloaded" });
  await expect(options.locator("#remove-after")).not.toBeChecked();
  await expect(options.locator("#default-scope")).toHaveValue("window");

  await context.close();
});

test("special tab handling: internal pages, duplicates, and token-bound confirmation", async () => {
  const dist = prepareDist();
  const userDataDir = path.join(os.tmpdir(), "tabfold-userdata-special");
  const fixture = await startFixtureServer();
  const { context, extensionId } = await launchExtension(userDataDir, dist);

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

  // 2. Token-bound confirmation flow for unsaved warning (R202/R208)
  const normTab = await openTabViaExtension(
    ext,
    `http://127.0.0.1:${fixture.port}/special`,
  );
  // Without confirmedUnsaved and without token, must request confirmation
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

  await context.close();
  await fixture.close();
});
