// Reactive layer tying the ASCII engine (pure, in src/engine/) to the live
// cels and project settings. See ASCII_BUDDY_SPEC.md §5.1, §4.4.
import { signal, effect } from '@preact/signals';
import type { ID, Project } from '../types/model';
import { rowsFor } from '../types/model';
import { liveCels } from './celStore';
import { projects } from './projects';
import { computeFullGridStats, recomputeGridStatsRegion, type GridStats, type PixelBBox } from '../engine/gridStats';
import { effectiveSettings, type OccupancyTrack } from '../engine/occupancy';
import { resolveFrame, resolveFrameSync, jobUsesShape, type FrameJob } from './asciiConvertService';
import { needsBins } from '../engine/asciiConvert';
import { convertContextFor } from './convertContext';
import { shapeTemplates, ensureShapeTemplates } from './shapeTemplates';
import type { AsciiFrame } from '../types/model';

/** Keyed by trackId — one GridStats per loaded drawing track. */
export const trackStats = signal<Map<ID, GridStats>>(new Map());
export const asciiFrame = signal<AsciiFrame | null>(null);

function currentProject(): Project | null {
  const anyCel = liveCels.value.values().next().value;
  if (!anyCel) return null;
  return projects.value.find((p) => p.id === anyCel.projectId) ?? null;
}

let frameSeq = 0;

/** Discards any conversion still running (e.g. in the worker) so it can't land after the project changed. */
export function invalidateAsciiFrame(): void {
  frameSeq++;
}

/** Recomputes the combined AsciiFrame from whatever per-track stats are already cached. Ramp converts
 * synchronously (instant); Shape/Hybrid run in the worker and the previous frame stays on screen until
 * the newest result arrives (older, superseded results are dropped). */
export function recomputeFrame(): void {
  const project = currentProject();
  if (!project) return;
  const rows = rowsFor(project.grid.columns, project.canvas.width, project.canvas.height);
  const occupancyTracks: OccupancyTrack[] = project.tracks
    .map((t, index) => ({ track: t, position: index + 1 }))
    .filter(({ track }) => track.kind === 'drawing')
    .map(({ track, position }) => ({
      trackId: track.id,
      position,
      visible: track.visible,
      conversion: track.conversion,
      celConversion: liveCels.value.get(track.id)?.conversion,
    }));
  const job: FrameJob = {
    columns: project.grid.columns,
    rows,
    tracks: occupancyTracks,
    stats: trackStats.value,
    projectConversion: project.conversion,
    ctx: convertContextFor(project),
  };
  const seq = ++frameSeq;
  if (!jobUsesShape(job)) {
    asciiFrame.value = resolveFrameSync(job);
    return;
  }
  void resolveFrame(job).then((frame) => {
    if (seq === frameSeq) asciiFrame.value = frame;
  });
}

/** True if this track's live cel needs sub-grid bins under the settings cascade (Shape/Hybrid). */
function trackWantsBins(project: Project, trackId: ID): boolean {
  const track = project.tracks.find((t) => t.id === trackId);
  return needsBins(effectiveSettings(project.conversion, track?.conversion, liveCels.value.get(trackId)?.conversion));
}

export function recomputeFullStatsForTrack(trackId: ID): void {
  const cel = liveCels.value.get(trackId);
  const project = currentProject();
  if (!cel || !project) return;
  const rows = rowsFor(project.grid.columns, project.canvas.width, project.canvas.height);
  const stats = computeFullGridStats(cel.buf, cel.width, cel.height, project.grid.columns, rows, trackWantsBins(project, trackId));
  const next = new Map(trackStats.value);
  next.set(trackId, stats);
  trackStats.value = next;
}

/** Full stats recompute for every currently-loaded drawing track, then the combined frame. */
export function recomputeAllStats(): void {
  for (const trackId of liveCels.value.keys()) recomputeFullStatsForTrack(trackId);
  // Drop stats for tracks no longer loaded (deleted/merged away).
  const next = new Map(trackStats.value);
  for (const id of next.keys()) if (!liveCels.value.has(id)) next.delete(id);
  trackStats.value = next;
  recomputeFrame();
}

/** Call after any edit to one track's live cel (stroke, undo/redo, clear) with the edit's pixel-space bbox. */
export function recomputeStatsRegion(trackId: ID, dirty: PixelBBox): void {
  const cel = liveCels.value.get(trackId);
  const project = currentProject();
  if (!cel || !project) return;
  const stats = trackStats.value.get(trackId);
  if (!stats || stats.columns !== project.grid.columns || (trackWantsBins(project, trackId) && !stats.bins)) {
    recomputeFullStatsForTrack(trackId);
    recomputeFrame();
    return;
  }
  recomputeGridStatsRegion(stats, cel.buf, cel.width, cel.height, dirty);
  const next = new Map(trackStats.value);
  next.set(trackId, { ...stats }); // new reference so signal subscribers see the update
  trackStats.value = next;
  recomputeFrame();
}

// Stats and the frame must stay in sync with the loaded tracks and with
// grid/conversion settings even while the ASCII view (and its AsciiCanvas,
// previously the only thing watching any of this) is unmounted — e.g.
// dragging the columns slider, toggling a track's visibility, or adjusting
// threshold/density, while looking at Raster view. A module-level effect
// runs regardless of what's currently mounted. Two separate keys: the set of
// loaded tracks (and columns) needs a full stats recompute; everything else
// that affects the frame (visibility, order, per-track/project conversion)
// only needs the cheap occupancy-resolve redone.
let lastStatsKey = '';
let lastFrameKey = '';
effect(() => {
  const cels = liveCels.value;
  const project = currentProject();
  if (!project) return;

  // Which tracks need the sub-grid bins (Shape/Hybrid under the cascade) is part of the stats identity:
  // switching a style on must recompute stats with bins, switching it off can drop them.
  const binTracks = [...cels.keys()].filter((id) => trackWantsBins(project, id)).sort();
  const statsKey = `${project.id}:${project.grid.columns}:${[...cels.keys()].sort().join(',')}:${binTracks.join(',')}`;
  const celConversions = [...cels.values()].map((c) => [c.trackId, c.conversion ?? null]);
  const templatesKey = shapeTemplates.value?.key ?? '';
  const frameKey = JSON.stringify({
    tracks: project.tracks.map((t) => ({ id: t.id, kind: t.kind, visible: t.visible, conversion: t.conversion })),
    conversion: project.conversion,
    celConversions,
    charset: project.charset,
    colorChars: project.colorChars,
    templatesKey,
  });

  // Shape/Hybrid need glyph templates for the current font + character union; until they exist the
  // conversion falls back to the ramp, and this effect re-runs (it reads the templates signal) when they land.
  if (binTracks.length > 0) void ensureShapeTemplates(project);

  if (statsKey !== lastStatsKey) {
    lastStatsKey = statsKey;
    lastFrameKey = frameKey;
    recomputeAllStats(); // also (re)computes the frame
    return;
  }
  if (frameKey !== lastFrameKey) {
    lastFrameKey = frameKey;
    recomputeFrame();
  }
});
