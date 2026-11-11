// §5.10 Shape targets, checked with real pen strokes (rasterCel → gridStats bins)
// against the real Departure Mono glyph masks — the same path the app takes.
import { describe, expect, it } from 'vitest';
import { buildTemplates } from './shapeMatch';
import { computeFullGridStats } from './gridStats';
import { createCelBuffer, emptyBBox, strokeSegment } from './rasterCel';
import { convertToAsciiFrame, type ConvertContext } from './asciiConvert';
import { defaultConversionSettings, DEFAULT_COLUMNS } from '../model/defaults';
import { rowsFor } from '../types/model';
import { DEPARTURE_MONO_SHAPE_BINS } from './fixtures/departureMonoShapeBins';

const W = 2048;
const H = 1536;
const COLS = DEFAULT_COLUMNS; // 80
const ROWS = rowsFor(COLS, W, H); // 30
const CW = W / COLS; // 25.6
const CH = H / ROWS; // 51.2

const templates = buildTemplates(Object.entries(DEPARTURE_MONO_SHAPE_BINS).map(([ch, bins]) => ({ code: ch.codePointAt(0)!, bins })));
const ctx: ConvertContext = { templates, extended: false, colorChars: null };
const settings = { ...defaultConversionSettings(), style: 'shape' as const };

/** Draws one 4 px pen line and returns the shape-converted characters, keyed by "col,row" for inked cells. */
function draw(x0: number, y0: number, x1: number, y1: number, size = 4) {
  const buf = createCelBuffer(W, H);
  strokeSegment(buf, W, H, x0, y0, x1, y1, size, 'round', 1, emptyBBox());
  const stats = computeFullGridStats(buf, W, H, COLS, ROWS, true);
  const frame = convertToAsciiFrame(stats, settings, ctx);
  const cells = new Map<string, { ch: string; coverage: number }>();
  for (let i = 0; i < frame.chars.length; i++) {
    if (frame.chars[i]) cells.set(`${i % COLS},${Math.floor(i / COLS)}`, { ch: String.fromCodePoint(frame.chars[i]), coverage: stats.coverage[i] });
  }
  return cells;
}

function tally(cells: Map<string, { ch: string; coverage: number }>, minCoverage: number, filter: (col: number, row: number) => boolean = () => true) {
  const counts: Record<string, number> = {};
  let total = 0;
  for (const [key, cell] of cells) {
    const [col, row] = key.split(',').map(Number);
    if (cell.coverage < minCoverage || !filter(col, row)) continue;
    counts[cell.ch] = (counts[cell.ch] ?? 0) + 1;
    total++;
  }
  return { counts, total };
}

describe('§5.10 shape targets — real strokes, real glyphs', () => {
  it('a horizontal line through the middle of the cells becomes -', () => {
    const cells = draw(10 * CW, 10.5 * CH, 60 * CW, 10.5 * CH);
    const { counts, total } = tally(cells, 0.02, (col) => col > 11 && col < 58); // skip the round end caps
    expect(total).toBeGreaterThan(40);
    expect(counts['-'] / total).toBeGreaterThanOrEqual(0.9);
  });

  it('a vertical line through the middle of the cells becomes |', () => {
    const cells = draw(30.5 * CW, 5 * CH, 30.5 * CW, 25 * CH);
    const { counts, total } = tally(cells, 0.02, (_c, row) => row > 6 && row < 24);
    expect(total).toBeGreaterThan(10);
    expect(counts['|'] / total).toBeGreaterThanOrEqual(0.9);
  });

  it('a vertical line anywhere inside the cell is still |, not just when it happens to be centred', () => {
    for (const offset of [0.2, 0.35, 0.5, 0.65, 0.8]) {
      const { counts, total } = tally(draw((30 + offset) * CW, 5 * CH, (30 + offset) * CW, 25 * CH), 0.05, (_c, row) => row > 6 && row < 24);
      expect((counts['|'] ?? 0) / total).toBeGreaterThanOrEqual(0.8);
    }
  });

  it('a diagonal through the cell corners becomes / or \\ (one column per row, i.e. 45° on the character grid)', () => {
    const rising = tally(draw(24 * CW, 16 * CH, 36 * CW, 4 * CH), 0.05);
    const falling = tally(draw(24 * CW, 4 * CH, 36 * CW, 16 * CH), 0.05);
    expect(rising.counts['/'] / rising.total).toBeGreaterThanOrEqual(0.6);
    expect(falling.counts['\\'] / falling.total).toBeGreaterThanOrEqual(0.6);
  });

  it('is deterministic: the same strokes always give the identical characters', () => {
    const a = [...draw(24 * CW, 4 * CH, 36 * CW, 16 * CH)].map(([k, v]) => k + v.ch).join();
    const b = [...draw(24 * CW, 4 * CH, 36 * CW, 16 * CH)].map(([k, v]) => k + v.ch).join();
    expect(a).toBe(b);
  });

  it('a tiny accidental dot picks a light glyph in Shape mode, and vanishes with a small threshold', () => {
    const buf = createCelBuffer(W, H);
    strokeSegment(buf, W, H, 500, 500, 500, 500, 2, 'round', 1, emptyBBox());
    const stats = computeFullGridStats(buf, W, H, COLS, ROWS, true);
    const lightest = convertToAsciiFrame(stats, settings, ctx);
    const ch = [...lightest.chars].filter(Boolean).map((c) => String.fromCodePoint(c));
    expect(ch.length).toBeGreaterThan(0);
    for (const c of ch) expect(["'", ',', '.', ':', ';', '-', '_']).toContain(c);
    const thresholded = convertToAsciiFrame(stats, { ...settings, threshold: 0.02 }, ctx);
    expect([...thresholded.chars].every((c) => c === 0)).toBe(true);
  });
});
