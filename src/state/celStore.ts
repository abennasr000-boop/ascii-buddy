// Holds the live (full-canvas, uncompressed) buffers for every *drawing*
// track's cel in the current frame, and moves them to/from the compressed
// IndexedDB representation. Per ASCII_BUDDY_SPEC.md §14.3, only the current
// frame's cels are kept live — with Phase 4's multiple frames not built yet,
// that's simply "every drawing track, for the one frame that exists."
import { signal } from '@preact/signals';
import type { ConversionOverride, ID, Project, Track } from '../types/model';
import { createCelBuffer } from '../engine/rasterCel';
import { computeTightBBox, decodeCelInto, encodeCel } from '../engine/celCodec';
import { deleteCel, getCel, putCel } from '../db/db';
import { registerCelShapeChars } from './shapeTemplates';

export interface LiveCel {
  projectId: ID;
  trackId: ID;
  frameId: ID | 'static';
  width: number;
  height: number;
  buf: Uint8Array;
  version: number;
  /** Cel-level conversion override (§5.7); persisted with the cel. */
  conversion?: ConversionOverride;
}

/** Keyed by trackId. Only drawing tracks have entries — reference tracks live in referenceStore.ts. */
export const liveCels = signal<Map<ID, LiveCel>>(new Map());

export function frameIdForTrack(track: Track, currentFrameId: ID): ID | 'static' {
  return track.isStatic ? 'static' : currentFrameId;
}

async function readCel(project: Project, track: Track, currentFrameId: ID): Promise<LiveCel> {
  const frameId = frameIdForTrack(track, currentFrameId);
  const { width, height } = project.canvas;
  const stored = await getCel(project.id, track.id, frameId);
  const buf =
    stored?.bbox && stored.data
      ? decodeCelInto(stored.data, stored.bbox, width, height)
      : createCelBuffer(width, height);
  registerCelShapeChars(stored?.conversion?.shapeChars);
  return { projectId: project.id, trackId: track.id, frameId, width, height, buf, version: stored?.version ?? 0, conversion: stored?.conversion };
}

export async function loadCel(project: Project, track: Track, currentFrameId: ID): Promise<void> {
  const entry = await readCel(project, track, currentFrameId);
  const next = new Map(liveCels.value);
  next.set(track.id, entry);
  liveCels.value = next;
}

/** Loads (or creates) every drawing track's cel for the current frame, replacing whatever was loaded before.
 * All cels are read first and swapped in together; `isStale` lets a caller abandon the swap if a newer
 * reload (e.g. rapid frame navigation) started while this one was reading — otherwise a slow older read
 * could land last and leave the canvas showing (and drawing into) the wrong frame. */
export async function loadAllDrawingCels(project: Project, currentFrameId: ID, isStale: () => boolean = () => false): Promise<void> {
  const drawingTracks = project.tracks.filter((t) => t.kind === 'drawing');
  const entries = await Promise.all(drawingTracks.map((t) => readCel(project, t, currentFrameId)));
  if (isStale()) return;
  const next = new Map<ID, LiveCel>();
  for (const entry of entries) next.set(entry.trackId, entry);
  liveCels.value = next;
}

/** Call after mutating a track's `buf` in place, to trigger redraws and mark it for autosave. */
export function bumpCelVersion(trackId: ID) {
  const cel = liveCels.value.get(trackId);
  if (!cel) return;
  const next = new Map(liveCels.value);
  next.set(trackId, { ...cel, version: cel.version + 1 });
  liveCels.value = next;
}

export async function saveCel(trackId: ID): Promise<void> {
  const cel = liveCels.value.get(trackId);
  if (!cel) return;
  const bbox = computeTightBBox(cel.buf, cel.width, cel.height);
  const hasOverride = !!cel.conversion && Object.keys(cel.conversion).length > 0;
  if (!bbox) {
    // An empty cel is normally not stored at all — unless it carries a conversion override, which must survive.
    if (!hasOverride) {
      await deleteCel(cel.projectId, cel.trackId, cel.frameId);
      return;
    }
    await putCel({ projectId: cel.projectId, trackId: cel.trackId, frameId: cel.frameId, version: cel.version, bbox: null, data: new Uint8Array(0), conversion: cel.conversion });
    return;
  }
  const data = encodeCel(cel.buf, cel.width, bbox);
  await putCel({
    projectId: cel.projectId,
    trackId: cel.trackId,
    frameId: cel.frameId,
    version: cel.version,
    bbox,
    data,
    ...(hasOverride ? { conversion: cel.conversion } : {}),
  });
}

export async function saveAllCels(): Promise<void> {
  await Promise.all([...liveCels.value.keys()].map(saveCel));
}

export function unloadCel(trackId: ID) {
  const next = new Map(liveCels.value);
  next.delete(trackId);
  liveCels.value = next;
}
