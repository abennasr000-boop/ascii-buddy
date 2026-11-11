// The `.buddy` project file (§14.2): a ZIP holding project.json (with schemaVersion), one raw `.bin` per
// drawing cel (a small bounding-box header followed by the indexed pixels — the ZIP compresses them),
// the reference images, and a thumbnail. This module only packs and unpacks bytes; reading and writing
// IndexedDB is state/projectFileActions.ts. Pure and unit tested (round trip).
import { unzipSync, zipSync, type Zippable } from 'fflate';
import type { ConversionOverride, ID, Project, ReferenceCel } from '../types/model';

export const PROJECT_SCHEMA_VERSION = 1;
const FORMAT_NAME = 'ascii_buddy';
const CEL_HEADER_BYTES = 16; // x, y, w, h as little-endian uint32

export class ProjectFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectFileError';
  }
}

export interface PackedCel {
  trackId: ID;
  frameId: ID | 'static';
  version: number;
  bbox: { x: number; y: number; w: number; h: number } | null;
  /** bbox-sized indexed pixels, uncompressed (empty when bbox is null). */
  pixels: Uint8Array;
  conversion?: ConversionOverride;
}

export interface PackedReference {
  trackId: ID;
  frameId: ID | 'static';
  imageId: ID;
  transform: ReferenceCel['transform'];
}

export interface PackedImage {
  id: ID;
  type: string; // MIME type
  bytes: Uint8Array;
}

export interface ProjectBundle {
  project: Project;
  cels: PackedCel[];
  references: PackedReference[];
  images: PackedImage[];
  thumbnail?: Uint8Array; // PNG
}

interface Manifest {
  format: typeof FORMAT_NAME;
  schemaVersion: number;
  exportedAt: number;
  project: Project;
  cels: Array<{ trackId: ID; frameId: ID | 'static'; version: number; conversion?: ConversionOverride }>;
  references: PackedReference[];
  images: Array<{ id: ID; type: string; file: string }>;
}

const EXTENSIONS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/heic': 'heic', 'image/avif': 'avif' };

function safeSegment(s: string): string {
  return s.replace(/[^A-Za-z0-9_-]/g, '_');
}

function celPath(trackId: ID, frameId: ID): string {
  return `cels/${safeSegment(trackId)}/${safeSegment(frameId)}.bin`;
}

function encodeCelBin(cel: PackedCel): Uint8Array {
  const out = new Uint8Array(CEL_HEADER_BYTES + cel.pixels.length);
  const view = new DataView(out.buffer);
  const b = cel.bbox ?? { x: 0, y: 0, w: 0, h: 0 };
  view.setUint32(0, b.x, true);
  view.setUint32(4, b.y, true);
  view.setUint32(8, b.w, true);
  view.setUint32(12, b.h, true);
  out.set(cel.pixels, CEL_HEADER_BYTES);
  return out;
}

