// The global palette library (§7.3): named palettes shared by every project,
// stored in IndexedDB, with .hex / .gpl import and export. Each project keeps
// its own *copy* of its active palette (`project.palette`) — editing that never
// changes the library until "Save to library".
import { signal } from '@preact/signals';
import type { Hex, ID, PaletteLibraryEntry } from '../types/model';
import { deletePalette, listPalettes, putPalette } from '../db/db';
import { makeId } from '../model/id';
import { parsePaletteFile, serializeGplPalette, serializeHexPalette } from '../engine/paletteFormats';

export const paletteLibrary = signal<PaletteLibraryEntry[]>([]);

const SEEDED_KEY = 'ascii_buddy:palettes:seeded';

// Original starter palettes (§7.3) — fixed ids so a re-seed can never duplicate them.
const STARTERS: PaletteLibraryEntry[] = [
  { id: 'starter-ink', name: 'Ink', swatches: ['#000000', '#404040', '#808080', '#C0C0C0', '#E0E0E0', '#FFFFFF'] },
  {
    id: 'starter-terminal',
    name: 'Terminal',
    swatches: ['#001A00', '#003B00', '#008F11', '#33FF33', '#A6FFA6', '#2B1700', '#FF7A00', '#FFB000'],
  },
  { id: 'starter-sunset', name: 'Sunset', swatches: ['#2B0F3A', '#6B1D5E', '#C2185B', '#FF5A36', '#FFA630', '#FFE066', '#FFF4D6'] },
  { id: 'starter-harbor', name: 'Harbor', swatches: ['#0B1F3A', '#1D4E89', '#2A9D8F', '#8AB17D', '#E9C46A', '#F4A261', '#E76F51', '#F1FAEE'] },
];

function seededBefore(): boolean {
  try {
    return localStorage.getItem(SEEDED_KEY) === '1';
  } catch {
    return false;
  }
}

function sorted(entries: PaletteLibraryEntry[]): PaletteLibraryEntry[] {
  return [...entries].sort((a, b) => a.name.localeCompare(b.name));
}

export async function loadPaletteLibrary(): Promise<void> {
  try {
    let entries = await listPalettes();
    if (!seededBefore()) {
      for (const starter of STARTERS) {
        if (!entries.some((e) => e.id === starter.id)) await putPalette(starter);
      }
      try {
        localStorage.setItem(SEEDED_KEY, '1');
      } catch {
        // best effort — worst case the starters are offered again next launch
      }
      entries = await listPalettes();
    }
    paletteLibrary.value = sorted(entries);
  } catch {
    paletteLibrary.value = [];
  }
}

async function upsert(entry: PaletteLibraryEntry): Promise<void> {
  await putPalette(entry);
  paletteLibrary.value = sorted([...paletteLibrary.value.filter((e) => e.id !== entry.id), entry]);
}

/** "Save to library": overwrites the library palette with the same name, otherwise adds a new one. */
export async function savePaletteToLibrary(name: string, swatches: Hex[]): Promise<void> {
  const trimmed = name.trim() || 'Untitled palette';
  const existing = paletteLibrary.value.find((e) => e.name.toLowerCase() === trimmed.toLowerCase());
  await upsert({ id: existing?.id ?? makeId(), name: trimmed, swatches: [...swatches] });
}

export async function renameLibraryPalette(id: ID, name: string): Promise<void> {
  const entry = paletteLibrary.value.find((e) => e.id === id);
  if (entry && name.trim()) await upsert({ ...entry, name: name.trim() });
}

export async function duplicateLibraryPalette(id: ID): Promise<void> {
  const entry = paletteLibrary.value.find((e) => e.id === id);
  if (!entry) return;
  const names = new Set(paletteLibrary.value.map((e) => e.name));
  let name = `${entry.name} copy`;
  for (let n = 2; names.has(name); n++) name = `${entry.name} copy ${n}`;
  await upsert({ id: makeId(), name, swatches: [...entry.swatches] });
}

export async function removeLibraryPalette(id: ID): Promise<void> {
  await deletePalette(id);
  paletteLibrary.value = paletteLibrary.value.filter((e) => e.id !== id);
}

/** Imports a `.hex` / `.gpl` file as a new library palette. Returns it, or null if no colors were found. */
export async function importPaletteFile(file: File): Promise<PaletteLibraryEntry | null> {
  const parsed = parsePaletteFile(file.name, await file.text());
  if (parsed.swatches.length === 0) return null;
  const entry: PaletteLibraryEntry = { id: makeId(), name: parsed.name ?? 'Imported palette', swatches: parsed.swatches };
  await upsert(entry);
  return entry;
}

export function exportPaletteFile(name: string, swatches: Hex[], format: 'hex' | 'gpl'): void {
  const text = format === 'hex' ? serializeHexPalette(swatches) : serializeGplPalette(name, swatches);
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name.replace(/[^\w.-]+/g, '_') || 'palette'}.${format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
