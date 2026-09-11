import { describe, expect, it } from 'vitest';
import { rowsFor } from './model';

describe('rowsFor', () => {
  it('matches the 4:3 canvas example from §4.2 (2048×1536 at 80 columns → 30 rows)', () => {
    expect(rowsFor(80, 2048, 1536)).toBe(30);
  });

  it('gives the Terminal 80×24 preset exactly 24 rows at 80 columns (2048×1228)', () => {
    expect(rowsFor(80, 2048, 1228)).toBe(24);
  });

  it('is never less than 1', () => {
    expect(rowsFor(10, 2048, 1)).toBeGreaterThanOrEqual(1);
  });

  it('halves the row count for a square canvas (grid cells are 1:2 width:height)', () => {
    expect(rowsFor(80, 2048, 2048)).toBe(40);
  });
});
