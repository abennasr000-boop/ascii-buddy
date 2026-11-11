// Draws one exported frame onto a canvas of the requested output size, from the ASCII data (through the
// same glyph atlas and crisp-glyph rule as the screen) or from the raster layers.
import type { Project } from '../types/model';
import { rowsFor } from '../types/model';
import { GlyphAtlas, ensureFontReady } from '../canvas/glyphAtlas';
import { fontFamilyFor } from '../canvas/glyphRender';
import type { ArtFrame } from './frameLoader';

export type ExportContent = 'ascii' | 'raster';

export interface FrameRenderer {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  /** Paints the frame onto `canvas`, replacing what was there. */
  render(art: ArtFrame): void;
  dispose(): void;
}

export async function createFrameRenderer(
  project: Project,
  content: ExportContent,
  size: { width: number; height: number },
  transparent: boolean,
  smooth = false,
): Promise<FrameRenderer> {
  const { width, height } = size;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('This device could not create a canvas of that size. Try a smaller export size.');

  let atlas: GlyphAtlas | null = null;
  if (content === 'ascii') {
    const family = fontFamilyFor(project.asciiFont);
    await ensureFontReady(family);
    // The atlas cell is the on-canvas cell size rounded up, so glyphs are drawn 1:1 (crisp) at rounded positions.
    atlas = new GlyphAtlas(Math.ceil(width / project.grid.columns), Math.ceil(height / rowsFor(project.grid.columns, project.canvas.width, project.canvas.height)), family, project.crispGlyphs);
  }

  return {
    canvas,
    width,
    height,
    render(art) {
      ctx.clearRect(0, 0, width, height);
      if (!transparent) {
        ctx.fillStyle = project.background;
        ctx.fillRect(0, 0, width, height);
      }
      if (content === 'raster') {
        art.paintRaster(ctx, width, height, smooth);
        return;
      }
      const frame = art.ascii;
      if (!frame || !atlas) return;
      const cellW = width / frame.columns;
      const cellH = height / frame.rows;
      for (let row = 0; row < frame.rows; row++) {
        for (let col = 0; col < frame.columns; col++) {
          const i = row * frame.columns + col;
          if (!frame.owner[i] || !frame.chars[i]) continue;
          const rect = atlas.getOrCreate(String.fromCodePoint(frame.chars[i]), project.colors[frame.colors[i]] || '#000000');
          ctx.drawImage(atlas.texture, rect.x, rect.y, rect.w, rect.h, Math.round(col * cellW), Math.round(row * cellH), Math.ceil(cellW), Math.ceil(cellH));
        }
      }
    },
    dispose() {
      canvas.width = 0;
      canvas.height = 0;
    },
  };
}
