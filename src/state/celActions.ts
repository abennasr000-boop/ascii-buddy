// Whole-cel edit actions (Edit → Clear cel). Kept separate from celStore.ts
// and history.ts to avoid a module cycle between them.
import { liveCel, bumpCelVersion } from './celStore';
import { pushCommand } from './history';
import { computeTightBBox } from '../engine/celCodec';
import { scheduleAutosave } from './autosave';
import { recomputeStatsRegion } from './asciiState';

export function clearCel(projectId: string) {
  const cel = liveCel.value;
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
  bumpCelVersion();
  recomputeStatsRegion({ x: bbox.x, y: bbox.y, w, h });
  scheduleAutosave(projectId);
}
