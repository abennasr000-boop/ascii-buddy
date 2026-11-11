// Eyedropper: picks the color under a canvas point from everything visible,
// reference images included (so colors can be sampled from a photo). In ASCII
// view it picks the grid cell's color instead. See ASCII_BUDDY_SPEC.md §6.3.
import { signal } from '@preact/signals';
import type { Hex, Project } from '../types/model';
import { liveCels } from './celStore';
import { liveReferences } from './referenceStore';
import { asciiFrame } from './asciiState';
import { hideAllReferences } from './viewSettings';
import { useColor } from './tools';
import { ensureColorIndex } from './colorTable';
import { colorTableFull } from './uiFlags';
import { projects } from './projects';

const imageCache = new Map<string, Promise<HTMLImageElement>>();
function loadImage(url: string): Promise<HTMLImageElement> {
  let p = imageCache.get(url);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
    imageCache.set(url, p);
    if (imageCache.size > 16) imageCache.delete(imageCache.keys().next().value as string);
  }
  return p;
}

function toHex(r: number, g: number, b: number): Hex {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

/** The color a viewer sees at canvas pixel (x, y): paper, then each visible track bottom-to-top. */
export async function sampleRasterColor(project: Project, x: number, y: number): Promise<Hex> {
  const px = Math.floor(x);
  const py = Math.floor(y);
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return project.background;
  ctx.fillStyle = project.background;
  ctx.fillRect(0, 0, 1, 1);

  for (const track of [...project.tracks].reverse()) {
    if (!track.visible) continue;
    if (track.kind === 'drawing') {
      const cel = liveCels.value.get(track.id);
      if (!cel || px < 0 || py < 0 || px >= cel.width || py >= cel.height) continue;
      const idx = cel.buf[py * cel.width + px];
      if (idx && project.colors[idx]) {
        ctx.fillStyle = project.colors[idx];
        ctx.fillRect(0, 0, 1, 1);
      }
    } else if (!hideAllReferences.value) {
      const live = liveReferences.value.get(track.id);
      if (!live) continue;
      try {
        const img = await loadImage(live.imageUrl);
        const { x: tx, y: ty, scale, rotation } = live.cel.transform;
        ctx.save();
        ctx.globalAlpha = track.opacity;
        ctx.translate(-px, -py); // sample the pixel at (px, py)
        ctx.translate(tx, ty);
        ctx.rotate(rotation);
        ctx.scale(scale, scale);
        ctx.drawImage(img, -live.naturalWidth / 2, -live.naturalHeight / 2);
        ctx.restore();
      } catch {
        // an image that fails to decode simply doesn't contribute
      }
    }
  }
  const d = ctx.getImageData(0, 0, 1, 1).data;
  return toHex(d[0], d[1], d[2]);
}

/** In ASCII view: the color of the character in the grid cell under the point, or paper if the cell is empty. */
export function sampleAsciiColor(project: Project, x: number, y: number): Hex {
  const frame = asciiFrame.value;
  if (!frame) return project.background;
  const col = Math.min(frame.columns - 1, Math.max(0, Math.floor((x / project.canvas.width) * frame.columns)));
  const row = Math.min(frame.rows - 1, Math.max(0, Math.floor((y / project.canvas.height) * frame.rows)));
  const i = row * frame.columns + col;
  return frame.owner[i] ? (project.colors[frame.colors[i]] ?? project.background) : project.background;
}

/** Picks the color at a canvas point and makes it the current ink, adding it to the color table if new. */
export async function eyedropAt(projectId: string, x: number, y: number): Promise<Hex | null> {
  const project = projects.value.find((p) => p.id === projectId);
  if (!project) return null;
  const hex = project.ui.view === 'ascii' ? sampleAsciiColor(project, x, y) : await sampleRasterColor(project, x, y);
  useColor(hex);
  const fresh = projects.value.find((p) => p.id === projectId) ?? project;
  if (ensureColorIndex(fresh, hex) === null) colorTableFull.value = true;
  return hex;
}

/** A brief ring at the picked spot (container-local px), so a long-press/Option-click visibly did something. */
export const pickFeedback = signal<{ x: number; y: number; hex: Hex; id: number } | null>(null);
let pickCounter = 0;
export function nextPickId(): number {
  return ++pickCounter;
}
