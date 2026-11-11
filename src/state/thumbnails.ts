// Project thumbnails for the Projects screen (§13.1): frame 1, in the view the project was last left in,
// rendered by the same code as exports. Stored in the `thumbnails` object store, refreshed whenever a
// project is closed (and made for imported projects), and shown through object URLs.
import { signal } from '@preact/signals';
import type { Project } from '../types/model';
import { getThumbnail, listThumbnails, putThumbnail } from '../db/db';
import { outputSize } from '../engine/exportPlan';
import { createFrameLoader } from '../export/frameLoader';
import { createFrameRenderer } from '../export/frameRenderer';

export const thumbnailUrls = signal<Map<string, string>>(new Map());

const THUMBNAIL_WIDTH = 320;

function setUrl(projectId: string, blob: Blob): void {
  const next = new Map(thumbnailUrls.value);
  const old = next.get(projectId);
  if (old) URL.revokeObjectURL(old);
  next.set(projectId, URL.createObjectURL(blob));
  thumbnailUrls.value = next;
}

export async function loadThumbnails(): Promise<void> {
  try {
    for (const t of await listThumbnails()) setUrl(t.projectId, t.blob);
  } catch {
    // no storage: the Projects screen falls back to a plain paper-colored tile
  }
}

/** Renders frame 1 of the project at thumbnail size. Undefined if it can't be drawn. */
export async function renderThumbnailBlob(project: Project): Promise<Blob | undefined> {
  try {
    const size = outputSize(project.canvas.width, project.canvas.height, { kind: 'width', width: THUMBNAIL_WIDTH });
    const renderer = await createFrameRenderer(project, project.ui.view, size, false, true);
    const loader = createFrameLoader(project);
    try {
      const art = await loader.load(0, { ascii: project.ui.view === 'ascii', raster: project.ui.view === 'raster' });
      renderer.render(art);
      art.release();
      return await new Promise<Blob | null>((resolve) => renderer.canvas.toBlob(resolve, 'image/png')).then((b) => b ?? undefined);
    } finally {
      loader.dispose();
      renderer.dispose();
    }
  } catch {
    return undefined; // a thumbnail is a nicety; never fail anything over it
  }
}

/** Re-renders and stores the project's thumbnail. Call after its cels are saved. */
export async function refreshThumbnail(project: Project): Promise<void> {
  const blob = await renderThumbnailBlob(project);
  if (!blob) return;
  try {
    await putThumbnail(project.id, blob);
  } catch {
    return;
  }
  setUrl(project.id, blob);
}

export async function copyThumbnail(fromId: string, toId: string): Promise<void> {
  try {
    const blob = await getThumbnail(fromId);
    if (!blob) return;
    await putThumbnail(toId, blob);
    setUrl(toId, blob);
  } catch {
    // ignore
  }
}

export function forgetThumbnail(projectId: string): void {
  const old = thumbnailUrls.value.get(projectId);
  if (!old) return;
  URL.revokeObjectURL(old);
  const next = new Map(thumbnailUrls.value);
  next.delete(projectId);
  thumbnailUrls.value = next;
}
