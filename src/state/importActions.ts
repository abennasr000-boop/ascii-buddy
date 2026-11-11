// Bulk image import and video import (§10.2, §10.3). One image per frame, on a
// new or existing reference track, sized per the chosen option, with progress and
// Cancel, and the whole import is ONE undo step.
//
// Two phases keep Cancel and Undo simple:
//  A. Produce: decode/extract each item, render it at its stored size and write the
//     image to storage (journaled). Nothing in the project changes yet, so Cancel just
//     deletes what was written.
//  B. Commit (quick, all-or-nothing): create the missing frames and the track, write
//     the reference cels (backing up any cels being replaced), update the project, and
//     push a single history command that can remove/restore all of it.
import type { Frame, ID, Project, ReferenceCel, Track } from '../types/model';
import { projects, updateProjectData } from './projects';
import { makeId } from '../model/id';
import { flush } from './autosave';
import { pushCommand } from './history';
import { reloadAllTrackData } from './canvasData';
import { isPlaying, stopPlayback } from './playback';
import { nextReferenceName } from './tracksActions';
import { pruneUnreferencedImages } from './framesActions';
import { deleteCel, deleteImage, getImage, getReferenceCel, putImage, putReferenceCel } from '../db/db';
import { renderImportedImage } from '../engine/imageImport';
import {
  importRange,
  orderFiles,
  startIndexFor,
  videoFrameCount,
  videoSampleTimes,
  type ImportOrder,
  type ImportSize,
  type ImportStartAt,
} from '../engine/importPlan';
import type { VideoHandle } from './videoImport';

export type ImportTarget = { kind: 'new' } | { kind: 'existing'; trackId: ID };

export interface ImportOptions {
  size: ImportSize;
  startAt: ImportStartAt;
  target: ImportTarget;
}

export type ImportSource =
  | { kind: 'images'; files: File[]; order: ImportOrder }
  | { kind: 'video'; handle: VideoHandle; start: number; end: number; fps: number; setProjectFps: boolean };

export interface ImportResult {
  cancelled: boolean;
  /** Frames that received an image. */
  imported: number;
  /** Files that couldn't be decoded and were left out. */
  failures: string[];
  /** 1-based, inclusive; 0 when nothing was imported. */
  firstFrame: number;
  lastFrame: number;
  trackName: string;
}

export interface ImportHooks {
  onProgress: (done: number, total: number) => void;
  signal: AbortSignal;
}

function fresh(id: ID): Project | undefined {
  return projects.value.find((p) => p.id === id);
}

export function itemCount(source: ImportSource): number {
  return source.kind === 'images' ? source.files.length : videoFrameCount(source.start, source.end, source.fps);
}

/** What the import will do, for the dialog's summary line. Frame numbers are 1-based and inclusive. */
export function describeImport(project: Project, count: number, options: ImportOptions) {
  const currentIndex = Math.max(0, project.frames.findIndex((f) => f.id === project.ui.currentFrameId));
  const start = startIndexFor(options.startAt, currentIndex, project.frames.length);
  const range = importRange(start, count, project.frames.length);
  const trackName =
    options.target.kind === 'new' ? nextReferenceName(project) : (project.tracks.find((t) => t.id === (options.target as { trackId: ID }).trackId)?.name ?? 'track');
  return { firstFrame: range.start + 1, lastFrame: range.end, newFrames: range.newFrames, trackName, isNewTrack: options.target.kind === 'new' };
}

/** How many existing cels on the target track the import would replace (they need confirmation, §10.2). */
export async function countReplacedCels(project: Project, count: number, options: ImportOptions): Promise<number> {
  if (options.target.kind !== 'existing') return 0;
  const trackId = options.target.trackId;
  const currentIndex = Math.max(0, project.frames.findIndex((f) => f.id === project.ui.currentFrameId));
  const range = importRange(startIndexFor(options.startAt, currentIndex, project.frames.length), count, project.frames.length);
  let n = 0;
  for (let i = range.start; i < Math.min(range.end, project.frames.length); i++) {
    if (await getReferenceCel(project.id, trackId, project.frames[i].id)) n++;
  }
  return n;
}

interface Produced {
  imageId: ID;
  scale: number;
}

interface ReplacedCel {
  cel: ReferenceCel;
  blob: Blob | undefined;
}

interface Snapshot {
  frames: Frame[];
  tracks: Track[];
  fps: number;
  currentFrameId: ID;
  currentTrackId: ID;
}

function snapshotOf(project: Project): Snapshot {
  return {
    frames: project.frames,
    tracks: project.tracks,
    fps: project.fps,
    currentFrameId: project.ui.currentFrameId,
    currentTrackId: project.ui.currentTrackId,
  };
}

async function applySnapshot(projectId: ID, snap: Snapshot): Promise<void> {
  const project = fresh(projectId);
  if (!project) return;
  if (isPlaying.value) stopPlayback(projectId);
  await flush();
  updateProjectData(projectId, {
    frames: snap.frames,
    tracks: snap.tracks,
    fps: snap.fps,
    ui: { ...project.ui, currentFrameId: snap.currentFrameId, currentTrackId: snap.currentTrackId },
  });
  await reloadAllTrackData(fresh(projectId)!);
}

