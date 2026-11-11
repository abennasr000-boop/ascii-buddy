// Read-only raster renderer for one drawing track — used for every drawing
// track except the one currently being drawn on (which DrawingCanvas renders
// itself, since it also owns the incremental per-stroke blit). Composites
// normally in Raster view; occupancy (ASCII view) is resolved separately by
// the engine, not by this component. See ASCII_BUDDY_SPEC.md §4.4.
import { useEffect, useRef } from 'preact/hooks';
import type { Hex, ID } from '../types/model';
import { liveCels } from '../state/celStore';
import { buildLUT, celRegionToImageData } from '../engine/lut';

export function TrackCanvas({ trackId, colors, opacity }: { trackId: ID; colors: Hex[]; opacity: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lutRef = useRef<Uint8ClampedArray>(buildLUT(colors));

  function redraw() {
    const cel = liveCels.value.get(trackId);
    const canvas = canvasRef.current;
    if (!cel || !canvas) return;
    if (canvas.width !== cel.width || canvas.height !== cel.height) {
      canvas.width = cel.width;
      canvas.height = cel.height;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.imageSmoothingEnabled = false;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = celRegionToImageData(cel.buf, cel.width, lutRef.current, 0, 0, cel.width, cel.height);
    ctx.putImageData(img, 0, 0);
  }

  useEffect(() => {
    lutRef.current = buildLUT(colors);
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colors]);

  const version = liveCels.value.get(trackId)?.version;
  useEffect(() => {
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackId, version]);

  // Read-only: a canvas element hit-tests across its whole box regardless of
  // which pixels are actually opaque, so without this it can silently steal
  // pointer events meant for whatever else is stacked at that point (e.g. a
  // reference track's transform handles, if this track happens to sit above
  // it) — purely by being in front, with nothing about it visually
  // indicating it's intercepting anything.
  return <canvas ref={canvasRef} class="ab-canvas-layer" style={{ opacity, pointerEvents: 'none' }} />;
}
