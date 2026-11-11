// Whole-cel edit actions (Edit → Clear cel). Kept separate from celStore.ts
// and history.ts to avoid a module cycle between them.
import type { ID } from '../types/model';
import { liveCels, bumpCelVersion } from './celStore';
import { pushCommand } from './history';
import { computeTightBBox } from '../engine/celCodec';
import { scheduleAutosave } from './autosave';
import { recomputeStatsRegion } from './asciiState';

export function clearCel(projectId: string, trackId: ID) {
  const cel = liveCels.value.get(trackId);
  if (!cel) return;
  const bbox = computeTightBBox(cel.buf, cel.width, cel.height);
  if (!bbox) return; // already empty

  const w = bbox.w;
  const h = bbox.h;
  const before = new Uint8Array(w * h);
  const after = new Uint8Array(w * h); // all zeros = cleared
  for (let y = 0; y < h; y++) {
    const srcOffset = (bbox.y + y) * cel.width + bbox.x;
    before.set(cel.buf.subarray(srcOffset, srcOffset + w), y * w);
    cel.buf.fill(0, srcOffset, srcOffset + w);
  }

  pushCommand({
    kind: 'stroke',
    trackId: cel.trackId,
    frameId: cel.frameId,
    bbox: { x: bbox.x, y: bbox.y, w, h },
    before,
    after,
  });
  bumpCelVersion(trackId);
  recomputeStatsRegion(trackId, { x: bbox.x, y: bbox.y, w, h });
  scheduleAutosave(projectId, trackId);
}

export interface DirtyRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Records an undo step for an edit already applied in place to a live cel (fill, selection commit, ...).
 * `before` is a full copy of the cel buffer taken before the edit; `dirty` bounds every pixel that may
 * have changed. Pushes nothing (but still refreshes) if the region turned out identical. */
export function commitCelEdit(projectId: string, trackId: ID, before: Uint8Array, dirty: DirtyRect): void {
  const cel = liveCels.value.get(trackId);
  if (!cel) return;
  const x0 = Math.max(0, dirty.x0);
  const y0 = Math.max(0, dirty.y0);
  const x1 = Math.min(cel.width - 1, dirty.x1);
  const y1 = Math.min(cel.height - 1, dirty.y1);
  if (x1 < x0 || y1 < y0) return;
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const beforeCrop = new Uint8Array(w * h);
  const afterCrop = new Uint8Array(w * h);
  let changed = false;
  for (let y = 0; y < h; y++) {
    const src = (y0 + y) * cel.width + x0;
    beforeCrop.set(before.subarray(src, src + w), y * w);
    afterCrop.set(cel.buf.subarray(src, src + w), y * w);
  }
  for (let i = 0; i < beforeCrop.length; i++) {
    if (beforeCrop[i] !== afterCrop[i]) {
      changed = true;
      break;
    }
  }
  if (!changed) return;
  pushCommand({ kind: 'stroke', trackId, frameId: cel.frameId, bbox: { x: x0, y: y0, w, h }, before: beforeCrop, after: afterCrop });
  bumpCelVersion(trackId);
  recomputeStatsRegion(trackId, { x: x0, y: y0, w, h });
  scheduleAutosave(projectId, trackId);
}
