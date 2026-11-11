import { describe, expect, it } from 'vitest';
import {
  exportFileName,
  expandHolds,
  gifDelaysCs,
  outputSize,
  safeFileBase,
  selectFrameIndices,
  sizeProblem,
  spriteSheetLayout,
  videoTimeline,
} from './exportPlan';

describe('outputSize', () => {
  it('scales the canvas by 1×, 2× and 4×', () => {
    expect(outputSize(1024, 768, { kind: 'scale', scale: 1 })).toEqual({ width: 1024, height: 768 });
    expect(outputSize(1024, 768, { kind: 'scale', scale: 2 })).toEqual({ width: 2048, height: 1536 });
    expect(outputSize(1024, 768, { kind: 'scale', scale: 4 })).toEqual({ width: 4096, height: 3072 });
  });
  it('a custom width keeps the aspect ratio', () => {
    expect(outputSize(2048, 1536, { kind: 'width', width: 800 })).toEqual({ width: 800, height: 600 });
  });
  it('rounds up to even sizes for video', () => {
    expect(outputSize(1001, 751, { kind: 'scale', scale: 1 }, true)).toEqual({ width: 1002, height: 752 });
  });
  it('flags sizes a device cannot render', () => {
    expect(sizeProblem({ width: 4096, height: 4096 })).toBeNull();
    expect(sizeProblem({ width: 4097, height: 4097 })).not.toBeNull();
    expect(sizeProblem({ width: 20000, height: 10 })).not.toBeNull();
  });
});

describe('selectFrameIndices', () => {
  it('current frame', () => expect(selectFrameIndices(10, 'current', 4, 1, 10)).toEqual([4]));
  it('all frames', () => expect(selectFrameIndices(3, 'all', 0, 1, 3)).toEqual([0, 1, 2]));
  it('a 1-based inclusive range, in either order, clamped', () => {
    expect(selectFrameIndices(10, 'range', 0, 3, 5)).toEqual([2, 3, 4]);
    expect(selectFrameIndices(10, 'range', 0, 5, 3)).toEqual([2, 3, 4]);
    expect(selectFrameIndices(10, 'range', 0, 8, 99)).toEqual([7, 8, 9]);
  });
});

describe('gifDelaysCs', () => {
  it('12 fps: one tick is 8 or 9 cs and the total is exact', () => {
    const delays = gifDelaysCs(Array(12).fill(1), 12);
    expect(delays.reduce((a, b) => a + b, 0)).toBe(100);
    expect(Math.min(...delays)).toBeGreaterThanOrEqual(8);
    expect(Math.max(...delays)).toBeLessThanOrEqual(9);
  });
  it('a hold lengthens that frame', () => {
    expect(gifDelaysCs([1, 3], 10)).toEqual([10, 30]);
  });
  it('never goes below 2 cs (browsers would turn it into 10 cs)', () => {
    expect(gifDelaysCs([1, 1, 1], 100).every((d) => d >= 2)).toBe(true);
  });
});

describe('videoTimeline', () => {
  it('lays frames end to end and respects holds', () => {
    const t = videoTimeline([1, 2], 10, 1);
    expect(t).toEqual([
      { index: 0, start: 0, duration: 0.1 },
      { index: 1, start: 0.1, duration: 0.2 },
    ]);
  });
  it('repeats the whole animation N times', () => {
    const t = videoTimeline([1, 1], 10, 3);
    expect(t).toHaveLength(6);
    expect(t[4].index).toBe(0);
    expect(t[5].start).toBeCloseTo(0.5);
  });
});

describe('expandHolds', () => {
  it('repeats each item by its duration', () => expect(expandHolds(['a', 'b'], [1, 3])).toEqual(['a', 'b', 'b', 'b']));
});

describe('file names', () => {
  it('follows <name>_<ascii|raster>[_f0004].<ext>', () => {
    expect(exportFileName('Walk cycle', 'ascii', 'gif')).toBe('Walk cycle_ascii.gif');
    expect(exportFileName('Walk cycle', 'raster', 'png', 4)).toBe('Walk cycle_raster_f0004.png');
  });
  it('removes characters that are not allowed in file names', () => {
    expect(safeFileBase('a/b:c*?')).toBe('a-b-c-');
    expect(safeFileBase('  ')).toBe('untitled');
  });
});

describe('spriteSheetLayout', () => {
  it('automatic columns are roughly square', () => {
    const l = spriteSheetLayout(9, 0, 10, 10);
    expect(l.columns).toBe(3);
    expect(l.rows).toBe(3);
    expect(l.width).toBe(30);
  });
  it('honours a set column count and places rects row by row', () => {
    const l = spriteSheetLayout(5, 2, 8, 4);
    expect(l.columns).toBe(2);
    expect(l.rows).toBe(3);
    expect(l.rects[3]).toEqual({ x: 8, y: 4, w: 8, h: 4 });
    expect(l.height).toBe(12);
  });
  it('never uses more columns than frames', () => expect(spriteSheetLayout(2, 10, 5, 5).columns).toBe(2));
});
