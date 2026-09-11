import { signal } from '@preact/signals';
import type { Project } from '../types/model';
import { deleteProject, getCel, listProjects, putCel, putProject } from '../db/db';
import { createProject, type NewProjectOptions } from '../model/defaults';
import { makeId } from '../model/id';
import { storageError } from './storage';
import { scheduleAutosave } from './autosave';

export const projects = signal<Project[]>([]);
export const projectsLoaded = signal(false);

export async function loadProjects() {
  try {
    projects.value = await listProjects();
    storageError.value = null;
  } catch (err) {
    storageError.value = err instanceof Error ? err.message : String(err);
    projects.value = [];
  } finally {
    projectsLoaded.value = true;
  }
}

export function nextUntitledName(): string {
  const used = new Set(projects.value.map((p) => p.name));
  let n = 1;
  while (used.has(`Untitled ${n}`)) n++;
  return `Untitled ${n}`;
}

function flagAndRethrow(err: unknown): never {
  storageError.value = err instanceof Error ? err.message : String(err);
  throw err;
}

export async function createAndSaveProject(opts: NewProjectOptions): Promise<Project> {
  const project = createProject(opts);
  try {
    await putProject(project);
  } catch (err) {
    flagAndRethrow(err);
  }
  projects.value = [project, ...projects.value];
  return project;
}

export async function renameProject(id: string, name: string) {
  const project = projects.value.find((p) => p.id === id);
  if (!project) return;
  const updated = { ...project, name, updatedAt: Date.now() };
  try {
    await putProject(updated);
  } catch (err) {
    flagAndRethrow(err);
  }
  projects.value = projects.value.map((p) => (p.id === id ? updated : p));
}

export async function duplicateProject(id: string) {
  const project = projects.value.find((p) => p.id === id);
  if (!project) return;
  const now = Date.now();
  const existingNames = new Set(projects.value.map((p) => p.name));
  let name = `${project.name} copy`;
  let n = 2;
  while (existingNames.has(name)) name = `${project.name} copy ${n++}`;

  const copy: Project = {
    ...project,
    id: makeId(),
    name,
    createdAt: now,
    updatedAt: now,
    lastExportedAt: undefined,
  };
  try {
    await putProject(copy);
    await duplicateCels(project, copy.id);
  } catch (err) {
    flagAndRethrow(err);
  }
  projects.value = [copy, ...projects.value].sort((a, b) => b.updatedAt - a.updatedAt);
}

async function duplicateCels(source: Project, newProjectId: string) {
  for (const track of source.tracks) {
    const frameIds = track.isStatic ? (['static'] as const) : source.frames.map((f) => f.id);
    for (const frameId of frameIds) {
      const cel = await getCel(source.id, track.id, frameId);
      if (cel) await putCel({ ...cel, projectId: newProjectId });
    }
  }
}

/** In-memory patch for fields the editor changes live (color table, background, ...),
 * scheduling a debounced save rather than writing immediately — see state/autosave.ts. */
export function updateProjectData(id: string, patch: Partial<Project>) {
  const idx = projects.value.findIndex((p) => p.id === id);
  if (idx === -1) return;
  const updated = { ...projects.value[idx], ...patch, updatedAt: Date.now() };
  const next = projects.value.slice();
  next[idx] = updated;
  projects.value = next;
  scheduleAutosave(id);
}

export async function removeProject(id: string) {
  try {
    await deleteProject(id);
  } catch (err) {
    flagAndRethrow(err);
  }
  projects.value = projects.value.filter((p) => p.id !== id);
}
