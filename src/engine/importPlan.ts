// Pure planning maths for image and video import. See ASCII_BUDDY_SPEC.md
// §10.2 (options, frame placement), §10.3 (video sampling), §10.4 (storage size).

export type ImportOrder = 'name' | 'selected';
export type ImportSize = 'fit' | 'fill' | 'stretch' | 'original';
export type ImportStartAt = 'first' | 'current' | 'after';

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Natural, case-insensitive comparison: `img2` sorts before `img10`. */
export function naturalCompare(a: string, b: string): number {
  return collator.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0);
}

/** Orders the picked files. "As selected" keeps the picker's order; by name is a stable natural sort. */
export function orderFiles<T extends { name: string }>(files: T[], order: ImportOrder): T[] {
  if (order === 'selected') return [...files];
  return files
    .map((file, index) => ({ file, index }))
    .sort((x, y) => naturalCompare(x.file.name, y.file.name) || x.index - y.index)
    .map((x) => x.file);
}

/** Where the first imported image goes, as a 0-based frame index. */
export function startIndexFor(startAt: ImportStartAt, currentIndex: number, frameCount: number): number {
  if (startAt === 'first') return 0;
  if (startAt === 'current') return Math.max(0, Math.min(frameCount - 1, currentIndex));
  return frameCount;
}

/** The frames an import of `count` images covers: `[start, end)`, and how many new frames must be appended. */
export function importRange(start: number, count: number, frameCount: number): { start: number; end: number; newFrames: number } {
  const end = start + count;
  return { start, end, newFrames: Math.max(0, end - frameCount) };
}

/** §10.2 default: Frame 1 when the project is a single empty frame, otherwise after the last frame. */
export function defaultStartAt(frameCount: number, firstFrameHasContent: boolean): ImportStartAt {
  return frameCount === 1 && !firstFrameHasContent ? 'first' : 'after';
}

export interface ImagePlan {
  /** Size the image is stored at (§10.4: never larger than the canvas, never upscaled unless the mode bakes the canvas shape in). */
  width: number;
  height: number;
  /** Uniform display scale applied to the stored image on the canvas (the reference transform's `scale`). */
  scale: number;
  /** Where the source is drawn inside the stored image. Fill and Stretch bake the canvas shape in, because the
   * reference transform is a uniform scale and the stage doesn't clip — a "cropped" fill must really be cropped. */
  draw: { dx: number; dy: number; dw: number; dh: number };
}

/**
 * How a `srcW × srcH` image is stored and displayed on a `canvasW × canvasH` canvas:
 *  - fit: whole image visible, letterboxed (may upscale a small image);
 *  - fill: covers the canvas and is cropped to it (the crop is baked into the stored image);
 *  - stretch: distorted to exactly the canvas shape (baked in);
 *  - original: native pixel size, centred (larger than the canvas → shrunk to fit, per §10.4).
 */
export function planImage(srcW: number, srcH: number, canvasW: number, canvasH: number, mode: ImportSize): ImagePlan {
  if (mode === 'stretch') return { width: canvasW, height: canvasH, scale: 1, draw: { dx: 0, dy: 0, dw: canvasW, dh: canvasH } };
  if (mode === 'fill') {
    const cover = Math.max(canvasW / srcW, canvasH / srcH);
    const dw = srcW * cover;
    const dh = srcH * cover;
    return { width: canvasW, height: canvasH, scale: 1, draw: { dx: (canvasW - dw) / 2, dy: (canvasH - dh) / 2, dw, dh } };
  }
  const down = Math.min(1, canvasW / srcW, canvasH / srcH);
  const width = Math.max(1, Math.round(srcW * down));
  const height = Math.max(1, Math.round(srcH * down));
  const scale = mode === 'fit' ? Math.min(canvasW / width, canvasH / height) : 1;
  return { width, height, scale, draw: { dx: 0, dy: 0, dw: width, dh: height } };
}

/** Frames a video yields when sampled at `fps` between `start` and `end` seconds (at least 1). */
export function videoFrameCount(start: number, end: number, fps: number): number {
  return Math.max(1, Math.round((end - start) * fps));
}

/** Time of each sampled frame: `start + i / fps`, kept inside the video so the last seek is always valid. */
export function videoSampleTimes(start: number, end: number, fps: number, duration: number): number[] {
  const n = videoFrameCount(start, end, fps);
  const last = Math.max(0, duration - 0.001);
  return Array.from({ length: n }, (_, i) => Math.min(last, Math.max(0, start + i / fps)));
}

/** §10.3: warn above this many frames (memory and storage). */
export const VIDEO_FRAME_WARNING = 300;