/** Builds the `.buddy` ZIP. */
export function packProjectFile(bundle: ProjectBundle, exportedAt: number): Uint8Array {
  const files: Zippable = {};
  const manifest: Manifest = {
    format: FORMAT_NAME,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    exportedAt,
    project: bundle.project,
    cels: bundle.cels.map((c) => ({ trackId: c.trackId, frameId: c.frameId, version: c.version, ...(c.conversion ? { conversion: c.conversion } : {}) })),
    references: bundle.references,
    images: bundle.images.map((img) => ({ id: img.id, type: img.type, file: `images/${safeSegment(img.id)}.${EXTENSIONS[img.type] ?? 'bin'}` })),
  };
  files['project.json'] = [new TextEncoder().encode(JSON.stringify(manifest)), { level: 6 }];
  for (const cel of bundle.cels) files[celPath(cel.trackId, cel.frameId)] = [encodeCelBin(cel), { level: 6 }];
  manifest.images.forEach((entry, i) => {
    files[entry.file] = [bundle.images[i].bytes, { level: 0 }]; // already compressed
  });
  if (bundle.thumbnail) files['thumbnail.png'] = [bundle.thumbnail, { level: 0 }];
  return zipSync(files);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function fail(message: string): never {
  throw new ProjectFileError(message);
}

/** Brings a project of an older schema up to the current one. Only version 1 exists so far. */
export function migrateProject(project: Record<string, unknown>, fromVersion: number): Project {
  if (fromVersion > PROJECT_SCHEMA_VERSION) fail('This project file was made by a newer version of ascii_buddy. Update the app to open it.');
  if (fromVersion < 1) fail('This project file is too old to open.');
  return project as unknown as Project;
}

function validateProject(p: Project): void {
  if (typeof p.name !== 'string') fail('The project file is damaged (no project name).');
  const c = p.canvas;
  if (!isObject(c) || !Number.isInteger(c.width) || !Number.isInteger(c.height) || (c.width as number) < 1 || (c.height as number) < 1) fail('The project file is damaged (bad canvas size).');
  if (!p.grid || !Number.isInteger(p.grid.columns) || p.grid.columns < 1) fail('The project file is damaged (bad grid).');
  if (!Array.isArray(p.colors) || !Array.isArray(p.tracks) || !Array.isArray(p.frames) || p.frames.length < 1) fail('The project file is damaged (missing tracks, frames or colors).');
  for (const f of p.frames) if (!isObject(f) || typeof f.id !== 'string') fail('The project file is damaged (bad frame).');
  for (const t of p.tracks) if (!isObject(t) || typeof t.id !== 'string' || (t.kind !== 'drawing' && t.kind !== 'reference')) fail('The project file is damaged (bad track).');
}

/** Reads and validates a `.buddy` ZIP. Throws ProjectFileError with a readable message when it isn't one. */
export function unpackProjectFile(bytes: Uint8Array): ProjectBundle {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    fail("This isn't a project file (it can't be opened as a .buddy archive).");
  }
  const manifestBytes = files['project.json'];
  if (!manifestBytes) fail("This isn't a project file (no project.json inside).");
  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(new TextDecoder().decode(manifestBytes));
  } catch {
    fail('The project file is damaged (project.json is unreadable).');
  }
  if (!isObject(manifest) || manifest.format !== FORMAT_NAME || typeof manifest.schemaVersion !== 'number') fail("This isn't an ascii_buddy project file.");
  if (!isObject(manifest.project)) fail('The project file is damaged (no project).');
  const project = migrateProject(manifest.project, manifest.schemaVersion as number);
  validateProject(project);
  const { width, height } = project.canvas;

  const cels: PackedCel[] = [];
  for (const entry of (Array.isArray(manifest.cels) ? manifest.cels : []) as Manifest['cels']) {
    if (!isObject(entry) || typeof entry.trackId !== 'string' || typeof entry.frameId !== 'string') fail('The project file is damaged (bad cel entry).');
    const bin = files[celPath(entry.trackId, entry.frameId)];
    if (!bin || bin.length < CEL_HEADER_BYTES) fail('The project file is damaged (a drawing is missing).');
    const view = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
    const w = view.getUint32(8, true);
    const h = view.getUint32(12, true);
    const bbox = w === 0 || h === 0 ? null : { x: view.getUint32(0, true), y: view.getUint32(4, true), w, h };
    if (bbox && (bbox.x + bbox.w > width || bbox.y + bbox.h > height)) fail('The project file is damaged (a drawing lies outside the canvas).');
    if (bin.length - CEL_HEADER_BYTES !== (bbox ? bbox.w * bbox.h : 0)) fail('The project file is damaged (a drawing has the wrong size).');
    cels.push({
      trackId: entry.trackId,
      frameId: entry.frameId,
      version: typeof entry.version === 'number' ? entry.version : 1,
      bbox,
      pixels: bin.slice(CEL_HEADER_BYTES),
      ...(entry.conversion ? { conversion: entry.conversion } : {}),
    });
  }

  const images: PackedImage[] = [];
  for (const entry of (Array.isArray(manifest.images) ? manifest.images : []) as Manifest['images']) {
    const data = isObject(entry) ? files[entry.file] : undefined;
    if (!isObject(entry) || typeof entry.id !== 'string' || !data) fail('The project file is damaged (an image is missing).');
    images.push({ id: entry.id, type: typeof entry.type === 'string' ? entry.type : 'application/octet-stream', bytes: data });
  }

  const references = (Array.isArray(manifest.references) ? manifest.references : []) as PackedReference[];
  const imageIds = new Set(images.map((i) => i.id));
  for (const r of references) {
    if (!isObject(r) || typeof r.trackId !== 'string' || typeof r.frameId !== 'string' || typeof r.imageId !== 'string' || !isObject(r.transform)) fail('The project file is damaged (bad reference entry).');
    if (!imageIds.has(r.imageId)) fail('The project file is damaged (a reference image is missing).');
  }

  return { project, cels, references, images, thumbnail: files['thumbnail.png'] };
}
