// Pure playback timing/advance math, framework-free — see
// ASCII_BUDDY_SPEC.md §9.2. Kept separate from state/playback.ts (which owns
// the actual requestAnimationFrame loop and signals) so the tick-advance
// logic for all three playback modes can be unit tested directly.

export type PlaybackMode = 'loop' | 'pingpong' | 'once';

export function frameDurationMs(fps: number, ticks: number): number {
  return (ticks / Math.max(1, fps)) * 1000;
}

export interface AdvanceResult {
  index: number;
  forward: boolean;
  /** True the instant a 'once' playthrough reaches its last frame — the caller should stop. */
  finished: boolean;
}

/** Given the current frame index and ping-pong direction, returns the next
 * index for one step of playback under `mode`. `frameCount` is assumed >= 1. */
export function advanceFrame(mode: PlaybackMode, frameCount: number, index: number, forward: boolean): AdvanceResult {
  if (frameCount <= 1) return { index: 0, forward, finished: mode === 'once' };

  if (mode === 'once') {
    if (index >= frameCount - 1) return { index, forward, finished: true };
    return { index: index + 1, forward, finished: index + 1 >= frameCount - 1 };
  }

  if (mode === 'pingpong') {
    if (forward) {
      if (index >= frameCount - 1) return { index: frameCount - 2, forward: false, finished: false };
      return { index: index + 1, forward: true, finished: false };
    }
    if (index <= 0) return { index: Math.min(frameCount - 1, 1), forward: true, finished: false };
    return { index: index - 1, forward: false, finished: false };
  }

  // loop
  return { index: (index + 1) % frameCount, forward, finished: false };
}

/** Advances repeatedly while `accumulatedMs` covers each visited frame's hold
 * duration, mirroring a real rAF loop's catch-up behavior when a tick is
 * late. `getTicks(index)` returns that frame's hold length in ticks.
 * `guard` caps iterations so a pathological input (e.g. fps 0) can't hang. */
export function advanceForElapsed(
  mode: PlaybackMode,
  frameCount: number,
  startIndex: number,
  startForward: boolean,
  fps: number,
  getTicks: (index: number) => number,
  accumulatedMs: number,
  guard = 1000,
): { index: number; forward: boolean; remainderMs: number; finished: boolean } {
  let index = startIndex;
  let forward = startForward;
  let remaining = accumulatedMs;
  let steps = 0;
  while (remaining >= frameDurationMs(fps, getTicks(index)) && steps < guard) {
    remaining -= frameDurationMs(fps, getTicks(index));
    steps++;
    const result = advanceFrame(mode, frameCount, index, forward);
    index = result.index;
    forward = result.forward;
    if (result.finished) return { index, forward, remainderMs: remaining, finished: true };
  }
  return { index, forward, remainderMs: remaining, finished: false };
}
