// Renders every icon bitmap into one SVG contact sheet, so the whole set can be reviewed side by side
// (at the sizes the app draws them, and enlarged). Usage: node tools/icon-sheet.mjs out.svg
import { writeFileSync } from 'node:fs';
import { ICON_BITMAPS, ICON_SIZE } from '../src/ui/iconBitmaps.ts';

const out = process.argv[2] ?? 'icon-sheet.svg';
const names = Object.keys(ICON_BITMAPS);
const cols = 6;
const big = 12; // px per icon pixel in the enlarged row
const cellW = ICON_SIZE * big + 24;
const cellH = ICON_SIZE * big + 90;
const rowsN = Math.ceil(names.length / cols);
let body = '';
names.forEach((name, i) => {
  const ox = (i % cols) * cellW + 12;
  const oy = Math.floor(i / cols) * cellH + 12;
  const rects = (scale, dx, dy, fill) =>
    ICON_BITMAPS[name]
      .map((row, y) => [...row].map((c, x) => (c === '#' ? `<rect x="${dx + x * scale}" y="${dy + y * scale}" width="${scale}" height="${scale}" fill="${fill}"/>` : '')).join(''))
      .join('');
  body += `<rect x="${ox - 4}" y="${oy - 4}" width="${ICON_SIZE * big + 8}" height="${ICON_SIZE * big + 8}" fill="#fff" stroke="#ccc"/>`;
  body += rects(big, ox, oy, '#000');
  // grid ticks for centring checks
  body += `<line x1="${ox + 8 * big}" y1="${oy}" x2="${ox + 8 * big}" y2="${oy + 16 * big}" stroke="#f0a" stroke-width="0.5" opacity="0.5"/>`;
  body += `<line x1="${ox}" y1="${oy + 8 * big}" x2="${ox + 16 * big}" y2="${oy + 8 * big}" stroke="#f0a" stroke-width="0.5" opacity="0.5"/>`;
  // as drawn in the app: 1× (16 px) and 2× (32 px), on paper and inverted
  const ry = oy + ICON_SIZE * big + 14;
  body += rects(2, ox, ry, '#000');
  body += `<rect x="${ox + 44}" y="${ry - 4}" width="40" height="40" fill="#000"/>` + rects(2, ox + 48, ry, '#fff');
  body += rects(1, ox + 100, ry, '#000');
  body += `<text x="${ox}" y="${ry + 52}" font-family="monospace" font-size="12">${name}</text>`;
});
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cols * cellW + 12}" height="${rowsN * cellH + 12}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#eee"/>${body}</svg>`;
writeFileSync(out, svg);
console.log('wrote', out, names.length, 'icons');
