// Frame management: add/duplicate/delete/reorder/hold, single and multi-select
// (batch) variants, all undoable (§6.4). See ASCII_BUDDY_SPEC.md §9.1. Cels are
// keyed by frameId, not position, so reordering only touches `project.frames`.
//
// Every operation follows the same order: flush pending edits to IndexedDB
// (so the DB copy the operation reads/copies/deletes is current), change the
// stored cels if needed, then swap the project's frame list and reload the
// live data. The undo/redo closures replay the same steps in reverse.
import type { DrawingCel, Frame, ID, Project, ReferenceCel } from '../types/model';
import { updateProjectData, projects } from './projects';
import { makeId } from '../model/id';
import {
  getCel,
  putCel,
  deleteCel,
  getReferenceCel,
  putReferenceCel,
  getImage,
  putImage,
  deleteImage,
  listCelsForProject,
} from '../db/db';
import { clearFrameSelection } from './frameSelection';
import { reloadAllTrackData } from './canvasData';
import { flush } from './autosave';
import { pushCommand, registerHistoryJump } from './history';
import { isPlaying, stopPlayback } from './playback';
import { liveCels } from './celStore';

export const MIN_HOLD = 1;
export const MAX_HOLD = 99;

function freshProject(id: ID): Project | undefined {
  return projects.value.find((p) => p.id === id);
}

/** Every animated (non-static) track, drawing or reference — the ones that actually have a per-frame cel. */
function animatedTracks(project: Project) {
  return project.tracks.filter((t) => !t.isStatic);
}

// ---- stored-cel helpers -----------------------------------------------------

type AnyCel = DrawingCel | ReferenceCel;

interface CelBackup {
  cels: AnyCel[];
  images: Array<{ id: ID; blob: Blob }>;
}

async function copyFrameCels(project: Project, fromFrameId: ID, toFrameId: ID): Promise<void> {
  for (const track of animatedTracks(project)) {
    if (track.kind === 'drawing') {
      const cel = await getCel(project.id, track.id, fromFrameId);
      if (cel) await putCel({ ...cel, frameId: toFrameId });
    } else {
      const cel = await getReferenceCel(project.id, track.id, fromFrameId);
      if (cel) await putReferenceCel({ ...cel, frameId: toFrameId });
    }
  }
}

/** Snapshots every animated track's stored cel (and reference image bytes) for the given frames. */
async function backupFrameCels(project: Project, frameIds: ID[]): Promise<CelBackup> {
  const cels: AnyCel[] = [];
  const images = new Map<ID, Blob>();
  for (const frameId of frameIds) {
    for (const track of animatedTracks(project)) {
      if (track.kind === 'drawing') {
        const cel = await getCel(project.id, track.id, frameId);
        if (cel) cels.push(cel);
      } else {
        const cel = await getReferenceCel(project.id, track.id, frameId);
        if (!cel) continue;
        cels.push(cel);
        if (!images.has(cel.imageId)) {
          const blob = await getImage(cel.imageId);
          if (blob) images.set(cel.imageId, blob);
        }
      }
    }
  }
  return { cels, images: [...images].map(([id, blob]) => ({ id, blob })) };
}

async function restoreBackup(projectId: ID, backup: CelBackup): Promise<void> {
  for (const image of backup.images) await putImage(image.id, projectId, image.blob);
  for (const cel of backup.cels) {
    if ('imageId' in cel) await putReferenceCel(cel);
    else await putCel(cel);
  }
}

/** Deletes stored images that no remaining cel refers to. Duplicated frames share their source's image, so
 * an image is only removed once nothing uses it. */
export async function pruneUnreferencedImages(project: Project, candidates: Iterable<ID>): Promise<void> {
  const wanted = new Set(candidates);
  if (wanted.size === 0) return;
  const stillUsed = new Set<ID>();
  for (const cel of await listCelsForProject(project.id)) if ('imageId' in cel) stillUsed.add(cel.imageId);
  for (const id of wanted) if (!stillUsed.has(id)) await deleteImage(id);
}

/** Deletes the frames' cels, and any reference image no remaining cel points at. */
async function removeFrameCels(project: Project, frameIds: ID[]): Promise<void> {
  const candidateImages = new Set<ID>();
  for (const frameId of frameIds) {
    for (const track of animatedTracks(project)) {
      if (track.kind === 'reference') {
        const cel = await getReferenceCel(project.id, track.id, frameId);
        if (cel) candidateImages.add(cel.imageId);
      }
      await deleteCel(project.id, track.id, frameId);
    }
  }
  await pruneUnreferencedImages(project, candidateImages);
}

/** True if any animated track has a non-empty cel on this frame. */
export async function frameHasContent(project: Project, frameId: ID): Promise<boolean> {
  for (const track of animatedTracks(project)) {
    if (track.kind === 'drawing') {
      const cel = await getCel(project.id, track.id, frameId);
      if (cel?.bbox) return true;
    } else {
      const cel = await getReferenceCel(project.id, track.id, frameId);
      if (cel) return true;
    }
  }
  return false;
}

