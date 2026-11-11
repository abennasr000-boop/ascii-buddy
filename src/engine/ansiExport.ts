// ANSI export (§15.2): colored terminal text with 24-bit escape codes. Pure functions over AsciiFrame.
import type { AsciiFrame, Hex } from '../types/model';
import { hexToRgb } from './color';

const ESC = '\u001b';
const RESET = `${ESC}[0m`;
/** Clears the screen and homes the cursor — what makes `cat`-ing a multi-frame file play as a flip-book. */
export const CLEAR_SCREEN = `${ESC}[2J${ESC}[H`;

function fg(hex: Hex): string {
  const { r, g, b } = hexToRgb(hex);
  return `${ESC}[38;2;${r};${g};${b}m`;
}

function bg(hex: Hex): string {
  const { r, g, b } = hexToRgb(hex);
  return `${ESC}[48;2;${r};${g};${b}m`;
}

export interface AnsiOptions {
  colors: Hex[]; // project color table
  background: Hex;
  /** Paint the project's background color behind the art (every row is padded to the full width). */
  paintBackground: boolean;
}

/** One frame: each row is set in its colors and reset at the end of the line. */
export function frameToAnsi(frame: AsciiFrame, opts: AnsiOptions): string {
  const lines: string[] = [];
  for (let row = 0; row < frame.rows; row++) {
    let line = opts.paintBackground ? bg(opts.background) : '';
    let current = -1; // color index currently set
    let last = frame.columns - 1;
    if (!opts.paintBackground) while (last >= 0 && !frame.chars[row * frame.columns + last]) last--; // trim trailing blanks
    for (let col = 0; col <= last; col++) {
      const i = row * frame.columns + col;
      const cp = frame.chars[i];
      if (!cp) {
        line += ' ';
        continue;
      }
      const color = frame.colors[i];
      if (color !== current) {
        line += fg(opts.colors[color] || '#000000');
        current = color;
      }
      line += String.fromCodePoint(cp);
    }
    lines.push(line + RESET);
  }
  return lines.join('\n');
}

/** Several frames, each cleared and redrawn from the top-left so the file plays in a terminal. */
export function framesToAnsi(frames: AsciiFrame[], opts: AnsiOptions): string {
  if (frames.length === 1) return frameToAnsi(frames[0], opts) + '\n';
  return frames.map((f) => CLEAR_SCREEN + frameToAnsi(f, opts) + '\n').join('');
}
