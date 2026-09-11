// Converts a project color table into a 256-entry RGBA lookup table, used to
// turn the indexed cel buffer into pixels for display. See ASCII_BUDDY_SPEC.md
// §6.1. Index 0 is always fully transparent, so a track's own canvas can be
// composited over the ones below it (and the project background) normally.
import { hexToRgb } from './color';
import type { Hex } from '../types/model';

export function buildLUT(colors: Hex[]): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256 * 4);
  for (let i = 1; i < 256; i++) {
    const hex = colors[i];
    if (!hex) continue;
    const { r, g, b } = hexToRgb(hex);
    const o = i * 4;
    lut[o] = r;
    lut[o + 1] = g;
    lut[o + 2] = b;
    lut[o + 3] = 255;
  }
  return lut;
}

/** Converts one rectangular region of an indexed cel buffer into an RGBA ImageData through the LUT. */
export function celRegionToImageData(
  buf: Uint8Array,
  celWidth: number,
  lut: Uint8ClampedArray,
  x0: number,
  y0: number,
  w: number,
  h: number,
): ImageData {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const srcRow = (y0 + y) * celWidth + x0;
    const dstRow = y * w;
    for (let x = 0; x < w; x++) {
      const idx = buf[srcRow + x];
      const lo = idx * 4;
      const doo = (dstRow + x) * 4;
      out[doo] = lut[lo];
      out[doo + 1] = lut[lo + 1];
      out[doo + 2] = lut[lo + 2];
      out[doo + 3] = lut[lo + 3];
    }
  }
  return new ImageData(out, w, h);
}
