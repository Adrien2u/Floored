/**
 * Generate the app icons.
 *
 * PNG is written by hand rather than by an image library, for the same reason
 * the PDF writer is: the file is a handful of chunks around a zlib stream,
 * `node:zlib` is in the standard library, and the alternative is a dependency
 * tree with a licence audit attached — for four small squares and a circle.
 *
 * Run with `npm run icons`. The output is committed, so a clone needs no
 * generation step and the icons are reviewable in a diff like anything else.
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT_DIR = fileURLToPath(new URL('../public/', import.meta.url));

/** Ink and ground. The plan is drawn light on dark, as a plan on a screen is. */
const GROUND = [17, 17, 19, 255];
const INK = [245, 245, 245, 255];
const ACCENT = [214, 122, 82, 255];

/* ------------------------------------------------------------------ *
 * PNG
 * ------------------------------------------------------------------ */

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** Encode RGBA pixels as a PNG. Filter byte 0 (none) on every row. */
function encodePng(width, height, pixels) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);

  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA
  header[10] = 0; // deflate
  header[11] = 0; // adaptive filtering
  header[12] = 0; // no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------------------------------------------ *
 * Drawing
 * ------------------------------------------------------------------ */

function canvas(size, fill) {
  const pixels = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    pixels[i * 4] = fill[0];
    pixels[i * 4 + 1] = fill[1];
    pixels[i * 4 + 2] = fill[2];
    pixels[i * 4 + 3] = fill[3];
  }
  return pixels;
}

function put(pixels, size, x, y, colour) {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const i = (y * size + x) * 4;
  pixels[i] = colour[0];
  pixels[i + 1] = colour[1];
  pixels[i + 2] = colour[2];
  pixels[i + 3] = colour[3];
}

function rect(pixels, size, x0, y0, w, h, colour) {
  for (let y = Math.round(y0); y < Math.round(y0 + h); y++) {
    for (let x = Math.round(x0); x < Math.round(x0 + w); x++) put(pixels, size, x, y, colour);
  }
}

function ring(pixels, size, cx, cy, radius, thickness, colour) {
  const outer = radius + thickness / 2;
  const inner = radius - thickness / 2;

  for (let y = Math.floor(cy - outer); y <= Math.ceil(cy + outer); y++) {
    for (let x = Math.floor(cx - outer); x <= Math.ceil(cx + outer); x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d <= outer && d >= inner) put(pixels, size, x, y, colour);
    }
  }
}

/**
 * The mark: a room outline with a round table inside it.
 *
 * The most literal thing the app does, which is what an icon on a taskbar has
 * room to say.
 */
function drawIcon(size, { padding }) {
  const pixels = canvas(size, GROUND);

  const inset = Math.round(size * padding);
  const box = size - inset * 2;
  const line = Math.max(2, Math.round(size * 0.045));

  // Room walls.
  rect(pixels, size, inset, inset, box, line, INK);
  rect(pixels, size, inset, inset + box - line, box, line, INK);
  rect(pixels, size, inset, inset, line, box, INK);
  rect(pixels, size, inset + box - line, inset, line, box, INK);

  // A round table, off-centre the way a plan actually looks.
  ring(pixels, size, inset + box * 0.42, inset + box * 0.44, box * 0.17, line, ACCENT);

  // Two banquet tables below it.
  const tableW = box * 0.42;
  const tableH = Math.max(line, box * 0.075);
  rect(pixels, size, inset + box * 0.2, inset + box * 0.66, tableW, tableH, INK);
  rect(pixels, size, inset + box * 0.2, inset + box * 0.66 + tableH * 2.4, tableW, tableH, INK);

  return encodePng(size, size, pixels);
}

mkdirSync(OUT_DIR, { recursive: true });

const icons = [
  // Plain icons sit close to the edge; the maskable one leaves the 20% safe
  // margin Android crops into, or the walls would be shaved off.
  ['icon-192.png', 192, { padding: 0.14 }],
  ['icon-512.png', 512, { padding: 0.14 }],
  ['icon-maskable-512.png', 512, { padding: 0.24 }],
];

for (const [name, size, options] of icons) {
  writeFileSync(new URL(name, `file://${OUT_DIR.replace(/\\/g, '/')}`), drawIcon(size, options));
  console.log(`[icons] ${name} ${String(size)}×${String(size)}`);
}
