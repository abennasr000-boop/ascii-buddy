import { describe, expect, it } from 'vitest';
import { computeFullGridStats, recomputeGridStatsRegion } from './gridStats';

// A small 8×8 buffer sliced into a 4×4 grid, so each grid cell is exactly 2×2 = 4 pixels.
function makeBuffer(): Uint8Array {
  return new Uint8Array(8 * 8);
}

describe('computeFullGridStats', () => {
  it('gives every cell zero coverage on an empty buffer', () => {
    const stats = computeFullGridStats(makeBuffer(), 8, 8, 4, 4);
    expect(Array.from(stats.coverage)).toEqual(new Array(16).fill(0));
  });

  it('gives every cell full coverage on a fully-inked buffer', () => {
    const buf = makeBuffer().fill(1);
    const stats = computeFullGridStats(buf, 8, 8, 4, 4);
    for (const c of stats.coverage) expect(c).toBeCloseTo(1);
  });

  it('computes partial coverage for a partially-inked cell', () => {
    const buf = makeBuffer();
    // Cell (row0, col0) spans pixels x:0-1, y:0-1. Ink one of its 4 pixels.
    buf[0] = 5;
    const stats = computeFullGridStats(buf, 8, 8, 4, 4);
    expect(stats.coverage[0]).toBeCloseTo(0.25);
    expect(stats.dominantColor[0]).toBe(5);
    // every other cell stays empty
    for (let i = 1; i < 16; i++) expect(stats.coverage[i]).toBe(0);
  });

  it('picks the dominant color by count, ties going to the lower index', () => {
    const buf = makeBuffer();
    // Cell (0,0): pixels (0,0)&(1,0) = color 9; pixel (0,1) = color 3.
    buf[0] = 9;
    buf[1] = 9;
    buf[8] = 3;
    let stats = computeFullGridStats(buf, 8, 8, 4, 4);
    expect(stats.dominantColor[0]).toBe(9); // 9 has 2 pixels vs 3's 1

    // Now tie them at 2 pixels each — lower index (3) should win.
    buf[9] = 3;
    stats = computeFullGridStats(buf, 8, 8, 4, 4);
    expect(stats.dominantColor[0]).toBe(3);
  });

  it('is deterministic', () => {
    const buf = makeBuffer();
    buf[0] = 7;
    buf[20] = 2;
    const a = computeFullGridStats(buf, 8, 8, 4, 4);
    const b = computeFullGridStats(buf, 8, 8, 4, 4);
    expect(Array.from(a.coverage)).toEqual(Array.from(b.coverage));
    expect(Array.from(a.dominantColor)).toEqual(Array.from(b.dominantColor));
  });
});

describe('recomputeGridStatsRegion', () => {
  it('only touches grid cells overlapping the dirty pixel bbox', () => {
    const buf = makeBuffer();
    const stats = computeFullGridStats(buf, 8, 8, 4, 4);
    // Seed a sentinel value in a cell far from the edit, to prove it's untouched.
    stats.coverage[15] = 0.42;
    stats.dominantColor[15] = 99;

    // Ink cell (0,0) (pixels x:0-1,y:0-1) after the fact, then recompute just that region.
    buf[0] = 6;
    recomputeGridStatsRegion(stats, buf, 8, 8, { x: 0, y: 0, w: 1, h: 1 });

    expect(stats.coverage[0]).toBeCloseTo(0.25);
    expect(stats.dominantColor[0]).toBe(6);
    // untouched cell keeps its sentinel
    expect(stats.coverage[15]).toBeCloseTo(0.42);
    expect(stats.dominantColor[15]).toBe(99);
  });

  it('produces the same result as a full recompute for the affected cells', () => {
    const buf = makeBuffer();
    buf[0] = 4;
    buf[9] = 8;
    buf[63] = 2; // last pixel, cell (3,3)

    const stats = computeFullGridStats(new Uint8Array(64), 8, 8, 4, 4);
    recomputeGridStatsRegion(stats, buf, 8, 8, { x: 0, y: 0, w: 8, h: 8 });

    const full = computeFullGridStats(buf, 8, 8, 4, 4);
    expect(Array.from(stats.coverage)).toEqual(Array.from(full.coverage));
    expect(Array.from(stats.dominantColor)).toEqual(Array.from(full.dominantColor));
  });
});
