import { describe, expect, it } from 'vitest';
import {
  defaultStartAt,
  importRange,
  naturalCompare,
  orderFiles,
  planImage,
  startIndexFor,
  videoFrameCount,
  videoSampleTimes,
} from './importPlan';

describe('file ordering (§10.2)', () => {
  it('natural sort: img2 before img10, case-insensitive', () => {
    const names = ['img10.png', 'IMG2.png', 'img1.png', 'img20.png', 'img3.png'];
    expect(orderFiles(names.map((name) => ({ name })), 'name').map((f) => f.name)).toEqual(['img1.png', 'IMG2.png', 'img3.png', 'img10.png', 'img20.png']);
  });

  it('"as selected" keeps the picker order', () => {
    const files = [{ name: 'b' }, { name: 'a' }, { name: 'c' }];
    expect(orderFiles(files, 'selected').map((f) => f.name)).toEqual(['b', 'a', 'c']);
  });

  it('is stable for equal names and does not mutate its input', () => {
    const files = [{ name: 'x', id: 1 }, { name: 'x', id: 2 }];
    expect(orderFiles(files, 'name').map((f) => f.id)).toEqual([1, 2]);
    const input = [{ name: 'b' }, { name: 'a' }];
    orderFiles(input, 'name');
    expect(input.map((f) => f.name)).toEqual(['b', 'a']);
  });

  it('handles zero-padded and mixed names sensibly (30 photos come out 1..30)', () => {
    const shuffled = Array.from({ length: 30 }, (_, i) => `IMG_${i + 1}.jpg`).reverse();
    const sorted = orderFiles(shuffled.map((name) => ({ name })), 'name').map((f) => f.name);
    expect(sorted[0]).toBe('IMG_1.jpg');
    expect(sorted[9]).toBe('IMG_10.jpg');
    expect(sorted[29]).toBe('IMG_30.jpg');
  });

  it('naturalCompare orders digits numerically', () => {
    expect(naturalCompare('a9', 'a10')).toBeLessThan(0);
  });
});

describe('frame placement (§10.2)', () => {
  it('start index by option', () => {
    expect(startIndexFor('first', 3, 10)).toBe(0);
    expect(startIndexFor('current', 3, 10)).toBe(3);
    expect(startIndexFor('after', 3, 10)).toBe(10);
  });

  it('range and how many frames must be created', () => {
    expect(importRange(0, 24, 1)).toEqual({ start: 0, end: 24, newFrames: 23 });
    expect(importRange(5, 3, 10)).toEqual({ start: 5, end: 8, newFrames: 0 });
    expect(importRange(8, 5, 10)).toEqual({ start: 8, end: 13, newFrames: 3 });
    expect(importRange(10, 4, 10)).toEqual({ start: 10, end: 14, newFrames: 4 });
  });

  it('default: frame 1 for a single empty frame, otherwise after the last', () => {
    expect(defaultStartAt(1, false)).toBe('first');
    expect(defaultStartAt(1, true)).toBe('after');
    expect(defaultStartAt(6, false)).toBe('after');
  });
});

describe('sizing (§10.2 Size, §10.4 storage)', () => {
  const CW = 2048;
  const CH = 1536;

  it('fit: whole image visible; a wide image is letterboxed', () => {
    const p = planImage(1000, 500, CW, CH, 'fit');
    expect(p.scale * p.width).toBeCloseTo(CW); // touches the left/right edges
    expect(p.scale * p.height).toBeLessThanOrEqual(CH);
  });

  it('fill: covers the canvas and is cropped to it — the stored image is exactly canvas-sized, source centred and overflowing', () => {
    const p = planImage(1000, 500, CW, CH, 'fill');
    expect([p.width, p.height, p.scale]).toEqual([CW, CH, 1]);
    expect(p.draw.dh).toBeCloseTo(CH); // wide source: height fills exactly …
    expect(p.draw.dw).toBeGreaterThan(CW); // … width overflows and is cropped
    expect(p.draw.dx).toBeCloseTo((CW - p.draw.dw) / 2); // centred
    const tall = planImage(500, 1000, CW, CH, 'fill');
    expect(tall.draw.dw).toBeCloseTo(CW);
    expect(tall.draw.dh).toBeGreaterThan(CH);
  });

  it('original: native size at scale 1, but never larger than the canvas', () => {
    expect(planImage(800, 600, CW, CH, 'original')).toMatchObject({ width: 800, height: 600, scale: 1 });
    const big = planImage(4096, 3072, CW, CH, 'original');
    expect(big.width).toBe(2048);
    expect(big.height).toBe(1536);
    expect(big.scale).toBe(1);
  });

  it('stretch: exactly the canvas shape, distortion baked into the stored image', () => {
    expect(planImage(300, 900, CW, CH, 'stretch')).toEqual({ width: CW, height: CH, scale: 1, draw: { dx: 0, dy: 0, dw: CW, dh: CH } });
  });

  it('never stores an image larger than the canvas, and never upscales the stored copy (§10.4)', () => {
    const big = planImage(8000, 6000, CW, CH, 'fit');
    expect(big.width).toBeLessThanOrEqual(CW);
    expect(big.height).toBeLessThanOrEqual(CH);
    const small = planImage(100, 80, CW, CH, 'fit');
    expect(small.width).toBe(100);
    expect(small.height).toBe(80);
  });
});

describe('video sampling (§10.3)', () => {
  it('a 5 second video at 12 fps is 60 frames (the §19 acceptance example)', () => {
    expect(videoFrameCount(0, 5, 12)).toBe(60);
  });

  it('matches the dialog example: 4.2 s × 12 fps = 50 frames', () => {
    expect(videoFrameCount(0, 4.2, 12)).toBe(50);
  });

  it('trim narrows the range; always at least one frame', () => {
    expect(videoFrameCount(1, 3, 12)).toBe(24);
    expect(videoFrameCount(2, 2, 12)).toBe(1);
  });

  it('samples start + i / fps and stays inside the clip', () => {
    const times = videoSampleTimes(1, 2, 4, 10);
    expect(times).toEqual([1, 1.25, 1.5, 1.75]);
    const clamped = videoSampleTimes(0, 5, 12, 5);
    expect(clamped).toHaveLength(60);
    expect(Math.max(...clamped)).toBeLessThan(5);
    expect(Math.min(...clamped)).toBe(0);
  });
});
