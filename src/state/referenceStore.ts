// Live reference-track state for the current frame: each visible reference
// track's ReferenceCel (position/scale/rotation) plus a decoded, drawable
// image. See ASCII_BUDDY_SPEC.md §6.3, §8, §10.
import { signal } from '@preact/signals';
import type { ID, Project, ReferenceCel, Track } from '../types/model';
import { frameIdForTrack } from './celStore';
import { getImage, getReferenceCel, putImage, putReferenceCel } from '../db/db';
import { downscaleImageForImport } from '../engine/imageImport';
import { makeId } from '../model/id';
import { scheduleAutosave } from './autosave';

export interface LiveReference {
  projectId: ID;
  trackId: ID;
  frameId: ID | 'static';
  cel: ReferenceCel;
  imageUrl: string; // object URL for the decoded image blob
  naturalWidth: number;
  naturalHeight: number;
}

/** Keyed by trackId. Only reference tracks have entries. */
export const liveReferences = signal<Map<ID, LiveReference>>(new Map());

function revokeIfPresent(trackId: ID) {
  const existing = liveReferences.value.get(trackId);
  if (existing) URL.revokeObjectURL(existing.imageUrl);
}

async function buildLiveReference(project: Project, trackId: ID, frameId: ID | 'static', cel: ReferenceCel): Promise<LiveReference | null> {
  const blob = await getImage(cel.imageId);
  if (!blob) return null;
  const imageUrl = URL.createObjectURL(blob);
  const dims = await new Promise<{ w: number; h: number } | null>((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = imageUrl;
  });
  if (!dims) {
    URL.revokeObjectURL(imageUrl);
    return null;
  }
  return { projectId: project.id, trackId, frameId, cel, imageUrl, naturalWidth: dims.w, naturalHeight: dims.h };
}

export async function loadReferenceTrack(project: Project, track: Track, currentFrameId: ID, isStale: () => boolean = () => false): Promise<void> {
  const frameId = frameIdForTrack(track, currentFrameId);
  const cel = await getReferenceCel(project.id, track.id, frameId);
  if (isStale()) return;
  revokeIfPresent(track.id);
  if (!cel) {
    const next = new Map(liveReferences.value);
    next.delete(track.id);
    liveReferences.value = next;
    return;
  }
  const live = await buildLiveReference(project, track.id, frameId, cel);
  if (isStale()) {
    if (live) URL.revokeObjectURL(live.imageUrl); // a newer load owns the map now
    return;
  }
  const next = new Map(liveReferences.value);
  if (live) next.set(track.id, live);
  else next.delete(track.id);
  liveReferences.value = next;
}

export async function loadAllReferenceTracks(project: Project, currentFrameId: ID, isStale: () => boolean = () => false): Promise<void> {
  const referenceTracks = project.tracks.filter((t) => t.kind === 'reference');
  await Promise.all(referenceTracks.map((t) => loadReferenceTrack(project, t, currentFrameId, isStale)));
  if (isStale()) return;
  const validIds = new Set(referenceTracks.map((t) => t.id));
  for (const id of liveReferences.value.keys()) {
    if (!validIds.has(id)) {
      revokeIfPresent(id);
      const next = new Map(liveReferences.value);
      next.delete(id);
      liveReferences.value = next;
    }
  }
}

export function fitTransform(imgW: number, imgH: number, canvasW: number, canvasH: number) {
  return { x: canvasW / 2, y: canvasH / 2, scale: Math.min(canvasW / imgW, canvasH / imgH), rotation: 0 };
}
export function fillTransform(imgW: number, imgH: number, canvasW: number, canvasH: number) {
  return { x: canvasW / 2, y: canvasH / 2, scale: Math.max(canvasW / imgW, canvasH / imgH), rotation: 0 };
}
export function resetTransform(canvasW: number, canvasH: number) {
  return { x: canvasW / 2, y: canvasH / 2, scale: 1, rotation: 0 };
}

/** Imports a single image (paste/drop) onto a reference track's current-frame cel,
 * downscaling and storing it per §10.4, with a default "Fit" transform. */
export async function importImageToReferenceTrack(project: Project, track: Track, currentFrameId: ID, source: Blob): Promise<void> {
  const frameId = frameIdForTrack(track, currentFrameId);
  const { blob, width, height } = await downscaleImageForImport(source, project.canvas.width, project.canvas.height);
  const imageId = makeId();
  await putImage(imageId, project.id, blob);
  const cel: ReferenceCel = {
    projectId: project.id,
    trackId: track.id,
    frameId,
    imageId,
    transform: fitTransform(width, height, project.canvas.width, project.canvas.height),
  };
  await putReferenceCel(cel);
  await loadReferenceTrack(project, track, currentFrameId);
  scheduleAutosave(project.id);
}

/** Updates the in-memory transform only (no DB write) — for live feedback while
 * dragging a move/scale/rotate handle. Call `setReferenceTransform` on release to persist. */
export function previewReferenceTransform(trackId: ID, transform: ReferenceCel['transform']): void {
  const live = liveReferences.value.get(trackId);
  if (!live) return;
  const next = new Map(liveReferences.value);
  next.set(trackId, { ...live, cel: { ...live.cel, transform } });
  liveReferences.value = next;
}

export async function setReferenceTransform(trackId: ID, transform: ReferenceCel['transform']): Promise<void> {
  const live = liveReferences.value.get(trackId);
  if (!live) return;
  const cel: ReferenceCel = { ...live.cel, transform };
  const next = new Map(liveReferences.value);
  next.set(trackId, { ...live, cel });
  liveReferences.value = next;
  await putReferenceCel(cel);
  scheduleAutosave(live.projectId);
}

/** Copies the given track's current transform to every cel (every frame) in that track. */
export async function applyTransformToAllCels(project: Project, track: Track): Promise<void> {
  const live = liveReferences.value.get(track.id);
  if (!live) return;
  const transform = live.cel.transform;
  for (const frame of project.frames) {
    const existing = await getReferenceCel(project.id, track.id, frame.id);
    if (!existing) continue;
    await putReferenceCel({ ...existing, transform });
  }
  scheduleAutosave(project.id);
}

export function unloadReferenceTrack(trackId: ID) {
  revokeIfPresent(trackId);
  const next = new Map(liveReferences.value);
  next.delete(trackId);
  liveReferences.value = next;
}

/** Drops every live reference (revoking their object URLs) — used when leaving a project. */
export function unloadAllReferences() {
  for (const id of [...liveReferences.value.keys()]) revokeIfPresent(id);
  liveReferences.value = new Map();
}
