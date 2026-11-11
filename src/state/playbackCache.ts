// Precomputes per-frame playback data ahead of starting playback, so the
// rAF loop in state/playback.ts only ever does a cheap signal swap per tick
// instead of an async IndexedDB read + full grid-stats recompute. See
// ASCII_BUDDY_SPEC.md §9.2, §14.3.
//
// Reference tracks ARE composited per playback frame: a video import puts a
// different image on every frame, so playing them frozen at the first frame's
// image (the original Phase 4 shortcut) shows a stuck picture. Each frame's raster
// is the exact composite of every visible track in stack order (drawing +
// reference, with each reference's transform and opacity), and a second,
// references-only bitmap feeds ASCII view, where references are traced under the
// characters. Both share the one reduced-resolution budget (§14.3).
import type { AsciiFrame, ID, Project } from '../types/model';
import { rowsFor } from '../types/model';
import { signal } from '@preact/signals';
import { getCel, getImage, getReferenceCel } from '../db/db';
import { hideAllReferences } from './viewSettings';
import { decodeCelInto } from '../engine/celCodec';
import { computeFullGridStats, type GridStats } from '../engine/gridStats';
import type { OccupancyTrack } from '../engine/occupancy';
import { resolveFrame } from './asciiConvertService';
import type { ConversionOverride } from '../types/model';
import { convertContextFor, celNeedsBins } from './convertContext';
import { ensureShapeTemplates, registerCelShapeChars } from './shapeTemplates';
import { buildLUT, celRegionToImageData } from '../engine/lut';

export interface PlaybackFrameData {
  ascii: AsciiFrame;
  // Scaled to fit the whole animation in RASTER_BUDGET_BYTES (below) when the
  // canvas is large or there are many frames — PlaybackCanvas draws it scaled
  // back up to the full canvas size, which is exactly §14.3's "render frames
  // at reduced resolution instead" fallback, applied uniformly up front.
  raster: ImageBitmap;
  /** Just the reference tracks (their opacity baked in), for ASCII view; absent when there are none. */
  refs?: ImageBitmap;
}

export const playbackCache = signal<Map<ID, PlaybackFrameData>>(new Map());
export const playbackPreparing = signal<{ done: number; total: number } | null>(null);

const RASTER_BUDGET_BYTES = 150 * 1024 * 1024; // §14.3's "about 150 MB"

export function clearPlaybackCache(): void {
  for (const data of playbackCache.value.values()) {
    data.raster?.close();
    data.refs?.close();
  }
  playbackCache.value = new Map();
}

let buildGeneration = 0;

