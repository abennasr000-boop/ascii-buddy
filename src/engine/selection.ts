// Pure selection maths: masks (rectangle / lasso), pixel-block transforms
// (flip, rotate 90°, nearest-neighbour scale — never smoothed, to keep the
// aliased look) and marching-ants outline tracing. See ASCII_BUDDY_SPEC.md §6.3.

/** A rectangular chunk of a cel: indexed pixels plus which of them belong to the selection. */
export interface PixelBlock {
  width: number;
  height: number;
  pixels: Uint8Array;
  /** 1 = inside the selection. A rectangle selection is all ones. */
  mask: Uint8Array;
}

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function rectMask(w: number, h: number): Uint8Array {
  return new Uint8Array(w * h).fill(1);
}

/** Normalises two drag corners into a pixel rect clamped to the canvas. Null if it has no area. */
export function rectFromCorners(a: Point, b: Point, canvasW: number, canvasH: number): Rect | null {
  const x0 = Math.max(0, Math.floor(Math.min(a.x, b.x)));
  const y0 = Math.max(0, Math.floor(Math.min(a.y, b.y)));
  const x1 = Math.min(canvasW, Math.ceil(Math.max(a.x, b.x)));
  const y1 = Math.min(canvasH, Math.ceil(Math.max(a.y, b.y)));
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Even-odd scanline fill of a freehand polygon; a pixel is inside if its centre is. Null if empty. */
export function polygonMask(points: Point[], canvasW: number, canvasH: number): { rect: Rect; mask: Uint8Array } | null {
  if (points.length < 3) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const x0 = Math.max(0, Math.floor(minX));
  const y0 = Math.max(0, Math.floor(minY));
  const x1 = Math.min(canvasW, Math.ceil(maxX));
  const y1 = Math.min(canvasH, Math.ceil(maxY));
  const w = x1 - x0;
  const h = y1 - y0;
  if (w <= 0 || h <= 0) return null;

  const mask = new Uint8Array(w * h);
  let any = false;
  const crossings: number[] = [];
  for (let row = 0; row < h; row++) {
    const cy = y0 + row + 0.5;
    crossings.length = 0;
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      if ((a.y <= cy && b.y > cy) || (b.y <= cy && a.y > cy)) {
        crossings.push(a.x + ((cy - a.y) / (b.y - a.y)) * (b.x - a.x));
      }
    }
    crossings.sort((p, q) => p - q);
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      // Pixels whose centre (x + 0.5) lies in [crossings[i], crossings[i+1]).
      const from = Math.max(x0, Math.ceil(crossings[i] - 0.5));
      const to = Math.min(x1 - 1, Math.ceil(crossings[i + 1] - 0.5) - 1);
      for (let x = from; x <= to; x++) {
        mask[row * w + (x - x0)] = 1;
        any = true;
      }
    }
  }
  return any ? { rect: { x: x0, y: y0, w, h }, mask } : null;
}

/** Copies a rect out of a full-canvas buffer, keeping only pixels the mask selects. */
export function extractBlock(buf: Uint8Array, canvasW: number, rect: Rect, mask: Uint8Array): PixelBlock {
  const pixels = new Uint8Array(rect.w * rect.h);
  for (let y = 0; y < rect.h; y++) {
    for (let x = 0; x < rect.w; x++) {
      const i = y * rect.w + x;
      if (mask[i]) pixels[i] = buf[(rect.y + y) * canvasW + rect.x + x];
    }
  }
  return { width: rect.w, height: rect.h, pixels, mask: mask.slice() };
}

/** Sets every selected pixel of the rect to 0 in a full-canvas buffer. */
export function clearBlockArea(buf: Uint8Array, canvasW: number, rect: Rect, mask: Uint8Array): void {
  for (let y = 0; y < rect.h; y++) {
    for (let x = 0; x < rect.w; x++) {
      if (mask[y * rect.w + x]) buf[(rect.y + y) * canvasW + rect.x + x] = 0;
    }
  }
}

/** Draws a block into a full-canvas buffer at (dx, dy). Selected pixels overwrite — including
 * transparent (0) ones only if `overwriteWithTransparent` — and anything off-canvas is clipped. */
export function stampBlock(
  buf: Uint8Array,
  canvasW: number,
  canvasH: number,
  block: PixelBlock,
  dx: number,
  dy: number,
): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let y = 0; y < block.height; y++) {
    const cy = dy + y;
    if (cy < 0 || cy >= canvasH) continue;
    for (let x = 0; x < block.width; x++) {
      const cx = dx + x;
      if (cx < 0 || cx >= canvasW) continue;
      const i = y * block.width + x;
      const v = block.pixels[i];
      if (!block.mask[i] || v === 0) continue; // transparent floating pixels don't erase what's beneath
      buf[cy * canvasW + cx] = v;
      if (cx < x0) x0 = cx;
      if (cx > x1) x1 = cx;
      if (cy < y0) y0 = cy;
      if (cy > y1) y1 = cy;
    }
  }
  return x1 < x0 ? null : { x0, y0, x1, y1 };
}

