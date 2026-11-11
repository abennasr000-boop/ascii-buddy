import { describe, expect, it } from 'vitest';
import { zipSync } from 'fflate';
import { packProjectFile, unpackProjectFile, ProjectFileError, type ProjectBundle } from './projectFile';
import { createProject, DEFAULT_CANVAS_PRESET, DEFAULT_COLUMNS } from '../model/defaults';

function sampleBundle(): ProjectBundle {
  const project = createProject({
    name: 'Walk cycle',
    canvasPreset: DEFAULT_CANVAS_PRESET,
    columns: DEFAULT_COLUMNS,
    background: '#F0F0E8',
    fps: 12,
  });
  project.colors = ['', '#000000', '#FF0000'];
  project.canvas = { aspect: [4, 3], width: 64, height: 48 };
  project.frames.push({ id: 'f2', duration: 3 });
  project.tracks.push({ id: 'ref', name: 'Ref', kind: 'reference', isStatic: false, visible: true, locked: false, opacity: 0.5 });
  const t = project.tracks[0].id;
  return {
    project,
    cels: [
      { trackId: t, frameId: project.frames[0].id, version: 7, bbox: { x: 3, y: 4, w: 2, h: 3 }, pixels: new Uint8Array([1, 2, 0, 1, 1, 2]) },
      { trackId: t, frameId: 'f2', version: 1, bbox: null, pixels: new Uint8Array(0), conversion: { style: 'shape', threshold: 0.2 } },
    ],
    references: [{ trackId: 'ref', frameId: 'f2', imageId: 'img1', transform: { x: 10, y: 20, scale: 1.5, rotation: 0.25 } }],
    images: [{ id: 'img1', type: 'image/png', bytes: new Uint8Array([137, 80, 78, 71, 1, 2, 3]) }],
    thumbnail: new Uint8Array([1, 2, 3]),
  };
}

describe('project file round trip', () => {
  it('comes back identical: project, cels (pixels, bbox, version, override), references, images', () => {
    const bundle = sampleBundle();
    const back = unpackProjectFile(packProjectFile(bundle, 123));
    expect(back.project).toEqual(bundle.project);
    expect(back.cels).toHaveLength(2);
    for (const cel of bundle.cels) {
      const other = back.cels.find((c) => c.trackId === cel.trackId && c.frameId === cel.frameId)!;
      expect(other.bbox).toEqual(cel.bbox);
      expect(other.version).toBe(cel.version);
      expect(other.conversion).toEqual(cel.conversion);
      expect(Array.from(other.pixels)).toEqual(Array.from(cel.pixels));
    }
    expect(back.references).toEqual(bundle.references);
    expect(back.images[0].id).toBe('img1');
    expect(back.images[0].type).toBe('image/png');
    expect(Array.from(back.images[0].bytes)).toEqual(Array.from(bundle.images[0].bytes));
    expect(Array.from(back.thumbnail!)).toEqual([1, 2, 3]);
  });
});

describe('project file validation', () => {
  it('rejects something that is not a zip', () => {
    expect(() => unpackProjectFile(new Uint8Array([1, 2, 3, 4]))).toThrow(ProjectFileError);
  });
  it('rejects a zip without project.json', () => {
    expect(() => unpackProjectFile(zipSync({ 'a.txt': new Uint8Array([1]) }))).toThrow(/project\.json/);
  });
  it('rejects a file made by a newer version', () => {
    const files = { 'project.json': new TextEncoder().encode(JSON.stringify({ format: 'ascii_buddy', schemaVersion: 99, project: {} })) };
    expect(() => unpackProjectFile(zipSync(files))).toThrow(/newer version/);
  });
  it('rejects a cel whose data is the wrong size', () => {
    const bundle = sampleBundle();
    bundle.cels[0].pixels = new Uint8Array([1, 2, 3]); // bbox says 6
    expect(() => unpackProjectFile(packProjectFile(bundle, 1))).toThrow(/wrong size/);
  });
  it('rejects a reference to a missing image', () => {
    const bundle = sampleBundle();
    bundle.images = [];
    expect(() => unpackProjectFile(packProjectFile(bundle, 1))).toThrow(/image is missing|reference image/);
  });
});
