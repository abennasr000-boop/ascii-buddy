// Indexed 8-bit cel buffer + aliased rasterization. See ASCII_BUDDY_SPEC.md §6.1.
//
// A cel is a Uint8Array, one byte per pixel: 0 = transparent, 1-255 = index
// into the project color table. Drawing writes directly into this buffer
// with Bresenham lines and a stamped brush tip — never Canvas 2D stroke()/
// arc(), which anti-alias.

export type TipShape = 'round' | 'square';

export function createCelBuffer(width: number, height: number): Uint8Array {
  return new Uint8Array(width * height);
}

/** Mutable bounding box accumulator for dirty-region tracking, in canvas px, inclusive. */
export interface MutableBBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function emptyBBox(): MutableBBox {
  return { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
}

export function bboxIsEmpty(b: MutableBBox): boolean {
  return b.x1 < b.x0 || b.y1 < b.y0;
}

function growBBox(b: MutableBBox, x0: number, y0: number, x1: number, y1: number) {
  if (x0 < b.x0) b.x0 = x0;
  if (y0 < b.y0) b.y0 = y0;
  if (x1 > b.x1) b.x1 = x1;
  if (y1 > b.y1) b.y1 = y1;
}

/** Expands `target` to also cover `source` — used to fold a per-pointermove dirty
 * rect into the whole-stroke dirty rect that becomes the undo command's bbox. */
export function unionBBoxInto(target: MutableBBox, source: MutableBBox): void {
  if (bboxIsEmpty(source)) return;
  growBBox(target, source.x0, source.y0, source.x1, source.y1);
}

/** Stamps one brush tip centered at (cx, cy). Size is the tip's diameter/side in canvas px. */
export function stamp(
  buf: Uint8Array,
  width: number,
  height: number,
  cx: number,
  cy: number,
  size: number,
  tip: TipShape,
  colorIndex: number,
  dirty: MutableBBox,
): void {
  const r = Math.max(0.5, size / 2);
  const minX = Math.max(0, Math.floor(cx - r));
  const maxX = Math.min(width - 1, Math.ceil(cx + r));
  const minY = Math.max(0, Math.floor(cy - r));
  const maxY = Math.min(height - 1, Math.ceil(cy + r));
  if (minX > maxX || minY > maxY) return;

  const r2 = r * r;
  for (let y = minY; y <= maxY; y++) {
    const row = y * width;
    for (let x = minX; x <= maxX; x++) {
      if (tip === 'round') {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        if (dx * dx + dy * dy > r2) continue;
      }
      buf[row + x] = colorIndex;
    }
  }
  growBBox(dirty, minX, minY, maxX, maxY);
}

/** Bresenham line, stamping the brush at every step so strokes stay gap-free at any speed/zoom. */
export function strokeSegment(
  buf: Uint8Array,
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  size: number,
  tip: TipShape,
  colorIndex: number,
  dirty: MutableBBox,
): void {
  let cx = Math.round(x0);
  let cy = Math.round(y0);
  const ex = Math.round(x1);
  const ey = Math.round(y1);
  const dx = Math.abs(ex - cx);
  const dy = -Math.abs(ey - cy);
  const sx = cx < ex ? 1 : -1;
  const sy = cy < ey ? 1 : -1;
  let err = dx + dy;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    stamp(buf, width, height, cx, cy, size, tip, colorIndex, dirty);
    if (cx === ex && cy === ey) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      cx += sx;
    }
    if (e2 <= dx) {
      err += dx;
      cy += sy;
    }
  }
}
