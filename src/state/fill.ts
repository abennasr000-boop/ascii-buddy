// Fill tool action. Boundaries come from the composite of every visible
// drawing track (default) or just the current cel; pixels are only ever
// written into the current cel — so line art can sit on one track with the
// color fills on the track below. See ASCII_BUDDY_SPEC.md §6.3.
import type { ID, Project } from '../types/model';
import { liveCels } from './celStore';
import { compositeIndexed, floodFill } from '../engine/fill';
import { ensureColorIndex } from './colorTable';
import { commitCelEdit } from './celActions';
import { currentColor, fillBoundary } from './tools';
import { colorTableFull } from './uiFlags';

export function fillAt(project: Project, trackId: ID, x: number, y: number): void {
  const cel = liveCels.value.get(trackId);
  if (!cel) return;
  const colorIndex = ensureColorIndex(project, currentColor.value);
  if (colorIndex === null) {
    colorTableFull.value = true;
    return;
  }

  let boundary = cel.buf;
  if (fillBoundary.value === 'all') {
    // Top of the stack first, drawing tracks only, hidden ones excluded (they aren't visible boundaries).
    const layers = project.tracks
      .filter((t) => t.kind === 'drawing' && t.visible)
      .map((t) => liveCels.value.get(t.id)?.buf)
      .filter((b): b is Uint8Array => b !== undefined);
    if (layers.length > 0) boundary = compositeIndexed(layers, cel.width, cel.height);
  }

  const before = cel.buf.slice();
  const result = floodFill(boundary, cel.buf, cel.width, cel.height, x, y, colorIndex);
  if (result.bbox) commitCelEdit(project.id, trackId, before, result.bbox);
}
