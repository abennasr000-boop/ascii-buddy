import { describe, expect, it } from 'vitest';
import { bestShapeCode, buildTemplates, shapeCandidates, type RawTemplate } from './shapeMatch';
import { convertToAsciiFrame, convertTrackCells, type ConvertContext } from './asciiConvert';
import { effectiveSettings, resolveOccupancy } from './occupancy';
import { BIN_COLS, BIN_ROWS, BIN_COUNT, type GridStats } from './gridStats';
import { defaultConversionSettings } from '../model/defaults';

/** Builds a 6×12 bin mask from a predicate over (col, row), full-strength where true. */
function mask(fn: (c: number, r: number) => boolean, strength = 255): Uint8Array {
  const out = new Uint8Array(BIN_COUNT);
  for (let r = 0; r < BIN_ROWS; r++) for (let c = 0; c < BIN_COLS; c++) if (fn(c, r)) out[r * BIN_COLS + c] = strength;
  return out;
}

// Hand-made stand-ins for the real glyph masks (which need a canvas + font, so they're checked in the browser).
const RAW: RawTemplate[] = [
  { code: 45, bins: mask((_c, r) => r === 5 || r === 6) }, // -
  { code: 95, bins: mask((_c, r) => r === 11) }, // _
  { code: 124, bins: mask((c) => c === 2 || c === 3) }, // |
  { code: 47, bins: mask((c, r) => Math.abs(c - (BIN_COLS - 1) * (1 - r / (BIN_ROWS - 1))) < 0.9) }, // /
  { code: 92, bins: mask((c, r) => Math.abs(c - (BIN_COLS - 1) * (r / (BIN_ROWS - 1))) < 0.9) }, // \
  { code: 46, bins: mask((c, r) => (c === 2 || c === 3) && r >= 9 && r <= 10) }, // .
];
const templates = buildTemplates(RAW);
const codeFor = (bins: Uint8Array) => bestShapeCode(bins, 0, templates);

describe('shape matching (§5.5)', () => {
  it('matches straight lines at 0°, 90° and the two diagonals to - | / \\', () => {
    expect(String.fromCodePoint(codeFor(mask((_c, r) => r === 5 || r === 6)))).toBe('-');
    expect(String.fromCodePoint(codeFor(mask((c) => c === 2 || c === 3)))).toBe('|');
    expect(String.fromCodePoint(codeFor(mask((c, r) => Math.abs(c - 5 * (1 - r / 11)) < 0.9)))).toBe('/');
    expect(String.fromCodePoint(codeFor(mask((c, r) => Math.abs(c - 5 * (r / 11)) < 0.9)))).toBe('\\');
  });

  it('ignores the total amount of ink: a faint line matches the same glyph as a bold one (cosine)', () => {
    const faint = mask((c) => c === 2 || c === 3, 40);
    const bold = mask((c) => c === 2 || c === 3, 255);
    expect(codeFor(faint)).toBe(codeFor(bold));
  });

  it('a line low in the cell prefers _ over -', () => {
    expect(String.fromCodePoint(codeFor(mask((_c, r) => r === 11)))).toBe('_');
  });

  it('is deterministic and breaks ties by candidate order', () => {
    const twin = buildTemplates([
      { code: 111, bins: mask((c) => c === 2) },
      { code: 79, bins: mask((c) => c === 2) },
    ]);
    const bins = mask((c) => c === 2);
    expect(bestShapeCode(bins, 0, twin)).toBe(111);
    expect(bestShapeCode(bins, 0, twin)).toBe(111);
  });

  it('returns 0 for an empty cell or no candidates', () => {
    expect(codeFor(new Uint8Array(BIN_COUNT))).toBe(0);
    expect(bestShapeCode(mask(() => true), 0, buildTemplates([]))).toBe(0);
  });

  it('drops empty candidate masks (e.g. a space)', () => {
    expect(buildTemplates([{ code: 32, bins: new Uint8Array(BIN_COUNT) }, RAW[0]]).codes.length).toBe(1);
  });

  it('builds the candidate list from the shape characters, de-duplicated, spaces dropped, extended set optional', () => {
    expect(shapeCandidates('-- |/ ', false)).toEqual(['-', '|', '/']);
    expect(shapeCandidates('-', true).length).toBeGreaterThan(10);
    expect(shapeCandidates('-', true)).toContain('┼');
  });
});

