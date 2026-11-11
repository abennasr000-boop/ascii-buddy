// Whether a raster stroke is currently being drawn. The ASCII view uses this
// to show a thin raster preview while the pen is down, converting to
// characters when it lifts — see ASCII_BUDDY_SPEC.md §11.
import { signal } from '@preact/signals';

export const strokeInProgress = signal(false);

/** Number of touch pointers currently down on the canvas, kept in sync by
 * DrawingCanvas's own touch tracking. Other touch-driven UI nested inside the
 * canvas (e.g. ReferenceLayer's transform handles) reads this to detect a
 * second finger arriving mid-drag and hand off to the canvas's own
 * pan/pinch-zoom gesture instead of fighting it for the same pointer. */
export const touchCount = signal(0);
