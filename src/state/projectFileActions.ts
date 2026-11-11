// Exporting a project to a `.buddy` file and importing one back (§14.2). Reads and writes the same
// IndexedDB records the editor uses; the byte format itself is engine/projectFile.ts.
import { deflateSync, inflateSync } from 'fflate';
import type { Project, DrawingCel, ReferenceCel } from '../types/model';
import { deleteProject, getImage, listCelsForProject, putCel, putImage, putProject, putReferenceCel } from '../db/db';
import { packProjectFile, unpackProjectFile, type PackedCel, type PackedImage, type PackedReference } from '../engine/projectFile';
import { safeFileBase } from '../engine/exportPlan';
import { renderThumbnailBlob } from './thumbnails';
import { makeId } from '../model/id';
import { flush } from './autosave';
import { projects } from './projects';

export interface ProjectFileResult {
  blob: Blob;
  filename: string;
}

async function makeThumbnail(project: Project): Promise<Uint8Array | undefined> {
  const blob = await renderThumbnailBlob(project);
  return blob ? new Uint8Array(await blob.arrayBuffer()) : undefined;
}

/** Packs the project, with everything it needs, into a `.buddy` file, and records the backup time. */
export async function buildProjectFile(projectId: string, onStatus?: (message: string) => void): Promise<ProjectFileResult> {
  onStatus?.('Saving…');
  await flush(); // what's on screen must be in storage before it is read back
  const project = projects.value.find((p) => p.id === projectId);
  if (!project) throw new Error('That project no longer exists.');

  onStatus?.('Reading the drawings…');
  const trackIds = new Set(project.tracks.map((t) => t.id));
  const frameIds = new Set(project.frames.map((f) => f.id));
  const all = (await listCelsForProject(projectId)).filter((c) => trackIds.has(c.trackId) && (c.frameId === 'static' || frameIds.has(c.frameId)));

  const cels: PackedCel[] = [];
  const references: PackedReference[] = [];
  for (const cel of all) {
    if ('imageId' in cel) {
      references.push({ trackId: cel.trackId, frameId: cel.frameId, imageId: cel.imageId, transform: cel.transform });
    } else {
      cels.push({
        trackId: cel.trackId,
        frameId: cel.frameId,
        version: cel.version,
        bbox: cel.bbox,
        pixels: cel.bbox ? inflateSync(cel.data) : new Uint8Array(0),
        ...(cel.conversion ? { conversion: cel.conversion } : {}),
      });
    }
  }

  const images: PackedImage[] = [];
  for (const id of new Set(references.map((r) => r.imageId))) {
    const blob = await getImage(id);
    if (!blob) continue;
    images.push({ id, type: blob.type || 'application/octet-stream', bytes: new Uint8Array(await blob.arrayBuffer()) });
  }
  const knownImages = new Set(images.map((i) => i.id));

  onStatus?.('Packing…');
  const thumbnail = await makeThumbnail(project);
  const now = Date.now();
  const bytes = packProjectFile(
    { project, cels, references: references.filter((r) => knownImages.has(r.imageId)), images, thumbnail },
    now,
  );
  await markExported(project.id, now);
  return { blob: new Blob([bytes as unknown as BlobPart], { type: 'application/octet-stream' }), filename: `${safeFileBase(project.name)}.buddy` };
}

/** Records "last backup" without touching updatedAt, so a backup doesn't reorder the project list. */
async function markExported(projectId: string, when: number): Promise<void> {
  const project = projects.value.find((p) => p.id === projectId);
  if (!project) return;
  const updated = { ...project, lastExportedAt: when };
  projects.value = projects.value.map((p) => (p.id === projectId ? updated : p));
  await putProject(updated);
}

function uniqueName(name: string): string {
  const used = new Set(projects.value.map((p) => p.name));
  if (!used.has(name)) return name;
  let candidate = `${name} copy`;
  let n = 2;
  while (used.has(candidate)) candidate = `${name} copy ${n++}`;
  return candidate;
}

/** Reads a `.buddy` file into a NEW project (new id, so importing twice makes two copies). Throws a
 * ProjectFileError with a readable message if the file isn't a valid project file. */
export async function importProjectFile(file: File): Promise<Project> {
  const bundle = unpackProjectFile(new Uint8Array(await file.arrayBuffer()));
  const id = makeId();
  const now = Date.now();
  const imageIds = new Map(bundle.images.map((img) => [img.id, makeId()]));

  const source = bundle.project;
  const project: Project = {
    ...source,
    id,
    name: uniqueName(source.name),
    updatedAt: now,
    lastExportedAt: undefined,
    ui: {
      ...source.ui,
      currentFrameId: source.frames.some((f) => f.id === source.ui.currentFrameId) ? source.ui.currentFrameId : source.frames[0].id,
      currentTrackId: source.tracks.some((t) => t.id === source.ui.currentTrackId) ? source.ui.currentTrackId : source.tracks[0]?.id ?? '',
    },
  };

  try {
    // Images and cels first, the project record that refers to them last, so an interrupted import can't
    // leave a project pointing at data that isn't there (§14.1).
    for (const img of bundle.images) await putImage(imageIds.get(img.id)!, id, new Blob([img.bytes as unknown as BlobPart], { type: img.type }));
    for (const cel of bundle.cels) {
      const stored: DrawingCel = {
        projectId: id,
        trackId: cel.trackId,
        frameId: cel.frameId,
        version: cel.version,
        bbox: cel.bbox,
        data: cel.bbox ? deflateSync(cel.pixels, { level: 6 }) : new Uint8Array(0),
        ...(cel.conversion ? { conversion: cel.conversion } : {}),
      };
      await putCel(stored);
    }
    for (const ref of bundle.references) {
      const stored: ReferenceCel = { projectId: id, trackId: ref.trackId, frameId: ref.frameId, imageId: imageIds.get(ref.imageId)!, transform: ref.transform };
      await putReferenceCel(stored);
    }
    await putProject(project);
  } catch (err) {
    await deleteProject(id).catch(() => undefined);
    throw err;
  }
  projects.value = [project, ...projects.value];
  return project;
}