function oneCell(coverage: number, bins: Uint8Array, dominant = 3): GridStats {
  return { columns: 1, rows: 1, coverage: new Float32Array([coverage]), dominantColor: new Uint8Array([dominant]), bins };
}
const ctx: ConvertContext = { templates, extended: false, colorChars: null };
const base = defaultConversionSettings();

describe('styles (§5.4–5.6)', () => {
  const vertical = mask((c) => c === 2 || c === 3);

  it('Shape uses the matched glyph; Ramp ignores shape entirely', () => {
    const stats = oneCell(0.1, vertical);
    expect(String.fromCodePoint(convertToAsciiFrame(stats, { ...base, style: 'shape' }, ctx).chars[0])).toBe('|');
    expect(convertToAsciiFrame(stats, { ...base, style: 'ramp' }, ctx).chars[0]).not.toBe(124);
  });

  it('Hybrid: shape below the cutoff, ramp at or above it (strokes → shapes, filled areas → density)', () => {
    const hybrid = { ...base, style: 'hybrid' as const, hybridCutoff: 0.45 };
    expect(String.fromCodePoint(convertToAsciiFrame(oneCell(0.2, vertical), hybrid, ctx).chars[0])).toBe('|');
    const dense = convertToAsciiFrame(oneCell(0.8, vertical), hybrid, ctx);
    expect(Array.from(base.ramp)).toContain(String.fromCodePoint(dense.chars[0]));
  });

  it('Shape/Hybrid fall back to the ramp when templates are not ready (never silently empty)', () => {
    const frame = convertToAsciiFrame(oneCell(0.5, vertical), { ...base, style: 'shape' }, { templates: null, extended: false, colorChars: null });
    expect(frame.chars[0]).not.toBe(0);
    expect(frame.owner[0]).toBe(1);
  });

  it('the threshold empties cells before any style is applied', () => {
    const frame = convertToAsciiFrame(oneCell(0.05, vertical), { ...base, style: 'shape', threshold: 0.1 }, ctx);
    expect(frame.chars[0]).toBe(0);
  });

  it('is deterministic: the same input gives the identical frame', () => {
    const stats = oneCell(0.3, vertical);
    const a = convertToAsciiFrame(stats, { ...base, style: 'hybrid' }, ctx);
    const b = convertToAsciiFrame(stats, { ...base, style: 'hybrid' }, ctx);
    expect([...a.chars]).toEqual([...b.chars]);
  });
});

describe('colors-to-characters (§5.8)', () => {
  const stats = oneCell(0.5, mask(() => true), 3);
  it('a mapped dominant color decides the character, in any style', () => {
    const c: ConvertContext = { templates, extended: false, colorChars: { enabled: true, map: { 3: '#' } } };
    expect(String.fromCodePoint(convertToAsciiFrame(stats, base, c).chars[0])).toBe('#');
    expect(String.fromCodePoint(convertToAsciiFrame(stats, { ...base, style: 'shape' }, c).chars[0])).toBe('#');
  });
  it('unmapped colors use the normal style, and disabling the option ignores the table', () => {
    const other = oneCell(0.5, mask(() => true), 4);
    const c: ConvertContext = { templates, extended: false, colorChars: { enabled: true, map: { 3: '#' } } };
    expect(convertToAsciiFrame(other, base, c).chars[0]).not.toBe('#'.codePointAt(0));
    const off: ConvertContext = { templates, extended: false, colorChars: { enabled: false, map: { 3: '#' } } };
    expect(convertToAsciiFrame(stats, base, off).chars[0]).not.toBe('#'.codePointAt(0));
  });
  it('the threshold still decides emptiness', () => {
    const c: ConvertContext = { templates, extended: false, colorChars: { enabled: true, map: { 3: '#' } } };
    expect(convertToAsciiFrame(stats, { ...base, threshold: 0.6 }, c).chars[0]).toBe(0);
  });
});