export async function buildPlaybackCache(project: Project): Promise<void> {
  clearPlaybackCache();
  const myGeneration = ++buildGeneration;
  const frames = project.frames;
  const showRefs = !hideAllReferences.value;
  // Every visible track that shows in Raster view, in stack order (index 0 = top).
  const visibleTracks = project.tracks.filter((t) => t.visible && (t.kind === 'drawing' || showRefs));
  const tracks = visibleTracks.filter((t) => t.kind === 'drawing');
  const refTracks = visibleTracks.filter((t) => t.kind === 'reference');
  const hasRefs = refTracks.length > 0;
  const { width, height } = project.canvas;
  const rows = rowsFor(project.grid.columns, width, height);
  const lut = buildLUT(project.colors);
  const occupancyTracks: OccupancyTrack[] = project.tracks
    .map((t, index) => ({ track: t, position: index + 1 }))
    .filter(({ track }) => tracks.some((vt) => vt.id === track.id))
    .map(({ track, position }) => ({ trackId: track.id, position, visible: track.visible, conversion: track.conversion }));

  // §14.3: "if the raster playback cache exceeds its budget, render frames on
  // the fly at reduced resolution instead." A long animation at full canvas
  // resolution (e.g. 48 frames at 2048×1536 ≈ 576 MB) would otherwise only
  // fit a handful of frames before the budget runs out, leaving the rest
  // blank for most of playback — so every frame is cached at ONE shared,
  // budget-fitting resolution up front, rather than caching some frames at
  // full size and dropping the rest entirely. With reference tracks present
  // each frame holds two bitmaps, so the budget is split between them.
  const fullFrameBytes = width * height * 4;
  const bitmapsPerFrame = hasRefs ? 2 : 1;
  const scale = Math.min(1, Math.sqrt(RASTER_BUDGET_BYTES / (fullFrameBytes * Math.max(1, frames.length) * bitmapsPerFrame)));
  const cacheWidth = Math.max(1, Math.round(width * scale));
  const cacheHeight = Math.max(1, Math.round(height * scale));

  // Composite straight at the reduced cache size (no full-resolution intermediate canvas to clear, fill and
  // then shrink for every frame) — a long animation with a photographic reference on every frame used to
  // take several seconds longer to prepare than it needed to.
  const comp = document.createElement('canvas');
  comp.width = cacheWidth;
  comp.height = cacheHeight;
  const cctx = comp.getContext('2d');
  const refCanvas = document.createElement('canvas');
  refCanvas.width = cacheWidth;
  refCanvas.height = cacheHeight;
  const rctx = refCanvas.getContext('2d');
  if (!cctx || !rctx) return;
  // Hard-edged downscale keeps drawn pixel art crisp; photographic references are smoothed instead
  // (nearest-neighbour shrinking a photo 4× looks like noise). Set per draw call below.
  cctx.imageSmoothingQuality = 'high';
  rctx.imageSmoothingQuality = 'high';

  playbackPreparing.value = { done: 0, total: frames.length };
  const map = new Map<ID, PlaybackFrameData>();
  const abandon = () => {
    for (const data of map.values()) {
      data.raster.close();
      data.refs?.close();
    }
  };

  // Static reference images repeat on every frame — decode each stored image once.
  let lastImageId: ID | null = null;
  let lastBitmap: ImageBitmap | null = null;

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    cctx.clearRect(0, 0, cacheWidth, cacheHeight);
    rctx.clearRect(0, 0, cacheWidth, cacheHeight);
    const statsByTrack = new Map<ID, GridStats>();
    const celOverrides = new Map<ID, ConversionOverride | undefined>();
    let anyBins = false;

    // Bottom-to-top so later drawImage calls paint the topmost track last.
    for (const track of [...visibleTracks].reverse()) {
      const frameId = track.isStatic ? 'static' : frame.id;

      if (track.kind === 'reference') {
        const cel = await getReferenceCel(project.id, track.id, frameId);
        if (!cel) continue;
        if (cel.imageId !== lastImageId) {
          lastBitmap?.close();
          lastBitmap = null;
          lastImageId = cel.imageId;
          const blob = await getImage(cel.imageId);
          if (blob) lastBitmap = await createImageBitmap(blob).catch(() => null);
        }
        if (!lastBitmap) continue;
        for (const ctx of [cctx, rctx]) {
          ctx.save();
          ctx.imageSmoothingEnabled = true;
          ctx.globalAlpha = track.opacity;
          ctx.scale(scale, scale); // canvas coordinates → cache coordinates
          ctx.translate(cel.transform.x, cel.transform.y);
          ctx.rotate(cel.transform.rotation);
          ctx.scale(cel.transform.scale, cel.transform.scale);
          ctx.drawImage(lastBitmap, -lastBitmap.width / 2, -lastBitmap.height / 2);
          ctx.restore();
        }
        continue;
      }

      const cel = await getCel(project.id, track.id, frameId);
      if (!cel?.bbox) continue;
      const buf = decodeCelInto(cel.data, cel.bbox, width, height);
      registerCelShapeChars(cel.conversion?.shapeChars);
      const wantBins = celNeedsBins(project, track.conversion, cel.conversion);
      anyBins = anyBins || wantBins;
      celOverrides.set(track.id, cel.conversion);
      statsByTrack.set(track.id, computeFullGridStats(buf, width, height, project.grid.columns, rows, wantBins));
      const img = celRegionToImageData(buf, width, lut, 0, 0, width, height);
      const layer = document.createElement('canvas');
      layer.width = width;
      layer.height = height;
      layer.getContext('2d')?.putImageData(img, 0, 0);
      cctx.imageSmoothingEnabled = false;
      cctx.drawImage(layer, 0, 0, width, height, 0, 0, cacheWidth, cacheHeight);
    }

    if (anyBins) await ensureShapeTemplates(project); // Shape/Hybrid need the glyph templates
    const perFrameTracks = occupancyTracks.map((t) => ({ ...t, celConversion: celOverrides.get(t.trackId) }));
    const ascii = await resolveFrame({
      columns: project.grid.columns,
      rows,
      tracks: perFrameTracks,
      stats: statsByTrack,
      projectConversion: project.conversion,
      ctx: convertContextFor(project),
    });

    const raster = await createImageBitmap(comp);
    const refs = hasRefs ? await createImageBitmap(refCanvas) : undefined;

    if (myGeneration !== buildGeneration) {
      // superseded — abandon and let the newer build own the cache
      raster.close();
      refs?.close();
      abandon();
      lastBitmap?.close();
      return;
    }
    map.set(frame.id, { ascii, raster, refs });
    playbackPreparing.value = { done: i + 1, total: frames.length };
    if (i % 4 === 3) await new Promise((r) => setTimeout(r, 0)); // yield so the UI (progress indicator) stays responsive
  }
  lastBitmap?.close();

  if (myGeneration !== buildGeneration) {
    abandon();
    return;
  }
  playbackCache.value = map;
  playbackPreparing.value = null;
}
