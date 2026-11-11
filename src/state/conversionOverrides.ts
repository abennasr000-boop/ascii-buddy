// The ASCII window's "Apply to: Project | Track | Cel" (§5.7): reading and
// editing the conversion settings at each cascade level. Project settings live
// in the project JSON, a track override on its Track, a cel override on the
// live cel (persisted with the cel).
import { signal } from '@preact/signals';
import type { ConversionOverride, ConversionSettings, ID, Project } from '../types/model';
import { updateProjectData } from './projects';
import { liveCels } from './celStore';
import { scheduleAutosave } from './autosave';
import { effectiveSettings } from '../engine/occupancy';
import { registerCelShapeChars } from './shapeTemplates';

export type ApplyTo = 'project' | 'track' | 'cel';
export const asciiApplyTo = signal<ApplyTo>('project');

export function isEmptyOverride(o: ConversionOverride | undefined): boolean {
  return !o || Object.keys(o).length === 0;
}

function currentDrawingTrack(project: Project) {
  const t = project.tracks.find((x) => x.id === project.ui.currentTrackId);
  return t?.kind === 'drawing' ? t : undefined;
}

/** Levels the current selection actually supports: Track/Cel need a drawing track (and its live cel) to point at. */
export function availableLevels(project: Project): { track: boolean; cel: boolean } {
  const t = currentDrawingTrack(project);
  return { track: !!t, cel: !!t && liveCels.value.has(t.id) };
}

export function overrideAt(project: Project, level: ApplyTo): ConversionOverride | undefined {
  if (level === 'project') return undefined;
  const t = currentDrawingTrack(project);
  if (!t) return undefined;
  return level === 'track' ? t.conversion : liveCels.value.get(t.id)?.conversion;
}

/** What the controls should show when editing at `level`: the cascade resolved down to that level. */
export function effectiveAt(project: Project, level: ApplyTo): ConversionSettings {
  const t = currentDrawingTrack(project);
  if (level === 'project' || !t) return project.conversion;
  const trackOverride = t.conversion;
  return effectiveSettings(project.conversion, trackOverride, level === 'cel' ? liveCels.value.get(t.id)?.conversion : undefined);
}

function writeOverride(project: Project, level: 'track' | 'cel', trackId: ID, next: ConversionOverride | undefined): void {
  const value = isEmptyOverride(next) ? undefined : next;
  if (level === 'track') {
    updateProjectData(project.id, {
      tracks: project.tracks.map((t) => {
        if (t.id !== trackId) return t;
        const copy = { ...t };
        if (value) copy.conversion = value;
        else delete copy.conversion;
        return copy;
      }),
    });
    return;
  }
  const cel = liveCels.value.get(trackId);
  if (!cel) return;
  const map = new Map(liveCels.value);
  map.set(trackId, { ...cel, conversion: value });
  liveCels.value = map;
  registerCelShapeChars(value?.shapeChars);
  scheduleAutosave(project.id, trackId); // persists with the cel and refreshes the timeline markers
}

export function patchConversion(project: Project, level: ApplyTo, patch: Partial<ConversionSettings>): void {
  if (level === 'project') {
    updateProjectData(project.id, { conversion: { ...project.conversion, ...patch } });
    return;
  }
  const t = currentDrawingTrack(project);
  if (!t) return;
  writeOverride(project, level, t.id, { ...(overrideAt(project, level) ?? {}), ...patch });
}

/** Removes one field's override at the level, so it inherits again. */
export function clearOverrideField(project: Project, level: 'track' | 'cel', key: keyof ConversionSettings): void {
  const t = currentDrawingTrack(project);
  const current = overrideAt(project, level);
  if (!t || !current || !(key in current)) return;
  const next = { ...current };
  delete next[key];
  writeOverride(project, level, t.id, next);
}

/** "Reset to inherited" — clears every override at the level. */
export function resetOverride(project: Project, level: 'track' | 'cel'): void {
  const t = currentDrawingTrack(project);
  if (t) writeOverride(project, level, t.id, undefined);
}
