import { describe, expect, it } from 'vitest';
import { ICON_BITMAPS, ICON_SIZE } from './iconBitmaps';

describe('icon bitmaps', () => {
  for (const [name, rows] of Object.entries(ICON_BITMAPS)) {
    it(`${name} is a clean 16 × 16 grid of # and .`, () => {
      expect(rows).toHaveLength(ICON_SIZE);
      for (const row of rows) expect(row).toMatch(/^[.#]{16}$/);
    });
    it(`${name} has ink and keeps a margin so it never touches the tile edge unevenly`, () => {
      const cells = rows.flatMap((row, y) => [...row].map((c, x) => (c === '#' ? [x, y] : null)).filter(Boolean) as number[][]);
      expect(cells.length).toBeGreaterThan(8);
      const xs = cells.map((c) => c[0]);
      const ys = cells.map((c) => c[1]);
      // The icon's bounding box is centred on the 16 × 16 tile to within one pixel.
      expect(Math.abs(Math.min(...xs) - (ICON_SIZE - 1 - Math.max(...xs)))).toBeLessThanOrEqual(1);
      expect(Math.abs(Math.min(...ys) - (ICON_SIZE - 1 - Math.max(...ys)))).toBeLessThanOrEqual(1);
    });
  }

  it('the settings icon is the supplied hammer and sickle, pixel for pixel (14 × 14, centred)', () => {
    const supplied = [
      '.......#......',
      '........##....',
      '....####.##...',
      '...#####..##..',
      '..#####....##.',
      '.######....##.',
      '..######...##.',
      '...#..###..##.',
      '.......###.##.',
      '..##....#####.',
      '.####....###..',
      '.############.',
      '##...#####.###',
      '##..........##',
    ];
    const drawn = ICON_BITMAPS.hammerAndSickle.slice(1, 15).map((row) => row.slice(1, 15));
    expect(drawn).toEqual(supplied);
  });
});
