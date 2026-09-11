// Holds the live (full-canvas, uncompressed) buffer for the cel currently
// being edited, and moves it to/from the compressed IndexedDB representation.
// Per ASCII_BUDDY_SPEC.md §14.3, only the current frame's cel is kept live —
// that's naturally true here since Phase 1 has exactly one frame and track.
import { signal } from '@preact/signals';
import type { ID, Project } from '../types/model';
import { createCelBuffer } from '../engine/rasterCel';
import { computeTightBBox, decodeCelInto, encodeCel } from '../engine/celCodec';
import { deleteCel, getCel, putCel } from '../db/db';

export interface LiveCel {
  projectId: ID;
  trackId: ID;
  frameId: ID | 'static';
  width: number;
  height: number;
  buf: Uint8Array;
  version: number;
}

export const liveCel = signal<LiveCel | null>(null);

export async function loadCel(project: Project, trackId: ID, frameId: ID | 'static'): Promise<void> {
  const { width, height } = project.canvas;
  const stored = await getCel(project.id, trackId, frameId);
  const buf =
    stored?.bbox && stored.data
      ? decodeCelInto(stored.data, stored.bbox, width, height)
      : createCelBuffer(width, height);
  liveCel.value = { projectId: project.id, trackId, frameId, width, height, buf, version: stored?.version ?? 0 };
}

/** Call after mutating `liveCel.value.buf` in place, to trigger redraws and mark it for autosave. */
export function bumpCelVersion() {
  const cel = liveCel.value;
  if (!cel) return;
  liveCel.value = { ...cel, version: cel.version + 1 };
}

export async function saveCel(projectId: ID): Promise<void> {
  const cel = liveCel.value;
  if (!cel) return;
  const bbox = computeTightBBox(cel.buf, cel.width, cel.height);
  if (!bbox) {
    await deleteCel(projectId, cel.trackId, cel.frameId);
    return;
  }
  const data = encodeCel(cel.buf, cel.width, bbox);
  await putCel({ projectId, trackId: cel.trackId, frameId: cel.frameId, version: cel.version, bbox, data });
}
