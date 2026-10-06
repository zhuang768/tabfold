import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const out = join(root, "tabfold-extension.zip");

if (!existsSync(dist)) {
  console.error("dist/ missing — run npm run build first");
  process.exit(1);
}

// Prefer system zip (macOS/Linux). On Windows use PowerShell Compress-Archive.
if (process.platform === "win32") {
  const ps = spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      `Compress-Archive -Path '${dist}\\*' -DestinationPath '${out}' -Force`,
    ],
    { stdio: "inherit" },
  );
  process.exit(ps.status ?? 1);
}

const r = spawnSync(
  "bash",
  ["-lc", `rm -f "${out}" && cd "${dist}" && zip -r "${out}" . -x "*.map"`],
  {
    stdio: "inherit",
  },
);
if (r.status !== 0) {
  console.error("zip failed — install Info-ZIP `zip` on PATH (macOS/Linux)");
  process.exit(r.status ?? 1);
}
console.log(`Packed → ${out}`);
