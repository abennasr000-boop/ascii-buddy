// Track management: add/duplicate/delete/reorder/rename, static↔animated,
// visibility/lock, reference opacity, and merge down. See ASCII_BUDDY_SPEC.md
// §8. Structural changes reload all live track data afterward rather than
// surgically patching it — simpler and these are infrequent operations.
import type { ID, Project, Track } from '../types/model';
import { updateProjectData, projects } from './projects';
import { makeId } from '../model/id';
import { reloadAllTrackData } from './canvasData';
import { getCel, putCel, deleteCel, getReferenceCel, putReferenceCel, deleteImage } from '../db/db';
import { computeTightBBox, decodeCelInto, encodeCel } from '../engine/celCodec';
import { createCelBuffer } from '../engine/rasterCel';
import { importImageToReferenceTrack } from './referenceStore';

export const SOFT_TRACK_LIMIT = 16;

function freshProject(id: ID): Project | undefined {
  return projects.value.find((p) => p.id === id);
}

function withTracks(project: Project, tracks: Track[], currentTrackId?: ID): void {
  updateProjectData(project.id, {
    tracks,
    ui: currentTrackId ? { ...project.ui, currentTrackId } : project.ui,
  });
}

export function nextLayerName(project: Project): string {
  const used = new Set(project.tracks.filter((t) => t.kind === 'drawing').map((t) => t.name));
  let n = 1;
  while (used.has(`Layer ${n}`)) n++;
  return `Layer ${n}`;
}

export function nextReferenceName(project: Project): string {
  const used = new Set(project.tracks.filter((t) => t.kind === 'reference').map((t) => t.name));
  let n = 1;
  while (used.has(`Reference ${n}`)) n++;
  return `Reference ${n}`;
}

function currentTrackIndex(project: Project): number {
  const idx = project.tracks.findIndex((t) => t.id === project.ui.currentTrackId);
  return idx === -1 ? 0 : idx;
}

export async function addDrawingTrack(project: Project): Promise<void> {
  const track: Track = { id: makeId(), name: nextLayerName(project), kind: 'drawing', isStatic: false, visible: true, locked: false, opacity: 1 };
  const insertAt = currentTrackIndex(project);
  const tracks = [...project.tracks];
  tracks.splice(insertAt, 0, track);
  withTracks(project, tracks, track.id);
  await reloadAllTrackData(freshProject(project.id)!);
}

export async function addReferenceTrack(project: Project): Promise<void> {
  const track: Track = { id: makeId(), name: nextReferenceName(project), kind: 'reference', isStatic: false, visible: true, locked: false, opacity: 0.5 };
  const insertAt = currentTrackIndex(project);
  const tracks = [...project.tracks];
  tracks.splice(insertAt, 0, track);
  withTracks(project, tracks, track.id);
  await reloadAllTrackData(freshProject(project.id)!);
}

export async function duplicateTrack(project: Project, trackId: ID): Promise<void> {
  const source = project.tracks.find((t) => t.id === trackId);
  if (!source) return;
  const copy: Track = { ...source, id: makeId(), name: `${source.name} copy` };
  const index = project.tracks.findIndex((t) => t.id === trackId);
  const tracks = [...project.tracks];
  tracks.splice(index, 0, copy);

  const frameIds = source.isStatic ? (['static'] as const) : project.frames.map((f) => f.id);
  for (const frameId of frameIds) {
    if (source.kind === 'drawing') {
      const cel = await getCel(project.id, source.id, frameId);
      if (cel) await putCel({ ...cel, trackId: copy.id });
    } else {
      const cel = await getReferenceCel(project.id, source.id, frameId);
      if (cel) await putReferenceCel({ ...cel, trackId: copy.id });
    }
  }

  withTracks(project, tracks, copy.id);
  await reloadAllTrackData(freshProject(project.id)!);
}

export async function deleteTrack(project: Project, trackId: ID): Promise<void> {
  const index = project.tracks.findIndex((t) => t.id === trackId);
  if (index === -1) return;
  const track = project.tracks[index];
  const remainingDrawingTracks = project.tracks.filter((t) => t.kind === 'drawing' && t.id !== trackId).length;
  if (track.kind === 'drawing' && remainingDrawingTracks === 0) return; // always keep at least one drawing track

  const tracks = project.tracks.filter((t) => t.id !== trackId);
  const nextCurrent = project.ui.currentTrackId === trackId ? tracks[Math.min(index, tracks.length - 1)].id : project.ui.currentTrackId;
  withTracks(project, tracks, nextCurrent);

  const frameIds = track.isStatic ? (['static'] as const) : project.frames.map((f) => f.id);
  for (const frameId of frameIds) {
    if (track.kind === 'reference') {
      const cel = await getReferenceCel(project.id, trackId, frameId);
      if (cel) await deleteImage(cel.imageId);
    }
    await deleteCel(project.id, trackId, frameId);
  }
  await reloadAllTrackData(freshProject(project.id)!);
}

export function renameTrack(project: Project, trackId: ID, name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  withTracks(
    project,
    project.tracks.map((t) => (t.id === trackId ? { ...t, name: trimmed } : t)),
  );
}