// ---- project-state helper + undo plumbing -----------------------------------

interface FramesSnapshot {
  frames: Frame[];
  currentFrameId: ID;
}

function snapshot(project: Project): FramesSnapshot {
  return { frames: project.frames, currentFrameId: project.ui.currentFrameId };
}

/** Swaps in a frame list (and preferred current frame, falling back to the existing current, then the
 * first frame), then reloads live data. Pending edits are flushed first so nothing typed is lost. */
async function applyFramesState(projectId: ID, frames: Frame[], preferredCurrent: ID | null): Promise<void> {
  const project = freshProject(projectId);
  if (!project) return;
  if (isPlaying.value) stopPlayback(projectId);
  await flush();
  const has = (id: ID | null) => id !== null && frames.some((f) => f.id === id);
  const current = has(preferredCurrent) ? preferredCurrent! : has(project.ui.currentFrameId) ? project.ui.currentFrameId : frames[0].id;
  updateProjectData(projectId, { frames, ui: { ...project.ui, currentFrameId: current } });
  await reloadAllTrackData(freshProject(projectId)!);
}

interface CelHooks {
  undoCels?: () => Promise<void>;
  redoCels?: () => Promise<void>;
}

function pushFramesCommand(
  projectId: ID,
  label: string,
  before: FramesSnapshot,
  after: FramesSnapshot,
  hooks: CelHooks = {},
  keepCurrent = false,
): void {
  pushCommand({
    kind: 'action',
    label,
    undo: async () => {
      await flush();
      await hooks.undoCels?.();
      await applyFramesState(projectId, before.frames, keepCurrent ? null : before.currentFrameId);
    },
    redo: async () => {
      await flush();
      await hooks.redoCels?.();
      await applyFramesState(projectId, after.frames, keepCurrent ? null : after.currentFrameId);
    },
  });
}

/** Undo/redo of a stroke elsewhere jumps to its frame and track so the change is visible (§6.4). */
registerHistoryJump(async (frameId, trackId) => {
  const anyCel = liveCels.value.values().next().value;
  const project = anyCel ? freshProject(anyCel.projectId) : undefined;
  if (!project) return false;
  const track = project.tracks.find((t) => t.id === trackId);
  if (!track) return false;
  const targetFrame = frameId === 'static' ? project.ui.currentFrameId : frameId;
  if (!project.frames.some((f) => f.id === targetFrame)) return false;
  if (project.ui.currentFrameId === targetFrame && project.ui.currentTrackId === trackId) return true;
  if (isPlaying.value) stopPlayback(project.id);
  await flush();
  updateProjectData(project.id, { ui: { ...project.ui, currentFrameId: targetFrame, currentTrackId: trackId } });
  await reloadAllTrackData(freshProject(project.id)!);
  return true;
});

// ---- operations -------------------------------------------------------------

export async function addFrame(project: Project): Promise<void> {
  const before = snapshot(project);
  const index = project.frames.findIndex((f) => f.id === project.ui.currentFrameId);
  const frame: Frame = { id: makeId(), duration: 1 };
  const frames = [...project.frames];
  frames.splice(index === -1 ? frames.length : index + 1, 0, frame);
  await applyFramesState(project.id, frames, frame.id);
  pushFramesCommand(project.id, 'New frame', before, { frames, currentFrameId: frame.id });
}

export async function duplicateFrame(project: Project, frameId: ID): Promise<void> {
  await duplicateFrames(project, [frameId]);
}

export async function duplicateFrames(project: Project, frameIds: ID[]): Promise<void> {
  const selected = project.frames.filter((f) => frameIds.includes(f.id));
  if (selected.length === 0) return;
  await flush(); // copy the on-screen edits, not a stale stored version
  const before = snapshot(freshProject(project.id) ?? project);
  const lastIndex = Math.max(...selected.map((f) => project.frames.findIndex((x) => x.id === f.id)));
  const copies: Frame[] = [];
  for (const source of selected) {
    const copy: Frame = { id: makeId(), duration: source.duration };
    await copyFrameCels(project, source.id, copy.id);
    copies.push(copy);
  }
  const frames = [...project.frames];
  frames.splice(lastIndex + 1, 0, ...copies);
  const backup = await backupFrameCels(project, copies.map((c) => c.id));
  clearFrameSelection();
  await applyFramesState(project.id, frames, copies[0].id);
  pushFramesCommand(
    project.id,
    copies.length > 1 ? 'Duplicate frames' : 'Duplicate frame',
    before,
    { frames, currentFrameId: copies[0].id },
    {
      undoCels: () => removeFrameCels(freshProject(project.id) ?? project, copies.map((c) => c.id)),
      redoCels: () => restoreBackup(project.id, backup),
    },
  );
}

