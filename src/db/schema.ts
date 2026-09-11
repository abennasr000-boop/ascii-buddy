import type { DBSchema } from 'idb';
import type { AppSettings, DrawingCel, PaletteLibraryEntry, Project, ReferenceCel } from '../types/model';

// Object stores per ASCII_BUDDY_SPEC.md §14.1. Only `projects` and `settings`
// are read/written in Phase 0; the rest are declared now so later phases
// don't need a version bump.
export interface AsciiBuddyDB extends DBSchema {
  projects: {
    key: string;
    value: Project;
  };
  cels: {
    key: string; // `${projectId}/${trackId}/${frameId}`
    value: DrawingCel | ReferenceCel;
    indexes: { projectId: string };
  };
  images: {
    key: string; // imageId
    value: { id: string; projectId: string; blob: Blob };
    indexes: { projectId: string };
  };
  thumbnails: {
    key: string; // projectId
    value: { projectId: string; blob: Blob };
  };
  palettes: {
    key: string; // paletteId
    value: PaletteLibraryEntry;
  };
  settings: {
    key: string; // fixed key 'app'
    value: AppSettings;
  };
}

export const DB_NAME = 'ascii_buddy';
export const DB_VERSION = 1;
