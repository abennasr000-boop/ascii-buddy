// Generates the app icon as plain PNGs, written by hand (signature + IHDR +
// IDAT + IEND, zlib via Node's built-in `zlib`) so the build has no binary
// image asset dependency. A 1-bit pixel-art heart on white, matching the
// "looks like 1984" aesthetic (see ASCII_BUDDY_SPEC.md §12.1).
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const GRID = 32; // base pixel-art resolution; upscaled with nearest-neighbor

function heartGrid(n) {
  const bits = [];
  for (let py = 0; py < n; py++) {
    const row = [];
    const my = 1.2 - ((py + 0.5) / n) * 2.4; // math y, up-positive, point at image bottom
    for (let px = 0; px < n; px++) {
      const mx = ((px + 0.5) / n) * 2.4 - 1.2;
      const inside = (mx * mx + my * my - 1) ** 3 - mx * mx * my ** 3 <= 0;
      row.push(inside ? 1 : 0);
    }
    bits.push(row);
  }
  return bits;
}

const grid = heartGrid(GRID);

function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeData), 0);
  return Buffer.concat([len, typeData, crc]);
}

function encodePng(size, marginFrac = 0.14) {
  const margin = Math.round(size * marginFrac);
  const inner = size - margin * 2;

  const rows = [];
  for (let y = 0; y < size; y++) {
    const filter = Buffer.from([0]); // no filter
    const row = Buffer.alloc(size * 3);
    for (let x = 0; x < size; x++) {
      let ink = false;
      if (x >= margin && x < margin + inner && y >= margin && y < margin + inner) {
        const gx = Math.min(GRID - 1, Math.floor(((x - margin) / inner) * GRID));
        const gy = Math.min(GRID - 1, Math.floor(((y - margin) / inner) * GRID));
        ink = grid[gy][gx] === 1;
      }
      const v = ink ? 0 : 255;
      row[x * 3] = v;
      row[x * 3 + 1] = v;
      row[x * 3 + 2] = v;
    }
    rows.push(filter, row);
  }
  const raw = Buffer.concat(rows);
  const idatData = deflateSync(raw, { level: 9 });

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idatData),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('src/assets/icons', { recursive: true });
for (const size of [32, 180, 192, 512]) {
  const png = encodePng(size);
  writeFileSync(`src/assets/icons/icon-${size}.png`, png);
  console.log(`wrote src/assets/icons/icon-${size}.png (${png.length} bytes)`);
}
