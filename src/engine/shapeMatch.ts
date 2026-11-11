// Shape-aware character choice by template matching. See ASCII_BUDDY_SPEC.md §5.5.
//
// Every candidate glyph is rendered once into the same S × 2S sub-grid the cel
// statistics use (gridStats.ts BIN_*) and normalised to a unit vector. A grid
// cell's bins are compared to every template by cosine similarity — which
// ignores how much ink there is, so a thin line still matches a line-shaped
// glyph. Tuned against real pen strokes (see DECISIONS.md), with two additions
// the spec allows ("an optional small penalty ... if it improves results"):
//
//  • Translation tolerance. A 4 px pen line falls at an arbitrary position inside
//    a grid cell, so each glyph is also matched shifted up to ±2 bins sideways and
//    ±1 bin vertically, at a small cost per bin. Without it a vertical line only
//    became `|` when it happened to sit in the middle of the cell (38% of
//    positions); with it, 100%.
//  • A log-ratio ink term. Cosine alone matches a sliver of ink at a cell's edge
//    (the pen's width spilling into the neighbouring cell) to a large glyph just
//    as readily as to a small one; comparing total ink makes slivers pick light glyphs.
//
// The best score wins; ties go to the earlier candidate, so results are deterministic.
// Pure and framework-free (the glyph rasterisation itself lives in the UI layer).
import { BIN_COLS, BIN_ROWS, BIN_COUNT } from './gridStats';

/** Sideways / vertical shifts tried per glyph, in bins, with their cost distance. Order = tie-break order. */
const SHIFTS: ReadonlyArray<readonly [number, number, number]> = [
  [0, 0, 0],
  [1, 0, 1],
  [-1, 0, 1],
  [2, 0, 2],
  [-2, 0, 2],
  [0, 1, 1],
  [0, -1, 1],
];

/** Weight of the |ln(cell ink / glyph ink)| term subtracted from the cosine score. */
export const INK_PENALTY = 0.05;
/** Cost per bin of shifting a glyph. */
export const SHIFT_PENALTY = 0.02;
const INK_EPSILON = 0.01;

export interface ShapeTemplates {
  /** Library glyph code points, in library order. */
  codes: Uint32Array;
  /** Mean coverage (0..1) of each library glyph's unshifted mask. */
  glyphInk: Float32Array;
  /** Variants (shifted copies) of glyph g are `variantStart[g] .. variantStart[g + 1]`. */
  variantStart: Int32Array;
  /** Sparse unit vectors, one per variant: bins `binIndex[offsets[v]..offsets[v+1]]` with `weights` in the same range. */
  offsets: Int32Array;
  binIndex: Uint8Array;
  weights: Float32Array;
  /** Per variant: the unshifted glyph's ink, and its shift cost. */
  variantInk: Float32Array;
  variantDist: Uint8Array;
}

export interface RawTemplate {
  code: number;
  /** BIN_COUNT values, 0..255 (alpha averaged into each bin). */
  bins: ArrayLike<number>;
}

/** Builds the template library with all shifted variants, dropping any candidate whose mask is empty (e.g. a space). */
export function buildTemplates(raw: RawTemplate[]): ShapeTemplates {
  const kept = raw.filter((r) => {
    for (let i = 0; i < BIN_COUNT; i++) if (r.bins[i] > 0) return true;
    return false;
  });
  const codes = new Uint32Array(kept.length);
  const glyphInk = new Float32Array(kept.length);
  const variantStart = new Int32Array(kept.length + 1);
  const offsets: number[] = [0];
  const binIndex: number[] = [];
  const weights: number[] = [];
  const variantInk: number[] = [];
  const variantDist: number[] = [];

  kept.forEach((r, g) => {
    let sumSq = 0;
    let sum = 0;
    for (let i = 0; i < BIN_COUNT; i++) {
      sumSq += r.bins[i] * r.bins[i];
      sum += r.bins[i];
    }
    const norm = Math.sqrt(sumSq);
    codes[g] = r.code;
    glyphInk[g] = sum / (BIN_COUNT * 255);
    variantStart[g] = variantInk.length;
    for (const [dx, dy, dist] of SHIFTS) {
      // Shifted copy: bins pushed out of the cell are dropped, so a heavily shifted glyph scores lower.
      const shifted = new Float32Array(BIN_COUNT);
      let nSq = 0;
      for (let row = 0; row < BIN_ROWS; row++) {
        for (let col = 0; col < BIN_COLS; col++) {
          const rr = row + dy;
          const cc = col + dx;
          if (rr < 0 || rr >= BIN_ROWS || cc < 0 || cc >= BIN_COLS) continue;
          const v = r.bins[row * BIN_COLS + col] / norm; // normalised against the *unshifted* glyph
          shifted[rr * BIN_COLS + cc] = v;
          nSq += v * v;
        }
      }
      if (nSq === 0) continue;
      const shiftedNorm = Math.sqrt(nSq);
      for (let i = 0; i < BIN_COUNT; i++) {
        if (shifted[i] > 0) {
          binIndex.push(i);
          weights.push(shifted[i] / shiftedNorm);
        }
      }
      offsets.push(binIndex.length);
      variantInk.push(glyphInk[g]);
      variantDist.push(dist);
    }
  });
  variantStart[kept.length] = variantInk.length;

  return {
    codes,
    glyphInk,
    variantStart,
    offsets: Int32Array.from(offsets),
    binIndex: Uint8Array.from(binIndex),
    weights: Float32Array.from(weights),
    variantInk: Float32Array.from(variantInk),
    variantDist: Uint8Array.from(variantDist),
  };
}

