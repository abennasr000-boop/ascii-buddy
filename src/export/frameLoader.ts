// Loads one frame's artwork for export straight from storage: its ASCII conversion and the visible
// drawing tracks' pixels. Exports always convert from the stored cels at the requested output size — never
// from what happens to be on screen — so they don't depend on zoom, the current view or the live canvas.
// Reference tracks, hidden tracks, onion skin, the grid overlay and selections are never included (§15.1).
import type { AsciiFrame, ConversionOverride, ID, Project } from '../types/model';
import { rowsFor } from '../types/model';
import { getCel } from '../db/db';
import { decodeCelInto } from '../engine/celCodec';
import { computeFullGridStats, type GridStats } from '../engine/gridStats';
import type { OccupancyTrack } from '../engine/occupancy';
import { buildLUT, celRegionToImageData } from '../engine/lut';
import { resolveFrame } from '../state/asciiConvertService';
import { celNeedsBins, convertContextFor } from '../state/convertContext';
import { ensureShapeTemplates, registerCelShapeChars } from '../state/shapeTemplates';

export interface ArtFrame {
  index: number;
  frameId: ID;
  /** Null when the export didn't ask for ASCII. */
  ascii: AsciiFrame | null;
  /** Paints the visible drawing tracks (bottom to top, nearest-neighbour) onto a canvas of `w × h`. */
  paintRaster: (ctx: CanvasRenderingContext2D, w: number, h: number, smooth?: boolean) => void;
  /** Frees the per-frame layer canvases. */
  release: () => void;
}

export interface FrameLoader {
  load(index: number, needs: { ascii: boolean; raster: boolean }): Promise<ArtFrame>;
  dispose(): void;
}

export function createFrameLoader(project: Project): FrameLoader {
  const { width, height } = project.canvas;
  const rows = rowsFor(project.grid.columns, width, height);
  const lut = buildLUT(project.colors);
  const drawingTracks = project.tracks.filter((t) => t.visible && t.kind === 'drawing');
  const occupancyTracks: OccupancyTrack[] = project.tracks
    .map((track, i) => ({ track, position: i + 1 }))
    .filter(({ track }) => drawingTracks.some((t) => t.id === track.id))
    .map(({ track, position }) => ({ trackId: track.id, position, visible: track.visible, conversion: track.conversion }));

  // One full-size scratch canvas per layer, reused from frame to frame.
  const pool: HTMLCanvasElement[] = [];
  const canvasAt = (i: number): HTMLCanvasElement => {
    if (!pool[i]) {
      const c = document.createElement('canvas');
      c.width = width;
      c.height = height;
      pool[i] = c;
    }
    return pool[i];
  };

  return {
    async load(index, needs) {
      const frame = project.frames[index];
      const layers: HTMLCanvasElement[] = [];
      const statsByTrack = new Map<ID, GridStats>();
      const celOverrides = new Map<ID, ConversionOverride | undefined>();
      let anyBins = false;

      // Bottom-to-top, so later layers paint over earlier ones.
      for (const track of [...drawingTracks].reverse()) {
        const cel = await getCel(project.id, track.id, track.isStatic ? 'static' : frame.id);
        if (!cel?.bbox) continue;
        const buf = decodeCelInto(cel.data, cel.bbox, width, height);
        if (needs.raster) {
          const layer = canvasAt(layers.length);
          const lctx = layer.getContext('2d')!;
          lctx.clearRect(0, 0, width, height);
          lctx.putImageData(celRegionToImageData(buf, width, lut, 0, 0, width, height), 0, 0);
          layers.push(layer);
        }
        if (needs.ascii) {
          registerCelShapeChars(cel.conversion?.shapeChars);
          const wantBins = celNeedsBins(project, track.conversion, cel.conversion);
          anyBins = anyBins || wantBins;
          celOverrides.set(track.id, cel.conversion);
          statsByTrack.set(track.id, computeFullGridStats(buf, width, height, project.grid.columns, rows, wantBins));
        }
      }

      let ascii: AsciiFrame | null = null;
      if (needs.ascii) {
        if (anyBins) await ensureShapeTemplates(project); // Shape/Hybrid match against rendered glyph templates
        ascii = await resolveFrame({
          columns: project.grid.columns,
          rows,
          tracks: occupancyTracks.map((t) => ({ ...t, celConversion: celOverrides.get(t.trackId) })),
          stats: statsByTrack,
          projectConversion: project.conversion,
          ctx: convertContextFor(project),
        });
      }

      return {
        index,
        frameId: frame.id,
        ascii,
        paintRaster(ctx, w, h, smooth = false) {
          ctx.save();
          // Exports scale hard-edged (crisp pixel art); only tiny previews are smoothed, or thin lines vanish into dots.
          ctx.imageSmoothingEnabled = smooth;
          ctx.imageSmoothingQuality = 'high';
          for (const layer of layers) ctx.drawImage(layer, 0, 0, width, height, 0, 0, w, h);
          ctx.restore();
        },
        release() {
          layers.length = 0;
        },
      };
    },
    dispose() {
      for (const c of pool) {
        c.width = 0;
        c.height = 0;
      }
      pool.length = 0;
    },
  };
}
