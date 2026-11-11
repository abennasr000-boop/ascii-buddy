import { describe, expect, it } from 'vitest';
import { compactColorTable, remapKeys } from './colorTable';
import { deflateSync } from 'fflate';
import { remapCelData, usedIndicesInCelData } from './celCodec';

describe('compactColorTable', () => {
  const table = ['', '#000000', '#FF0000', '#00FF00', '#0000FF'];
  it('keeps used colors in order and renumbers them', () => {
    const r = compactColorTable(table, new Set([1, 3]));
    expect(r.colors).toEqual(['', '#000000', '#00FF00']);
    expect(r.removed).toBe(2);
    expect([r.map[1], r.map[2], r.map[3], r.map[4]]).toEqual([1, 0, 2, 0]);
  });
  it('changes nothing when everything is used', () => {
    const r = compactColorTable(table, new Set([1, 2, 3, 4]));
    expect(r.colors).toEqual(table);
    expect(r.removed).toBe(0);
  });
  it('remaps character-map keys and drops removed colors', () => {
    const r = compactColorTable(table, new Set([1, 3]));
    expect(remapKeys({ 1: 'a', 2: 'b', 3: 'c' }, r.map)).toEqual({ 1: 'a', 2: 'c' });
  });
});

describe('stored cel helpers', () => {
  const data = deflateSync(new Uint8Array([0, 1, 3, 3, 0, 1]));
  it('finds the indices in use', () => {
    expect([...usedIndicesInCelData(data)].sort()).toEqual([1, 3]);
  });
  it('remaps indices through a table', () => {
    const map = new Uint8Array(256);
    map[1] = 1;
    map[3] = 2;
    const out = remapCelData(data, map);
    expect([...usedIndicesInCelData(out)].sort()).toEqual([1, 2]);
  });
});
