// Project color-table operations: palette edits, Replace color, Remove unused
// colors. All undoable except Remove unused (which renumbers every cel and so
// clears the undo history — the confirmation says so). See ASCII_BUDDY_SPEC.md §7.
import type { Hex, ID, Project } from '../types/model';
import { updateProjectData, projects } from './projects';
import { pushCommand, clearHistory } from './history';
import { currentColor } from './tools';
import { flush } from './autosave';
import { listCelsForProject, putCel } from '../db/db';
import { compactColorTable, remapKeys } from '../engine/colorTable';
import { remapCelData, usedIndicesInCelData } from '../engine/celCodec';
import { reloadAllTrackData } from './canvasData';
import type { DrawingCel } from '../types/model';

type Palette = Project['palette'];

function fresh(id: ID): Project | undefined {
  return projects.value.find((p) => p.id === id);
}

/** Changes the project's active palette copy as one undo step. */
export function setProjectPalette(project: Project, next: Palette, label: string): void {
  const before = fresh(project.id)?.palette ?? project.palette;
  if (before.name === next.name && before.swatches.length === next.swatches.length && before.swatches.every((s, i) => s === next.swatches[i])) return;
  updateProjectData(project.id, { palette: next });
  pushCommand({
    kind: 'action',
    label,
    undo: () => updateProjectData(project.id, { palette: before }),
    redo: () => updateProjectData(project.id, { palette: next }),
  });
}

/** Rewrites one color-table entry, recoloring every pixel that uses it across the whole project (§7.1). */
export function replaceColor(projectId: ID, index: number, newHex: Hex): void {
  const project = fresh(projectId);
  if (!project || index < 1 || !project.colors[index]) return;
  const hex = newHex.toUpperCase();
  const oldHex = project.colors[index];
  if (oldHex.toUpperCase() === hex) return;

  const beforeColors = project.colors;
  const afterColors = project.colors.map((c, i) => (i === index ? hex : c));
  // A palette swatch that showed the old color follows it, so the swatch keeps matching the art.
  const beforePalette = project.palette;
  const afterPalette = {
    ...project.palette,
    swatches: project.palette.swatches.map((s) => (s.toUpperCase() === oldHex.toUpperCase() ? hex : s)),
  };
  const wasInk = currentColor.value.toUpperCase() === oldHex.toUpperCase();

  updateProjectData(projectId, { colors: afterColors, palette: afterPalette });
  if (wasInk) currentColor.value = hex;

  pushCommand({
    kind: 'action',
    label: 'Replace color',
    undo: () => {
      updateProjectData(projectId, { colors: beforeColors, palette: beforePalette });
      if (wasInk) currentColor.value = oldHex;
    },
    redo: () => {
      updateProjectData(projectId, { colors: afterColors, palette: afterPalette });
      if (wasInk) currentColor.value = hex;
    },
  });
}

/** Color-table indices that at least one stored cel actually uses. Reads from storage, so callers flush first. */
export async function usedColorIndices(projectId: ID): Promise<Set<number>> {
  const used = new Set<number>();
  for (const cel of await listCelsForProject(projectId)) {
    if ('imageId' in cel || !cel.bbox) continue;
    for (const idx of usedIndicesInCelData(cel.data)) used.add(idx);
  }
  return used;
}

/** How many table colors no cel uses (for the confirmation message). */
export async function countUnusedColors(projectId: ID): Promise<number> {
  await flush();
  const project = fresh(projectId);
  if (!project) return 0;
  return compactColorTable(project.colors, await usedColorIndices(projectId)).removed;
}

/** Compacts the color table to the colors in use and renumbers every cel to match. Clears undo history. */
export async function removeUnusedColors(projectId: ID): Promise<number> {
  await flush();
  const project = fresh(projectId);
  if (!project) return 0;
  const used = await usedColorIndices(projectId);
  const { colors, map, removed } = compactColorTable(project.colors, used);
  if (removed === 0) return 0;

  // Cels first, project JSON after, so an interrupted save can't leave a table that no longer matches its cels.
  for (const cel of await listCelsForProject(projectId)) {
    if ('imageId' in cel || !cel.bbox) continue;
    const drawing = cel as DrawingCel;
    await putCel({ ...drawing, data: remapCelData(drawing.data, map), version: drawing.version + 1 });
  }
  const colorChars = { ...project.colorChars, map: remapKeys(project.colorChars.map, map) };
  updateProjectData(projectId, { colors, colorChars });
  clearHistory(); // recorded strokes refer to the old numbering
  await flush();
  const updated = fresh(projectId);
  if (updated) await reloadAllTrackData(updated);
  return removed;
}