export async function runImport(projectId: ID, source: ImportSource, options: ImportOptions, hooks: ImportHooks): Promise<ImportResult> {
  const project = fresh(projectId);
  if (!project) throw new Error('Project not found.');
  const { width: cw, height: ch } = project.canvas;
  const total = itemCount(source);
  const files = source.kind === 'images' ? orderFiles(source.files, source.order) : [];
  const times = source.kind === 'video' ? videoSampleTimes(source.start, source.end, source.fps, source.handle.duration) : [];

  // ---- Phase A: produce and store the images ----
  const journal: ID[] = [];
  const produced: Produced[] = [];
  const failures: string[] = [];
  const rollback = async () => {
    for (const id of journal) await deleteImage(id).catch(() => undefined);
  };

  try {
    for (let i = 0; i < total; i++) {
      if (hooks.signal.aborted) {
        await rollback();
        return { cancelled: true, imported: 0, failures, firstFrame: 0, lastFrame: 0, trackName: '' };
      }
      try {
        let rendered;
        if (source.kind === 'images') {
          const bitmap = await createImageBitmap(files[i]);
          try {
            rendered = await renderImportedImage(bitmap, bitmap.width, bitmap.height, cw, ch, options.size);
          } finally {
            bitmap.close();
          }
        } else {
          await source.handle.seek(times[i]);
          rendered = await renderImportedImage(source.handle.element, source.handle.width, source.handle.height, cw, ch, options.size, false);
        }
        const imageId = makeId();
        await putImage(imageId, projectId, rendered.blob);
        journal.push(imageId);
        produced.push({ imageId, scale: rendered.scale });
      } catch (err) {
        if (source.kind === 'video') throw err; // a broken video can't be partially imported
        failures.push(files[i].name); // an unreadable image is skipped; the next one takes its frame
      }
      hooks.onProgress(i + 1, total);
    }
  } catch (err) {
    await rollback();
    throw err;
  }
  if (hooks.signal.aborted) {
    await rollback();
    return { cancelled: true, imported: 0, failures, firstFrame: 0, lastFrame: 0, trackName: '' };
  }
  if (produced.length === 0) return { cancelled: false, imported: 0, failures, firstFrame: 0, lastFrame: 0, trackName: '' };

  // ---- Phase B: commit ----
  await flush(); // commit pending edits/selection before the structure changes
  const before = fresh(projectId)!;
  const beforeSnap = snapshotOf(before);
  const currentIndex = Math.max(0, before.frames.findIndex((f) => f.id === before.ui.currentFrameId));
  const range = importRange(startIndexFor(options.startAt, currentIndex, before.frames.length), produced.length, before.frames.length);

  // frames
  const newFrames: Frame[] = Array.from({ length: range.newFrames }, () => ({ id: makeId(), duration: 1 }));
  const allFrames = [...before.frames, ...newFrames];
  const targetFrameIds = produced.map((_, k) => allFrames[range.start + k].id);

  // track
  let track: Track;
  let tracks = before.tracks;
  if (options.target.kind === 'new') {
    track = { id: makeId(), name: nextReferenceName(before), kind: 'reference', isStatic: false, visible: true, locked: false, opacity: 0.5 };
    const at = Math.max(0, before.tracks.findIndex((t) => t.id === before.ui.currentTrackId));
    tracks = [...before.tracks];
    tracks.splice(at, 0, track);
  } else {
    const trackId = options.target.trackId;
    const existing = before.tracks.find((t) => t.id === trackId && t.kind === 'reference');
    if (!existing) {
      await rollback();
      throw new Error('That reference track no longer exists.');
    }
    track = existing;
  }

  // cels being replaced (existing track only) — backed up so Undo can restore them
  const replaced: ReplacedCel[] = [];
  for (const frameId of targetFrameIds) {
    const cel = await getReferenceCel(projectId, track.id, frameId);
    if (cel) replaced.push({ cel, blob: await getImage(cel.imageId) });
  }

  const transformFor = (scale: number) => ({ x: cw / 2, y: ch / 2, scale, rotation: 0 });
  const newCels: ReferenceCel[] = produced.map((p, k) => ({
    projectId,
    trackId: track.id,
    frameId: targetFrameIds[k],
    imageId: p.imageId,
    transform: transformFor(p.scale),
  }));
  for (const cel of newCels) await putReferenceCel(cel);
  await pruneUnreferencedImages(before, replaced.map((r) => r.cel.imageId));

  const fps = source.kind === 'video' && source.setProjectFps ? Math.max(1, Math.min(60, Math.round(source.fps))) : before.fps;
  const afterSnap: Snapshot = { frames: allFrames, tracks, fps, currentFrameId: targetFrameIds[0], currentTrackId: track.id };
  await applySnapshot(projectId, afterSnap);

  // ---- one undo step for everything ----
  let savedBlobs: Array<Blob | undefined> = [];
  pushCommand({
    kind: 'action',
    label: source.kind === 'video' ? 'Import video' : 'Import images',
    undo: async () => {
      await flush();
      savedBlobs = await Promise.all(newCels.map((c) => getImage(c.imageId))); // kept in memory so Redo can bring them back
      for (const c of newCels) await deleteCel(projectId, c.trackId, c.frameId);
      for (const c of newCels) await deleteImage(c.imageId);
      for (const r of replaced) {
        if (r.blob) await putImage(r.cel.imageId, projectId, r.blob);
        await putReferenceCel(r.cel);
      }
      await applySnapshot(projectId, beforeSnap);
    },
    redo: async () => {
      await flush();
      for (let k = 0; k < newCels.length; k++) {
        const blob = savedBlobs[k];
        if (blob) await putImage(newCels[k].imageId, projectId, blob);
        await putReferenceCel(newCels[k]);
      }
      const current = fresh(projectId);
      if (current) await pruneUnreferencedImages(current, replaced.map((r) => r.cel.imageId));
      savedBlobs = [];
      await applySnapshot(projectId, afterSnap);
    },
  });

  return {
    cancelled: false,
    imported: produced.length,
    failures,
    firstFrame: range.start + 1,
    lastFrame: range.start + produced.length,
    trackName: track.name,
  };
}
