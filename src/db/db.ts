import { openDB, type IDBPDatabase } from 'idb';
import type { AsciiBuddyDB } from './schema';
import { DB_NAME, DB_VERSION } from './schema';
import type { AppSettings, DrawingCel, ID, Project } from '../types/model';
import { defaultAppSettings } from '../model/defaults';

// Thrown when IndexedDB can't be opened at all (e.g. a page opened via
// file:// denies it entirely in some browsers). Callers degrade gracefully
// instead of leaving the UI stuck — see ASCII_BUDDY_SPEC.md §3.2.
export class StorageUnavailableError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = 'StorageUnavailableError';
  }
}

let dbPromise: Promise<IDBPDatabase<AsciiBuddyDB>> | null = null;

export async function getDB(): Promise<IDBPDatabase<AsciiBuddyDB>> {
  if (!dbPromise) {
    dbPromise = openDatabase().catch((err) => {
      dbPromise = null;
      throw new StorageUnavailableError(err);
    });
  }
  return dbPromise;
}

async function openDatabase(): Promise<IDBPDatabase<AsciiBuddyDB>> {
    return openDB<AsciiBuddyDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('projects')) {
          db.createObjectStore('projects', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('cels')) {
          const cels = db.createObjectStore('cels');
          cels.createIndex('projectId', 'projectId');
        }
        if (!db.objectStoreNames.contains('images')) {
          const images = db.createObjectStore('images', { keyPath: 'id' });
          images.createIndex('projectId', 'projectId');
        }
        if (!db.objectStoreNames.contains('thumbnails')) {
          db.createObjectStore('thumbnails', { keyPath: 'projectId' });
        }
        if (!db.objectStoreNames.contains('palettes')) {
          db.createObjectStore('palettes', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings');
        }
      },
    });
}

export async function listProjects(): Promise<Project[]> {
  const db = await getDB();
  const all = await db.getAll('projects');
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getProject(id: string): Promise<Project | undefined> {
  const db = await getDB();
  return db.get('projects', id);
}

export async function putProject(project: Project): Promise<void> {
  const db = await getDB();
  await db.put('projects', project);
}

export async function deleteProject(id: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['projects', 'cels', 'images', 'thumbnails'], 'readwrite');
  await tx.objectStore('projects').delete(id);
  const celStore = tx.objectStore('cels');
  for (const key of await celStore.index('projectId').getAllKeys(id)) {
    await celStore.delete(key);
  }
  const imageStore = tx.objectStore('images');
  for (const key of await imageStore.index('projectId').getAllKeys(id)) {
    await imageStore.delete(key);
  }
  await tx.objectStore('thumbnails').delete(id);
  await tx.done;
}

export function celKey(projectId: ID, trackId: ID, frameId: ID | 'static'): string {
  return `${projectId}/${trackId}/${frameId}`;
}

export async function getCel(projectId: ID, trackId: ID, frameId: ID | 'static'): Promise<DrawingCel | undefined> {
  const db = await getDB();
  const value = await db.get('cels', celKey(projectId, trackId, frameId));
  return value as DrawingCel | undefined;
}

export async function putCel(cel: DrawingCel): Promise<void> {
  const db = await getDB();
  await db.put('cels', cel, celKey(cel.projectId, cel.trackId, cel.frameId));
}

export async function deleteCel(projectId: ID, trackId: ID, frameId: ID | 'static'): Promise<void> {
  const db = await getDB();
  await db.delete('cels', celKey(projectId, trackId, frameId));
}

const SETTINGS_KEY = 'app';

export async function getAppSettings(): Promise<AppSettings> {
  const db = await getDB();
  const stored = await db.get('settings', SETTINGS_KEY);
  return { ...defaultAppSettings(), ...stored };
}

export async function putAppSettings(settings: AppSettings): Promise<void> {
  const db = await getDB();
  await db.put('settings', settings, SETTINGS_KEY);
}
