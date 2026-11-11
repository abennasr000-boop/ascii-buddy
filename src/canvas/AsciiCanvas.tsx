// Renders the current AsciiFrame via a glyph atlas. See ASCII_BUDDY_SPEC.md
// §5.11: never fillText per grid cell per frame — draw from a prebuilt atlas.
// The atlas is rebuilt (debounced) when zoom or columns change, so glyphs
// stay crisp at the current zoom without rebuilding on every pointermove.
import { useEffect, useRef } from 'preact/hooks';
import type { AsciiFrame, Project } from '../types/model';
import { asciiFrame } from '../state/asciiState';
import { onionLayers } from '../state/onion';
import { viewport } from '../state/viewport';
import { blendHex } from '../engine/color';
import { GlyphAtlas, ensureFontReady } from './glyphAtlas';
import { fontFamilyFor } from './glyphRender';

const REBUILD_DEBOUNCE_MS = 120;

/** `overrideFrame`, when given (playback), is shown instead of the live `asciiFrame`
 * signal and onion skin is skipped — see state/playback.ts and ASCII_BUDDY_SPEC.md §9.3. */
export function AsciiCanvas({ project, overrideFrame }: { project: Project; overrideFrame?: AsciiFrame | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const atlasRef = useRef<GlyphAtlas | null>(null);
  const rebuildTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fontReadyRef = useRef(false);
  const frame = overrideFrame ?? asciiFrame.value;
  const showOnion = !overrideFrame && onionLayers.value.length > 0;

  function render() {
    const canvas = canvasRef.current;
    const atlas = atlasRef.current;
    if (!canvas || !atlas || !frame) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const cellW = canvas.width / frame.columns;
    const cellH = canvas.height / frame.rows;

    if (showOnion) {
      // Nearest frame drawn last (on top); only shown in cells empty in the current frame.
      const sorted = [...onionLayers.value].sort((a, b) => b.distance - a.distance);
      for (const layer of sorted) {
        const baseHex = layer.side === 'before' ? project.onion.colorBefore : project.onion.colorAfter;
        const opacity = project.onion.opacity * Math.pow(project.onion.falloff, layer.distance - 1);
        const colorHex = blendHex(project.background, baseHex, opacity);
        for (let i = 0; i < frame.owner.length; i++) {
          if (frame.owner[i] || !layer.ascii.owner[i]) continue;
          const row = Math.floor(i / frame.columns);
          const col = i % frame.columns;
          const ch = String.fromCodePoint(layer.ascii.chars[i]);
          const rect = atlas.getOrCreate(ch, colorHex);
          ctx.drawImage(atlas.texture, rect.x, rect.y, rect.w, rect.h, Math.round(col * cellW), Math.round(row * cellH), Math.ceil(cellW), Math.ceil(cellH));
        }
      }
    }

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
    if (!canvas || !frame) return;
    // Size the backing store to roughly the current on-screen cell size, so glyphs
    // are crisp *now*; it drifts slightly (and gets CSS-scaled) between rebuilds
    // while actively zooming — that's the "reuse while zooming" allowance in §5.11.
    const onScreenCellW = (project.canvas.width / frame.columns) * viewport.value.zoom;
    const cellPx = Math.max(6, Math.min(64, Math.round(onScreenCellW)));
    canvas.width = cellPx * frame.columns;
    canvas.height = cellPx * 2 * frame.rows;
    atlasRef.current = new GlyphAtlas(cellPx, cellPx * 2, fontFamilyFor(project.asciiFont), project.crispGlyphs);
    render();
  }

  function scheduleRebuild() {
    if (rebuildTimerRef.current) clearTimeout(rebuildTimerRef.current);
    rebuildTimerRef.current = setTimeout(rebuildAtlasAndRender, REBUILD_DEBOUNCE_MS);
  }

  // Initial build once the font is actually loaded (otherwise glyph metrics are wrong) — and again
  // whenever the ASCII font changes (Pixel ↔ Smooth).
  useEffect(() => {
    let cancelled = false;
    fontReadyRef.current = false;
    atlasRef.current = null; // a different font needs a different atlas
    ensureFontReady(fontFamilyFor(project.asciiFont)).then(() => {
      if (cancelled) return;
      fontReadyRef.current = true;
      rebuildAtlasAndRender();
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, project.asciiFont]);

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

  // Re-render (no rebuild needed) whenever the frame content or onion overlay changes. The first frame can
  // arrive after the atlas was due to be built (the build needs a frame for the grid size — and shape
  // conversion delivers frames later than ramp does), so build it here if it doesn't exist yet.
  useEffect(() => {
    if (!atlasRef.current) {
      if (fontReadyRef.current) rebuildAtlasAndRender();
      return;
    }
    render();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame, onionLayers.value, project.onion, project.background, project.colors]);

  return <canvas ref={canvasRef} class="ab-ascii-canvas-layer" />;
}