const indexCache = new WeakMap<ShapeTemplates, Map<number, number>>();

/** Library glyph indices for a conversion's own candidate list (its shape characters, plus the extended
 * set), in candidate order — which is the tie-break order. Candidates the library has no glyph for are skipped. */
export function allowedIndices(t: ShapeTemplates, shapeChars: string, extended: boolean): Int32Array {
  let index = indexCache.get(t);
  if (!index) {
    index = new Map();
    t.codes.forEach((code, g) => index!.set(code, g));
    indexCache.set(t, index);
  }
  const out: number[] = [];
  for (const ch of shapeCandidates(shapeChars, extended)) {
    const g = index.get(ch.codePointAt(0) ?? 0);
    if (g !== undefined) out.push(g);
  }
  return Int32Array.from(out);
}

/**
 * Best-matching candidate code point for the cell whose bins start at `bins[offset]`; 0 if there are none.
 * `allowed` restricts the search to a subset of the library (see allowedIndices).
 */
export function bestShapeCode(bins: Uint8Array, offset: number, t: ShapeTemplates, allowed?: Int32Array): number {
  const glyphCount = allowed ? allowed.length : t.codes.length;
  if (glyphCount === 0) return 0;
  let sumSq = 0;
  let sum = 0;
  for (let i = 0; i < BIN_COUNT; i++) {
    const v = bins[offset + i];
    sumSq += v * v;
    sum += v;
  }
  if (sumSq === 0) return 0;
  const cellNorm = Math.sqrt(sumSq);
  const cellInk = sum / (BIN_COUNT * 255);

  let best = -1;
  let bestScore = -Infinity;
  for (let j = 0; j < glyphCount; j++) {
    const g = allowed ? allowed[j] : j;
    for (let v = t.variantStart[g]; v < t.variantStart[g + 1]; v++) {
      let dot = 0;
      for (let k = t.offsets[v]; k < t.offsets[v + 1]; k++) dot += bins[offset + t.binIndex[k]] * t.weights[k];
      const score =
        dot / cellNorm -
        INK_PENALTY * Math.abs(Math.log((cellInk + INK_EPSILON) / (t.variantInk[v] + INK_EPSILON))) -
        SHIFT_PENALTY * t.variantDist[v];
      if (score > bestScore) {
        bestScore = score;
        best = g;
      }
    }
  }
  return best < 0 ? 0 : t.codes[best];
}

/** Extended-set additions to the shape candidates (§5.5): box-drawing and block characters. */
export const EXTENDED_SHAPE_CHARS = '─│┌┐└┘├┤┬┴┼╱╲╳▀▄▌▐';

/** The candidate characters for a conversion: the user's list (plus the extended set when enabled), de-duplicated, spaces dropped. */
export function shapeCandidates(shapeChars: string, extended: boolean): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const ch of Array.from(shapeChars + (extended ? EXTENDED_SHAPE_CHARS : ''))) {
    if (ch.trim() === '' || seen.has(ch)) continue;
    seen.add(ch);
    out.push(ch);
  }
  return out;
}
