// Pan/zoom transform for the canvas viewport. See ASCII_BUDDY_SPEC.md §11.
// The stage div is sized to the canvas's pixel dimensions at 1 CSS px per
// canvas px, then `transform: translate(pan) scale(zoom)` positions it —
// so "actual pixels" is simply zoom = 1.
import { signal } from '@preact/signals';

export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 32;

export interface Viewport {
  zoom: number;
  panX: number;
  panY: number;
}

export const viewport = signal<Viewport>({ zoom: 1, panX: 0, panY: 0 });

/** True once the user has deliberately zoomed/panned/pinched. While false, a
 * window resize or rotation re-fits the canvas instead of preserving pan/zoom —
 * see §11 ("if the user has not zoomed or panned, the canvas re-fits"). */
export const userAdjustedViewport = signal(false);

export function clampZoom(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

/** Centers the canvas at the given zoom within an available CSS-px area. */
export function centerAt(zoom: number, canvasWidth: number, canvasHeight: number, availW: number, availH: number) {
  viewport.value = {
    zoom,
    panX: (availW - canvasWidth * zoom) / 2,
    panY: (availH - canvasHeight * zoom) / 2,
  };
}

export function fitToScreen(canvasWidth: number, canvasHeight: number, availW: number, availH: number) {
  const margin = 32;
  const scale = Math.min((availW - margin * 2) / canvasWidth, (availH - margin * 2) / canvasHeight);
  centerAt(clampZoom(scale), canvasWidth, canvasHeight, availW, availH);
  userAdjustedViewport.value = false;
}

export function actualPixels(canvasWidth: number, canvasHeight: number, availW: number, availH: number) {
  centerAt(1, canvasWidth, canvasHeight, availW, availH);
  userAdjustedViewport.value = true;
}

/** Zooms so that the canvas-space point under (anchorX, anchorY) (viewport-local CSS px) stays put. */
export function zoomAround(nextZoom: number, anchorX: number, anchorY: number) {
  const v = viewport.value;
  const z = clampZoom(nextZoom);
  const canvasX = (anchorX - v.panX) / v.zoom;
  const canvasY = (anchorY - v.panY) / v.zoom;
  viewport.value = {
    zoom: z,
    panX: anchorX - canvasX * z,
    panY: anchorY - canvasY * z,
  };
  userAdjustedViewport.value = true;
}

export function panBy(dx: number, dy: number) {
  const v = viewport.value;
  viewport.value = { ...v, panX: v.panX + dx, panY: v.panY + dy };
  userAdjustedViewport.value = true;
}

/** Keeps the same canvas-space point centered when the viewport area is resized
 * (rotation, Split View resize, ...) without changing zoom. */
export function recenterForResize(oldAvailW: number, oldAvailH: number, newAvailW: number, newAvailH: number) {
  const v = viewport.value;
  const canvasCenterX = (oldAvailW / 2 - v.panX) / v.zoom;
  const canvasCenterY = (oldAvailH / 2 - v.panY) / v.zoom;
  viewport.value = {
    zoom: v.zoom,
    panX: newAvailW / 2 - canvasCenterX * v.zoom,
    panY: newAvailH / 2 - canvasCenterY * v.zoom,
  };
}

export function viewportToCanvasPoint(clientX: number, clientY: number): { x: number; y: number } {
  const v = viewport.value;
  return { x: (clientX - v.panX) / v.zoom, y: (clientY - v.panY) / v.zoom };
}

interface ViewportHandlers {
  fit: () => void;
  actual: () => void;
}

let activeHandlers: ViewportHandlers | null = null;

export function registerViewportHandlers(h: ViewportHandlers) {
  activeHandlers = h;
}

export function unregisterViewportHandlers(h: ViewportHandlers) {
  if (activeHandlers === h) activeHandlers = null;
}

export function requestFitToScreen() {
  activeHandlers?.fit();
}

export function requestActualPixels() {
  activeHandlers?.actual();
}
