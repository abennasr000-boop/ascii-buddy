// Renders the glyph templates that Shape/Hybrid matching compares cells against
// (§5.5). One library covers every character any conversion might choose from —
// the project's shape characters, every track/cel override's, and the extended
// set — and each conversion picks its own subset (engine/shapeMatch allowedIndices).
// Rebuilt when the font or that character union changes; conversion falls back
// to the ramp until it is ready, then recomputes.
import { signal } from '@preact/signals';
import type { Project } from '../types/model';
import { BIN_COLS, BIN_ROWS, BIN_COUNT } from '../engine/gridStats';
import { buildTemplates, EXTENDED_SHAPE_CHARS, type ShapeTemplates } from '../engine/shapeMatch';
import { fontFamilyFor, renderGlyphAlpha } from '../canvas/glyphRender';
import { ensureFontReady } from '../canvas/glyphAtlas';

export const shapeTemplates = signal<{ key: string; templates: ShapeTemplates } | null>(null);

// Rendered at 4 px per bin so each bin averages a 4×4 block of the glyph's alpha.
const BIN_PX = 4;
const CELL_W = BIN_COLS * BIN_PX;
const CELL_H = BIN_ROWS * BIN_PX;

/** Characters used by cel-level overrides seen this session (they live with their cel, not in the project JSON). */
const celShapeChars = new Set<string>();
export function registerCelShapeChars(shapeChars: string | undefined): void {
  if (!shapeChars) return;
  for (const ch of Array.from(shapeChars)) celShapeChars.add(ch);
}
export function resetCelShapeChars(): void {
  celShapeChars.clear();
}

/** Every shape character the current project could pick from, as one sorted, de-duplicated string. */
export function wantedShapeChars(project: Project): string {
  const set = new Set<string>(Array.from(project.conversion.shapeChars));
  for (const t of project.tracks) for (const ch of Array.from(t.conversion?.shapeChars ?? '')) set.add(ch);
  for (const ch of celShapeChars) set.add(ch);
  if (project.charset === 'extended') for (const ch of Array.from(EXTENDED_SHAPE_CHARS)) set.add(ch);
  set.delete(' ');
  return [...set].sort().join('');
}

let building: Promise<void> | null = null;

/** Makes sure `shapeTemplates` matches the project's font and character union, (re)rendering if not. */
export async function ensureShapeTemplates(project: Project): Promise<void> {
  const chars = wantedShapeChars(project);
  const key = `${project.asciiFont}|${chars}`;
  if (shapeTemplates.value?.key === key) return;
  // Serialise builds; a newer request just queues behind the running one and re-checks the key.
  while (building) await building;
  if (shapeTemplates.value?.key === key) return;
  building = (async () => {
    const family = fontFamilyFor(project.asciiFont);
    await ensureFontReady(family);
    const raw = Array.from(chars).map((ch) => {
      const alpha = renderGlyphAlpha(ch, CELL_W, CELL_H, family);
      const bins = new Uint8Array(BIN_COUNT);
      for (let by = 0; by < BIN_ROWS; by++) {
        for (let bx = 0; bx < BIN_COLS; bx++) {
          let sum = 0;
          for (let y = 0; y < BIN_PX; y++) for (let x = 0; x < BIN_PX; x++) sum += alpha[(by * BIN_PX + y) * CELL_W + bx * BIN_PX + x];
          bins[by * BIN_COLS + bx] = Math.round(sum / (BIN_PX * BIN_PX));
        }
      }
      return { code: ch.codePointAt(0) ?? 0, bins };
    });
    shapeTemplates.value = { key, templates: buildTemplates(raw) };
  })().finally(() => {
    building = null;
  });
  await building;
}
