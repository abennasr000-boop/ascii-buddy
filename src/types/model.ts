// Data model. Mirrors ASCII_BUDDY_SPEC.md §17 exactly — keep this file in
// sync with the spec rather than adding convenience fields here.

export type ID = string; // short random id
export type Hex = string; // "#RRGGBB"

export interface Project {
  schemaVersion: 1;
  id: ID;
  name: string;
  createdAt: number;
  updatedAt: number;
  lastExportedAt?: number;

  canvas: { aspect: [number, number]; width: number; height: number };
  grid: { columns: number }; // rows derived with rowsFor()
  background: Hex;
  fps: number;
  playbackMode: 'loop' | 'pingpong' | 'once';

  colors: Hex[]; // project color table; index 0 unused (transparent), max 255 entries
  palette: { name: string; swatches: Hex[] }; // project's active palette

  conversion: ConversionSettings; // project-level defaults
  charset: 'ascii' | 'extended';
  asciiFont: 'pixel' | 'smooth';
  crispGlyphs: boolean;
  colorChars: { enabled: boolean; map: Record<number, string> }; // color index → character

  onion: OnionSettings;
  ui: { view: 'raster' | 'ascii'; hideReferences: boolean; currentFrameId: ID; currentTrackId: ID };

  tracks: Track[]; // index 0 = top of the stack
  frames: Frame[]; // at least one
}

export interface ConversionSettings {
  style: 'ramp' | 'hybrid' | 'shape';
  ramp: string; // non-empty characters, light → dense (space is implicit)
  shapeChars: string;
  threshold: number; // 0–0.9
  density: number; // gamma, 0.2–3
  hybridCutoff: number; // 0–1
}
export type ConversionOverride = Partial<ConversionSettings>;

export interface OnionSettings {
  enabled: boolean;
  before: number;
  after: number;
  colorBefore: Hex;
  colorAfter: Hex;
  opacity: number; // nearest frame, 0–1
  falloff: number; // multiplier per additional frame
  wrap: boolean;
  scope: 'all' | 'current';
}

export interface Frame {
  id: ID;
  duration: number;
} // duration in ticks (hold), ≥ 1

export interface Track {
  id: ID;
  name: string;
  kind: 'drawing' | 'reference';
  isStatic: boolean;
  visible: boolean;
  locked: boolean;
  opacity: number; // reference tracks only, 0–1
  conversion?: ConversionOverride; // drawing tracks only
}

// Stored separately from the project JSON. Static tracks use frameId = 'static'.
export interface DrawingCel {
  projectId: ID;
  trackId: ID;
  frameId: ID | 'static';
  version: number; // increments on every edit (cache key)
  bbox: { x: number; y: number; w: number; h: number } | null; // null = empty
  data: Uint8Array; // bbox-sized indexed pixels (compressed at rest)
  conversion?: ConversionOverride;
}

export interface ReferenceCel {
  projectId: ID;
  trackId: ID;
  frameId: ID | 'static';
  imageId: ID;
  transform: { x: number; y: number; scale: number; rotation: number }; // center in canvas px; rotation in radians
}

// Output of the conversion engine for one frame.
export interface AsciiFrame {
  columns: number;
  rows: number;
  chars: Uint32Array; // Unicode code point per grid cell, 0 = empty
  colors: Uint8Array; // color index per grid cell
  owner: Uint8Array; // claiming track position + 1, 0 = none
}

export interface PaletteLibraryEntry {
  id: ID;
  name: string;
  swatches: Hex[];
}

export interface AppSettings {
  drawWithFinger: boolean;
  leftHanded: boolean;
  canvasRotation: boolean;
  tapGestures: boolean;
  hideReferencesDuringPlayback: boolean;
  autosaveDelayMs: number;
}

export function rowsFor(columns: number, width: number, height: number): number {
  return Math.max(1, Math.round((columns * height) / (2 * width)));
}