export async function deleteFrame(project: Project, frameId: ID): Promise<void> {
  await deleteFrames(project, [frameId]);
}

export async function deleteFrames(project: Project, frameIds: ID[]): Promise<void> {
  const toDelete = new Set(frameIds);
  const frames = project.frames.filter((f) => !toDelete.has(f.id));
  if (frames.length === 0) return; // a project always has at least one frame — §4.3
  const doomed = project.frames.filter((f) => toDelete.has(f.id)).map((f) => f.id);
  if (doomed.length === 0) return;
  await flush(); // so the backup (and the deletion) see the latest drawing
  const before = snapshot(freshProject(project.id) ?? project);
  const currentIndex = project.frames.findIndex((f) => f.id === project.ui.currentFrameId);
  const nextCurrent = toDelete.has(project.ui.currentFrameId)
    ? (frames[Math.min(currentIndex, frames.length - 1)] ?? frames[frames.length - 1]).id
    : project.ui.currentFrameId;
  const backup = await backupFrameCels(project, doomed);
  await removeFrameCels(project, doomed);
  clearFrameSelection();
  await applyFramesState(project.id, frames, nextCurrent);
  pushFramesCommand(
    project.id,
    doomed.length > 1 ? 'Delete frames' : 'Delete frame',
    before,
    { frames, currentFrameId: nextCurrent },
    {
      undoCels: () => restoreBackup(project.id, backup),
      redoCels: () => removeFrameCels(freshProject(project.id) ?? project, doomed),
    },
  );
}

/** Applies durations without touching history — the hold dialog calls this continuously while a
 * slider drags, then records ONE undo step on close via `recordFramesEdit`. */
function setDurations(project: Project, ids: Set<ID>, duration: number): void {
  const clamped = Math.max(MIN_HOLD, Math.min(MAX_HOLD, Math.round(duration)));
  const current = freshProject(project.id) ?? project;
  updateProjectData(project.id, { frames: current.frames.map((f) => (ids.has(f.id) ? { ...f, duration: clamped } : f)) });
}

export function setFrameHold(project: Project, frameId: ID, duration: number): void {
  setDurations(project, new Set([frameId]), duration);
}

export function setFramesHold(project: Project, frameIds: ID[], duration: number): void {
  setDurations(project, new Set(frameIds), duration);
}

/** Pushes one undo step for whatever changed in the frame list since `beforeFrames` was captured. */
export function recordFramesEdit(projectId: ID, beforeFrames: Frame[], label: string): void {
  const project = freshProject(projectId);
  if (!project) return;
  const after = project.frames;
  const unchanged = after.length === beforeFrames.length && after.every((f, i) => f.id === beforeFrames[i].id && f.duration === beforeFrames[i].duration);
  if (unchanged) return;
  pushFramesCommand(
    projectId,
    label,
    { frames: beforeFrames, currentFrameId: project.ui.currentFrameId },
    { frames: after, currentFrameId: project.ui.currentFrameId },
    {},
    true,
  );
}

/** Moves `movingIds` (as a contiguous block, preserving their relative order) to sit
 * right before whatever frame is currently at `targetIndex` in the original array
 * (`targetIndex === frames.length` means the end). */
export async function reorderFrames(project: Project, movingIds: ID[], targetIndex: number): Promise<void> {
  const moving = new Set(movingIds);
  const targetFrame = project.frames[targetIndex];
  const block = project.frames.filter((f) => moving.has(f.id));
  const rest = project.frames.filter((f) => !moving.has(f.id));
  if (block.length === 0) return;
  let insertAt = targetFrame ? rest.findIndex((f) => f.id === targetFrame.id) : rest.length;
  if (insertAt === -1) insertAt = rest.length;
  const frames = [...rest.slice(0, insertAt), ...block, ...rest.slice(insertAt)];
  if (frames.every((f, i) => f.id === project.frames[i].id)) return; // dropped where it already was
  const before = project.frames;
  await applyFramesState(project.id, frames, null);
  recordFramesEdit(project.id, before, 'Reorder frames');
}

export type FrameNavDirection = 'first' | 'previous' | 'next' | 'last';

export function navigateFrame(project: Project, direction: FrameNavDirection): void {
  const frames = project.frames;
  if (frames.length === 0) return;
  const index = frames.findIndex((f) => f.id === project.ui.currentFrameId);
  let nextIndex: number;
  switch (direction) {
    case 'first':
      nextIndex = 0;
      break;
    case 'last':
      nextIndex = frames.length - 1;
      break;
    case 'previous':
      nextIndex = Math.max(0, (index === -1 ? 0 : index) - 1);
      break;
    case 'next':
      nextIndex = Math.min(frames.length - 1, (index === -1 ? 0 : index) + 1);
      break;
  }
  const frame = frames[nextIndex];
  if (frame && frame.id !== project.ui.currentFrameId) {
    updateProjectData(project.id, { ui: { ...project.ui, currentFrameId: frame.id } });
  }
}
