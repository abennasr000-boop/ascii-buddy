// The Select tool's state and actions. See ASCII_BUDDY_SPEC.md §6.3.
//
// A selection is a pixel block (indexed pixels + which of them are selected)
// at a canvas position. It starts "in place" (the cel is untouched). The first
// real change — a move, scale, flip, rotate or nudge — *lifts* it: the selected
// pixels are cut out of the cel into the floating block, which is drawn by
// SelectionOverlay. Committing (tapping outside, changing tool/frame/track,
// undo/redo, any save) stamps the block back down and records ONE undo step
// covering the source and destination, so a whole move/scale is a single undo.
import { signal, effect } from '@preact/signals';
import type { Hex, ID, Project } from '../types/model';
import { rowsFor } from '../types/model';
import {
  clearBlockArea,
  extractBlock,
  flipBlockH,
  flipBlockV,
  polygonMask,
  rectFromCorners,
  rectMask,
  rotateBlock90,
  scaleBlock,
  stampBlock,
  type PixelBlock,
  type Point,
  type Rect,
} from '../engine/selection';
import { liveCels, bumpCelVersion } from './celStore';
import { commitCelEdit } from './celActions';
import { recomputeStatsRegion } from './asciiState';
import { registerBeforeFlush } from './autosave';
import { registerBeforeHistoryChange } from './history';
import { projects } from './projects';
import { ensureColorIndex } from './colorTable';
import { currentTool, selectMode, snapOverride } from './tools';
import { colorTableFull } from './uiFlags';

export interface Selection {
  projectId: ID;
  trackId: ID;
  frameId: ID | 'static';
  /** Top-left of the block, in canvas pixels. May be off-canvas while floating (clipped on commit). */
  x: number;
  y: number;
  block: PixelBlock;
  lifted: boolean;
}

export type Marquee = { kind: 'rect'; a: Point; b: Point } | { kind: 'lasso'; points: Point[] };

export const selection = signal<Selection | null>(null);
export const marquee = signal<Marquee | null>(null);

// ---- internal clipboard (§6.3: separate from the system clipboard) -----------

interface ClipboardData {
  x: number;
  y: number;
  block: PixelBlock;
  /** Color index → hex, so a paste into another project (different color table) keeps its colors. */
  palette: Map<number, Hex>;
}

let clipboard: ClipboardData | null = null;
export const hasClipboard = signal(false);
/** True right after an in-app copy, until the window loses focus — used to decide whether ⌘V means
 * "paste my selection" or "paste the image that's on the system clipboard". */
let internalCopyFresh = false;
export function internalClipboardIsFresh(): boolean {
  return clipboard !== null && internalCopyFresh;
}
window.addEventListener('blur', () => (internalCopyFresh = false));

// ---- live-cel access ------------------------------------------------------------

/** Where the lifted selection came from, and the untouched cel to diff against for undo. */
let session: { before: Uint8Array | null; source: Rect | null } = { before: null, source: null };

function celFor(sel: Selection) {
  const cel = liveCels.value.get(sel.trackId);
  return cel && cel.frameId === sel.frameId ? cel : null;
}

function currentProjectFor(sel: Selection): Project | undefined {
  return projects.value.find((p) => p.id === sel.projectId);
}

function blockRect(sel: Selection): Rect {
  return { x: sel.x, y: sel.y, w: sel.block.width, h: sel.block.height };
}

