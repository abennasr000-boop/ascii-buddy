// Converts cached grid statistics into an AsciiFrame using the Ramp style.
// See ASCII_BUDDY_SPEC.md §5.3, §5.4. Pure, framework-free, deterministic:
// the same stats + settings always produce the identical AsciiFrame.
//
// Shape and Hybrid styles are Phase 6 scope (§19) — `style` is read from
// ConversionSettings but only 'ramp' is implemented; other values fall back
// to ramp so the engine never silently produces nothing.
import type { AsciiFrame, ConversionSettings } from '../types/model';
import type { GridStats } from './gridStats';

/** `n = (coverage - t) / (1 - t)`, the normalized value in (0, 1] once past the threshold. */
export function normalize(coverage: number, threshold: number): number {
  return (coverage - threshold) / (1 - threshold);
}

/** `d = n^gamma` — the density curve; lower gamma produces denser characters. */
export function density(n: number, gamma: number): number {
  return Math.pow(n, gamma);
}

/** `index = clamp(ceil(d * L), 1, L)` into the ramp, 1-based. */
export function rampIndex(d: number, rampLength: number): number {
  return Math.min(rampLength, Math.max(1, Math.ceil(d * rampLength)));
}

export function convertToAsciiFrame(stats: GridStats, conversion: ConversionSettings): AsciiFrame {
  const { columns, rows } = stats;
  const chars = new Uint32Array(columns * rows);
  const colors = new Uint8Array(columns * rows);
  const owner = new Uint8Array(columns * rows);

  const rampChars = Array.from(conversion.ramp); // code-point safe
  const L = rampChars.length;
  const t = conversion.threshold;

  if (L > 0) {
    for (let i = 0; i < columns * rows; i++) {
      const coverage = stats.coverage[i];
      if (coverage <= t) continue; // empty grid cell
      const n = normalize(coverage, t);
      const d = density(n, conversion.density);
      const idx = rampIndex(d, L);
      const ch = rampChars[idx - 1];
      chars[i] = ch.codePointAt(0) ?? 0;
      colors[i] = stats.dominantColor[i];
      owner[i] = 1; // Phase 1-3: a single drawing track always claims what it covers
    }
  }

  return { columns, rows, chars, colors, owner };
}
