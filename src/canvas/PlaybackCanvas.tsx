// Displays the current playback frame's cached raster bitmap in place of the
// normal per-track live canvases (§9.2). The cached bitmap may be smaller
// than the canvas (state/playbackCache.ts scales it down up front when the
// full-resolution animation wouldn't fit the memory budget), so it's always
// drawn scaled to fill the canvas rather than at its own natural size.
import { useEffect, useRef } from 'preact/hooks';
import type { Project } from '../types/model';
import { playbackFrameIndex } from '../state/playback';
import { playbackCache } from '../state/playbackCache';

/** Raster view shows the cached composite of every visible track (references included, so an imported
 * video plays). ASCII view shows only the cached *references* under the characters — never the drawing
 * raster, or it would show through the ASCII — plus a faint drawing ghost when "Show drawing under ASCII" is on. */
export function PlaybackCanvas({ project, view, ghost }: { project: Project; view: 'raster' | 'ascii'; ghost: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  function render() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { width, height } = project.canvas;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const frame = project.frames[playbackFrameIndex.value];
    const data = frame ? playbackCache.value.get(frame.id) : undefined;
    // Hard-edged upscale when the cache is downscaled for drawings; a cache that holds photographic
    // references looks better smoothed.
    ctx.imageSmoothingEnabled = !!data?.refs;
    ctx.clearRect(0, 0, width, height);
    if (!data) return;
    if (view === 'raster') {
      ctx.drawImage(data.raster, 0, 0, width, height);
    } else {
      if (data.refs) ctx.drawImage(data.refs, 0, 0, width, height);
      if (ghost) {
        ctx.globalAlpha = 0.2;
        ctx.drawImage(data.raster, 0, 0, width, height);
        ctx.globalAlpha = 1;
      }
    }
  }

  const index = playbackFrameIndex.value;
  useEffect(() => {
    render();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, playbackCache.value, view, ghost]);

  return <canvas ref={canvasRef} class="ab-canvas-layer" style={{ pointerEvents: 'none' }} />;
}
