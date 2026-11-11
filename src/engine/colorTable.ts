// Pure color-table maths for "Remove unused colors" (§7.1): compact the table
// to just the used entries and produce the old→new index map for cels.
import type { Hex } from '../types/model';

export interface CompactResult {
  colors: Hex[];
  /** 256-entry lookup: old index → new index (0 → 0; removed entries map to 0). */
  map: Uint8Array;
  removed: number;
}

export function compactColorTable(colors: Hex[], used: Set<number>): CompactResult {
  const next: Hex[] = [colors[0] ?? ''];
  const map = new Uint8Array(256);
  let removed = 0;
  for (let i = 1; i < colors.length; i++) {
    if (used.has(i) && colors[i]) {
      map[i] = next.length;
      next.push(colors[i]);
    } else if (colors[i]) {
      removed++;
    }
  }
  return { colors: next, map, removed };
}

/** Remaps the numeric keys of a color→character map through `map`, dropping entries for removed colors. */
export function remapKeys(record: Record<number, string>, map: Uint8Array): Record<number, string> {
  const out: Record<number, string> = {};
  for (const [k, v] of Object.entries(record)) {
    const mapped = map[Number(k)];
    if (mapped) out[mapped] = v;
  }
  return out;
}
