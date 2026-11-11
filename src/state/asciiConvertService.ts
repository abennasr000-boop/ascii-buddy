// Turns per-track grid statistics into an AsciiFrame — on the main thread when
// that's trivially cheap (Ramp), in a Web Worker when shape matching is involved.
// Live view, playback cache and onion skin all go through here so they agree.
import type { AsciiFrame, ConversionSettings } from '../types/model';
import type { GridStats } from '../engine/gridStats';
import { effectiveSettings, resolveOccupancy, type OccupancyTrack } from '../engine/occupancy';
import { needsBins, type ConvertContext } from '../engine/asciiConvert';
import type { FrameRequest, FrameResponse } from '../workers/asciiWorker';
import AsciiWorker from '../workers/asciiWorker.ts?worker&inline';

export interface FrameJob {
  columns: number;
  rows: number;
  tracks: OccupancyTrack[];
  stats: Map<string, GridStats>;
  projectConversion: ConversionSettings;
  ctx: ConvertContext;
}

/** True if any visible track that has ink converts with Shape/Hybrid (and has the bins to do it). */
export function jobUsesShape(job: FrameJob): boolean {
  return job.tracks.some((t) => {
    if (!t.visible) return false;
    const stats = job.stats.get(t.trackId);
    return !!stats?.bins && needsBins(effectiveSettings(job.projectConversion, t.conversion, t.celConversion));
  });
}

export function resolveFrameSync(job: FrameJob): AsciiFrame {
  return resolveOccupancy(job.columns, job.rows, job.tracks, job.stats, job.projectConversion, job.ctx);
}

let worker: Worker | null = null;
let workerBroken = false;
let nextId = 1;
const pending = new Map<number, { resolve: (f: AsciiFrame) => void; job: FrameJob }>();

function getWorker(): Worker | null {
  if (workerBroken) return null;
  if (worker) return worker;
  try {
    const w = new AsciiWorker();
    w.onmessage = (e: MessageEvent<FrameResponse>) => {
      const entry = pending.get(e.data.id);
      if (!entry) return;
      pending.delete(e.data.id);
      entry.resolve(e.data.frame ?? resolveFrameSync(entry.job)); // a worker-side error falls back to the main thread
    };
    w.onerror = () => {
      // Worker unavailable or crashed: finish everything on the main thread from now on.
      workerBroken = true;
      worker = null;
      for (const [id, entry] of pending) {
        pending.delete(id);
        entry.resolve(resolveFrameSync(entry.job));
      }
    };
    worker = w;
    return w;
  } catch {
    workerBroken = true;
    return null;
  }
}

/** Converts a frame, off the main thread when it involves shape matching. Always resolves. */
export function resolveFrame(job: FrameJob): Promise<AsciiFrame> {
  if (!jobUsesShape(job)) return Promise.resolve(resolveFrameSync(job));
  const w = getWorker();
  if (!w) return Promise.resolve(resolveFrameSync(job));
  return new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, { resolve, job });
    const req: FrameRequest = {
      id,
      columns: job.columns,
      rows: job.rows,
      tracks: job.tracks,
      stats: [...job.stats],
      projectConversion: job.projectConversion,
      ctx: job.ctx,
    };
    try {
      w.postMessage(req); // stats are structured-cloned, so later in-place edits can't race the worker
    } catch {
      pending.delete(id);
      resolve(resolveFrameSync(job));
    }
  });
}
