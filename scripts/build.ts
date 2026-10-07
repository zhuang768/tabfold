import * as esbuild from "esbuild";
import {
  cpSync,
  mkdirSync,
  rmSync,
  readFileSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { STRINGS } from "../src/strings.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

// Validate CSS syntax (R323)
const cssFiles = ["styles.css", "popup.css", "list.css", "options.css"];
for (const css of cssFiles) {
  const cssPath = join(root, "src/ui", css);
  const result = await esbuild.build({
    entryPoints: [cssPath],
    bundle: false,
    write: false,
    logLevel: "silent",
  });
  if (result.warnings.length > 0) {
    console.error(`CSS warning in ${css}:`, result.warnings);
    process.exit(1);
  }
}

const entryPoints = [
  join(root, "src/background/service-worker.ts"),
  join(root, "src/ui/popup.ts"),
  join(root, "src/ui/list.ts"),
  join(root, "src/ui/options.ts"),
];

await esbuild.build({
  entryPoints,
  bundle: true,
  outdir: dist,
  entryNames: "[name]",
  format: "esm",
  target: ["chrome127"],
  sourcemap: true,
  logLevel: "info",
  platform: "browser",
});

// HTML + CSS
for (const file of [
  "popup.html",
  "list.html",
  "options.html",
  "styles.css",
  "popup.css",
  "list.css",
  "options.css",
]) {
  cpSync(join(root, "src/ui", file), join(dist, file));
}

// Copy manifest & sync with STRINGS (R314)
const manifestRaw = readFileSync(join(root, "public/manifest.json"), "utf8");
const manifestJson = JSON.parse(manifestRaw);
manifestJson.name = STRINGS.appName;
manifestJson.description = STRINGS.shortDescription;
if (manifestJson.action) {
  manifestJson.action.default_title = STRINGS.actionDefaultTitle;
}
if (manifestJson.commands?.["save-current-tab"]) {
  manifestJson.commands["save-current-tab"].description =
    STRINGS.commandSaveDesc;
}
if (manifestJson.commands?.["open-library"]) {
  manifestJson.commands["open-library"].description =
    STRINGS.commandLibraryDesc;
}
writeFileSync(
  join(dist, "manifest.json"),
  JSON.stringify(manifestJson, null, 2) + "\n",
);

mkdirSync(join(dist, "icons"), { recursive: true });
const iconsDir = join(root, "public/icons");
if (existsSync(iconsDir)) {
  cpSync(iconsDir, join(dist, "icons"), { recursive: true });
}

// Rewrite HTML script/link if needed — popup.ts bundles to popup.js at dist root
const htmlFiles = ["popup.html", "list.html", "options.html"];
for (const h of htmlFiles) {
  const p = join(dist, h);
  const html = readFileSync(p, "utf8");
  // ensure relative assets
  writeFileSync(p, html);
}

console.log("Build complete → dist/");
