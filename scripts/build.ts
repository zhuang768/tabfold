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

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

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

// Fix script paths in HTML (already popup.js etc matching entry names)
// Copy manifest + icons
cpSync(join(root, "public/manifest.json"), join(dist, "manifest.json"));
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
