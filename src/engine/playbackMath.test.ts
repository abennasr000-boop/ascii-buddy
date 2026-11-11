import { describe, expect, it } from 'vitest';
import { advanceFrame, advanceForElapsed, frameDurationMs } from './playbackMath';

describe('frameDurationMs', () => {
  it('divides ticks by fps', () => {
    expect(frameDurationMs(12, 1)).toBeCloseTo((1 / 12) * 1000);
    expect(frameDurationMs(12, 3)).toBeCloseTo((3 / 12) * 1000);
  });

  it('never divides by zero fps', () => {
    expect(Number.isFinite(frameDurationMs(0, 1))).toBe(true);
  });
});

describe('advanceFrame — loop', () => {
  it('wraps around from the last frame to the first', () => {
    expect(advanceFrame('loop', 5, 4, true)).toEqual({ index: 0, forward: true, finished: false });
  });

  it('steps forward normally otherwise', () => {
    expect(advanceFrame('loop', 5, 2, true)).toEqual({ index: 3, forward: true, finished: false });
  });
});

describe('advanceFrame — once', () => {
  it('stops advancing at the last frame and reports finished', () => {
    expect(advanceFrame('once', 5, 4, true)).toEqual({ index: 4, forward: true, finished: true });
  });

  it('reports finished one step early, on the step that reaches the last frame', () => {
    expect(advanceFrame('once', 5, 3, true)).toEqual({ index: 4, forward: true, finished: true });
  });

  it('advances normally before the end', () => {
    expect(advanceFrame('once', 5, 1, true)).toEqual({ index: 2, forward: true, finished: false });
  });
});

describe('advanceFrame — pingpong', () => {
  it('bounces back from the last frame', () => {
    expect(advanceFrame('pingpong', 5, 4, true)).toEqual({ index: 3, forward: false, finished: false });
  });

  it('bounces forward from the first frame', () => {
    expect(advanceFrame('pingpong', 5, 0, false)).toEqual({ index: 1, forward: true, finished: false });
  });

  it('continues forward mid-sequence', () => {
    expect(advanceFrame('pingpong', 5, 2, true)).toEqual({ index: 3, forward: true, finished: false });
  });

  it('continues backward mid-sequence', () => {
    expect(advanceFrame('pingpong', 5, 2, false)).toEqual({ index: 1, forward: false, finished: false });
  });
});

describe('advanceFrame — single-frame project', () => {
  it('never advances past frame 0', () => {
    expect(advanceFrame('loop', 1, 0, true)).toEqual({ index: 0, forward: true, finished: false });
    expect(advanceFrame('once', 1, 0, true)).toEqual({ index: 0, forward: true, finished: true });
  });
});

describe('advanceForElapsed', () => {
  it('advances multiple frames when elapsed time covers several holds', () => {
    // 12fps, all frames hold 1 tick (~83.3ms each); 300ms should cover ~3.6 frames.
    const result = advanceForElapsed('loop', 10, 0, true, 12, () => 1, 300);
    expect(result.index).toBe(3);
    expect(result.remainderMs).toBeGreaterThanOrEqual(0);
    expect(result.remainderMs).toBeLessThan(frameDurationMs(12, 1));
  });

  it('respects a per-frame hold — a held frame is skipped less often', () => {
    // Frame 0 holds for 3 ticks (~250ms at 12fps); 200ms should not be enough to leave it.
    const result = advanceForElapsed('loop', 5, 0, true, 12, (i) => (i === 0 ? 3 : 1), 200);
    expect(result.index).toBe(0);
  });

  it('stops at the end of a "once" playthrough regardless of remaining elapsed time', () => {
    const result = advanceForElapsed('once', 3, 1, true, 12, () => 1, 10000);
    expect(result.finished).toBe(true);
    expect(result.index).toBe(2);
  });

  it('reproduces the §9.2 acceptance scenario: 48 frames at 12fps stay in sync over 3 seconds', () => {
    // 3000ms at 12fps is 36 frames of advance (a hair over, to absorb the
    // same floating-point rounding a real elapsed-time measurement would).
    const result = advanceForElapsed('loop', 48, 0, true, 12, () => 1, 3000.01);
    expect(result.index).toBe(36 % 48);
  });
});
