// Project color table lookups. See ASCII_BUDDY_SPEC.md §7.1: an index stays
// bound to its color, colors are added automatically on first use, max 255
// (index 0 is the unused/transparent placeholder).
import type { Project } from '../types/model';
import { updateProjectData } from './projects';

export const MAX_COLORS = 255;

export function findColorIndex(project: Project, hex: string): number {
  const upper = hex.toUpperCase();
  return project.colors.findIndex((c, i) => i > 0 && c?.toUpperCase() === upper);
}

/** Returns the color's table index, adding it if new. Returns null if the table is full. */
export function ensureColorIndex(project: Project, hex: string): number | null {
  const existing = findColorIndex(project, hex);
  if (existing !== -1) return existing;
  if (project.colors.length - 1 >= MAX_COLORS) return null;
  const colors = [...project.colors, hex.toUpperCase()];
  const index = colors.length - 1;
  updateProjectData(project.id, { colors });
  return index;
}
