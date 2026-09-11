import { signal } from '@preact/signals';

/** Set when IndexedDB couldn't be opened at all (e.g. opened via file://).
 * The app still runs, just without persistence — see ASCII_BUDDY_SPEC.md §3.2. */
export const storageError = signal<string | null>(null);
