// Raster-view onion skin: tints neighboring frames' ink as silhouettes
// beneath the current frame. See ASCII_BUDDY_SPEC.md §9.3. Purely a rendered
// view (never drawn on), so it must never intercept pointer events.
import { useEffect, useRef } from 'preact/hooks';
import type { Project } from '../types/model';
import { onionLayers } from '../state/onion';
import { hexToRgb } from '../engine/color';

export function OnionOverlay({ project }: { project: Project }) {
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
    ctx.clearRect(0, 0, width, height);

    const layers = onionLayers.value;
    if (layers.length === 0) return;
    // Draw farthest-first so the nearest frame's silhouette ends up on top.
    const sorted = [...layers].sort((a, b) => b.distance - a.distance);
    for (const layer of sorted) {
      const colorHex = layer.side === 'before' ? project.onion.colorBefore : project.onion.colorAfter;
      const opacity = project.onion.opacity * Math.pow(project.onion.falloff, layer.distance - 1);
      if (opacity <= 0) continue;
      const { r, g, b } = hexToRgb(colorHex);

      const tint = document.createElement('canvas');
      tint.width = width;
      tint.height = height;
      const tctx = tint.getContext('2d');
      if (!tctx) continue;
      const img = tctx.createImageData(width, height);
      const data = img.data;
      for (let i = 0; i < layer.mask.length; i++) {
        if (!layer.mask[i]) continue;
        const o = i * 4;
        data[o] = r;
        data[o + 1] = g;
        data[o + 2] = b;
        data[o + 3] = 255; // opaque here — opacity is applied below via globalAlpha, which putImageData ignores
      }
      tctx.putImageData(img, 0, 0);

      ctx.globalAlpha = Math.min(1, opacity);
      ctx.drawImage(tint, 0, 0);
      ctx.globalAlpha = 1;
    }
  }

  useEffect(() => {
    render();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onionLayers.value, project.onion.colorBefore, project.onion.colorAfter, project.onion.opacity, project.onion.falloff]);

  return <canvas ref={canvasRef} class="ab-canvas-layer" style={{ pointerEvents: 'none' }} />;
}
