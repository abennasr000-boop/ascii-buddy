// Shared types and helpers for the export code: the errors, progress hooks, the result type and the
// per-export context every format function receives.
import type { Project } from '../types/model';
import type { PixelSize } from '../engine/exportPlan';
import type { ExportOptions } from './options';

export class ExportCancelled extends Error {
  constructor() {
    super('Export cancelled');
    this.name = 'ExportCancelled';
  }
}

/** A problem the user can act on (an unsupported format, a size that's too big…). The message is shown as is. */
export class ExportProblem extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExportProblem';
  }
}

export interface ExportHooks {
  onProgress: (done: number, total: number) => void;
  signal: AbortSignal;
}

export type ExportOutput =
  | { kind: 'file'; blob: Blob; filename: string }
  | { kind: 'text'; text: string };

export const yieldToUi = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export function checkAbort(hooks: ExportHooks): void {
  if (hooks.signal.aborted) throw new ExportCancelled();
}

export interface Ctx {
  project: Project;
  opts: ExportOptions;
  indices: number[];
  durations: number[];
  size: PixelSize;
  hooks: ExportHooks;
  name: (ext: string) => string;
}

export const needsFor = (opts: ExportOptions) => ({ ascii: opts.content === 'ascii', raster: opts.content === 'raster' });
