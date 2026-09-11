// Canvas shape presets and pixel-size math. See ASCII_BUDDY_SPEC.md §4.2.

export interface CanvasPreset {
  id: string;
  label: string;
  aspect: [number, number];
  /** Only the "Terminal 80×24" preset needs an exact, spec-mandated size
   * instead of the derived one (its ratio doesn't round cleanly). */
  fixedSize?: { width: number; height: number };
}

export const CANVAS_LONG_SIDE = 2048;

export const CANVAS_PRESETS: CanvasPreset[] = [
  { id: '4:3', label: '4:3', aspect: [4, 3] },
  { id: '3:4', label: '3:4', aspect: [3, 4] },
  { id: '16:9', label: '16:9', aspect: [16, 9] },
  { id: '9:16', label: '9:16', aspect: [9, 16] },
  { id: '1:1', label: '1:1', aspect: [1, 1] },
  { id: '3:2', label: '3:2', aspect: [3, 2] },
  { id: '2:3', label: '2:3', aspect: [2, 3] },
  { id: 'terminal', label: 'Terminal 80×24', aspect: [5, 3], fixedSize: { width: 2048, height: 1228 } },
];

function roundToEven(n: number): number {
  return Math.round(n / 2) * 2;
}

/** Long side fixed at 2048px; the short side follows the aspect ratio, rounded to even. */
export function canvasSizeForAspect(aspect: [number, number]): { width: number; height: number } {
  const [aw, ah] = aspect;
  if (aw >= ah) {
    const width = CANVAS_LONG_SIDE;
    const height = roundToEven(Math.round((CANVAS_LONG_SIDE * ah) / aw));
    return { width, height };
  }
  const height = CANVAS_LONG_SIDE;
  const width = roundToEven(Math.round((CANVAS_LONG_SIDE * aw) / ah));
  return { width, height };
}

export function sizeForPreset(preset: CanvasPreset): { width: number; height: number } {
  return preset.fixedSize ?? canvasSizeForAspect(preset.aspect);
}
