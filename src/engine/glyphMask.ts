// "Crisp glyphs" (§5.11): hard 1-bit glyph edges by thresholding the glyph's
// alpha. The threshold is 50% of full alpha — but never more than 50% of the
// glyph's *own* peak, so a thin glyph rendered small can never disappear.
// Without that, at a 4 × 8 px cell the Pixel font's `|` `'` `.` `:` peak at
// alpha 127 (just under 50%) and a fixed threshold would erase them entirely:
// a filled area of vertical strokes would export as blank paper.
// Pure and framework-free — shared by the on-screen atlas and every export.

/** Returns a binary (0 / 255) mask. Any glyph that has any ink keeps at least its strongest pixels. */
export function crispenAlpha(alpha: ArrayLike<number>): Uint8ClampedArray {
  const out = new Uint8ClampedArray(alpha.length);
  let peak = 0;
  for (let i = 0; i < alpha.length; i++) if (alpha[i] > peak) peak = alpha[i];
  if (peak === 0) return out;
  const threshold = Math.min(128, peak / 2);
  for (let i = 0; i < alpha.length; i++) out[i] = alpha[i] >= threshold ? 255 : 0;
  return out;
}