function unionRect(a: Rect | null, b: Rect): Rect {
  if (!a) return b;
  const x0 = Math.min(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const x1 = Math.max(a.x + a.w, b.x + b.w);
  const y1 = Math.max(a.y + a.h, b.y + b.h);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// ---- lift / commit ----------------------------------------------------------------

/** Cuts the selected pixels out of the cel into the floating block. No-op if already floating. */
function ensureLifted(): Selection | null {
  const sel = selection.value;
  if (!sel) return null;
  if (sel.lifted) return sel;
  const cel = celFor(sel);
  if (!cel) return null;
  session = { before: cel.buf.slice(), source: blockRect(sel) };
  clearBlockArea(cel.buf, cel.width, session.source!, sel.block.mask);
  bumpCelVersion(sel.trackId);
  recomputeStatsRegion(sel.trackId, { x: session.source!.x, y: session.source!.y, w: session.source!.w, h: session.source!.h });
  const lifted = { ...sel, lifted: true };
  selection.value = lifted;
  return lifted;
}

/** Stamps a floating selection back into its cel as one undo step, then clears the selection. */
export function commitSelection(): void {
  if (dragging) return; // never pull a selection out from under a live drag
  const sel = selection.value;
  marquee.value = null;
  if (!sel) return;
  selection.value = null;
  if (!sel.lifted) return;
  const cel = celFor(sel);
  const before = session.before;
  const source = session.source;
  session = { before: null, source: null };
  if (!cel || !before) return;
  stampBlock(cel.buf, cel.width, cel.height, sel.block, sel.x, sel.y);
  const area = unionRect(source, blockRect(sel));
  commitCelEdit(sel.projectId, sel.trackId, before, { x0: area.x, y0: area.y, x1: area.x + area.w - 1, y1: area.y + area.h - 1 });
}

/** Drops the selection without touching the cel (used when leaving the editor; the flush hook has already committed). */
export function discardSelection(): void {
  selection.value = null;
  marquee.value = null;
  session = { before: null, source: null };
  dragging = null;
}

// Anything that persists or reshapes the cels commits a floating selection first.
registerBeforeFlush(commitSelection);
registerBeforeHistoryChange(commitSelection);

// Changing tool or track commits (§6.3). Frame changes go through reloadAllTrackData → flush → the hook above.
effect(() => {
  const tool = currentTool.value;
  const sel = selection.value;
  if (!sel) return;
  const project = currentProjectFor(sel);
  if (tool !== 'select' || (project && project.ui.currentTrackId !== sel.trackId)) commitSelection();
});
for (const event of ['visibilitychange', 'pagehide'] as const) {
  (event === 'pagehide' ? window : document).addEventListener(event, () => {
    if (event === 'pagehide' || document.visibilityState === 'hidden') commitSelection();
  });
}

// ---- creating selections ----------------------------------------------------------------

function setSelection(project: Project, trackId: ID, frameId: ID | 'static', rect: Rect, mask: Uint8Array) {
  const cel = liveCels.value.get(trackId);
  if (!cel) return;
  selection.value = {
    projectId: project.id,
    trackId,
    frameId,
    x: rect.x,
    y: rect.y,
    block: extractBlock(cel.buf, cel.width, rect, mask),
    lifted: false,
  };
}

export function selectAll(project: Project, trackId: ID): void {
  commitSelection();
  const cel = liveCels.value.get(trackId);
  if (!cel) return;
  currentTool.value = 'select'; // before the selection exists, or the tool-change effect below would commit it
  setSelection(project, trackId, cel.frameId, { x: 0, y: 0, w: cel.width, h: cel.height }, rectMask(cel.width, cel.height));
}

// ---- actions ------------------------------------------------------------------------------

export function flipSelection(axis: 'h' | 'v'): void {
  const sel = ensureLifted();
  if (!sel) return;
  selection.value = { ...sel, block: axis === 'h' ? flipBlockH(sel.block) : flipBlockV(sel.block) };
}

export function rotateSelection(): void {
  const sel = ensureLifted();
  if (!sel) return;
  const rotated = rotateBlock90(sel.block);
  // Rotate about the block's centre so it turns in place.
  const cx = sel.x + sel.block.width / 2;
  const cy = sel.y + sel.block.height / 2;
  selection.value = { ...sel, block: rotated, x: Math.round(cx - rotated.width / 2), y: Math.round(cy - rotated.height / 2) };
}

export function nudgeSelection(dx: number, dy: number): void {
  const sel = ensureLifted();
  if (!sel) return;
  selection.value = { ...sel, x: sel.x + dx, y: sel.y + dy };
}

export function gridCellSize(project: Project): { w: number; h: number } {
  const rows = rowsFor(project.grid.columns, project.canvas.width, project.canvas.height);
  return { w: project.canvas.width / project.grid.columns, h: project.canvas.height / rows };
}

export function snapEnabled(project: Project): boolean {
  return snapOverride.value ?? project.ui.view === 'ascii';
}

/** Deletes the selected pixels (a floating selection is simply discarded). One undo step. */
export function deleteSelection(): void {
  const sel = selection.value;
  if (!sel) return;
  const cel = celFor(sel);
  if (!cel) {
    selection.value = null;
    return;
  }
  if (sel.lifted) {
    // Content is already out of the cel; just don't stamp it back. Commit records source-vs-now.
    selection.value = { ...sel, block: { ...sel.block, pixels: new Uint8Array(sel.block.pixels.length) } };
    commitSelection();
    return;
  }
  const before = cel.buf.slice();
  const rect = blockRect(sel);
  clearBlockArea(cel.buf, cel.width, rect, sel.block.mask);
  selection.value = null;
  commitCelEdit(sel.projectId, sel.trackId, before, { x0: rect.x, y0: rect.y, x1: rect.x + rect.w - 1, y1: rect.y + rect.h - 1 });
}

export function copySelection(project: Project): boolean {
  const sel = selection.value;
  if (!sel) return false;
  const palette = new Map<number, Hex>();
  for (let i = 0; i < sel.block.pixels.length; i++) {
    const idx = sel.block.pixels[i];
    if (sel.block.mask[i] && idx && !palette.has(idx)) palette.set(idx, project.colors[idx]);
  }
  clipboard = {
    x: sel.x,
    y: sel.y,
    block: { width: sel.block.width, height: sel.block.height, pixels: sel.block.pixels.slice(), mask: sel.block.mask.slice() },
    palette,
  };
  hasClipboard.value = true;
  internalCopyFresh = true;
  return true;
}

export function cutSelection(project: Project): void {
  if (copySelection(project)) deleteSelection();
}

/** Paste in place (§6.3): a floating selection at the copied position on the current cel — which may be a
 * different frame or track than the one copied from. Returns false if there is nothing to paste or nowhere to. */
export function pasteClipboard(project: Project, trackId: ID): boolean {
  if (!clipboard) return false;
  const track = project.tracks.find((t) => t.id === trackId);
  const cel = liveCels.value.get(trackId);
  if (!track || track.kind !== 'drawing' || track.locked || !cel) return false;
  commitSelection();

  const remap = new Map<number, number>();
  for (const [oldIdx, hex] of clipboard.palette) {
    const fresh = projects.value.find((p) => p.id === project.id) ?? project;
    const idx = ensureColorIndex(fresh, hex);
    if (idx === null) {
      colorTableFull.value = true;
      return false;
    }
    remap.set(oldIdx, idx);
  }
  const src = clipboard.block;
  const pixels = new Uint8Array(src.pixels.length);
  for (let i = 0; i < pixels.length; i++) pixels[i] = src.pixels[i] ? (remap.get(src.pixels[i]) ?? 0) : 0;

  session = { before: cel.buf.slice(), source: null };
  currentTool.value = 'select'; // before the selection exists — see selectAll
  selection.value = {
    projectId: project.id,
    trackId,
    frameId: cel.frameId,
    x: clipboard.x,
    y: clipboard.y,
    block: { width: src.width, height: src.height, pixels, mask: src.mask.slice() },
    lifted: true,
  };
  return true;
}

// ---- pointer interaction (called from DrawingCanvas with canvas-space points) ---------------

export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
export const HANDLES: Array<{ id: HandleId; fx: number; fy: number; hx: -1 | 0 | 1; hy: -1 | 0 | 1 }> = [
  { id: 'nw', fx: 0, fy: 0, hx: -1, hy: -1 },
  { id: 'ne', fx: 1, fy: 0, hx: 1, hy: -1 },
  { id: 'se', fx: 1, fy: 1, hx: 1, hy: 1 },
  { id: 'sw', fx: 0, fy: 1, hx: -1, hy: 1 },
  { id: 'n', fx: 0.5, fy: 0, hx: 0, hy: -1 },
  { id: 'e', fx: 1, fy: 0.5, hx: 1, hy: 0 },
  { id: 's', fx: 0.5, fy: 1, hx: 0, hy: 1 },
  { id: 'w', fx: 0, fy: 0.5, hx: -1, hy: 0 },
];

const HANDLE_HIT_SCREEN_PX = 22;
const MAX_SCALED_SIDE = 4096;

type Drag =
  | { kind: 'marquee'; project: Project; trackId: ID; frameId: ID | 'static' }
  | { kind: 'move'; startPt: Point; startX: number; startY: number; cell: { w: number; h: number } | null }
  | { kind: 'scale'; handle: (typeof HANDLES)[number]; base: PixelBlock; start: Rect };

let dragging: Drag | null = null;
export function isSelectionDragging(): boolean {
  return dragging !== null;
}

export interface SelectionPointerEnv {
  project: Project;
  trackId: ID;
  frameId: ID | 'static';
  zoom: number;
}

function hitHandle(sel: Selection, pt: Point, zoom: number) {
  const r = HANDLE_HIT_SCREEN_PX / zoom;
  const w = sel.block.width;
  const h = sel.block.height;
  return HANDLES.find((hd) => Math.hypot(pt.x - (sel.x + hd.fx * w), pt.y - (sel.y + hd.fy * h)) <= r) ?? null;
}

function insideBlock(sel: Selection, pt: Point): boolean {
  return pt.x >= sel.x && pt.y >= sel.y && pt.x < sel.x + sel.block.width && pt.y < sel.y + sel.block.height;
}

export function selectionPointerDown(pt: Point, env: SelectionPointerEnv): void {
  const sel = selection.value;
  if (sel && sel.trackId === env.trackId) {
    const handle = hitHandle(sel, pt, env.zoom);
    if (handle) {
      dragging = { kind: 'scale', handle, base: sel.block, start: blockRect(sel) };
      return;
    }
    if (insideBlock(sel, pt)) {
      dragging = {
        kind: 'move',
        startPt: pt,
        startX: sel.x,
        startY: sel.y,
        cell: snapEnabled(env.project) ? gridCellSize(env.project) : null,
      };
      return;
    }
  }
  // Outside (or no selection): finish any current one and start a new marquee. A tap with no drag just deselects.
  commitSelection();
  dragging = { kind: 'marquee', project: env.project, trackId: env.trackId, frameId: env.frameId };
  marquee.value = selectMode.value === 'rect' ? { kind: 'rect', a: pt, b: pt } : { kind: 'lasso', points: [pt] };
}

export function selectionPointerMove(pt: Point): void {
  const drag = dragging;
  if (!drag) return;

  if (drag.kind === 'marquee') {
    const m = marquee.value;
    if (!m) return;
    if (m.kind === 'rect') marquee.value = { ...m, b: pt };
    else marquee.value = { kind: 'lasso', points: [...m.points, pt] };
    return;
  }

  if (drag.kind === 'move') {
    let dx = pt.x - drag.startPt.x;
    let dy = pt.y - drag.startPt.y;
    if (drag.cell) {
      dx = Math.round(Math.round(dx / drag.cell.w) * drag.cell.w);
      dy = Math.round(Math.round(dy / drag.cell.h) * drag.cell.h);
    } else {
      dx = Math.round(dx);
      dy = Math.round(dy);
    }
    if (dx === 0 && dy === 0 && !selection.value?.lifted) return; // not a real move yet
    const sel = ensureLifted();
    if (sel) selection.value = { ...sel, x: drag.startX + dx, y: drag.startY + dy };
    return;
  }

  // scale
  const { handle, base, start } = drag;
  const sel = ensureLifted();
  if (!sel) return;
  const anchorX = handle.hx > 0 ? start.x : handle.hx < 0 ? start.x + start.w : start.x;
  const anchorY = handle.hy > 0 ? start.y : handle.hy < 0 ? start.y + start.h : start.y;
  let newW = start.w;
  let newH = start.h;
  if (handle.hx !== 0) newW = handle.hx > 0 ? pt.x - anchorX : anchorX - pt.x;
  if (handle.hy !== 0) newH = handle.hy > 0 ? pt.y - anchorY : anchorY - pt.y;
  if (handle.hx !== 0 && handle.hy !== 0) {
    const s = Math.max(newW / start.w, newH / start.h); // corners keep proportions
    newW = start.w * s;
    newH = start.h * s;
  }
  newW = Math.min(MAX_SCALED_SIDE, Math.max(1, Math.round(newW)));
  newH = Math.min(MAX_SCALED_SIDE, Math.max(1, Math.round(newH)));
  const x = handle.hx < 0 ? anchorX - newW : start.x;
  const y = handle.hy < 0 ? anchorY - newH : start.y;
  selection.value = { ...sel, x, y, block: scaleBlock(base, newW, newH) };
}

export function selectionPointerUp(): void {
  const drag = dragging;
  dragging = null;
  if (!drag) return;
  if (drag.kind !== 'marquee') return; // move/scale leave the selection floating until it's committed
  const m = marquee.value;
  marquee.value = null;
  if (!m) return;
  const { project, trackId, frameId } = drag;
  const cel = liveCels.value.get(trackId);
  if (!cel) return;
  if (m.kind === 'rect') {
    const rect = rectFromCorners(m.a, m.b, cel.width, cel.height);
    if (rect) setSelection(project, trackId, frameId, rect, rectMask(rect.w, rect.h));
  } else {
    const poly = polygonMask(m.points, cel.width, cel.height);
    if (poly) setSelection(project, trackId, frameId, poly.rect, poly.mask);
  }
}

export function selectionPointerCancel(): void {
  const drag = dragging;
  dragging = null;
  if (drag?.kind === 'marquee') marquee.value = null;
}
