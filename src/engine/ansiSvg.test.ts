import { describe, expect, it } from 'vitest';
import { frameToAnsi, framesToAnsi, CLEAR_SCREEN } from './ansiExport';
import { frameToSvg } from './svgExport';
import type { AsciiFrame } from '../types/model';

function frameOf(rows: Array<Array<[string, number]>>): AsciiFrame {
  const columns = rows[0].length;
  const chars = new Uint32Array(columns * rows.length);
  const colors = new Uint8Array(columns * rows.length);
  rows.forEach((row, r) =>
    row.forEach(([ch, color], c) => {
      chars[r * columns + c] = ch === ' ' ? 0 : ch.codePointAt(0)!;
      colors[r * columns + c] = color;
    }),
  );
  return { columns, rows: rows.length, chars, colors, owner: new Uint8Array(chars.length).fill(1) };
}

const colors = ['', '#FF0000', '#00FF80'];
const frame = frameOf([
  [['a', 1], ['b', 1], ['c', 2], [' ', 0]],
  [[' ', 0], [' ', 0], [' ', 0], [' ', 0]],
]);

describe('ANSI export', () => {
  it('sets a 24-bit foreground color once per run and resets at the end of each line', () => {
    const out = frameToAnsi(frame, { colors, background: '#FFFFFF', paintBackground: false });
    expect(out).toBe('\u001b[38;2;255;0;0mab\u001b[38;2;0;255;128mc\u001b[0m\n\u001b[0m');
  });
  it('can paint the project background and then pads every row to full width', () => {
    const out = frameToAnsi(frame, { colors, background: '#102030', paintBackground: true });
    expect(out.startsWith('\u001b[48;2;16;32;48m')).toBe(true);
    expect(out.split('\n')[0].endsWith('c \u001b[0m')).toBe(true);
    expect(out.split('\n')[1]).toBe('\u001b[48;2;16;32;48m    \u001b[0m');
  });
  it('several frames each clear the screen first; one frame does not', () => {
    const opts = { colors, background: '#FFFFFF', paintBackground: false };
    expect(framesToAnsi([frame], opts).includes(CLEAR_SCREEN)).toBe(false);
    expect(framesToAnsi([frame, frame], opts).split(CLEAR_SCREEN)).toHaveLength(3);
  });
});

describe('SVG export', () => {
  const svg = frameToSvg(frame, { colors, background: '#FFFFFF', transparent: false, width: 40, height: 20, fontStack: "'Departure Mono', monospace", advanceEm: 0.6 });
  it('is real text: one <text> per same-colored run, pinned to the grid with textLength', () => {
    expect(svg).toContain('<text x="0" y="');
    expect(svg).toContain('fill="#FF0000" textLength="20" lengthAdjust="spacing">ab</text>');
    expect(svg).toContain('x="20"');
    expect(svg).toContain('>c</text>');
    expect(svg.match(/<text /g)).toHaveLength(2);
  });
  it('has a background rect unless transparent', () => {
    expect(svg).toContain('<rect width="100%" height="100%" fill="#FFFFFF"/>');
    const clear = frameToSvg(frame, { colors, background: '#FFFFFF', transparent: true, width: 40, height: 20, fontStack: 'monospace', advanceEm: 0.6 });
    expect(clear).not.toContain('<rect');
  });
  it('escapes markup characters in the art', () => {
    const f = frameOf([[['<', 1], ['&', 1]]]);
    expect(frameToSvg(f, { colors, background: '#FFF', transparent: true, width: 20, height: 10, fontStack: 'monospace', advanceEm: 0.6 })).toContain('&lt;&amp;');
  });
});