export function setTrackVisible(project: Project, trackId: ID, visible: boolean): void {
  withTracks(
    project,
    project.tracks.map((t) => (t.id === trackId ? { ...t, visible } : t)),
  );
}

export function setTrackLocked(project: Project, trackId: ID, locked: boolean): void {
  withTracks(
    project,
    project.tracks.map((t) => (t.id === trackId ? { ...t, locked } : t)),
  );
}

export function setReferenceOpacity(project: Project, trackId: ID, opacity: number): void {
  const clamped = Math.max(0, Math.min(1, opacity));
  withTracks(
    project,
    project.tracks.map((t) => (t.id === trackId ? { ...t, opacity: clamped } : t)),
  );
}

export function reorderTrack(project: Project, fromIndex: number, toIndex: number): void {
  if (fromIndex === toIndex) return;
  const tracks = [...project.tracks];
  const [moved] = tracks.splice(fromIndex, 1);
  tracks.splice(toIndex, 0, moved);
  withTracks(project, tracks);
}

/** Make static: keeps the current frame's cel as the shared cel (other frames' content on
 * this track is discarded). Make animated: copies the shared cel into every frame. §8. */
export async function setTrackStatic(project: Project, trackId: ID, isStatic: boolean): Promise<void> {
  const track = project.tracks.find((t) => t.id === trackId);
  if (!track || track.isStatic === isStatic || track.kind !== 'drawing') return;

  if (isStatic) {
    const currentCel = await getCel(project.id, trackId, project.ui.currentFrameId);
    for (const frame of project.frames) await deleteCel(project.id, trackId, frame.id);
    if (currentCel) await putCel({ ...currentCel, frameId: 'static' });
  } else {
    const staticCel = await getCel(project.id, trackId, 'static');
    await deleteCel(project.id, trackId, 'static');
    if (staticCel) {
      for (const frame of project.frames) {
        await putCel({ ...staticCel, frameId: frame.id });
      }
    }
  }

  withTracks(
    project,
    project.tracks.map((t) => (t.id === trackId ? { ...t, isStatic } : t)),
  );
  await reloadAllTrackData(freshProject(project.id)!);
}

/** Merges the given drawing track into the drawing track below it (top pixels over
 * bottom), frame by frame, then removes the merged-away track. §8. */
export async function mergeTrackDown(project: Project, trackId: ID): Promise<void> {
  const index = project.tracks.findIndex((t) => t.id === trackId);
  if (index === -1) return;
  const below = project.tracks.slice(index + 1).find((t) => t.kind === 'drawing');
  const top = project.tracks[index];
  if (!below || top.kind !== 'drawing') return;

  const { width, height } = project.canvas;
  const frameIds = top.isStatic && below.isStatic ? (['static'] as const) : project.frames.map((f) => f.id);

  for (const frameId of frameIds) {
    const topFrameId = top.isStatic ? 'static' : frameId;
    const bottomFrameId = below.isStatic ? 'static' : frameId;
    const [topCel, bottomCel] = await Promise.all([
      getCel(project.id, top.id, topFrameId),
      getCel(project.id, below.id, bottomFrameId),
    ]);
    if (!topCel?.bbox && !bottomCel?.bbox) continue; // both empty — nothing to do

    const merged = bottomCel?.bbox ? decodeCelInto(bottomCel.data, bottomCel.bbox, width, height) : createCelBuffer(width, height);
    if (topCel?.bbox) {
      const topBuf = decodeCelInto(topCel.data, topCel.bbox, width, height);
      for (let i = 0; i < topBuf.length; i++) if (topBuf[i] !== 0) merged[i] = topBuf[i]; // top pixels over bottom
    }

    const bbox = computeTightBBox(merged, width, height);
    if (bbox) {
      const data = encodeCel(merged, width, bbox);
      await putCel({ projectId: project.id, trackId: below.id, frameId: bottomFrameId, version: (bottomCel?.version ?? 0) + 1, bbox, data });
    } else {
      await deleteCel(project.id, below.id, bottomFrameId);
    }
  }

  const tracks = project.tracks.filter((t) => t.id !== trackId);
  const nextCurrent = project.ui.currentTrackId === trackId ? below.id : project.ui.currentTrackId;
  withTracks(project, tracks, nextCurrent);
  await reloadAllTrackData(freshProject(project.id)!);
}

export function warnIfOverTrackLimit(project: Project): boolean {
  return project.tracks.length > SOFT_TRACK_LIMIT;
}

/** A pasted/dropped image goes onto the current reference track; if the current
 * track is a drawing track, a new reference track is created for it first. §10.1. */
export async function importImageAsReference(project: Project, file: Blob): Promise<void> {
  const current = project.tracks.find((t) => t.id === project.ui.currentTrackId);
  if (!current || current.kind !== 'reference') {
    await addReferenceTrack(project);
  }
  const updated = freshProject(project.id);
  if (!updated) return;
  const track = updated.tracks.find((t) => t.id === updated.ui.currentTrackId);
  if (!track) return;
  await importImageToReferenceTrack(updated, track, updated.ui.currentFrameId, file);
}
