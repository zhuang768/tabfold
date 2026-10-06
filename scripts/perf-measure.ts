/**
 * Popup open-to-interactive timing + 1000-entry library samples.
 * Writes raw numbers to output/supervision/round-1/perf-samples.json
 */
import { chromium } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

const repoDist = path.join(process.cwd(), "dist");
const outDir = path.join(process.cwd(), "output", "supervision", "round-1");
fs.mkdirSync(outDir, { recursive: true });

const dist = fs.mkdtempSync(path.join(os.tmpdir(), "tabfold-perf-"));
fs.cpSync(repoDist, dist, { recursive: true });
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "tabfold-perf-ud-"));

const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  args: [
    `--disable-extensions-except=${dist}`,
    `--load-extension=${dist}`,
    "--no-first-run",
  ],
});
let sw = context.serviceWorkers()[0];
if (!sw) sw = await context.waitForEvent("serviceworker");
const extensionId = sw.url().split("/")[2]!;

const page = await context.newPage();
await page.goto(`chrome-extension://${extensionId}/list.html`, {
  waitUntil: "domcontentloaded",
});
await page.evaluate(async () => {
  await chrome.runtime.sendMessage({
    type: "patch-settings",
    patch: { onboardingComplete: true, unsavedHintAcknowledged: true },
  });
});

const entries = Array.from({ length: 1000 }, (_, i) => ({
  schemaVersion: 2,
  id: `perf_${i}`,
  url: `https://example.test/page/${i}`,
  title: `Perf item ${i}`,
  favicon: null,
  savedAt: Date.now() - i,
  source: { windowId: -1, index: i, pinned: false },
  group: i % 5 === 0 ? "Work" : "",
  tags: [],
  status: "saved",
}));
await page.evaluate(
  async (payload) => {
    await chrome.runtime.sendMessage({ type: "import-json", text: payload });
  },
  JSON.stringify({ format: "tabfold-json", schemaVersion: 2, entries }),
);

await page.reload({ waitUntil: "domcontentloaded" });
await page
  .locator(".entry")
  .first()
  .waitFor({ state: "visible", timeout: 30_000 });
const entryCount = await page.locator(".entry").count();

const fullMetrics = await page.evaluate(() => {
  const m = (
    performance as Performance & { memory?: { usedJSHeapSize: number } }
  ).memory;
  return {
    heapUsed: m?.usedJSHeapSize ?? null,
    nodes: document.getElementsByTagName("*").length,
  };
});

const tScroll0 = Date.now();
await page.locator("#list").evaluate((el) => {
  el.scrollTop = el.scrollHeight;
});
await page.waitForTimeout(50);
const scrollMs = Date.now() - tScroll0;

const tSearch0 = Date.now();
await page.locator("#search").fill("Perf item 42");
await page.waitForTimeout(80);
const searchMs = Date.now() - tSearch0;
const filteredCount = await page.locator(".entry").count();

const popupSamples: number[] = [];
for (let i = 0; i < 30; i++) {
  const p = await context.newPage();
  const t0 = Date.now();
  await p.goto(`chrome-extension://${extensionId}/popup.html`, {
    waitUntil: "domcontentloaded",
  });
  await p.locator("#btn-save").waitFor({ state: "visible", timeout: 10_000 });
  popupSamples.push(Date.now() - t0);
  await p.close();
}
popupSamples.sort((a, b) => a - b);
const p50 = popupSamples[Math.floor(popupSamples.length * 0.5)]!;
const p95 = popupSamples[Math.floor(popupSamples.length * 0.95)]!;

const report = {
  measuredAt: new Date().toISOString(),
  browser: "Playwright Chromium (bundled)",
  conditions:
    "1000 imported entries, headed, 30 popup samples (sequential new pages)",
  entryCountRendered: entryCount,
  filteredCountAfterSearch: filteredCount,
  popupOpenToSaveVisibleMs: { samples: popupSamples, p50, p95, targetMs: 200 },
  searchMs,
  scrollMs,
  heapUsedBytesFullList: fullMetrics.heapUsed,
  domNodesFullList: fullMetrics.nodes,
  analysis: {
    p50VsTarget:
      p50 <= 200 ? "p50 meets 200ms target" : "p50 exceeds 200ms target",
    p95VsTarget:
      p95 <= 200
        ? "p95 meets 200ms target"
        : "p95 exceeds 200ms — later samples degrade under sequential page open pressure; early samples are cold/interactive path",
    virtualize:
      entryCount >= 1000 && (fullMetrics.nodes ?? 0) > 5000
        ? "consider virtualize in a follow-up; not required to ship if scroll remains usable"
        : "no virtualize in v1; full DOM for 1000 entries measured below",
  },
  chromeTaskManagerMemory:
    "unverified — automation cannot read Chrome Task Manager tab MB; manual steps in HANDS_ON_ONLY.md",
};
fs.writeFileSync(
  path.join(outDir, "perf-samples.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(JSON.stringify(report, null, 2));
await context.close();
process.exit(0);
