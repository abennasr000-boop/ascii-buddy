// Global undo/redo history. See ASCII_BUDDY_SPEC.md §6.4.
//
// One global history covers drawing, frames, tracks, settings, imports, and
// color changes (§6.4). Stroke commands (Phase 1-3) store dirty-rect bytes;
// structural changes (Phase 4 frame operations, later tracks/settings) are
// `action` commands carrying their own undo/redo closures.
import { signal } from '@preact/signals';
import type { ID } from '../types/model';
import type { CelBBox } from '../engine/celCodec';
import { liveCels, bumpCelVersion, type LiveCel } from './celStore';
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

/** A reversible structural change. `undo`/`redo` must not push history commands themselves. */
export interface ActionCommand {
  kind: 'action';
  label: string;
  undo: () => void | Promise<void>;
  redo: () => void | Promise<void>;
}

export type Command = StrokeCommand | ActionCommand;

/** Makes (frame, track) the current one, reloading its live data, so an undo/redo of a stroke
 * made elsewhere is visible (§6.4). Registered by state/framesActions.ts; returns false when the
 * frame or track no longer exists. */
type JumpTo = (frameId: ID | 'static', trackId: ID) => Promise<boolean>;
let jumpTo: JumpTo | null = null;
export function registerHistoryJump(fn: JumpTo) {
  jumpTo = fn;
}

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
  return c.kind === 'stroke' ? c.before.byteLength + c.after.byteLength : 0;
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

function writeRegion(cel: LiveCel, bbox: CelBBox, bytes: Uint8Array) {
  for (let y = 0; y < bbox.h; y++) {
    const destOffset = (bbox.y + y) * cel.width + bbox.x;
    cel.buf.set(bytes.subarray(y * bbox.w, (y + 1) * bbox.w), destOffset);
  }
}

/** Applies a stroke command's `before` (or `after`) bytes to the live cel, first jumping to its frame/track. */
async function applyStroke(cmd: StrokeCommand, useBefore: boolean): Promise<void> {
  if (jumpTo && !(await jumpTo(cmd.frameId, cmd.trackId))) return; // frame or track is gone
  const cel = liveCels.value.get(cmd.trackId);
  if (!cel || cel.frameId !== cmd.frameId) return;
  writeRegion(cel, cmd.bbox, useBefore ? cmd.before : cmd.after);
  bumpCelVersion(cmd.trackId);
  recomputeStatsRegion(cmd.trackId, cmd.bbox);
  scheduleAutosave(cel.projectId, cmd.trackId);
}

async function apply(cmd: Command, direction: 'undo' | 'redo'): Promise<void> {
  if (cmd.kind === 'stroke') await applyStroke(cmd, direction === 'undo');
  else await (direction === 'undo' ? cmd.undo() : cmd.redo());
}

/** Runs before any undo/redo — the selection commits a floating selection first, so the move/paste
 * becomes a normal history step that the undo then reverses. */
let beforeChange: (() => void) | null = null;
export function registerBeforeHistoryChange(fn: () => void) {
  beforeChange = fn;
}

// Undo/redo can now be async (jumping frames, restoring cels), so they run one at a time.
let busy = false;

export async function undo(): Promise<void> {
  if (busy) return;
  beforeChange?.();
  const cmd = history.value.undoStack[history.value.undoStack.length - 1];
  if (!cmd) return;
  busy = true;
  try {
    await apply(cmd, 'undo');
  } finally {
    busy = false;
  }
  // Move the command even if it could no longer be applied, so a dead entry can't wedge the stack.
  const { undoStack, redoStack } = history.value;
  history.value = { undoStack: undoStack.filter((c) => c !== cmd), redoStack: [...redoStack, cmd] };
  syncFlags();
}

export async function redo(): Promise<void> {
  if (busy) return;
  beforeChange?.();
  const cmd = history.value.redoStack[history.value.redoStack.length - 1];
  if (!cmd) return;
  busy = true;
  try {
    await apply(cmd, 'redo');
  } finally {
    busy = false;
  }
  const { undoStack, redoStack } = history.value;
  history.value = { undoStack: [...undoStack, cmd], redoStack: redoStack.filter((c) => c !== cmd) };
  syncFlags();
}

/** Session-only, per §6.4 ("The history is not saved between sessions"). Call when switching projects. */
export function clearHistory() {
  history.value = { undoStack: [], redoStack: [] };
  syncFlags();
}
