// Rasterises one glyph into a cell-sized alpha mask, and names the ASCII fonts.
// Shared by the glyph atlas (what's drawn) and the shape-matching templates
// (what's matched against), so a character is matched using exactly the pixels
// that will be shown. See ASCII_BUDDY_SPEC.md §5.5, §5.11.
import type { Project } from '../types/model';

/** §3.4: Pixel = Departure Mono (default); Smooth = JetBrains Mono, falling back to Departure Mono for
 * any glyph it lacks (box-drawing/blocks in the extended set) so nothing ever renders as tofu. */
export function fontFamilyFor(font: Project['asciiFont']): string {
  return font === 'smooth'
    ? "'JetBrains Mono', 'Departure Mono', ui-monospace, monospace"
    : "'Departure Mono', ui-monospace, monospace";
}

/**
 * The glyph's alpha (0..255) at `cellW × cellH`: the em box stretched to fill the cell horizontally
 * (the slight non-uniform scaling §5.11 allows) and centred vertically.
 */
export function renderGlyphAlpha(char: string, cellW: number, cellH: number, fontFamily: string): Uint8ClampedArray {
  const canvas = document.createElement('canvas');
  canvas.width = cellW;
  canvas.height = cellH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.clearRect(0, 0, cellW, cellH);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const fontSize = cellH * 0.92;
  ctx.font = `${fontSize}px ${fontFamily}`;
  const width = ctx.measureText(char).width || fontSize * 0.6;
  const scaleX = width > 0 ? Math.min(3, Math.max(0.3, cellW / width)) : 1;
  ctx.save();
  ctx.translate(cellW / 2, cellH / 2);
  ctx.scale(scaleX, 1);
  ctx.fillText(char, 0, 0);
  ctx.restore();

  const img = ctx.getImageData(0, 0, cellW, cellH);
  const alpha = new Uint8ClampedArray(cellW * cellH);
  for (let i = 0; i < alpha.length; i++) alpha[i] = img.data[i * 4 + 3];
  return alpha;
}
