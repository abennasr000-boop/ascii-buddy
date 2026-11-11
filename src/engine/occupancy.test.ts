import { describe, expect, it } from 'vitest';
import { resolveOccupancy } from './occupancy';
import type { GridStats } from './gridStats';
import { defaultConversionSettings } from '../model/defaults';

function stats(coverage: number[], dominant: number): GridStats {
  return {
    columns: coverage.length,
    rows: 1,
    coverage: new Float32Array(coverage),
    dominantColor: new Uint8Array(coverage.map(() => dominant)),
  };
}

describe('resolveOccupancy — §4.4 example', () => {
  it('reproduces the spec example exactly: top track claims 3–4, bottom track claims the rest', () => {
    // Top track "A":    ·  ·  @  @  ·  ·
    // Lower track "B":  x  x  x  x  x  x
    // ASCII result:     x  x  @  @  x  x
    const trackA = { trackId: 'A', position: 1, visible: true, conversion: { ramp: '@', threshold: 0, density: 1 } };
    const trackB = { trackId: 'B', position: 2, visible: true, conversion: { ramp: 'x', threshold: 0, density: 1 } };
    const statsByTrack = new Map([
      ['A', stats([0, 0, 1, 1, 0, 0], 5)],
      ['B', stats([1, 1, 1, 1, 1, 1], 7)],
    ]);

    const frame = resolveOccupancy(6, 1, [trackA, trackB], statsByTrack, defaultConversionSettings());
    const result = Array.from(frame.chars).map((c) => (c === 0 ? '.' : String.fromCodePoint(c)));

    expect(result).toEqual(['x', 'x', '@', '@', 'x', 'x']);
    // grid cells 3-4 (1-indexed) → indices 2-3 (0-indexed) belong to A (position 1); the rest to B (position 2)
    expect(Array.from(frame.owner)).toEqual([2, 2, 1, 1, 2, 2]);
    expect(Array.from(frame.colors)).toEqual([7, 7, 5, 5, 7, 7]);
  });

  it('skips hidden tracks completely, even if they would otherwise claim a cell', () => {
    const trackA = { trackId: 'A', position: 1, visible: false, conversion: { ramp: '@', threshold: 0, density: 1 } };
    const trackB = { trackId: 'B', position: 2, visible: true, conversion: { ramp: 'x', threshold: 0, density: 1 } };
    const statsByTrack = new Map([
      ['A', stats([1], 1)],
      ['B', stats([1], 2)],
    ]);
    const frame = resolveOccupancy(1, 1, [trackA, trackB], statsByTrack, defaultConversionSettings());
    expect(String.fromCodePoint(frame.chars[0])).toBe('x');
    expect(frame.owner[0]).toBe(2);
  });

  it('leaves a cell unclaimed (empty) when no visible track covers it', () => {
    const trackA = { trackId: 'A', position: 1, visible: true, conversion: { ramp: '@', threshold: 0, density: 1 } };
    const statsByTrack = new Map([['A', stats([0], 1)]]);
    const frame = resolveOccupancy(1, 1, [trackA], statsByTrack, defaultConversionSettings());
    expect(frame.chars[0]).toBe(0);
    expect(frame.owner[0]).toBe(0);
  });

  it('a track with no stats entry (never drawn on) is treated as empty, not claiming anything', () => {
    const trackA = { trackId: 'A', position: 1, visible: true, conversion: { ramp: '@', threshold: 0, density: 1 } };
    const trackB = { trackId: 'B', position: 2, visible: true, conversion: { ramp: 'x', threshold: 0, density: 1 } };
    const statsByTrack = new Map([['B', stats([1], 9)]]); // A has no entry at all
    const frame = resolveOccupancy(1, 1, [trackA, trackB], statsByTrack, defaultConversionSettings());
    expect(String.fromCodePoint(frame.chars[0])).toBe('x');
    expect(frame.owner[0]).toBe(2);
  });

  it('is deterministic', () => {
    const trackA = { trackId: 'A', position: 1, visible: true, conversion: { ramp: '@', threshold: 0, density: 1 } };
    const statsByTrack = new Map([['A', stats([1, 0.5, 0], 3)]]);
    const a = resolveOccupancy(3, 1, [trackA], statsByTrack, defaultConversionSettings());
    const b = resolveOccupancy(3, 1, [trackA], statsByTrack, defaultConversionSettings());
    expect(Array.from(a.chars)).toEqual(Array.from(b.chars));
    expect(Array.from(a.owner)).toEqual(Array.from(b.owner));
  });
});
