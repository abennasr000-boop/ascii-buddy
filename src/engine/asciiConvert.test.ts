import { describe, expect, it } from 'vitest';
import { convertToAsciiFrame, density, normalize, rampIndex } from './asciiConvert';
import { computeFullGridStats } from './gridStats';
import { createCelBuffer, strokeSegment, emptyBBox } from './rasterCel';
import { defaultConversionSettings, DEFAULT_COLUMNS } from '../model/defaults';
import { rowsFor } from '../types/model';
import type { GridStats } from './gridStats';

function statsWithCoverage(coverage: number, dominant = 1): GridStats {
  return { columns: 1, rows: 1, coverage: new Float32Array([coverage]), dominantColor: new Uint8Array([dominant]) };
}

describe('normalize / density / rampIndex', () => {
  it('normalize(coverage, 0) is just the coverage', () => {
    expect(normalize(0.5, 0)).toBeCloseTo(0.5);
  });

  it('normalize maps coverage just above threshold near 0', () => {
    expect(normalize(0.51, 0.5)).toBeCloseTo(0.02, 2);
  });

  it('density with gamma=1 is linear', () => {
    expect(density(0.5, 1)).toBeCloseTo(0.5);
  });

  it('density with gamma<1 pushes values up (denser)', () => {
    expect(density(0.25, 0.5)).toBeCloseTo(0.5);
  });

  it('rampIndex clamps to [1, L] and rounds up', () => {
    expect(rampIndex(0, 9)).toBe(1);
    expect(rampIndex(0.01, 9)).toBe(1);
    expect(rampIndex(1, 9)).toBe(9);
    expect(rampIndex(0.5, 9)).toBe(5);
  });
});

describe('convertToAsciiFrame — §5.10 acceptance targets', () => {
  const conversion = defaultConversionSettings();

  it('a grid cell with zero coverage is empty at threshold 0', () => {
    const frame = convertToAsciiFrame(statsWithCoverage(0), conversion);
    expect(frame.chars[0]).toBe(0);
    expect(frame.owner[0]).toBe(0);
  });

  it('a fully-filled grid cell produces the densest ramp character', () => {
    const frame = convertToAsciiFrame(statsWithCoverage(1), conversion);
    const rampChars = Array.from(conversion.ramp);
    const densest = rampChars[rampChars.length - 1];
    expect(String.fromCodePoint(frame.chars[0])).toBe(densest);
  });

  it('a tiny accidental dot produces the lightest character at threshold 0', () => {
    // Coverage far below anything a real (no-pressure) brush stamp produces — this is
    // testing the near-zero end of the curve, not a literal single click (see the
    // "default-size pen stroke" test below for that, which targets the opposite end).
    const frame = convertToAsciiFrame(statsWithCoverage(0.0001), conversion);
    const lightest = Array.from(conversion.ramp)[0];
    expect(String.fromCodePoint(frame.chars[0])).toBe(lightest);
    expect(frame.owner[0]).toBe(1); // any ink counts at threshold 0
  });

  it('that same tiny dot disappears once the threshold is raised past it', () => {
    const raised = { ...conversion, threshold: 0.001 };
    const frame = convertToAsciiFrame(statsWithCoverage(0.0001), raised);
    expect(frame.chars[0]).toBe(0);
    expect(frame.owner[0]).toBe(0);
  });

  it('carries the dominant color into claimed grid cells, and leaves empty ones at 0', () => {
    const frame = convertToAsciiFrame(statsWithCoverage(0.5, 42), conversion);
    expect(frame.colors[0]).toBe(42);
    const empty = convertToAsciiFrame(statsWithCoverage(0), conversion);
    expect(empty.colors[0]).toBe(0);
  });

  it('is deterministic: identical stats + settings always produce an identical frame', () => {
    const stats = statsWithCoverage(0.37, 12);
    const a = convertToAsciiFrame(stats, conversion);
    const b = convertToAsciiFrame(stats, conversion);
    expect(Array.from(a.chars)).toEqual(Array.from(b.chars));
    expect(Array.from(a.colors)).toEqual(Array.from(b.colors));
    expect(Array.from(a.owner)).toEqual(Array.from(b.owner));
  });

  it('respects a custom ramp string', () => {
    const custom = { ...conversion, ramp: 'ab' };
    const light = convertToAsciiFrame(statsWithCoverage(0.001), custom);
    const dense = convertToAsciiFrame(statsWithCoverage(1), custom);
    expect(String.fromCodePoint(light.chars[0])).toBe('a');
    expect(String.fromCodePoint(dense.chars[0])).toBe('b');
  });

  // §5.10: "at 0°, 45°, 90°... straight lines... consistently produce..." is Shape style —
  // out of scope here (Phase 6). The Ramp-specific target below is the one this phase owns.
  it('a default-size pen stroke at default columns reads as at least mid-ramp, not just a faint mark', () => {
    // Real default project canvas (4:3, 2048×1536) at the real default column count.
    const width = 2048;
    const height = 1536;
    const columns = DEFAULT_COLUMNS;
    const rows = rowsFor(columns, width, height);
    const buf = createCelBuffer(width, height);

    // A normal-length stroke with the default pen size (4px), straight down through
    // several grid cells — representative of "a normal stroke" per §5.10.
    const dirty = emptyBBox();
    strokeSegment(buf, width, height, 400, 200, 400, 260, 4, 'round', 1, dirty);

    const stats = computeFullGridStats(buf, width, height, columns, rows);
    const frame = convertToAsciiFrame(stats, conversion);

    const rampLen = Array.from(conversion.ramp).length;
    const claimedIndices: number[] = [];
    for (let i = 0; i < frame.owner.length; i++) {
      if (frame.owner[i]) claimedIndices.push(Array.from(conversion.ramp).indexOf(String.fromCodePoint(frame.chars[i])) + 1);
    }
    expect(claimedIndices.length).toBeGreaterThan(0);
    const maxIndex = Math.max(...claimedIndices);
    expect(maxIndex).toBeGreaterThanOrEqual(Math.ceil(rampLen / 2));
  });
});
