// Palette file formats: `.hex` (one hex color per line — Lospec-compatible)
// and `.gpl` (GIMP). Pure text in / text out. See ASCII_BUDDY_SPEC.md §7.3.
import type { Hex } from '../types/model';

export interface ParsedPalette {
  name?: string;
  swatches: Hex[];
}

const HEX6 = /^#?([0-9a-fA-F]{6})$/;
const HEX3 = /^#?([0-9a-fA-F]{3})$/;

function normaliseHex(token: string): Hex | null {
  const t = token.trim();
  const six = HEX6.exec(t);
  if (six) return `#${six[1].toUpperCase()}`;
  const three = HEX3.exec(t);
  if (three) return `#${[...three[1]].map((c) => c + c).join('').toUpperCase()}`;
  return null;
}

function dedupe(swatches: Hex[]): Hex[] {
  return [...new Set(swatches)];
}

export function parseHexPalette(text: string): ParsedPalette {
  const swatches: Hex[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split(/[;\s]/)[0]; // tolerate trailing comments / names
    const hex = normaliseHex(line);
    if (hex) swatches.push(hex);
  }
  return { swatches: dedupe(swatches) };
}

export function parseGplPalette(text: string): ParsedPalette {
  const lines = text.split(/\r?\n/);
  let name: string | undefined;
  const swatches: Hex[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || /^GIMP Palette/i.test(line) || /^Columns:/i.test(line)) continue;
    const nameMatch = /^Name:\s*(.*)$/i.exec(line);
    if (nameMatch) {
      name = nameMatch[1].trim() || undefined;
      continue;
    }
    const m = /^(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})(?:\s|$)/.exec(line);
    if (!m) continue;
    const [r, g, b] = [m[1], m[2], m[3]].map((v) => Math.min(255, Number(v)));
    swatches.push(`#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}` as Hex);
  }
  return { name, swatches: dedupe(swatches) };
}

/** Picks the parser from the file name (falling back to sniffing the header). */
export function parsePaletteFile(fileName: string, text: string): ParsedPalette {
  const base = fileName.replace(/\.[^.]+$/, '');
  const isGpl = /\.gpl$/i.test(fileName) || /^GIMP Palette/i.test(text.trimStart());
  const parsed = isGpl ? parseGplPalette(text) : parseHexPalette(text);
  return { name: parsed.name ?? (base || undefined), swatches: parsed.swatches };
}

export function serializeHexPalette(swatches: Hex[]): string {
  return swatches.map((s) => s.replace('#', '').toLowerCase()).join('\n') + '\n';
}

export function serializeGplPalette(name: string, swatches: Hex[]): string {
  const rows = swatches.map((hex) => {
    const n = parseInt(hex.slice(1), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    return `${String(r).padStart(3)} ${String(g).padStart(3)} ${String(b).padStart(3)} ${hex.toUpperCase()}`;
  });
  return `GIMP Palette\nName: ${name}\nColumns: 8\n#\n${rows.join('\n')}\n`;
}
