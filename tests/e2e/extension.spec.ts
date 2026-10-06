import { test, expect, chromium, type BrowserContext } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import { execSync } from "node:child_process";

/**
 * Chrome's official channel often ignores --load-extension in automation.
 * Use Playwright's bundled Chromium + a copy of dist on a path WITHOUT spaces.
 */
const repoDist = path.join(process.cwd(), "dist");
const dist = "/tmp/tabfold-e2e-dist";
const userDataDir = path.join(
  process.cwd(),
  "output",
  "playwright",
  "user-data",
);
const artifacts = path.join(process.cwd(), "output", "playwright");

test.describe.configure({ mode: "serial" });

function prepareDist(): void {
  fs.mkdirSync(artifacts, { recursive: true });
  expect(fs.existsSync(path.join(repoDist, "manifest.json"))).toBeTruthy();
  expect(fs.existsSync(path.join(repoDist, "service-worker.js"))).toBeTruthy();
  fs.rmSync(dist, { recursive: true, force: true });
  execSync(`cp -R "${repoDist}" "${dist}"`);
}

async function launchExtension(): Promise<{
  context: BrowserContext;
  extensionId: string;
}> {
  prepareDist();
  if (fs.existsSync(userDataDir)) {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
  fs.mkdirSync(userDataDir, { recursive: true });

  const context = await chromium.launchPersistentContext(userDataDir, {
    // Do NOT set channel: 'chrome' — system Chrome may not expose extension SWs here.
    headless: false,
    args: [
      `--disable-extensions-except=${dist}`,
      `--load-extension=${dist}`,
      "--no-first-run",
      "--no-default-browser-check",
    ],
  });

  let sw = context.serviceWorkers()[0];
  if (!sw) {
    sw = await context.waitForEvent("serviceworker", { timeout: 30_000 });
  }
  const extensionId = sw.url().split("/")[2] ?? "";
  expect(extensionId.length).toBeGreaterThan(8);

  return { context, extensionId };
}

test("loads unpacked extension and opens library UI", async () => {
  const { context, extensionId } = await launchExtension();
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/list.html`);
  await expect(page.locator(".brand")).toHaveText("Tabfold");
  await page.screenshot({
    path: path.join(artifacts, "library.png"),
    fullPage: true,
  });

  await page.getByRole("button", { name: "Load demo data" }).click();
  await expect(page.locator(".entry").first()).toBeVisible({ timeout: 10_000 });
  const count = await page.locator(".entry").count();
  expect(count).toBeGreaterThanOrEqual(3);

  await page.screenshot({
    path: path.join(artifacts, "library-with-demo.png"),
    fullPage: true,
  });

  await page.locator("#search").fill("Wikipedia");
  await expect(page.locator(".entry")).toHaveCount(1);

  await page.locator("#search").fill("");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export JSON" }).click(),
  ]);
  const downloadPath = path.join(artifacts, await download.suggestedFilename());
  await download.saveAs(downloadPath);
  const exported = fs.readFileSync(downloadPath, "utf8");
  expect(exported).toContain("tabfold-json");
  expect(exported).toContain("wikipedia.org");

  await context.close();
});

test("popup renders and settings page works", async () => {
  const { context, extensionId } = await launchExtension();
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup.locator(".brand")).toHaveText("Tabfold");
  await popup.screenshot({ path: path.join(artifacts, "popup.png") });

  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await expect(
    options.getByRole("heading", { name: "Settings" }),
  ).toBeVisible();
  await options.locator("#remove-after").uncheck();
  await options.getByRole("button", { name: "Save settings" }).click();
  await expect(options.locator("#saved-msg")).toBeVisible();
  await options.screenshot({
    path: path.join(artifacts, "options.png"),
    fullPage: true,
  });

  await context.close();
});

test("service worker responds to get-state", async () => {
  const { context, extensionId } = await launchExtension();
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/list.html`);
  const result = await page.evaluate(async () => {
    return await chrome.runtime.sendMessage({ type: "get-state" });
  });
  expect(result.ok).toBe(true);
  expect(result.data.database.schemaVersion).toBe(2);
  await context.close();
});
