// Generates the app's PWA/favicon PNGs as plain static files in public/icons/.
//
// Why hand-rolled PNG encoding instead of next/og's ImageResponse (which is
// the normal way to do this in the App Router): ImageResponse's default font
// loader breaks on this machine with "TypeError: Invalid URL" during
// `next build`, because @vercel/og resolves its bundled font via a
// file:// URL built from the project's absolute path, and that path
// (`C:\Users\lynn.yeh\Lynn's Agents`) has both a space and an apostrophe.
// Pre-generating static PNGs sidesteps the whole code path — no font
// loading, no route handler, nothing for that bug to trip on.
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "public", "icons");
mkdirSync(outDir, { recursive: true });

const BG = [0x0c, 0x0e, 0x13, 255]; // ink-900
const FG = [255, 255, 255, 255];

// Bold blocky "L", 8x10 grid — legible even at 32x32.
const GLYPH = [
  [1, 1, 0, 0, 0, 0, 0, 0],
  [1, 1, 0, 0, 0, 0, 0, 0],
  [1, 1, 0, 0, 0, 0, 0, 0],
  [1, 1, 0, 0, 0, 0, 0, 0],
  [1, 1, 0, 0, 0, 0, 0, 0],
  [1, 1, 0, 0, 0, 0, 0, 0],
  [1, 1, 0, 0, 0, 0, 0, 0],
  [1, 1, 0, 0, 0, 0, 0, 0],
  [1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1],
];

function crc32(buf) {
  let c;
  const table = crc32.table ?? (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })());
  c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function renderPixels(size) {
  const rows = GLYPH.length;
  const cols = GLYPH[0].length;
  const cell = Math.max(1, Math.floor((size * 0.6) / rows));
  const glyphW = cell * cols;
  const glyphH = cell * rows;
  const offX = Math.floor((size - glyphW) / 2);
  const offY = Math.floor((size - glyphH) / 2);

  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let color = BG;
      const gx = x - offX;
      const gy = y - offY;
      if (gx >= 0 && gx < glyphW && gy >= 0 && gy < glyphH) {
        if (GLYPH[Math.floor(gy / cell)][Math.floor(gx / cell)]) color = FG;
      }
      const i = (y * size + x) * 4;
      pixels.set(color, i);
    }
  }
  return pixels;
}

function encodePng(size) {
  const pixels = renderPixels(size);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + size * 4);
    raw[rowStart] = 0; // filter: None
    Buffer.from(pixels.buffer, y * size * 4, size * 4).copy(raw, rowStart + 1);
  }
  const idat = deflateSync(raw);

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), // signature
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const targets = [
  ["icon-32.png", 32],
  ["apple-touch-icon.png", 180],
  ["icon-192.png", 192],
  ["icon-512.png", 512],
];

for (const [name, size] of targets) {
  writeFileSync(path.join(outDir, name), encodePng(size));
}

console.log(`[generate-icons] wrote ${targets.length} icon(s) to public/icons/`);
