// Pure planning maths for exports: output sizes, frame ranges, frame timing, file names and
// sprite-sheet layout. Framework-free so it can be unit tested — see ASCII_BUDDY_SPEC.md §15.

/** iOS Safari refuses canvases above 16,777,216 pixels (4096 × 4096); every export canvas must fit. */
export const MAX_EXPORT_PIXELS = 16_777_216;
/** The longest side any export canvas may have. */
export const MAX_EXPORT_SIDE = 16_384;

export type ExportSize = { kind: 'scale'; scale: number } | { kind: 'width'; width: number };
export type FrameSelection = 'current' | 'all' | 'range';

export interface PixelSize {
  width: number;
  height: number;
}

/** The output size for a canvas of `canvasW × canvasH` at the chosen size. `even` rounds up to even
 * numbers, which H.264 requires. */
export function outputSize(canvasW: number, canvasH: number, size: ExportSize, even = false): PixelSize {
  let width = size.kind === 'scale' ? canvasW * size.scale : size.width;
  width = Math.max(1, Math.round(width));
  let height = Math.max(1, Math.round((width * canvasH) / canvasW));
  if (even) {
    if (width % 2) width += 1;
    if (height % 2) height += 1;
  }
  return { width, height };
}

/** Null when the size can be rendered, otherwise a short explanation. */
export function sizeProblem(size: PixelSize): string | null {
  if (size.width < 1 || size.height < 1) return 'The size must be at least 1 pixel.';
  if (size.width > MAX_EXPORT_SIDE || size.height > MAX_EXPORT_SIDE || size.width * size.height > MAX_EXPORT_PIXELS) {
    return `${size.width} × ${size.height} is more than this device can render (about ${Math.round(MAX_EXPORT_PIXELS / 1_000_000)} megapixels). Pick a smaller size.`;
  }
  return null;
}

/** The zero-based frame indices an export covers. `from`/`to` are 1-based and inclusive, in either order. */
export function selectFrameIndices(total: number, selection: FrameSelection, currentIndex: number, from: number, to: number): number[] {
  if (total <= 0) return [];
  if (selection === 'current') return [Math.max(0, Math.min(total - 1, currentIndex))];
  if (selection === 'all') return Array.from({ length: total }, (_, i) => i);
  const a = Math.max(1, Math.min(total, Math.round(Math.min(from, to))));
  const b = Math.max(1, Math.min(total, Math.round(Math.max(from, to))));
  return Array.from({ length: b - a + 1 }, (_, i) => a - 1 + i);
}

/** GIF frame delays in whole hundredths of a second. Rounding is cumulative, so the animation's total
 * length stays right even when individual holds don't divide evenly; nothing goes below 2 cs (20 ms),
 * because browsers treat shorter delays as 100 ms. */
export function gifDelaysCs(durations: number[], fps: number): number[] {
  const safeFps = Math.max(1, fps);
  const out: number[] = [];
  let ticks = 0;
  let emitted = 0;
  for (const d of durations) {
    ticks += Math.max(1, d);
    const target = Math.round((ticks * 100) / safeFps);
    const delay = Math.max(2, target - emitted);
    out.push(delay);
    emitted += delay;
  }
  return out;
}

/** GIF can't show a frame for under 2 cs, so above 50 fps the animation would play slower than set. */
export const GIF_MAX_FPS = 50;

export interface TimedFrame {
  index: number; // position in the exported frame list
  start: number; // seconds
  duration: number; // seconds
}

/** Frame timestamps for a video: every frame is shown for its hold, the whole sequence `repeat` times. */
export function videoTimeline(durations: number[], fps: number, repeat: number): TimedFrame[] {
  const safeFps = Math.max(1, fps);
  const out: TimedFrame[] = [];
  let t = 0;
  for (let r = 0; r < Math.max(1, Math.round(repeat)); r++) {
    for (let i = 0; i < durations.length; i++) {
      const duration = Math.max(1, durations[i]) / safeFps;
      out.push({ index: i, start: t, duration });
      t += duration;
    }
  }
  return out;
}

/** Replaces each frame by `duration` copies of itself (a hold becomes repeated frames). */
export function expandHolds<T>(items: T[], durations: number[]): T[] {
  const out: T[] = [];
  items.forEach((item, i) => {
    for (let n = 0; n < Math.max(1, durations[i]); n++) out.push(item);
  });
  return out;
}

const FILE_NAME_FORBIDDEN = /[\\/:*?"<>|\u0000-\u001f]+/g;

export function safeFileBase(name: string): string {
  const cleaned = name.replace(FILE_NAME_FORBIDDEN, '-').replace(/\s+/g, ' ').trim().replace(/^\.+/, '');
  return cleaned || 'untitled';
}

export function pad(n: number, width = 4): string {
  return String(Math.max(0, Math.round(n))).padStart(width, '0');
}

/** `<project-name>_<ascii|raster>[_f0004].<ext>` (§15.1). `frameNumber` is 1-based; leave it out for multi-frame files. */
export function exportFileName(projectName: string, content: 'ascii' | 'raster', ext: string, frameNumber?: number): string {
  return `${safeFileBase(projectName)}_${content}${frameNumber !== undefined ? `_f${pad(frameNumber)}` : ''}.${ext}`;
}

export interface SheetLayout {
  columns: number;
  rows: number;
  width: number;
  height: number;
  rects: Array<{ x: number; y: number; w: number; h: number }>;
}

/** A grid of `count` equally sized cells. `columns` = 0 picks a roughly square arrangement. */
export function spriteSheetLayout(count: number, columns: number, cellW: number, cellH: number): SheetLayout {
  const n = Math.max(1, count);
  const cols = columns > 0 ? Math.min(n, Math.round(columns)) : Math.max(1, Math.ceil(Math.sqrt((n * cellH) / cellW)));
  const rows = Math.ceil(n / cols);
  const rects = Array.from({ length: count }, (_, i) => ({ x: (i % cols) * cellW, y: Math.floor(i / cols) * cellH, w: cellW, h: cellH }));
  return { columns: cols, rows, width: cols * cellW, height: rows * cellH, rects };
}
