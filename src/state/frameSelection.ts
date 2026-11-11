// Multi-select state for the timeline's frame strip/grid (§9.1). Long-press (or Shift-tap) starts selecting; taps
// then toggle frames one by one, or — with the Range toggle on — select everything from the anchor. A plain signal, not
// part of the persisted project — selection is a session/UI concept, reset
// per project like the tool state elsewhere.
import { signal } from '@preact/signals';
import type { ID } from '../types/model';

export const selectedFrameIds = signal<Set<ID>>(new Set());
export const frameSelectionAnchor = signal<ID | null>(null);
/** Off (default): tapping frames while selecting toggles them one by one. On: a tap selects the whole range from the anchor. */
export const frameRangeMode = signal(false);

export function isFrameSelected(id: ID): boolean {
  return selectedFrameIds.value.has(id);
}

export function clearFrameSelection(): void {
  if (selectedFrameIds.value.size > 0) selectedFrameIds.value = new Set();
  frameSelectionAnchor.value = null;
  frameRangeMode.value = false;
}

export function selectOnlyFrame(id: ID): void {
  selectedFrameIds.value = new Set([id]);
  frameSelectionAnchor.value = id;
}

export function toggleFrameInSelection(id: ID): void {
  const next = new Set(selectedFrameIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selectedFrameIds.value = next;
  frameSelectionAnchor.value = id;
  if (next.size === 0) frameRangeMode.value = false;
}

/** Shift-tap: extends the selection from the anchor through `targetId` (inclusive), by position in `orderedIds`. */
export function selectFrameRange(orderedIds: ID[], targetId: ID): void {
  const anchor = frameSelectionAnchor.value;
  if (!anchor) {
    selectOnlyFrame(targetId);
    return;
  }
  const a = orderedIds.indexOf(anchor);
  const b = orderedIds.indexOf(targetId);
  if (a === -1 || b === -1) {
    selectOnlyFrame(targetId);
    return;
  }
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  selectedFrameIds.value = new Set(orderedIds.slice(lo, hi + 1));
}
