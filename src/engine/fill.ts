// Flood fill on an indexed pixel buffer. See ASCII_BUDDY_SPEC.md §6.3: 4-connected
// (diagonal lines are solid boundaries), exact index match. Pure — no DOM.

export interface FillResult {
  /** Inclusive bounding box of the filled region, or null if nothing changed. */
  bbox: { x0: number; y0: number; x1: number; y1: number } | null;
  count: number;
}

/** Composites several same-size indexed buffers (top-most first): each pixel takes the first non-zero index. */
export function compositeIndexed(layersTopFirst: Uint8Array[], width: number, height: number): Uint8Array {
  if (layersTopFirst.length === 1) return layersTopFirst[0];
  const out = new Uint8Array(width * height);
  for (const layer of layersTopFirst) {
    for (let i = 0; i < out.length; i++) if (out[i] === 0) out[i] = layer[i];
  }
  return out;
}

/**
 * Finds the 4-connected region of `boundary` pixels that share the seed's index and writes
 * `colorIndex` into `target` for every pixel of it. `boundary` is what decides the region's shape
 * (the composite of visible tracks, or just the current cel); `target` is what gets written (always
 * the current cel). They may be the same buffer.
 */
export function floodFill(
  boundary: Uint8Array,
  target: Uint8Array,
  width: number,
  height: number,
  seedX: number,
  seedY: number,
  colorIndex: number,
): FillResult {
  const sx = Math.floor(seedX);
  const sy = Math.floor(seedY);
  if (sx < 0 || sy < 0 || sx >= width || sy >= height) return { bbox: null, count: 0 };
  const seedIndex = boundary[sy * width + sx];
  if (seedIndex === colorIndex) return { bbox: null, count: 0 };

  // Decide the region on the untouched boundary, then write — so `boundary === target` works.
  const visited = new Uint8Array(width * height);
  const stack: number[] = [sx, sy];
  const region: number[] = [];
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;

  while (stack.length > 0) {
    const y = stack.pop()!;
    let x = stack.pop()!;
    if (visited[y * width + x] || boundary[y * width + x] !== seedIndex) continue;

    // Expand left/right along the scanline.
    let left = x;
    while (left > 0 && !visited[y * width + left - 1] && boundary[y * width + left - 1] === seedIndex) left--;
    let right = x;
    while (right < width - 1 && !visited[y * width + right + 1] && boundary[y * width + right + 1] === seedIndex) right++;

    for (x = left; x <= right; x++) {
      visited[y * width + x] = 1;
      region.push(y * width + x);
    }
    if (left < x0) x0 = left;
    if (right > x1) x1 = right;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;

    // Seed the rows above and below with one entry per run.
    for (const ny of [y - 1, y + 1]) {
      if (ny < 0 || ny >= height) continue;
      let inRun = false;
      for (x = left; x <= right; x++) {
        const ok = !visited[ny * width + x] && boundary[ny * width + x] === seedIndex;
        if (ok && !inRun) stack.push(x, ny);
        inRun = ok;
      }
    }
  }

  for (let i = 0; i < region.length; i++) target[region[i]] = colorIndex;
  return { bbox: region.length > 0 ? { x0, y0, x1, y1 } : null, count: region.length };
}
