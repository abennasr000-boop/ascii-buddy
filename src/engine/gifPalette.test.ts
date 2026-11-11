import { describe, expect, it } from 'vitest';
import { indexFrame } from './gifPalette';

function rgba(pixels: Array<[number, number, number, number]>): Uint8ClampedArray {
  return new Uint8ClampedArray(pixels.flat());
}

describe('indexFrame', () => {
  it('uses the exact colours when there are few', () => {
    const f = indexFrame(rgba([[255, 0, 0, 255], [0, 0, 255, 255], [255, 0, 0, 255]]), 3, 1, false);
    expect(f.palette).toEqual([[255, 0, 0], [0, 0, 255]]);
    expect(Array.from(f.index)).toEqual([0, 1, 0]);
    expect(f.transparentIndex).toBeUndefined();
  });
  it('marks transparent pixels with their own palette entry', () => {
    const f = indexFrame(rgba([[0, 0, 0, 0], [10, 20, 30, 255]]), 2, 1, true);
    expect(f.transparentIndex).toBe(0);
    expect(f.palette[1]).toEqual([10, 20, 30]);
    expect(Array.from(f.index)).toEqual([0, 1]);
  });
  it('falls back to a 256-colour quantisation when there are more colours', () => {
    const data = new Uint8ClampedArray(400 * 4);
    for (let i = 0; i < 400; i++) data.set([i % 256, (i * 7) % 256, (i * 13) % 256, 255], i * 4);
    const f = indexFrame(data, 400, 1, false);
    expect(f.palette.length).toBeLessThanOrEqual(256);
    expect(f.index.length).toBe(400);
  });
});
