// Whether a raster stroke is currently being drawn. The ASCII view uses this
// to show a thin raster preview while the pen is down, converting to
// characters when it lifts — see ASCII_BUDDY_SPEC.md §11.
import { signal } from '@preact/signals';

export const strokeInProgress = signal(false);