describe('settings cascade (§5.7)', () => {
  it('effective = project, overlaid with the track override, overlaid with the cel override', () => {
    const eff = effectiveSettings(base, { style: 'shape', threshold: 0.2 }, { threshold: 0.4 });
    expect(eff.style).toBe('shape'); // from the track
    expect(eff.threshold).toBe(0.4); // the cel wins over the track
    expect(eff.density).toBe(base.density); // inherited from the project
  });

  it('a cel override changes only its own cel: one track, two cels, different results', () => {
    const stats = oneCell(0.5, mask(() => true));
    const track = { trackId: 'A', position: 1, visible: true };
    const withOverride = resolveOccupancy(1, 1, [{ ...track, celConversion: { ramp: 'Z', density: 1 } }], new Map([['A', stats]]), base, ctx);
    const without = resolveOccupancy(1, 1, [track], new Map([['A', stats]]), base, ctx);
    expect(String.fromCodePoint(withOverride.chars[0])).toBe('Z');
    expect(String.fromCodePoint(without.chars[0])).not.toBe('Z');
  });

  it('a track override changes only that track, leaving others on the project settings', () => {
    const stats = oneCell(0.5, mask(() => true));
    // two side-by-side cells: track A (overridden) claims cell 0, track B claims cell 1
    const two = (cov: [number, number]): GridStats => ({ columns: 2, rows: 1, coverage: new Float32Array(cov), dominantColor: new Uint8Array([1, 1]), bins: new Uint8Array(BIN_COUNT * 2) });
    const frame = resolveOccupancy(
      2,
      1,
      [
        { trackId: 'A', position: 1, visible: true, conversion: { ramp: 'A', density: 1 } },
        { trackId: 'B', position: 2, visible: true },
      ],
      new Map([
        ['A', two([0.5, 0])],
        ['B', two([0, 0.5])],
      ]),
      { ...base, ramp: 'B', density: 1 },
      ctx,
    );
    expect(Array.from(frame.chars).map((c) => String.fromCodePoint(c))).toEqual(['A', 'B']);
    void stats;
  });

  it('shape matching is skipped in cells already claimed by a track above', () => {
    const stats: GridStats = { columns: 1, rows: 1, coverage: new Float32Array([0.3]), dominantColor: new Uint8Array([1]), bins: mask((c) => c === 2 || c === 3) };
    const claimed = new Uint8Array([1]);
    const cells = convertTrackCells(stats, { ...base, style: 'shape' }, ctx, claimed);
    expect(cells.claimed[0]).toBe(0);
    expect(cells.chars[0]).toBe(0);
  });
});

describe('per-conversion candidate lists', () => {
  it('a track whose shape characters exclude a glyph never chooses it', () => {
    const vertical = mask((c) => c === 2 || c === 3);
    const stats = oneCell(0.1, vertical);
    const restricted = convertToAsciiFrame(stats, { ...base, style: 'shape', shapeChars: '-_' }, ctx);
    expect(String.fromCodePoint(restricted.chars[0])).not.toBe('|');
    expect(['-', '_']).toContain(String.fromCodePoint(restricted.chars[0]));
  });
  it('falls back to the ramp when none of the candidates has a template', () => {
    const stats = oneCell(0.5, mask(() => true));
    const frame = convertToAsciiFrame(stats, { ...base, style: 'shape', shapeChars: 'XYZ' }, ctx);
    expect(Array.from(base.ramp)).toContain(String.fromCodePoint(frame.chars[0]));
  });
});

describe('translation tolerance and slivers', () => {
  it('a vertical line up to 2 bins off-centre is still `|` (a pen line lands anywhere in the cell)', () => {
    for (const col of [0, 1, 2, 3, 4]) {
      expect(String.fromCodePoint(codeFor(mask((c) => c === col)))).toBe('|');
    }
  });

  it('a horizontal line one bin row off-centre is still `-`', () => {
    expect(String.fromCodePoint(codeFor(mask((_c, r) => r === 4)))).toBe('-');
    expect(String.fromCodePoint(codeFor(mask((_c, r) => r === 7)))).toBe('-');
  });

  it('a sliver of ink at a cell edge picks a light glyph, not a big shape', () => {
    // one faint bin near the bottom edge — what the pen's width leaves in the neighbouring cell
    const sliver = new Uint8Array(BIN_COUNT);
    sliver[10 * BIN_COLS + 2] = 60;
    expect(String.fromCodePoint(codeFor(sliver))).toBe('.');
  });

  it('shifting is not free: an unshifted match beats an equally good shifted one', () => {
    // '-' occupies rows 5-6; a line exactly there must not be reported as some shifted glyph
    expect(String.fromCodePoint(codeFor(mask((_c, r) => r === 5 || r === 6)))).toBe('-');
  });
});
