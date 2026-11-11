import { describe, expect, it } from 'vitest';
import { frameToText, framesToText } from './textExport';
import { convertToAsciiFrame } from './asciiConvert';
import { computeFullGridStats } from './gridStats';
import { createCelBuffer, strokeSegment, emptyBBox } from './rasterCel';
import { defaultConversionSettings } from '../model/defaults';
import { rowsFor, type AsciiFrame } from '../types/model';

function frameOf(rows: string[]): AsciiFrame {
  const columns = rows[0].length;
  const chars = new Uint32Array(columns * rows.length);
  rows.forEach((row, r) => Array.from(row).forEach((ch, c) => (chars[r * columns + c] = ch === ' ' ? 0 : ch.codePointAt(0)!)));
  return { columns, rows: rows.length, chars, colors: new Uint8Array(chars.length).fill(1), owner: new Uint8Array(chars.length).fill(1) };
}

describe('frameToText', () => {
  const frame = frameOf(['ab  ', '  █ ', '    ']);
  it('writes one line per grid row, empty cells as spaces', () => {
    expect(frameToText(frame, false)).toBe('ab  \n  █ \n    ');
  });
  it('can trim trailing spaces', () => {
    expect(frameToText(frame, true)).toBe('ab\n  █\n');
  });
  it('keeps extended characters (UTF-8)', () => {
    expect(frameToText(frameOf(['═╬']), false)).toBe('═╬');
  });
});

describe('framesToText', () => {
  const frames = [
    { number: 1, frame: frameOf(['a ']) },
    { number: 3, frame: frameOf(['b ']) },
  ];
  it('separates frames with a blank line and a "--- frame N ---" heading', () => {
    expect(framesToText(frames, { separator: 'marker', trimTrailing: true })).toBe('--- frame 1 ---\na\n\n--- frame 3 ---\nb\n');
  });
  it('can use form feeds instead', () => {
    expect(framesToText(frames, { separator: 'formfeed', trimTrailing: true })).toBe('a\n\fb\n');
  });
});

// Golden test (§20): a fixed drawing through the real conversion pipeline must keep producing this exact
// text, so any change to the engine's output is noticed.
describe('golden: a fixed drawing converts to fixed text', () => {
  it('a horizontal bar and a diagonal, ramp style', () => {
    const width = 160;
    const height = 96;
    const columns = 20;
    const rows = rowsFor(columns, width, height);
    const buf = createCelBuffer(width, height);
    const dirty = emptyBBox();
    strokeSegment(buf, width, height, 16, 20, 144, 20, 8, 'round', 1, dirty);
    strokeSegment(buf, width, height, 16, 40, 100, 90, 8, 'round', 1, dirty);
    const stats = computeFullGridStats(buf, width, height, columns, rows, false);
    const frame = convertToAsciiFrame(stats, defaultConversionSettings());
    expect(frameToText(frame, true)).toBe(['', ' *%%%%%%%%%%%%%%%%*', ' *%#+', '  -*%%%*', '      +%%%#=', '         =#%%'].join('\n'));
  });
});
