// Downscales an imported image to at most the canvas size and re-encodes it
// for storage. See ASCII_BUDDY_SPEC.md §10.4: JPEG (~0.85 quality), or PNG if
// the image has any transparency. Never keeps the full-resolution original.
import { planImage, type ImportSize } from './importPlan';

export interface ImportedImage {
  blob: Blob;
  width: number;
  height: number;
}

function hasTransparency(ctx: CanvasRenderingContext2D, width: number, height: number): boolean {
  const { data } = ctx.getImageData(0, 0, width, height);
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 255) return true;
  }
  return false;
}

export async function downscaleImageForImport(source: Blob, maxWidth: number, maxHeight: number): Promise<ImportedImage> {
  const bitmap = await createImageBitmap(source);
  try {
    const scale = Math.min(1, maxWidth / bitmap.width, maxHeight / bitmap.height);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    ctx.drawImage(bitmap, 0, 0, width, height);

    const alpha = hasTransparency(ctx, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, alpha ? 'image/png' : 'image/jpeg', 0.85),
    );
    if (!blob) throw new Error('Failed to encode image');
    return { blob, width, height };
  } finally {
    bitmap.close();
  }
}

/** A stored import: the encoded image plus how to display it (the reference transform's uniform scale). */
export interface RenderedImport extends ImportedImage {
  scale: number;
}

/**
 * Renders any drawable source (decoded image or a video frame) at the stored size the size mode calls for and
 * encodes it — JPEG ~0.85, or PNG if it has transparency (§10.4). `checkAlpha` is off for video frames,
 * which are always opaque (skips a full-frame pixel scan per frame).
 */
export async function renderImportedImage(
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  canvasW: number,
  canvasH: number,
  mode: ImportSize,
  checkAlpha = true,
): Promise<RenderedImport> {
  const plan = planImage(srcW, srcH, canvasW, canvasH, mode);
  const canvas = document.createElement('canvas');
  canvas.width = plan.width;
  canvas.height = plan.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: checkAlpha });
  if (!ctx) throw new Error('2D canvas context unavailable');
  ctx.drawImage(source, plan.draw.dx, plan.draw.dy, plan.draw.dw, plan.draw.dh);
  const alpha = checkAlpha && hasTransparency(ctx, plan.width, plan.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, alpha ? 'image/png' : 'image/jpeg', 0.85));
  if (!blob) throw new Error('Failed to encode image');
  return { blob, width: plan.width, height: plan.height, scale: plan.scale };
}
