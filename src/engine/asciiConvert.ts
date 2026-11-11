// Converts cached grid statistics into characters: Ramp, Shape and Hybrid
// styles plus the colors-to-characters mapping. See ASCII_BUDDY_SPEC.md §5.3–5.8.
// Pure, framework-free, deterministic: the same stats + settings always
// produce the identical result.
import type { AsciiFrame, ConversionSettings } from '../types/model';
import type { GridStats } from './gridStats';
import { allowedIndices, bestShapeCode, type ShapeTemplates } from './shapeMatch';

/** Everything besides the per-track settings that decides a character. */
export interface ConvertContext {
  /** Glyph templates for Shape/Hybrid; null until they've been rendered (those styles then fall back to ramp). */
  templates: ShapeTemplates | null;
  /** Character set (§5.7 project-only): true adds box-drawing/block characters to the shape candidates. */
  extended: boolean;
  /** §5.8 — a mapped dominant color overrides the style's character. */
  colorChars: { enabled: boolean; map: Record<number, string> } | null;
}

export const EMPTY_CONTEXT: ConvertContext = { templates: null, extended: false, colorChars: null };

/** True if the settings need per-cell sub-grid bins (any style that uses shape matching). */
export function needsBins(settings: Pick<ConversionSettings, 'style'>): boolean {
  return settings.style === 'shape' || settings.style === 'hybrid';
}

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

export function convertToAsciiFrame(stats: GridStats, conversion: ConversionSettings, ctx: ConvertContext = EMPTY_CONTEXT): AsciiFrame {
  const { columns, rows } = stats;
  const { chars, claimed } = convertTrackCells(stats, conversion, ctx, null);
  const colors = new Uint8Array(columns * rows);
  const owner = new Uint8Array(columns * rows);
  for (let i = 0; i < chars.length; i++) {
    if (!chars[i]) continue;
    colors[i] = stats.dominantColor[i];
    owner[i] = claimed[i]; // a single drawing track is position 1
  }
  return { columns, rows, chars, colors, owner };
}

export interface TrackCells {
  /** Code point per grid cell (0 = nothing to show). */
  chars: Uint32Array;
  /** 1 where this track claimed the cell (coverage above its threshold and not already claimed above). */
  claimed: Uint8Array;
}

/**
 * Chooses a character for every cell this track claims. `alreadyClaimed` (cells taken by tracks above,
 * §4.4) are skipped — never claimed and never matched, which keeps expensive shape matching to the
 * cells that will actually show. Pure and deterministic.
 */
export function convertTrackCells(
  stats: GridStats,
  settings: ConversionSettings,
  ctx: ConvertContext,
  alreadyClaimed: Uint8Array | null,
): TrackCells {
  const size = stats.columns * stats.rows;
  const chars = new Uint32Array(size);
  const claimed = new Uint8Array(size);
  const t = settings.threshold;
  const rampChars = Array.from(settings.ramp);
  const L = rampChars.length;
  const colorMap = ctx.colorChars?.enabled ? ctx.colorChars.map : null;
  const templates = needsBins(settings) && stats.bins ? ctx.templates : null;
  const allowed = templates ? allowedIndices(templates, settings.shapeChars, ctx.extended) : null;
  const useShape = templates !== null && allowed !== null && allowed.length > 0;

  for (let i = 0; i < size; i++) {
    if (alreadyClaimed && alreadyClaimed[i]) continue;
    const coverage = stats.coverage[i];
    if (coverage <= t) continue; // this track doesn't claim it
    claimed[i] = 1;

    // §5.8: a mapped color decides the character; the threshold above still decides emptiness.
    if (colorMap) {
      const mapped = colorMap[stats.dominantColor[i]];
      if (mapped) {
        chars[i] = mapped.codePointAt(0) ?? 0;
        continue;
      }
    }

    const wantShape = useShape && (settings.style === 'shape' || coverage < settings.hybridCutoff);
    if (wantShape) {
      const code = bestShapeCode(stats.bins!, i * (stats.bins!.length / size), templates!, allowed!);
      if (code !== 0) {
        chars[i] = code;
        continue;
      }
    }

    if (L === 0) continue; // claims the cell but has no characters to show
    const n = normalize(coverage, t);
    const idx = rampIndex(density(n, settings.density), L);
    chars[i] = rampChars[idx - 1].codePointAt(0) ?? 0;
  }
  return { chars, claimed };
}
