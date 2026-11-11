// Visuals for the Select tool, drawn inside the canvas stage (canvas-pixel
// coordinates): the floating pixels of a lifted selection, animated marching
// ants (black + white dashes, the classic Mac look), scale handles, and the
// marquee while one is being dragged. Purely visual (pointer-events: none) —
// hit-testing lives in state/selection.ts.
import { useEffect, useMemo, useRef } from 'preact/hooks';
import type { Project } from '../types/model';
import { selection, marquee, HANDLES } from '../state/selection';
import { viewport } from '../state/viewport';
import { maskOutline, outlinePath } from '../engine/selection';
import { hexToRgb } from '../engine/color';

export function SelectionOverlay({ project, trackId }: { project: Project; trackId: string }) {
  const sel = selection.value;
  const m = marquee.value;
  const zoom = viewport.value.zoom;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const block = sel && sel.trackId === trackId ? sel.block : null;
  const lifted = sel?.lifted ?? false;

  // Floating pixels: only the selected, non-transparent ones.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !block) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(block.width, block.height);
    for (let i = 0; i < block.pixels.length; i++) {
      const idx = block.pixels[i];
      if (!block.mask[i] || !idx) continue;
      const hex = project.colors[idx];
      if (!hex) continue;
      const { r, g, b } = hexToRgb(hex);
      img.data[i * 4] = r;
      img.data[i * 4 + 1] = g;
      img.data[i * 4 + 2] = b;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, [block, lifted, project.colors]);

  const loops = useMemo(() => (block ? maskOutline(block.mask, block.width, block.height) : []), [block]);
  const path = useMemo(() => outlinePath(loops), [loops]);

  return (
    <div class="ab-selection-layer">
      {sel && block ? (
        <>
          {lifted ? (
            <canvas
              ref={canvasRef}
              class="ab-selection-pixels"
              width={block.width}
              height={block.height}
              style={{ left: sel.x, top: sel.y, width: block.width, height: block.height }}
            />
          ) : null}
          <svg class="ab-ants" style={{ left: sel.x, top: sel.y }} width={block.width} height={block.height} viewBox={`0 0 ${block.width} ${block.height}`}>
            <path class="ab-ants__black" d={path} />
            <path class="ab-ants__white" d={path} />
          </svg>
          {HANDLES.map((h) => (
            <div
              key={h.id}
              class="ab-selection-handle"
              style={{
                left: sel.x + h.fx * block.width,
                top: sel.y + h.fy * block.height,
                transform: `translate(-50%, -50%) scale(${1 / zoom})`,
              }}
            />
          ))}
        </>
      ) : null}

      {m ? (
        <svg class="ab-ants" style={{ left: 0, top: 0 }} width={project.canvas.width} height={project.canvas.height} viewBox={`0 0 ${project.canvas.width} ${project.canvas.height}`}>
          {m.kind === 'rect' ? (
            <>
              <rect class="ab-ants__black" x={Math.min(m.a.x, m.b.x)} y={Math.min(m.a.y, m.b.y)} width={Math.abs(m.a.x - m.b.x)} height={Math.abs(m.a.y - m.b.y)} />
              <rect class="ab-ants__white" x={Math.min(m.a.x, m.b.x)} y={Math.min(m.a.y, m.b.y)} width={Math.abs(m.a.x - m.b.x)} height={Math.abs(m.a.y - m.b.y)} />
            </>
          ) : (
            <>
              <polyline class="ab-ants__black" points={m.points.map((p) => `${p.x},${p.y}`).join(' ')} />
              <polyline class="ab-ants__white" points={m.points.map((p) => `${p.x},${p.y}`).join(' ')} />
            </>
          )}
        </svg>
      ) : null}
    </div>
  );
}