export function flipBlockH(b: PixelBlock): PixelBlock {
  const pixels = new Uint8Array(b.pixels.length);
  const mask = new Uint8Array(b.mask.length);
  for (let y = 0; y < b.height; y++) {
    for (let x = 0; x < b.width; x++) {
      const s = y * b.width + x;
      const d = y * b.width + (b.width - 1 - x);
      pixels[d] = b.pixels[s];
      mask[d] = b.mask[s];
    }
  }
  return { width: b.width, height: b.height, pixels, mask };
}

export function flipBlockV(b: PixelBlock): PixelBlock {
  const pixels = new Uint8Array(b.pixels.length);
  const mask = new Uint8Array(b.mask.length);
  for (let y = 0; y < b.height; y++) {
    for (let x = 0; x < b.width; x++) {
      const s = y * b.width + x;
      const d = (b.height - 1 - y) * b.width + x;
      pixels[d] = b.pixels[s];
      mask[d] = b.mask[s];
    }
  }
  return { width: b.width, height: b.height, pixels, mask };
}

/** Rotates 90° clockwise; the result is height × width. */
export function rotateBlock90(b: PixelBlock): PixelBlock {
  const nw = b.height;
  const nh = b.width;
  const pixels = new Uint8Array(b.pixels.length);
  const mask = new Uint8Array(b.mask.length);
  for (let y = 0; y < b.height; y++) {
    for (let x = 0; x < b.width; x++) {
      const s = y * b.width + x;
      const d = x * nw + (nw - 1 - y);
      pixels[d] = b.pixels[s];
      mask[d] = b.mask[s];
    }
  }
  return { width: nw, height: nh, pixels, mask };
}

/** Nearest-neighbour resample to an exact size (at least 1 × 1). */
export function scaleBlock(b: PixelBlock, newW: number, newH: number): PixelBlock {
  const nw = Math.max(1, Math.round(newW));
  const nh = Math.max(1, Math.round(newH));
  if (nw === b.width && nh === b.height) return b;
  const pixels = new Uint8Array(nw * nh);
  const mask = new Uint8Array(nw * nh);
  for (let y = 0; y < nh; y++) {
    const sy = Math.min(b.height - 1, Math.floor(((y + 0.5) * b.height) / nh));
    for (let x = 0; x < nw; x++) {
      const sx = Math.min(b.width - 1, Math.floor(((x + 0.5) * b.width) / nw));
      pixels[y * nw + x] = b.pixels[sy * b.width + sx];
      mask[y * nw + x] = b.mask[sy * b.width + sx];
    }
  }
  return { width: nw, height: nh, pixels, mask };
}

/**
 * Traces the boundary of a mask into closed loops of pixel-corner coordinates (for marching ants).
 * Collinear points are merged, so a rectangle is exactly four vertices.
 */
export function maskOutline(mask: Uint8Array, w: number, h: number): Point[][] {
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1;
  const vw = w + 1;
  const key = (x: number, y: number) => y * vw + x;
  const outgoing = new Map<number, number[]>();
  const add = (ax: number, ay: number, bx: number, by: number) => {
    const k = key(ax, ay);
    const list = outgoing.get(k);
    if (list) list.push(key(bx, by));
    else outgoing.set(k, [key(bx, by)]);
  };

  // Every boundary edge, directed clockwise around the inside, so loops chain head-to-tail.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!inside(x, y)) continue;
      if (!inside(x, y - 1)) add(x, y, x + 1, y);
      if (!inside(x + 1, y)) add(x + 1, y, x + 1, y + 1);
      if (!inside(x, y + 1)) add(x + 1, y + 1, x, y + 1);
      if (!inside(x - 1, y)) add(x, y + 1, x, y);
    }
  }

  const loops: Point[][] = [];
  for (const startKey of [...outgoing.keys()]) {
    while ((outgoing.get(startKey)?.length ?? 0) > 0) {
      const path: number[] = [startKey];
      let current = outgoing.get(startKey)!.pop()!;
      while (current !== startKey) {
        path.push(current);
        const next = outgoing.get(current)?.pop();
        if (next === undefined) break; // malformed — can't happen for a closed mask boundary
        current = next;
      }
      // Drop points that lie in the middle of a straight run.
      const pts = path.map((k) => ({ x: k % vw, y: Math.floor(k / vw) }));
      const simplified: Point[] = [];
      for (let i = 0; i < pts.length; i++) {
        const prev = pts[(i - 1 + pts.length) % pts.length];
        const cur = pts[i];
        const next = pts[(i + 1) % pts.length];
        const straight = (cur.x - prev.x) * (next.y - cur.y) === (cur.y - prev.y) * (next.x - cur.x);
        if (!straight) simplified.push(cur);
      }
      loops.push(simplified);
    }
  }
  return loops;
}

/** SVG path data for outline loops, translated by (ox, oy). */
export function outlinePath(loops: Point[][], ox = 0, oy = 0): string {
  return loops.map((loop) => `M${loop.map((p) => `${p.x + ox} ${p.y + oy}`).join('L')}Z`).join('');
}
