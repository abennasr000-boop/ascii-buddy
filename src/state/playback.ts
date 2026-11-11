// Playback state machine: play/stop, FPS + hold-aware frame advance, Loop /
// Ping-pong / Once modes. See ASCII_BUDDY_SPEC.md §9.2. Uses
// requestAnimationFrame with accumulated real time (accurate across refresh
// rates) and skips ahead rather than slowing down if rendering falls behind.
//
// Deliberately does NOT drive playback by repeatedly writing
// `project.ui.currentFrameId` — that would re-run the full per-frame reload
// (IndexedDB reads + a full grid-stats recompute) on every tick, which is
// exactly the stutter §9.2's caching requirement exists to avoid. Instead
// `playbackFrameIndex` is a separate, ephemeral signal that DrawingCanvas and
// AsciiCanvas read (via effectiveCurrentFrameId/effectiveCurrentFrameIndex)
// only while playing; the real `currentFrameId` is written once, when
// playback stops, so everything else (undo, autosave, the timeline outside
// of playback) keeps working against a single settled frame as usual.
import { signal } from '@preact/signals';
import type { Project } from '../types/model';
import { projects, updateProjectData } from './projects';
import { buildPlaybackCache, clearPlaybackCache } from './playbackCache';
import { appSettings } from './appSettings';
import { hideAllReferences } from './viewSettings';
import { advanceForElapsed } from '../engine/playbackMath';
import { flush } from './autosave';

export const isPlaying = signal(false);
export const playbackFrameIndex = signal(0);

let rafId: number | null = null;
let lastTickTime = 0;
let accumulatedMs = 0;
let pingPongForward = true;
let hideReferencesRestoreValue: boolean | null = null;

function tick(projectId: string, now: number) {
  if (!isPlaying.value) return;
  const project = projects.value.find((p) => p.id === projectId);
  if (!project) {
    stopPlayback(projectId);
    return;
  }

  const dt = now - lastTickTime;
  lastTickTime = now;
  accumulatedMs += dt;

  const result = advanceForElapsed(
    project.playbackMode,
    project.frames.length,
    playbackFrameIndex.value,
    pingPongForward,
    project.fps,
    (i) => project.frames[i]?.duration ?? 1,
    accumulatedMs,
  );
  playbackFrameIndex.value = result.index;
  pingPongForward = result.forward;
  accumulatedMs = result.remainderMs;

  if (result.finished) {
    stopPlayback(projectId);
    return;
  }
  rafId = requestAnimationFrame((t) => tick(projectId, t));
}

function freshProjectFor(project: Project): Project {
  return projects.value.find((p) => p.id === project.id) ?? project;
}

export async function startPlayback(project: Project): Promise<void> {
  if (isPlaying.value) return;
  const startIndex = project.frames.findIndex((f) => f.id === project.ui.currentFrameId);
  playbackFrameIndex.value = startIndex === -1 ? 0 : startIndex;
  pingPongForward = true;
  accumulatedMs = 0;

  if (appSettings.value.hideReferencesDuringPlayback) {
    hideReferencesRestoreValue = hideAllReferences.value;
    hideAllReferences.value = true;
  }

  await flush(); // the cache is built from stored cels, so commit any pending edits first
  await buildPlaybackCache(freshProjectFor(project));
  // The project may have changed (or playback may have been stopped again) while the cache built.
  const fresh = projects.value.find((p) => p.id === project.id);
  if (!fresh || isPlaying.value) return;

  isPlaying.value = true;
  lastTickTime = performance.now();
  rafId = requestAnimationFrame((t) => tick(project.id, t));
}

export function stopPlayback(projectId: string): void {
  if (!isPlaying.value) return;
  isPlaying.value = false;
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  if (hideReferencesRestoreValue !== null) {
    hideAllReferences.value = hideReferencesRestoreValue;
    hideReferencesRestoreValue = null;
  }
  const project = projects.value.find((p) => p.id === projectId);
  const frame = project?.frames[playbackFrameIndex.value];
  if (project && frame && frame.id !== project.ui.currentFrameId) {
    updateProjectData(projectId, { ui: { ...project.ui, currentFrameId: frame.id } });
  }
  clearPlaybackCache();
}

export function togglePlayback(project: Project): void {
  if (isPlaying.value) stopPlayback(project.id);
  else void startPlayback(project);
}

/** The frame id the UI should treat as "current" for display purposes — the
 * real project frame normally, or whichever frame is playing right now. */
export function effectiveCurrentFrameId(project: Project): string {
  if (isPlaying.value) {
    const frame = project.frames[playbackFrameIndex.value];
    if (frame) return frame.id;
  }
  return project.ui.currentFrameId;
}
