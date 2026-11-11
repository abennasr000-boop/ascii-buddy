import { describe, expect, it } from 'vitest';
import { buildHtmlPlayer, escapeHtml, frameToHtml, scriptJson } from './htmlPlayer';
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

describe('frameToHtml', () => {
  it('groups same-coloured characters into one span and escapes markup', () => {
    const f = frameOf([[['<', 1], ['&', 1], ['x', 2], [' ', 0]]]);
    expect(frameToHtml(f)).toBe('<span class="c1">&lt;&amp;</span><span class="c2">x </span>');
  });
  it('separates rows with newlines', () => {
    const f = frameOf([[['a', 1]], [['b', 1]]]);
    expect(frameToHtml(f)).toBe('<span class="c1">a</span>\n<span class="c1">b</span>');
  });
  it('does not split a coloured run for spaces in the middle', () => {
    const f = frameOf([[['a', 1], [' ', 0], ['b', 1]]]);
    expect(frameToHtml(f)).toBe('<span class="c1">a b</span>');
  });
});

describe('buildHtmlPlayer', () => {
  const f1 = frameOf([[['a', 1], ['b', 2]]]);
  const f2 = frameOf([[['c', 1], ['d', 2]]]);
  const html = buildHtmlPlayer({
    title: 'Walk </script> cycle',
    background: '#F0F0E8',
    colors: ['', '#112233', '#445566'],
    frames: [f1, f2],
    durations: [1, 3],
    fps: 12,
    mode: 'pingpong',
    fonts: [{ family: 'Departure Mono', base64: 'AAAA' }],
    fontStack: "'Departure Mono', monospace",
    advanceEm: 0.6,
  });

  it('is a self-contained document with the colours, font and background embedded', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('.c1{color:#112233}');
    expect(html).toContain('data:font/woff2;base64,AAAA');
    expect(html).toContain('background:#F0F0E8');
    expect(html).not.toMatch(/https?:\/\//);
  });
  it('carries holds, fps and playback mode for the script', () => {
    expect(html).toContain('var ticks=[1,3];');
    expect(html).toContain('var fps=12;');
    expect(html).toContain('var mode="pingpong";');
  });
  it('shows frame 1 as real text before any script runs', () => {
    expect(html).toContain('<pre id="art"><span class="c1">a</span><span class="c2">b</span></pre>');
  });
  it('cannot be broken out of by a title or data containing markup', () => {
    expect(html).toContain('<title>Walk &lt;/script&gt; cycle</title>');
    expect(scriptJson(['</script>'])).not.toContain('</script>');
    expect(escapeHtml('<a>')).toBe('&lt;a&gt;');
  });
});
