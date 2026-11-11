// Plain-text export of ASCII frames (§15.2 TXT and Copy text). Pure functions over AsciiFrame.
import type { AsciiFrame } from '../types/model';

/** One frame as text: rows joined by newlines, empty grid cells as spaces. */
export function frameToText(frame: AsciiFrame, trimTrailing: boolean): string {
  const lines: string[] = [];
  for (let row = 0; row < frame.rows; row++) {
    let line = '';
    for (let col = 0; col < frame.columns; col++) {
      const cp = frame.chars[row * frame.columns + col];
      line += cp ? String.fromCodePoint(cp) : ' ';
    }
    lines.push(trimTrailing ? line.replace(/ +$/, '') : line);
  }
  return lines.join('\n');
}

export interface TextFrame {
  number: number; // 1-based frame number shown in the separator
  frame: AsciiFrame;
}

export interface TextOptions {
  separator: 'marker' | 'formfeed';
  trimTrailing: boolean;
}

/** All frames in one text: `--- frame 3 ---` headings with a blank line between frames, or form feeds. */
export function framesToText(frames: TextFrame[], options: TextOptions): string {
  if (options.separator === 'formfeed') {
    return frames.map((f) => frameToText(f.frame, options.trimTrailing)).join('\n\f') + '\n';
  }
  return frames.map((f) => `--- frame ${f.number} ---\n${frameToText(f.frame, options.trimTrailing)}\n`).join('\n');
}
