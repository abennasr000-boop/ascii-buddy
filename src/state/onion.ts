// Onion-skin preview data: fetches and decodes neighboring frames' animated
// drawing tracks on demand (not part of the "only current frame is live"
// working set — these are lightweight, read-only previews). See
// ASCII_BUDDY_SPEC.md §9.3. Recomputed whenever the current frame or the
// onion settings change; color/opacity are applied at render time (raster:
// canvas/OnionOverlay.tsx, ASCII: canvas/AsciiCanvas.tsx) so tweaking them
// doesn't require re-fetching/re-decoding anything.
import { signal } from '@preact/signals';
import type { ConversionOverride, ID, OnionSettings, Project, Track } from '../types/model';
import { rowsFor, type AsciiFrame } from '../types/model';
import { getCel } from '../db/db';
import { decodeCelInto } from '../engine/celCodec';
import { computeFullGridStats, type GridStats } from '../engine/gridStats';
import type { OccupancyTrack } from '../engine/occupancy';
import { resolveFrame } from './asciiConvertService';
import { updateProjectData } from './projects';
import { convertContextFor, celNeedsBins } from './convertContext';
import { ensureShapeTemplates, registerCelShapeChars } from './shapeTemplates';

export interface OnionLayer {
  frameId: ID;
  distance: number; // 1-based distance from the current frame
  side: 'before' | 'after';
  mask: Uint8Array; // canvas-sized, 1 = ink from any eligible track, for the raster silhouette
  ascii: AsciiFrame; // that frame's own occupancy result, for the ASCII-view overlay
}

export const onionLayers = signal<OnionLayer[]>([]);

function eligibleTracks(project: Project, scope: 'all' | 'current'): Track[] {
  // Static tracks and reference tracks are never onion-skinned — §9.3.
  return project.tracks.filter(
    (t) => t.kind === 'drawing' && !t.isStatic && t.visible && (scope === 'all' || t.id === project.ui.currentTrackId),
  );
}

async function buildLayer(
  project: Project,
  frameId: ID,
  distance: number,
  side: 'before' | 'after',
  tracks: Track[],
): Promise<OnionLayer | null> {
  const { width, height } = project.canvas;
  const rows = rowsFor(project.grid.columns, width, height);
  const mask = new Uint8Array(width * height);
  const statsByTrack = new Map<ID, GridStats>();
  const celOverrides = new Map<ID, ConversionOverride | undefined>();
  let anyInk = false;
  let anyBins = false;

  for (const track of tracks) {
    const cel = await getCel(project.id, track.id, frameId);
    if (!cel?.bbox) continue;
    const buf = decodeCelInto(cel.data, cel.bbox, width, height);
    for (let i = 0; i < buf.length; i++) {
      if (buf[i] !== 0) {
        mask[i] = 1;
        anyInk = true;
      }
    }
    registerCelShapeChars(cel.conversion?.shapeChars);
    const wantBins = celNeedsBins(project, track.conversion, cel.conversion);
    anyBins = anyBins || wantBins;
    celOverrides.set(track.id, cel.conversion);
    statsByTrack.set(track.id, computeFullGridStats(buf, width, height, project.grid.columns, rows, wantBins));
  }
  if (!anyInk) return null;
  if (anyBins) await ensureShapeTemplates(project); // Shape/Hybrid need the glyph templates

  const occupancyTracks: OccupancyTrack[] = project.tracks
    .map((t, index) => ({ track: t, position: index + 1 }))
    .filter(({ track }) => tracks.some((et) => et.id === track.id))
    .map(({ track, position }) => ({ trackId: track.id, position, visible: true, conversion: track.conversion, celConversion: celOverrides.get(track.id) }));
  const ascii = await resolveFrame({
    columns: project.grid.columns,
    rows,
    tracks: occupancyTracks,
    stats: statsByTrack,
    projectConversion: project.conversion,
    ctx: convertContextFor(project),
  });

  return { frameId, distance, side, mask, ascii };
}

let generation = 0;

export async function recomputeOnion(project: Project): Promise<void> {
  const myGeneration = ++generation;
  const onion = project.onion;
  if (!onion.enabled) {
    onionLayers.value = [];
    return;
  }
  const tracks = eligibleTracks(project, onion.scope);
  const frames = project.frames;
  const currentIndex = frames.findIndex((f) => f.id === project.ui.currentFrameId);
  if (tracks.length === 0 || currentIndex === -1 || frames.length <= 1) {
    onionLayers.value = [];
    return;
  }

  function frameIndexAt(offset: number): number | null {
    let idx = currentIndex + offset;
    if (onion.wrap) idx = ((idx % frames.length) + frames.length) % frames.length;
    if (idx < 0 || idx >= frames.length || idx === currentIndex) return null;
    return idx;
  }

  const jobs: Promise<OnionLayer | null>[] = [];
  for (let d = 1; d <= onion.before; d++) {
    const idx = frameIndexAt(-d);
    if (idx !== null) jobs.push(buildLayer(project, frames[idx].id, d, 'before', tracks));
  }
  for (let d = 1; d <= onion.after; d++) {
    const idx = frameIndexAt(d);
    if (idx !== null) jobs.push(buildLayer(project, frames[idx].id, d, 'after', tracks));
  }

  const results = (await Promise.all(jobs)).filter((r): r is OnionLayer => r !== null);
  if (myGeneration !== generation) return; // a newer recompute superseded this one
  onionLayers.value = results;
}

export function clearOnion(): void {
  generation++;
  onionLayers.value = [];
}

/** The one place onion settings should be changed from — patches `project.onion`
 * and recomputes the preview data in the same step, so every entry point (the
 * toolbar toggle, the View/Frame menus, the settings window, the `O` shortcut)
 * stays in sync without each one remembering to call recomputeOnion itself. */
export function updateOnionSettings(project: Project, patch: Partial<OnionSettings>): void {
  const next = { ...project.onion, ...patch };
  updateProjectData(project.id, { onion: next });
  void recomputeOnion({ ...project, onion: next });
}
