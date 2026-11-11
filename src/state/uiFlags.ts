// Small one-off UI signals that don't belong to a bigger module.
import { signal } from '@preact/signals';

/** Set true when a stroke tries to use a new color but the project's 255-color
 * table is full (ASCII_BUDDY_SPEC.md §7.1). The Editor shows an alert and resets it. */
export const colorTableFull = signal(false);

/** Opens the Replace color dialog (Edit menu, or long-press a palette swatch). `hex` preselects a color. */
export const replaceColorRequest = signal<{ hex?: string } | null>(null);

/** Opens the "Remove unused colors" confirmation. */
export const removeUnusedRequested = signal(false);
