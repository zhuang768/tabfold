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
    if (info?.url?.startsWith("http")) return id;
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
  let entryCount = 0;

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
    const state = await msg<{ data: { database: { entries: unknown[] } } }>(
      page,
      {
        type: "get-state",
      },
    );
    entryCount = state.data.database.entries.length;
    expect(entryCount).toBeGreaterThan(2);

    const client = await context.newCDPSession(page);
    const { targetInfos } = await client.send("Target.getTargets");
    const swTarget = targetInfos.find(
      (t) => t.type === "service_worker" && t.url.includes(extensionId),
    );
    expect(swTarget).toBeTruthy();
    await client.send("Target.closeTarget", { targetId: swTarget!.targetId });
    await page.waitForTimeout(400);
    const woken = await msg<{ data: { database: { entries: unknown[] } } }>(
      page,
      {
        type: "get-state",
      },
    );
    expect(woken.data.database.entries.length).toBe(entryCount);
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
    const state = await msg<{ data: { database: { entries: unknown[] } } }>(
      page,
      {
        type: "get-state",
      },
    );
    expect(state.data.database.entries.length).toBe(entryCount);
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
  await options.getByRole("button", { name: "Save settings" }).click();
  await expect(options.locator("#saved-msg")).toBeVisible();
  await context.close();
});
