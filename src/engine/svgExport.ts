// SVG export (§15.2): one ASCII frame as `<text>` elements — real, selectable, editable text. Pure string building.
import type { AsciiFrame, Hex } from '../types/model';
import { escapeHtml } from './htmlPlayer';

export interface SvgOptions {
  colors: Hex[];
  background: Hex;
  transparent: boolean;
  width: number; // output size in px (the SVG's viewBox and size)
  height: number;
  fontStack: string;
  /** Advance width of the font as a fraction of its size, so a run fits the grid it sits on. */
  advanceEm: number;
  /** Optional base64 woff2 files to embed, so the art looks the same on machines without the font. */
  fonts?: Array<{ family: string; base64: string }>;
}

function fmt(n: number): string {
  return String(Math.round(n * 100) / 100);
}

export function frameToSvg(frame: AsciiFrame, o: SvgOptions): string {
  const cellW = o.width / frame.columns;
  const cellH = o.height / frame.rows;
  const fontSize = cellW / o.advanceEm;
  const texts: string[] = [];
  for (let row = 0; row < frame.rows; row++) {
    const baseline = row * cellH + cellH * 0.5 + fontSize * 0.3;
    let col = 0;
    while (col < frame.columns) {
      const i = row * frame.columns + col;
      if (!frame.chars[i]) {
        col++;
        continue;
      }
      // a run: consecutive non-empty cells of one color
      const color = frame.colors[i];
      let end = col;
      let text = '';
      while (end < frame.columns && frame.chars[row * frame.columns + end] && frame.colors[row * frame.columns + end] === color) {
        text += String.fromCodePoint(frame.chars[row * frame.columns + end]);
        end++;
      }
      // textLength pins every character to its grid cell whatever the fallback font's own advance is
      texts.push(
        `<text x="${fmt(col * cellW)}" y="${fmt(baseline)}" fill="${o.colors[color] || '#000000'}" textLength="${fmt((end - col) * cellW)}" lengthAdjust="spacing">${escapeHtml(text)}</text>`,
      );
      col = end;
    }
  }
  const fontFaces = (o.fonts ?? []).map((f) => `@font-face{font-family:'${f.family}';src:url(data:font/woff2;base64,${f.base64}) format('woff2');}`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${o.width}" height="${o.height}" viewBox="0 0 ${o.width} ${o.height}">
<style>${fontFaces}text{font-family:${o.fontStack.replace(/"/g, "'")};font-size:${fmt(fontSize)}px;white-space:pre}</style>
${o.transparent ? '' : `<rect width="100%" height="100%" fill="${o.background}"/>\n`}<g xml:space="preserve">
${texts.join('\n')}
</g>
</svg>
`;
}
