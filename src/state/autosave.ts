// Debounced project + cel persistence. See ASCII_BUDDY_SPEC.md §14.1: save
// only what changed, debounced by the app's autosave delay, and flush
// immediately on visibilitychange→hidden / pagehide since iPadOS can close
// background tabs without warning. Cels are written before the project JSON
// that references them, so an interrupted save can't leave a dangling ref.
import { signal } from '@preact/signals';
import type { ID } from '../types/model';
import { appSettings } from './appSettings';
import { projects } from './projects';
import { putProject } from '../db/db';
import { saveCel } from './celStore';
import { storageError } from './storage';
import { refreshFrameContent } from './frameContent';

export type SaveStatus = 'idle' | 'saving' | 'saved';
export const saveStatus = signal<SaveStatus>('idle');

/** Hooks run at the start of every flush — e.g. the selection commits a floating selection so it is
 * part of what gets saved. Must not start async work. */
const beforeFlushHooks: Array<() => void> = [];
export function registerBeforeFlush(fn: () => void) {
  beforeFlushHooks.push(fn);
}

let timer: ReturnType<typeof setTimeout> | null = null;
let dirtyProjectId: string | null = null;
let dirtyTrackIds = new Set<ID>();

/** `trackId` is only needed when a track's cel actually changed — project-only
 * edits (background, color table, track visibility, ...) can omit it. */
export function scheduleAutosave(projectId: string, trackId?: ID) {
  dirtyProjectId = projectId;
  if (trackId) dirtyTrackIds.add(trackId);
  saveStatus.value = 'saving';
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void flush(), appSettings.value.autosaveDelayMs);
}

/** Everything saved so far (or being saved right now). `flush()` returns this so callers that
 * `await flush()` — leaving the editor, switching frame, starting playback — really do wait for
 * saves that an earlier flush started, instead of returning early because nothing new was dirty. */
let inFlight: Promise<void> = Promise.resolve();

export function flush(): Promise<void> {
  for (const hook of beforeFlushHooks) hook();
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const id = dirtyProjectId;
  if (!id) return inFlight;
  dirtyProjectId = null;
  const trackIds = [...dirtyTrackIds];
  dirtyTrackIds = new Set();
  if (!projects.value.some((p) => p.id === id)) return inFlight;

  // The cels are snapshotted synchronously (saveCel captures the live buffer before its first await),
  // so the order of writes to storage always follows the order of flush() calls.
  const cels = Promise.all(trackIds.map(saveCel));
  const run = (async () => {
    try {
      await cels;
      // Read the project *now*, not before the awaits: overlapping flushes must never let an older
      // snapshot land after a newer one and overwrite it in storage.
      const project = projects.value.find((p) => p.id === id);
      if (!project) return;
      await putProject(project);
      storageError.value = null;
      saveStatus.value = 'saved';
      if (trackIds.length > 0) void refreshFrameContent(project);
    } catch (err) {
      storageError.value = err instanceof Error ? err.message : String(err);
      saveStatus.value = 'idle';
    }
  })();
  inFlight = Promise.all([inFlight, run]).then(() => undefined);
  return inFlight;
}

let flushersInstalled = false;

export function installAutosaveFlushers() {
  if (flushersInstalled) return;
  flushersInstalled = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flush();
  });
  window.addEventListener('pagehide', () => void flush());
}
