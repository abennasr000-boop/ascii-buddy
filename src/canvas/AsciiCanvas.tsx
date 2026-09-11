// Renders the current AsciiFrame via a glyph atlas. See ASCII_BUDDY_SPEC.md
// §5.11: never fillText per grid cell per frame — draw from a prebuilt atlas.
// The atlas is rebuilt (debounced) when zoom or columns change, so glyphs
// stay crisp at the current zoom without rebuilding on every pointermove.
import { useEffect, useRef } from 'preact/hooks';
import type { Project } from '../types/model';
import { asciiFrame } from '../state/asciiState';
import { viewport } from '../state/viewport';
import { GlyphAtlas, ensureFontReady } from './glyphAtlas';

const FONT_FAMILY = "'Departure Mono', ui-monospace, monospace";
const REBUILD_DEBOUNCE_MS = 120;

export function AsciiCanvas({ project }: { project: Project }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const atlasRef = useRef<GlyphAtlas | null>(null);
  const rebuildTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function render() {
    const canvas = canvasRef.current;
    const atlas = atlasRef.current;
    const frame = asciiFrame.value;
    if (!canvas || !atlas || !frame) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const cellW = canvas.width / frame.columns;
    const cellH = canvas.height / frame.rows;
    for (let row = 0; row < frame.rows; row++) {
      for (let col = 0; col < frame.columns; col++) {
        const i = row * frame.columns + col;
        if (!frame.owner[i]) continue;
        const ch = String.fromCodePoint(frame.chars[i]);
        const colorHex = project.colors[frame.colors[i]] || '#000000';
        const rect = atlas.getOrCreate(ch, colorHex);
        const dx = Math.round(col * cellW);
        const dy = Math.round(row * cellH);
        const dw = Math.ceil(cellW);
        const dh = Math.ceil(cellH);
        ctx.drawImage(atlas.texture, rect.x, rect.y, rect.w, rect.h, dx, dy, dw, dh);
      }
    }
  }

  function rebuildAtlasAndRender() {
    const canvas = canvasRef.current;
    const frame = asciiFrame.value;
    if (!canvas || !frame) return;
    // Size the backing store to roughly the current on-screen cell size, so glyphs
    // are crisp *now*; it drifts slightly (and gets CSS-scaled) between rebuilds
    // while actively zooming — that's the "reuse while zooming" allowance in §5.11.
    const onScreenCellW = (project.canvas.width / frame.columns) * viewport.value.zoom;
    const cellPx = Math.max(6, Math.min(64, Math.round(onScreenCellW)));
    canvas.width = cellPx * frame.columns;
    canvas.height = cellPx * 2 * frame.rows;
    atlasRef.current = new GlyphAtlas(cellPx, cellPx * 2, FONT_FAMILY, project.crispGlyphs);
    render();
  }

  function scheduleRebuild() {
    if (rebuildTimerRef.current) clearTimeout(rebuildTimerRef.current);
    rebuildTimerRef.current = setTimeout(rebuildAtlasAndRender, REBUILD_DEBOUNCE_MS);
  }

  // Initial build once the font is actually loaded (otherwise glyph metrics are wrong).
  useEffect(() => {
    let cancelled = false;
    ensureFontReady(FONT_FAMILY).then(() => {
      if (!cancelled) rebuildAtlasAndRender();
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  // Rebuild (debounced) on zoom or columns/crispGlyphs change.
  const zoom = viewport.value.zoom;
  const columns = project.grid.columns;
  const crisp = project.crispGlyphs;
  useEffect(() => {
    scheduleRebuild();
    return () => {
      if (rebuildTimerRef.current) clearTimeout(rebuildTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, columns, crisp]);

  // Re-render (no rebuild needed) whenever the frame content changes.
  const frame = asciiFrame.value;
  useEffect(() => {
    render();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame]);

  return <canvas ref={canvasRef} class="ab-ascii-canvas-layer" />;
}
