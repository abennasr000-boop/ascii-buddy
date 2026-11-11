// Resolves which drawing track claims each grid cell when there are several.
// See ASCII_BUDDY_SPEC.md §4.4:
//
//   For each grid cell, walk the visible drawing tracks top to bottom. The
//   first track whose cel has coverage above its effective threshold claims
//   the grid cell. The character and color come only from that track. Tracks
//   below never show in a claimed grid cell, even if they contain ink there.
//   Hidden tracks are skipped completely.
//
// Pure, framework-free, deterministic.
import type { AsciiFrame, ConversionSettings, ConversionOverride } from '../types/model';
import type { GridStats } from './gridStats';
import { convertTrackCells, EMPTY_CONTEXT, type ConvertContext } from './asciiConvert';

export interface OccupancyTrack {
  trackId: string;
  /** 1-based position in the *full* `Project.tracks` stack (index 0 = top → position 1),
   * not just among drawing tracks — this is what ends up in `AsciiFrame.owner`. */
  position: number;
  visible: boolean;
  /** Track-level override (§5.7). */
  conversion?: ConversionOverride;
  /** Cel-level override for this frame's cel, layered on top of the track's (§5.7). */
  celConversion?: ConversionOverride;
}

/** Effective settings = project, overlaid with the track override, overlaid with the cel override (§5.7). */
export function effectiveSettings(
  project: ConversionSettings,
  trackOverride?: ConversionOverride,
  celOverride?: ConversionOverride,
): ConversionSettings {
  return { ...project, ...(trackOverride ?? {}), ...(celOverride ?? {}) };
}

/**
 * `tracksTopToBottom` should be the drawing tracks only (already filtered —
 * reference tracks never take part, §4.4), in stack order, each carrying its
 * true position in the full track stack. `statsByTrack` is keyed by trackId;
 * a track with no entry (e.g. never drawn on) is treated as entirely empty.
 */
export function resolveOccupancy(
  columns: number,
  rows: number,
  tracksTopToBottom: OccupancyTrack[],
  statsByTrack: Map<string, GridStats>,
  projectConversion: ConversionSettings,
  ctx: ConvertContext = EMPTY_CONTEXT,
): AsciiFrame {
  const size = columns * rows;
  const chars = new Uint32Array(size);
  const colors = new Uint8Array(size);
  const owner = new Uint8Array(size);
  const claimed = new Uint8Array(size);

  for (const track of tracksTopToBottom) {
    if (!track.visible) continue; // hidden tracks are skipped completely
    const stats = statsByTrack.get(track.trackId);
    if (!stats) continue; // never drawn on
    const settings = effectiveSettings(projectConversion, track.conversion, track.celConversion);
    // Cells already claimed by tracks above are passed in, so lower tracks never show there (and
    // never pay for shape matching there).
    const cells = convertTrackCells(stats, settings, ctx, claimed);
    for (let i = 0; i < size; i++) {
      if (!cells.claimed[i]) continue;
      claimed[i] = 1;
      if (cells.chars[i]) {
        chars[i] = cells.chars[i];
        colors[i] = stats.dominantColor[i];
        owner[i] = track.position;
      }
    }
  }

  return { columns, rows, chars, colors, owner };
}
