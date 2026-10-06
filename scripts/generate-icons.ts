/**
 * Generate simple PNG icons without third-party image libs.
 * Warm charcoal fold mark on bone / inverted for active state.
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const outDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "public",
  "icons",
);
mkdirSync(outDir, { recursive: true });

function crc32(buf: Buffer): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]!;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function writePng(
  size: number,
  bg: [number, number, number],
  fg: [number, number, number],
  accent: [number, number, number],
): Buffer {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      const i = row + 1 + x * 4;
      let [r, g, b] = bg;
      const nx = x / (size - 1);
      const ny = y / (size - 1);
      // Folded page shape
      const inFold =
        nx > 0.22 &&
        nx < 0.78 &&
        ny > 0.18 &&
        ny < 0.82 &&
        !(nx > 0.55 && ny < 0.18 + (nx - 0.55) * 0.9);
      const crease = Math.abs(nx - 0.55) < 0.03 && ny > 0.2 && ny < 0.75;
      const tab = nx > 0.12 && nx < 0.28 && ny > 0.35 && ny < 0.65;
      if (inFold) [r, g, b] = fg;
      if (crease) [r, g, b] = accent;
      if (tab) [r, g, b] = accent;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
      raw[i + 3] = 255;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const sizes = [16, 32, 48, 128];
const normalBg: [number, number, number] = [247, 246, 243];
const normalFg: [number, number, number] = [47, 52, 55];
const normalAccent: [number, number, number] = [31, 108, 159];

const activeBg: [number, number, number] = [47, 52, 55];
const activeFg: [number, number, number] = [247, 246, 243];
const activeAccent: [number, number, number] = [126, 196, 232];

for (const size of sizes) {
  writeFileSync(
    join(outDir, `icon-${size}.png`),
    writePng(size, normalBg, normalFg, normalAccent),
  );
  writeFileSync(
    join(outDir, `icon-${size}-active.png`),
    writePng(size, activeBg, activeFg, activeAccent),
  );
}

console.log("Icons written to public/icons");
