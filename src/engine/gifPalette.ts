// Turns an RGBA frame into a GIF-ready indexed bitmap + palette. ASCII art and pixel art use only a few
// flat colours (with crisp glyphs there are no blended edges at all), so the exact colours are used
// whenever they fit in the 256 a GIF allows; only frames with more (smooth glyph edges, photographic
// references) fall back to gifenc's quantiser.
import { applyPalette, quantize } from 'gifenc';

export interface IndexedFrame {
  index: Uint8Array;
  palette: number[][]; // [r, g, b] entries
  /** Palette entry that is fully transparent, when the frame has transparency. */
  transparentIndex?: number;
}

export function indexFrame(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number, transparent: boolean): IndexedFrame {
  const pixels = width * height;
  const index = new Uint8Array(pixels);
  const colors = new Map<number, number>();
  const palette: number[][] = [];
  let transparentIndex: number | undefined;
  const limit = 256;
  let overflow = false;

  for (let p = 0; p < pixels; p++) {
    const o = p * 4;
    if (transparent && rgba[o + 3] < 128) {
      if (transparentIndex === undefined) {
        if (palette.length >= limit) {
          overflow = true;
          break;
        }
        transparentIndex = palette.length;
        palette.push([0, 0, 0]);
      }
      index[p] = transparentIndex;
      continue;
    }
    const key = (rgba[o] << 16) | (rgba[o + 1] << 8) | rgba[o + 2];
    let i = colors.get(key);
    if (i === undefined) {
      if (palette.length >= limit) {
        overflow = true;
        break;
      }
      i = palette.length;
      colors.set(key, i);
      palette.push([rgba[o], rgba[o + 1], rgba[o + 2]]);
    }
    index[p] = i;
  }

  if (!overflow) {
    // GIF palettes come in power-of-two sizes; gifenc pads, but an empty palette must still have an entry.
    if (palette.length === 0) palette.push([0, 0, 0]);
    return { index, palette, transparentIndex };
  }

  if (transparent) {
    const q = quantize(rgba, 256, { format: 'rgba4444', oneBitAlpha: true });
    const mapped = applyPalette(rgba, q, 'rgba4444');
    const t = q.findIndex((c) => c[3] === 0);
    return { index: mapped, palette: q.map((c) => [c[0], c[1], c[2]]), transparentIndex: t >= 0 ? t : undefined };
  }
  const q = quantize(rgba, 256, { format: 'rgb565' });
  return { index: applyPalette(rgba, q, 'rgb565'), palette: q };
}
