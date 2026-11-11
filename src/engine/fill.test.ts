import { describe, expect, it } from 'vitest';
import { compositeIndexed, floodFill } from './fill';

function grid(rows: string[]): Uint8Array {
  const w = rows[0].length;
  const buf = new Uint8Array(w * rows.length);
  rows.forEach((r, y) => [...r].forEach((c, x) => (buf[y * w + x] = c === '.' ? 0 : Number(c))));
  return buf;
}

describe('floodFill', () => {
  it('fills an enclosed region and stops at the boundary', () => {
    const buf = grid(['11111', '1...1', '1...1', '11111']);
    const res = floodFill(buf, buf, 5, 4, 2, 1, 2);
    expect(res.count).toBe(6);
    expect(res.bbox).toEqual({ x0: 1, y0: 1, x1: 3, y1: 2 });
    expect(buf[0]).toBe(1); // outline untouched
    expect(buf[6]).toBe(2);
  });

  it('is 4-connected: a diagonal line is a solid boundary', () => {
    const buf = grid(['1....', '.1...', '..1..', '...1.', '....1']);
    const res = floodFill(buf, buf, 5, 5, 0, 4, 3); // bottom-left triangle
    expect(res.count).toBe(10);
    expect(buf[4]).toBe(0); // top-right triangle untouched
  });

  it('matches the seed index exactly, so it recolours only that color', () => {
    const buf = grid(['1122', '1122']);
    const res = floodFill(buf, buf, 4, 2, 0, 0, 3);
    expect(res.count).toBe(4);
    expect([...buf]).toEqual([3, 3, 2, 2, 3, 3, 2, 2]);
  });

  it('does nothing when the region already has the fill color', () => {
    const buf = grid(['22', '22']);
    expect(floodFill(buf, buf, 2, 2, 0, 0, 2).count).toBe(0);
  });

  it('ignores seeds outside the buffer', () => {
    const buf = grid(['..']);
    expect(floodFill(buf, buf, 2, 1, 5, 5, 1).bbox).toBeNull();
  });

  it('computes the region from a separate boundary buffer but writes only the target (§6.3 all-tracks default)', () => {
    const lines = grid(['11111', '1...1', '11111']); // ink on an upper track
    const current = new Uint8Array(15); // empty current cel, e.g. a fill track below
    const res = floodFill(lines, current, 5, 3, 2, 1, 4);
    expect(res.count).toBe(3);
    expect([...current.slice(5, 10)]).toEqual([0, 4, 4, 4, 0]);
    expect(lines[6]).toBe(0); // boundary buffer untouched
  });

  it('fills a large open area without overflowing the stack', () => {
    const buf = new Uint8Array(1000 * 1000);
    expect(floodFill(buf, buf, 1000, 1000, 0, 0, 1).count).toBe(1_000_000);
  });
});

describe('compositeIndexed', () => {
  it('takes the top-most non-zero index per pixel', () => {
    const top = grid(['1.', '..']);
    const bottom = grid(['22', '2.']);
    expect([...compositeIndexed([top, bottom], 2, 2)]).toEqual([1, 2, 2, 0]);
  });
});
