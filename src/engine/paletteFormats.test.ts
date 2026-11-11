import { describe, expect, it } from 'vitest';
import { parseGplPalette, parseHexPalette, parsePaletteFile, serializeGplPalette, serializeHexPalette } from './paletteFormats';

describe('.hex', () => {
  it('parses Lospec-style lines, with or without #, ignoring junk and duplicates', () => {
    const p = parseHexPalette('ff0000\n#00FF00\r\n0000ff ; blue\nnot a color\n\nFF0000\nabc\n');
    expect(p.swatches).toEqual(['#FF0000', '#00FF00', '#0000FF', '#AABBCC']);
  });
  it('round-trips', () => {
    const swatches = ['#000000', '#FFFFFF', '#FF8800'];
    expect(parseHexPalette(serializeHexPalette(swatches)).swatches).toEqual(swatches);
  });
});

describe('.gpl', () => {
  it('parses name and RGB rows, ignoring comments and headers', () => {
    const p = parseGplPalette('GIMP Palette\nName: Sunset\nColumns: 4\n# comment\n255 0 0 Red\n  0 128 255\tSky\n');
    expect(p.name).toBe('Sunset');
    expect(p.swatches).toEqual(['#FF0000', '#0080FF']);
  });
  it('round-trips', () => {
    const swatches = ['#010203', '#FFFFFF'];
    const p = parseGplPalette(serializeGplPalette('Mine', swatches));
    expect(p).toEqual({ name: 'Mine', swatches });
  });
});

describe('parsePaletteFile', () => {
  it('picks the parser by extension or header and defaults the name to the file name', () => {
    expect(parsePaletteFile('cool-set.hex', 'ff0000\n')).toEqual({ name: 'cool-set', swatches: ['#FF0000'] });
    expect(parsePaletteFile('x.txt', 'GIMP Palette\nName: G\n1 2 3\n').name).toBe('G');
  });
});
