// Crops a live full-canvas cel buffer down to its content bounding box and
// compresses it for storage, and reverses that for loading. See
// ASCII_BUDDY_SPEC.md §6.1, §14.3 ("store non-empty cels cropped to their
// bounding box, compressed at rest").
import { deflateSync, inflateSync } from 'fflate';

export interface CelBBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function computeTightBBox(buf: Uint8Array, width: number, height: number): CelBBox | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (buf[row + x] !== 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** Crops the live buffer to `bbox` and deflates it, ready to store as a DrawingCel's `data`. */
export function encodeCel(buf: Uint8Array, width: number, bbox: CelBBox): Uint8Array {
  const cropped = new Uint8Array(bbox.w * bbox.h);
  for (let y = 0; y < bbox.h; y++) {
    const srcOffset = (bbox.y + y) * width + bbox.x;
    cropped.set(buf.subarray(srcOffset, srcOffset + bbox.w), y * bbox.w);
  }
  return deflateSync(cropped, { level: 6 });
}

/** Inflates stored cel `data` and writes it into a full-canvas-sized buffer at `bbox`. */
export function decodeCelInto(
  data: Uint8Array,
  bbox: CelBBox,
  outWidth: number,
  outHeight: number,
): Uint8Array {
  const out = new Uint8Array(outWidth * outHeight);
  const cropped = inflateSync(data);
  for (let y = 0; y < bbox.h; y++) {
    const destOffset = (bbox.y + y) * outWidth + bbox.x;
    out.set(cropped.subarray(y * bbox.w, (y + 1) * bbox.w), destOffset);
  }
  return out;
}
