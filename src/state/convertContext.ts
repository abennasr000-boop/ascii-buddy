// Small helpers shared by every place that turns stats into an AsciiFrame
// (live view, playback cache, onion skin) so they all build the conversion
// context and decide "does this need sub-grid bins" identically.
import type { ConversionOverride, Project } from '../types/model';
import { needsBins, type ConvertContext } from '../engine/asciiConvert';
import { effectiveSettings } from '../engine/occupancy';
import { shapeTemplates } from './shapeTemplates';

export function convertContextFor(project: Project): ConvertContext {
  return {
    templates: shapeTemplates.value?.templates ?? null,
    extended: project.charset === 'extended',
    colorChars: project.colorChars,
  };
}

/** True if this track's cel, under the cascade, uses a style that needs the sub-grid bins. */
export function celNeedsBins(project: Project, trackOverride: ConversionOverride | undefined, celOverride: ConversionOverride | undefined): boolean {
  return needsBins(effectiveSettings(project.conversion, trackOverride, celOverride));
}
