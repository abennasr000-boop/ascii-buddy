// Which (track, frame) pairs have a non-empty cel, for the expanded
// timeline's content dots (§9.4). Deliberately separate from celStore.ts's
// `liveCels` (which only ever holds the *current* frame, per §14.3) — this
// is a cheap existence-only summary across every frame, refreshed after
// structural changes and after edits are saved.
import { signal } from '@preact/signals';
import type { ID, Project } from '../types/model';
import { listCelKeysWithContent, listCelOverrideKeys } from '../db/db';

export const frameContentKeys = signal<Set<string>>(new Set());
/** Cels that carry a conversion override (§5.7), shown as a small marker in the timeline. */
export const celOverrideKeys = signal<Set<string>>(new Set());

export async function refreshFrameContent(project: Project): Promise<void> {
  const [content, overrides] = await Promise.all([listCelKeysWithContent(project.id), listCelOverrideKeys(project.id)]);
  frameContentKeys.value = content;
  celOverrideKeys.value = overrides;
}

export function hasCelOverride(trackId: ID, frameId: ID, isStatic: boolean): boolean {
  return celOverrideKeys.value.has(`${trackId}/${isStatic ? 'static' : frameId}`);
}

export function hasFrameContent(trackId: ID, frameId: ID, isStatic: boolean): boolean {
  return frameContentKeys.value.has(`${trackId}/${isStatic ? 'static' : frameId}`);
}
