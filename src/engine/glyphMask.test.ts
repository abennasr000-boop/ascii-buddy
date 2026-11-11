import { describe, expect, it } from 'vitest';
import { crispenAlpha } from './glyphMask';

describe('crispenAlpha (§5.11 crisp glyphs)', () => {
  it('thresholds ordinary glyphs at 50% alpha, producing a strictly binary mask', () => {
    const out = crispenAlpha([0, 60, 127, 128, 200, 255]);
    expect([...out]).toEqual([0, 0, 0, 255, 255, 255]);
  });

  it('never erases a glyph that has ink: a peak just under 50% (a thin stem at a tiny size) survives', () => {
    // e.g. Departure Mono `|` at a 4 × 8 px cell: strongest pixels are 127 — a fixed 128 threshold drops all of them.
    const out = crispenAlpha([0, 127, 127, 0, 20, 0]);
    expect([...out]).toEqual([0, 255, 255, 0, 0, 0]);
  });

  it('even a very faint glyph keeps its strongest pixels', () => {
    const out = crispenAlpha([0, 10, 4, 0]);
    expect([...out]).toEqual([0, 255, 0, 0]);
  });

  it('an empty glyph (space) stays empty', () => {
    expect([...crispenAlpha([0, 0, 0])]).toEqual([0, 0, 0]);
  });
});
