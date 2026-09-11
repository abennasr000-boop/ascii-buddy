// Reactive layer tying the ASCII engine (pure, in src/engine/) to the live
// cel and project settings. See ASCII_BUDDY_SPEC.md §5.1.
import { signal, effect } from '@preact/signals';
import type { Project } from '../types/model';
import { rowsFor } from '../types/model';
import { liveCel } from './celStore';
import { projects } from './projects';
import { computeFullGridStats, recomputeGridStatsRegion, type GridStats, type PixelBBox } from '../engine/gridStats';
import { convertToAsciiFrame } from '../engine/asciiConvert';
import type { AsciiFrame } from '../types/model';

export const gridStats = signal<GridStats | null>(null);
export const asciiFrame = signal<AsciiFrame | null>(null);

function currentProject(): Project | null {
  const cel = liveCel.value;
  if (!cel) return null;
  return projects.value.find((p) => p.id === cel.projectId) ?? null;
}

export function recomputeFrame(): void {
  const project = currentProject();
  const stats = gridStats.value;
  if (!project || !stats) return;
  asciiFrame.value = convertToAsciiFrame(stats, project.conversion);
}

export function recomputeFullStats(): void {
  const cel = liveCel.value;
  const project = currentProject();
  if (!cel || !project) return;
  const rows = rowsFor(project.grid.columns, project.canvas.width, project.canvas.height);
  gridStats.value = computeFullGridStats(cel.buf, cel.width, cel.height, project.grid.columns, rows);
  recomputeFrame();
}

/** Call after any edit to the live cel (stroke, undo/redo, clear) with the edit's pixel-space bbox. */
export function recomputeStatsRegion(dirty: PixelBBox): void {
  const cel = liveCel.value;
  const project = currentProject();
  if (!cel || !project) return;
  const stats = gridStats.value;
  // No cache yet, or it was built for a different column count (e.g. changed mid-edit) — go full.
  if (!stats || stats.columns !== project.grid.columns) {
    recomputeFullStats();
    return;
  }
  recomputeGridStatsRegion(stats, cel.buf, cel.width, cel.height, dirty);
  gridStats.value = { ...stats }; // new reference so signal subscribers see the update
  recomputeFrame();
}

// Stats and the frame must stay in sync with grid/conversion settings even
// while the ASCII view (and its AsciiCanvas, previously the only thing
// watching any of this) is unmounted — e.g. dragging the columns slider, or
// adjusting threshold/density, while looking at Raster view. A module-level
// effect runs regardless of what's currently mounted. Two separate keys:
// columns (and cel identity) need a full stats recompute; threshold/density/
// ramp/style only need the cheap stats→frame conversion redone.
let lastStatsKey = '';
let lastConversionKey = '';
effect(() => {
  const cel = liveCel.value;
  const project = currentProject();
  if (!cel || !project) return;

  const statsKey = `${cel.projectId}:${cel.trackId}:${cel.frameId}:${project.grid.columns}`;
  const conversionKey = JSON.stringify(project.conversion);

  if (statsKey !== lastStatsKey) {
    lastStatsKey = statsKey;
    lastConversionKey = conversionKey;
    recomputeFullStats(); // also (re)computes the frame
    return;
  }
  if (conversionKey !== lastConversionKey) {
    lastConversionKey = conversionKey;
    recomputeFrame();
  }
});
