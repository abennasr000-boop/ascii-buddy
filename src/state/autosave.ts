// Debounced project + cel persistence. See ASCII_BUDDY_SPEC.md §14.1: save
// only what changed, debounced by the app's autosave delay, and flush
// immediately on visibilitychange→hidden / pagehide since iPadOS can close
// background tabs without warning. Cels are written before the project JSON
// that references them, so an interrupted save can't leave a dangling ref.
import { signal } from '@preact/signals';
import { appSettings } from './appSettings';
import { projects } from './projects';
import { putProject } from '../db/db';
import { saveCel } from './celStore';
import { storageError } from './storage';

export type SaveStatus = 'idle' | 'saving' | 'saved';
export const saveStatus = signal<SaveStatus>('idle');

let timer: ReturnType<typeof setTimeout> | null = null;
let dirtyProjectId: string | null = null;

export function scheduleAutosave(projectId: string) {
  dirtyProjectId = projectId;
  saveStatus.value = 'saving';
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void flush(), appSettings.value.autosaveDelayMs);
}

export async function flush(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const id = dirtyProjectId;
  if (!id) return;
  dirtyProjectId = null;
  const project = projects.value.find((p) => p.id === id);
  if (!project) return;
  try {
    await saveCel(id);
    await putProject(project);
    storageError.value = null;
    saveStatus.value = 'saved';
  } catch (err) {
    storageError.value = err instanceof Error ? err.message : String(err);
    saveStatus.value = 'idle';
  }
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
