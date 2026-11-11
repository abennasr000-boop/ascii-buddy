import { describe, expect, it } from 'vitest';
import {
  clearBlockArea,
  extractBlock,
  flipBlockH,
  flipBlockV,
  maskOutline,
  polygonMask,
  rectFromCorners,
  rectMask,
  rotateBlock90,
  scaleBlock,
  stampBlock,
  type PixelBlock,
} from './selection';

function block(rows: string[]): PixelBlock {
  const w = rows[0].length;
  const pixels = new Uint8Array(w * rows.length);
  rows.forEach((r, y) => [...r].forEach((c, x) => (pixels[y * w + x] = c === '.' ? 0 : Number(c))));
  return { width: w, height: rows.length, pixels, mask: rectMask(w, rows.length) };
}

describe('rectFromCorners', () => {
  it('normalises corner order and clamps to the canvas', () => {
    expect(rectFromCorners({ x: 10.2, y: 8 }, { x: 2.7, y: 3 }, 100, 100)).toEqual({ x: 2, y: 3, w: 9, h: 5 });
    expect(rectFromCorners({ x: -5, y: -5 }, { x: 3, y: 3 }, 100, 100)).toEqual({ x: 0, y: 0, w: 3, h: 3 });
  });
  it('returns null for an empty rect', () => {
    expect(rectFromCorners({ x: 4, y: 4 }, { x: 4, y: 4 }, 100, 100)).toBeNull();
  });
});

describe('polygonMask', () => {
  it('fills a square polygon exactly', () => {
    const res = polygonMask([{ x: 2, y: 2 }, { x: 6, y: 2 }, { x: 6, y: 5 }, { x: 2, y: 5 }], 20, 20)!;
    expect(res.rect).toEqual({ x: 2, y: 2, w: 4, h: 3 });
    expect(res.mask.every((v) => v === 1)).toBe(true);
  });
  it('fills a triangle by pixel-centre containment', () => {
    const res = polygonMask([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 4 }], 10, 10)!;
    const rows = [0, 1, 2, 3].map((y) => [...res.mask.slice(y * 4, y * 4 + 4)].join(''));
    expect(rows).toEqual(['1110', '1100', '1000', '0000']);
  });
  it('rejects degenerate input', () => {
    expect(polygonMask([{ x: 0, y: 0 }, { x: 5, y: 5 }], 10, 10)).toBeNull();
    expect(polygonMask([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }], 20, 20)).toBeNull();
  });
});

describe('extract / clear / stamp', () => {
  it('round-trips a region and honours the mask', () => {
    const buf = new Uint8Array(6 * 4);
    buf.fill(7);
    const mask = new Uint8Array([1, 0, 0, 1]); // 2x2 diagonal
    const b = extractBlock(buf, 6, { x: 1, y: 1, w: 2, h: 2 }, mask);
    expect([...b.pixels]).toEqual([7, 0, 0, 7]);
    clearBlockArea(buf, 6, { x: 1, y: 1, w: 2, h: 2 }, mask);
    expect(buf[1 * 6 + 1]).toBe(0);
    expect(buf[1 * 6 + 2]).toBe(7); // unselected pixel kept
  });
  it('stamps opaque pixels only and clips at the canvas edge', () => {
    const buf = new Uint8Array(4 * 4).fill(9);
    const b = block(['1.', '.1']);
    const dirty = stampBlock(buf, 4, 4, b, 3, 3); // only the top-left pixel lands on-canvas
    expect(buf[15]).toBe(1);
    expect(buf.filter((v) => v === 1).length).toBe(1);
    expect(dirty).toEqual({ x0: 3, y0: 3, x1: 3, y1: 3 });
    expect(stampBlock(buf, 4, 4, b, 50, 50)).toBeNull();
  });
});

describe('block transforms', () => {
  const b = block(['12.', '.34']);
  it('flips horizontally', () => expect([...flipBlockH(b).pixels]).toEqual([0, 2, 1, 4, 3, 0]));
  it('flips vertically', () => expect([...flipBlockV(b).pixels]).toEqual([0, 3, 4, 1, 2, 0]));
  it('rotates 90° clockwise', () => {
    const r = rotateBlock90(b);
    expect([r.width, r.height]).toEqual([2, 3]);
    expect([...r.pixels]).toEqual([0, 1, 3, 2, 4, 0]);
  });
  it('four rotations are the identity', () => {
    let r = b;
    for (let i = 0; i < 4; i++) r = rotateBlock90(r);
    expect([...r.pixels]).toEqual([...b.pixels]);
  });
  it('scales by nearest neighbour without inventing colors', () => {
    const up = scaleBlock(block(['12']), 4, 2);
    expect([...up.pixels]).toEqual([1, 1, 2, 2, 1, 1, 2, 2]);
    const down = scaleBlock(block(['1122']), 2, 1);
    expect([...down.pixels]).toEqual([1, 2]);
    expect(scaleBlock(b, 0.2, 0.2).width).toBe(1);
  });
});

describe('maskOutline', () => {
  it('traces a rectangle as four vertices', () => {
    const loops = maskOutline(rectMask(3, 2), 3, 2);
    expect(loops).toHaveLength(1);
    expect(loops[0]).toHaveLength(4);
  });
  it('traces an L shape as six vertices', () => {
    const loops = maskOutline(new Uint8Array([1, 0, 1, 1]), 2, 2);
    expect(loops).toHaveLength(1);
    expect(loops[0]).toHaveLength(6);
  });
  it('produces an outer and an inner loop for a ring', () => {
    const ring = new Uint8Array([1, 1, 1, 1, 0, 1, 1, 1, 1]);
    expect(maskOutline(ring, 3, 3)).toHaveLength(2);
  });
  it('produces one loop per separate island', () => {
    expect(maskOutline(new Uint8Array([1, 0, 1]), 3, 1)).toHaveLength(2);
  });
  it('returns nothing for an empty mask', () => {
    expect(maskOutline(new Uint8Array(4), 2, 2)).toEqual([]);
  });
});
