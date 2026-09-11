import type { AppSettings, ConversionSettings, OnionSettings, Project } from '../types/model';
import { makeId } from './id';
import { CANVAS_PRESETS, sizeForPreset, type CanvasPreset } from './canvas';
import { rowsFor } from '../types/model';

export const RAMP_PRESETS: Record<string, string> = {
  Classic: '.:-=+*#%@',
  Long: ".'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",
  Minimal: '.oO@',
};

export const DEFAULT_SHAPE_CHARS = "-_|/\\()<>^v',.:;+x=[]o";

export const DEFAULT_COLUMNS = 80;
export const COLUMN_PRESETS = [
  { label: 'Low', columns: 40 },
  { label: 'Medium', columns: 80 },
  { label: 'High', columns: 160 },
  { label: 'Ultra', columns: 240 },
];

export function defaultConversionSettings(): ConversionSettings {
  return {
    style: 'ramp',
    ramp: RAMP_PRESETS.Classic,
    shapeChars: DEFAULT_SHAPE_CHARS,
    threshold: 0,
    density: 0.3, // tuned down from the spec's γ=0.5 starting point — see DECISIONS.md
    hybridCutoff: 0.45,
  };
}

export function defaultOnionSettings(): OnionSettings {
  return {
    enabled: false,
    before: 1,
    after: 1,
    colorBefore: '#8B3FD9',
    colorAfter: '#FF8A00',
    opacity: 0.4,
    falloff: 0.6,
    wrap: false,
    scope: 'all',
  };
}

export function defaultAppSettings(): AppSettings {
  return {
    drawWithFinger: false,
    leftHanded: false,
    canvasRotation: false,
    tapGestures: true,
    hideReferencesDuringPlayback: false,
    autosaveDelayMs: 1500,
  };
}

export const DEFAULT_CANVAS_PRESET: CanvasPreset = CANVAS_PRESETS[0]; // 4:3

export interface NewProjectOptions {
  name: string;
  canvasPreset: CanvasPreset;
  columns: number;
  background: string;
  fps: number;
}

export function createProject(opts: NewProjectOptions): Project {
  const now = Date.now();
  const size = sizeForPreset(opts.canvasPreset);
  const frameId = makeId();
  const trackId = makeId();

  return {
    schemaVersion: 1,
    id: makeId(),
    name: opts.name,
    createdAt: now,
    updatedAt: now,

    canvas: { aspect: opts.canvasPreset.aspect, width: size.width, height: size.height },
    grid: { columns: opts.columns },
    background: opts.background,
    fps: opts.fps,
    playbackMode: 'loop',

    colors: [''], // index 0 is the unused/transparent placeholder — see §17's ID comment
    palette: { name: 'Ink', swatches: ['#000000', '#FFFFFF', '#808080', '#C0C0C0'] },

    conversion: defaultConversionSettings(),
    charset: 'ascii',
    asciiFont: 'pixel',
    crispGlyphs: true,
    colorChars: { enabled: false, map: {} },

    onion: defaultOnionSettings(),
    ui: { view: 'raster', hideReferences: false, currentFrameId: frameId, currentTrackId: trackId },

    tracks: [
      { id: trackId, name: 'Layer 1', kind: 'drawing', isStatic: false, visible: true, locked: false, opacity: 1 },
    ],
    frames: [{ id: frameId, duration: 1 }],
  };
}

export function gridReadout(columns: number, width: number, height: number): string {
  return `${columns} × ${rowsFor(columns, width, height)} characters`;
}
