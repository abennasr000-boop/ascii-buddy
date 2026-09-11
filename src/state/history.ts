// Global undo/redo history. See ASCII_BUDDY_SPEC.md §6.4.
//
// Phase 1 only produces stroke commands (drawing). The command shape is
// generic on purpose — later phases (frames, tracks, settings, imports,
// color table edits) add more command kinds without changing this stack.
import { signal } from '@preact/signals';
import type { ID } from '../types/model';
import type { CelBBox } from '../engine/celCodec';
import { liveCel, bumpCelVersion } from './celStore';
import { scheduleAutosave } from './autosave';
import { recomputeStatsRegion } from './asciiState';

export interface StrokeCommand {
  kind: 'stroke';
  trackId: ID;
  frameId: ID | 'static';
  bbox: CelBBox;
  before: Uint8Array;
  after: Uint8Array;
}

export type Command = StrokeCommand;

const MAX_STEPS = 200;
const MAX_BYTES = 150 * 1024 * 1024;

interface HistoryState {
  undoStack: Command[];
  redoStack: Command[];
}

const history = signal<HistoryState>({ undoStack: [], redoStack: [] });

export const canUndo = signal(false);
export const canRedo = signal(false);

function syncFlags() {
  canUndo.value = history.value.undoStack.length > 0;
  canRedo.value = history.value.redoStack.length > 0;
}

function commandBytes(c: Command): number {
  return c.before.byteLength + c.after.byteLength;
}

export function pushCommand(cmd: Command) {
  const undoStack = [...history.value.undoStack, cmd];
  let total = undoStack.reduce((sum, c) => sum + commandBytes(c), 0);
  while (undoStack.length > MAX_STEPS || total > MAX_BYTES) {
    const dropped = undoStack.shift();
    if (!dropped) break;
    total -= commandBytes(dropped);
  }
  history.value = { undoStack, redoStack: [] };
  syncFlags();
}

function writeRegion(cel: NonNullable<typeof liveCel.value>, bbox: CelBBox, bytes: Uint8Array) {
  for (let y = 0; y < bbox.h; y++) {
    const destOffset = (bbox.y + y) * cel.width + bbox.x;
    cel.buf.set(bytes.subarray(y * bbox.w, (y + 1) * bbox.w), destOffset);
  }
}

/** Applies a command's `before` (or `after`) bytes to the live cel, if it's the one currently loaded.
 * Switching frames/tracks to follow an undo elsewhere is Phase 4 work (once multiple frames exist). */
function applyToLiveCel(cmd: Command, useBefore: boolean) {
  const cel = liveCel.value;
  if (!cel || cel.trackId !== cmd.trackId || cel.frameId !== cmd.frameId) return;
  writeRegion(cel, cmd.bbox, useBefore ? cmd.before : cmd.after);
  bumpCelVersion();
  recomputeStatsRegion(cmd.bbox);
  scheduleAutosave(cel.projectId);
}

export function undo() {
  const { undoStack, redoStack } = history.value;
  const cmd = undoStack[undoStack.length - 1];
  if (!cmd) return;
  applyToLiveCel(cmd, true);
  history.value = { undoStack: undoStack.slice(0, -1), redoStack: [...redoStack, cmd] };
  syncFlags();
}

export function redo() {
  const { undoStack, redoStack } = history.value;
  const cmd = redoStack[redoStack.length - 1];
  if (!cmd) return;
  applyToLiveCel(cmd, false);
  history.value = { undoStack: [...undoStack, cmd], redoStack: redoStack.slice(0, -1) };
  syncFlags();
}

/** Session-only, per §6.4 ("The history is not saved between sessions"). Call when switching projects. */
export function clearHistory() {
  history.value = { undoStack: [], redoStack: [] };
  syncFlags();
}
