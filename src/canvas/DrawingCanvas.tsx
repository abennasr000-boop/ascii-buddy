// The interactive canvas: pan/zoom viewport, indexed-buffer rasterization,
// and Pointer Events-based input (pen draws, touch navigates, mouse draws +
// Space-pans + wheel-zooms). See ASCII_BUDDY_SPEC.md §6.1, §6.2, §6.4, §11.
import { useEffect, useRef } from 'preact/hooks';
import type { ID, Project } from '../types/model';
import {
  viewport,
  viewportToCanvasPoint,
  zoomAround,
  panBy,
  clampZoom,
  fitToScreen,
  actualPixels,
  recenterForResize,
  userAdjustedViewport,
  registerViewportHandlers,
  unregisterViewportHandlers,
} from '../state/viewport';
import { liveCel, loadCel, bumpCelVersion } from '../state/celStore';
import { currentTool, activeSize, activeTip, currentColor } from '../state/tools';
import { appSettings } from '../state/appSettings';
import { projects } from '../state/projects';
import { ensureColorIndex } from '../state/colorTable';
import { scheduleAutosave } from '../state/autosave';
import { pushCommand, undo, redo } from '../state/history';
import {
  emptyBBox,
  bboxIsEmpty,
  strokeSegment,
  unionBBoxInto,
  type MutableBBox,
} from '../engine/rasterCel';
import { buildLUT, celRegionToImageData } from '../engine/lut';
import { colorTableFull } from '../state/uiFlags';
import { recomputeFullStats, recomputeStatsRegion } from '../state/asciiState';
import { strokeInProgress } from '../state/strokeState';
import { gridOverlay, showDrawingUnderAscii, columnsSliderActive } from '../state/viewSettings';
import { AsciiCanvas } from './AsciiCanvas';
import { GridOverlay } from './GridOverlay';
import { rowsFor } from '../types/model';
import { safeSetPointerCapture } from '../ui/pointerCapture';

const TAP_MOVE_THRESHOLD = 10; // CSS px
const TAP_MAX_DURATION = 250; // ms

/** getCoalescedEvents() always includes the firing event as its last entry per
 * spec, but guard against an empty/absent result anyway (e.g. synthetic events). */
function coalesced(e: PointerEvent): PointerEvent[] {
  const events = e.getCoalescedEvents?.();
  return events && events.length > 0 ? events : [e];
}

interface TouchInfo {
  x: number;
  y: number;
  startX: number;
  startY: number;
  startTime: number;
}

interface StrokeState {
  pointerId: number;
  colorIndex: number;
  before: Uint8Array;
  dirty: MutableBBox;
  lastX: number;
  lastY: number;
}

interface GestureBase {
  midX: number;
  midY: number;
  dist: number;
  zoom: number;
  panX: number;
  panY: number;
  canvasAnchorX: number;
  canvasAnchorY: number;
}

export function DrawingCanvas({ project, trackId, frameId }: { project: Project; trackId: ID; frameId: ID | 'static' }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lutRef = useRef<Uint8ClampedArray>(buildLUT(project.colors));

  // Keep the LUT in sync with the live color table without re-running the pointer effect.
  useEffect(() => {
    lutRef.current = buildLUT(project.colors);
    const cel = liveCel.value;
    if (cel) redrawFull(canvasRef.current, cel.buf, cel.width, cel.height, lutRef.current);
  }, [project.colors]);

  // Load (or create) the cel buffer for this track/frame, then paint it.
  useEffect(() => {
    let cancelled = false;
    loadCel(project, trackId, frameId).then(() => {
      if (cancelled) return;
      const cel = liveCel.value;
      const canvas = canvasRef.current;
      if (cel && canvas) {
        canvas.width = cel.width;
        canvas.height = cel.height;
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.imageSmoothingEnabled = false;
        redrawFull(canvas, cel.buf, cel.width, cel.height, lutRef.current);
      }
      recomputeFullStats();
      const el = containerRef.current;
      if (el) fitToScreen(project.canvas.width, project.canvas.height, el.clientWidth, el.clientHeight);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, trackId, frameId]);

  // Redraws whenever the cel's version changes from outside a live stroke
  // (undo/redo, Clear cel) — in-progress strokes already blit incrementally.
  const version = liveCel.value?.version;
  useEffect(() => {
    const cel = liveCel.value;
    if (cel) redrawFull(canvasRef.current, cel.buf, cel.width, cel.height, lutRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  // Fit/Actual-pixels menu commands and window-resize/rotation reflow (§11).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let lastW = el.clientWidth;
    let lastH = el.clientHeight;

    const handlers = {
      fit: () => fitToScreen(project.canvas.width, project.canvas.height, el.clientWidth, el.clientHeight),
      actual: () => actualPixels(project.canvas.width, project.canvas.height, el.clientWidth, el.clientHeight),
    };
    registerViewportHandlers(handlers);

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const newW = entry.contentRect.width;
      const newH = entry.contentRect.height;
      if (newW === lastW && newH === lastH) return;
      if (userAdjustedViewport.value) {
        recenterForResize(lastW, lastH, newW, newH);
      } else {
        fitToScreen(project.canvas.width, project.canvas.height, newW, newH);
      }
      lastW = newW;
      lastH = newH;
    });
    observer.observe(el);

    return () => {
      observer.disconnect();
      unregisterViewportHandlers(handlers);
    };
  }, [project.canvas.width, project.canvas.height]);

  // All pointer/gesture handling lives in one native-listener effect so hot paths
  // (pointermove) never pay Preact re-render costs. Every piece of live state is
  // read through signals/`projects.value` at call time, so nothing here goes stale.
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    let stroke: StrokeState | null = null;
    let penActive = false;
    const touches = new Map<number, TouchInfo>();
    let gestureBase: GestureBase | null = null;
    let gesturePeakCount = 0;
    let gestureMoved = false;
    let gestureStartTime = 0;
    let spaceHeld = false;

    const getProject = () => projects.value.find((p) => p.id === project.id) ?? project;

    const clientToCanvasPoint = (clientX: number, clientY: number) => {
      const rect = container.getBoundingClientRect();
      return viewportToCanvasPoint(clientX - rect.left, clientY - rect.top);
    };

    function blit(x0: number, y0: number, x1: number, y1: number) {
      const cel = liveCel.value;
      const ctx = canvas!.getContext('2d');
      if (!cel || !ctx) return;
      const cx0 = Math.max(0, x0);
      const cy0 = Math.max(0, y0);
      const cx1 = Math.min(cel.width - 1, x1);
      const cy1 = Math.min(cel.height - 1, y1);
      if (cx1 < cx0 || cy1 < cy0) return;
      const img = celRegionToImageData(cel.buf, cel.width, lutRef.current, cx0, cy0, cx1 - cx0 + 1, cy1 - cy0 + 1);
      ctx.putImageData(img, cx0, cy0);
    }

    function beginStroke(pointerId: number, clientX: number, clientY: number) {
      const p = getProject();
      const cel = liveCel.value;
      if (!cel || cel.trackId !== trackId || cel.frameId !== frameId) return;

      let colorIndex = 0;
      if (currentTool.value !== 'eraser') {
        const idx = ensureColorIndex(p, currentColor.value);
        if (idx === null) {
          colorTableFull.value = true;
          return;
        }
        colorIndex = idx;
      }

      const before = cel.buf.slice();
      const pt = clientToCanvasPoint(clientX, clientY);
      const dirty = emptyBBox();
      strokeSegment(cel.buf, cel.width, cel.height, pt.x, pt.y, pt.x, pt.y, activeSize(), activeTip(), colorIndex, dirty);
      if (!bboxIsEmpty(dirty)) blit(dirty.x0, dirty.y0, dirty.x1, dirty.y1);

      stroke = { pointerId, colorIndex, before, dirty, lastX: pt.x, lastY: pt.y };
      strokeInProgress.value = true;
      safeSetPointerCapture(canvas!, pointerId);
    }

    function extendStroke(clientX: number, clientY: number) {
      if (!stroke) return;
      const cel = liveCel.value;
      if (!cel) return;
      const pt = clientToCanvasPoint(clientX, clientY);
      const moveDirty = emptyBBox();
      strokeSegment(cel.buf, cel.width, cel.height, stroke.lastX, stroke.lastY, pt.x, pt.y, activeSize(), activeTip(), stroke.colorIndex, moveDirty);
      stroke.lastX = pt.x;
      stroke.lastY = pt.y;
      unionBBoxInto(stroke.dirty, moveDirty);
      if (!bboxIsEmpty(moveDirty)) blit(moveDirty.x0, moveDirty.y0, moveDirty.x1, moveDirty.y1);
    }

    function endStroke() {
      if (!stroke) return;
      const cel = liveCel.value;
      const s = stroke;
      stroke = null;
      strokeInProgress.value = false;
      if (!cel || bboxIsEmpty(s.dirty)) return;
      const { x0, y0, x1, y1 } = s.dirty;
      const w = x1 - x0 + 1;
      const h = y1 - y0 + 1;
      const beforeCrop = new Uint8Array(w * h);
      const afterCrop = new Uint8Array(w * h);
      for (let y = 0; y < h; y++) {
        const srcOffset = (y0 + y) * cel.width + x0;
        beforeCrop.set(s.before.subarray(srcOffset, srcOffset + w), y * w);
        afterCrop.set(cel.buf.subarray(srcOffset, srcOffset + w), y * w);
      }
      pushCommand({
        kind: 'stroke',
        trackId,
        frameId,
        bbox: { x: x0, y: y0, w, h },
        before: beforeCrop,
        after: afterCrop,
      });
      bumpCelVersion();
      recomputeStatsRegion({ x: x0, y: y0, w, h });
      scheduleAutosave(project.id);
    }

    function shouldDrawFor(pointerType: string): boolean {
      if (pointerType === 'pen') return true;
      if (pointerType === 'mouse') return !spaceHeld;
      if (pointerType === 'touch') return appSettings.value.drawWithFinger && touches.size <= 1 && !penActive;
      return false;
    }

    // ---- Pointer Events ----

    function onPointerDown(e: PointerEvent) {
      if (e.pointerType === 'pen') {
        penActive = true;
        // Palm rejection: a pen is down, so any touch input is ignored entirely.
        touches.clear();
        gestureBase = null;
        beginStroke(e.pointerId, e.clientX, e.clientY);
        e.preventDefault();
        return;
      }

      if (penActive) return; // still ignore touch while the pen is down

      if (e.pointerType === 'touch') {
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, startTime: performance.now() });
        if (touches.size === 1) {
          gesturePeakCount = 1;
          gestureMoved = false;
          gestureStartTime = performance.now();
          if (shouldDrawFor('touch')) {
            beginStroke(e.pointerId, e.clientX, e.clientY);
          }
        } else {
          // A second (or third+) finger arrived: abandon any single-finger draw in
          // progress and switch to a navigation gesture.
          if (stroke && !touches.has(stroke.pointerId)) {
            // stroke belongs to a pointer no longer tracked as primary; leave it be.
          } else if (stroke) {
            endStroke();
          }
          gesturePeakCount = Math.max(gesturePeakCount, touches.size);
          if (touches.size === 2) {
            const pts = [...touches.values()];
            const midX = (pts[0].x + pts[1].x) / 2;
            const midY = (pts[0].y + pts[1].y) / 2;
            const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
            const rect = container!.getBoundingClientRect();
            const anchor = viewportToCanvasPoint(midX - rect.left, midY - rect.top);
            gestureBase = {
              midX,
              midY,
              dist,
              zoom: viewport.value.zoom,
              panX: viewport.value.panX,
              panY: viewport.value.panY,
              canvasAnchorX: anchor.x,
              canvasAnchorY: anchor.y,
            };
          }
        }
        e.preventDefault();
        return;
      }

      if (e.pointerType === 'mouse') {
        if (e.button !== 0) return;
        if (spaceHeld) return; // panning handled in pointermove while the button is down
        beginStroke(e.pointerId, e.clientX, e.clientY);
      }
    }

    function onPointerMove(e: PointerEvent) {
      if (e.pointerType === 'pen') {
        if (stroke?.pointerId !== e.pointerId) return;
        const events = coalesced(e);
        for (const ev of events) extendStroke(ev.clientX, ev.clientY);
        return;
      }

      if (e.pointerType === 'touch') {
        if (penActive) return;
        const info = touches.get(e.pointerId);
        if (!info) return;
        const dx = e.clientX - info.startX;
        const dy = e.clientY - info.startY;
        if (Math.hypot(dx, dy) > TAP_MOVE_THRESHOLD) gestureMoved = true;
        info.x = e.clientX;
        info.y = e.clientY;

        if (touches.size === 1 && stroke?.pointerId === e.pointerId) {
          const events = coalesced(e);
          for (const ev of events) extendStroke(ev.clientX, ev.clientY);
          return;
        }

        if (touches.size === 2 && gestureBase) {
          const pts = [...touches.values()];
          const midX = (pts[0].x + pts[1].x) / 2;
          const midY = (pts[0].y + pts[1].y) / 2;
          const dist = Math.max(1, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y));
          const scale = dist / gestureBase.dist;
          const newZoom = clampZoom(gestureBase.zoom * scale);
          const rect = container!.getBoundingClientRect();
          const localMidX = midX - rect.left;
          const localMidY = midY - rect.top;
          viewport.value = {
            zoom: newZoom,
            panX: localMidX - gestureBase.canvasAnchorX * newZoom,
            panY: localMidY - gestureBase.canvasAnchorY * newZoom,
          };
        }
        return;
      }

      if (e.pointerType === 'mouse') {
        if (spaceHeld && (e.buttons & 1) === 1) {
          panBy(e.movementX, e.movementY);
          return;
        }
        if (stroke?.pointerId === e.pointerId) {
          const events = coalesced(e);
          for (const ev of events) extendStroke(ev.clientX, ev.clientY);
        }
      }
    }

    function finishTouch(e: PointerEvent) {
      touches.delete(e.pointerId);
      if (stroke?.pointerId === e.pointerId) endStroke();

      if (touches.size < 2) gestureBase = null;

      if (touches.size === 0) {
        const duration = performance.now() - gestureStartTime;
        if (appSettings.value.tapGestures && !gestureMoved && duration < TAP_MAX_DURATION) {
          if (gesturePeakCount === 2) undo();
          else if (gesturePeakCount >= 3) redo();
        }
        gesturePeakCount = 0;
        gestureMoved = false;
      }
    }

    function onPointerUp(e: PointerEvent) {
      if (e.pointerType === 'pen') {
        if (stroke?.pointerId === e.pointerId) endStroke();
        penActive = false;
        return;
      }
      if (e.pointerType === 'touch') {
        finishTouch(e);
        return;
      }
      if (stroke?.pointerId === e.pointerId) endStroke();
    }

    function onPointerCancel(e: PointerEvent) {
      if (e.pointerType === 'touch') {
        finishTouch(e);
        return;
      }
      if (stroke?.pointerId === e.pointerId) {
        stroke = null; // discard — a cancelled stroke shouldn't be committed
        strokeInProgress.value = false;
      }
      if (e.pointerType === 'pen') penActive = false;
    }

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const rect = container!.getBoundingClientRect();
      const factor = Math.exp(-e.deltaY * 0.01);
      zoomAround(viewport.value.zoom * factor, e.clientX - rect.left, e.clientY - rect.top);
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.code === 'Space' && !isTypingTarget(e.target)) spaceHeld = true;
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.code === 'Space') spaceHeld = false;
    }

    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerup', onPointerUp);
    container.addEventListener('pointercancel', onPointerCancel);
    container.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    const blockGesture = (e: Event) => e.preventDefault();
    container.addEventListener('gesturestart', blockGesture);

    return () => {
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerup', onPointerUp);
      container.removeEventListener('pointercancel', onPointerCancel);
      container.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      container.removeEventListener('gesturestart', blockGesture);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, trackId, frameId]);

  const v = viewport.value;
  const view = project.ui.view;
  const stroking = strokeInProgress.value;
  // Raster layer: always visible in Raster view; in ASCII view it's the "thin
  // raster preview" while actively drawing (§11), and otherwise either hidden
  // or dimmed under the glyphs per "Show drawing under ASCII".
  const rasterOpacity = view === 'raster' || stroking ? 1 : showDrawingUnderAscii.value ? 0.2 : 0;
  const showGridOverlay = view === 'raster' && (gridOverlay.value || columnsSliderActive.value);
  const rows = rowsFor(project.grid.columns, project.canvas.width, project.canvas.height);

  return (
    <div
      ref={containerRef}
      class="ab-canvas-viewport"
      style={{ touchAction: 'none' }}
    >
      <div
        class="ab-canvas-stage"
        style={{
          width: project.canvas.width,
          height: project.canvas.height,
          background: project.background,
          transform: `translate(${v.panX}px, ${v.panY}px) scale(${v.zoom})`,
        }}
      >
        <canvas ref={canvasRef} class="ab-canvas-layer" style={{ opacity: rasterOpacity }} />
        {view === 'ascii' ? (
          <div class="ab-ascii-canvas-wrap" style={{ opacity: stroking ? 0 : 1 }}>
            <AsciiCanvas project={project} />
          </div>
        ) : null}
        {showGridOverlay ? (
          <GridOverlay columns={project.grid.columns} rows={rows} canvasWidth={project.canvas.width} canvasHeight={project.canvas.height} />
        ) : null}
      </div>
    </div>
  );
}

function redrawFull(canvas: HTMLCanvasElement | null, buf: Uint8Array, width: number, height: number, lut: Uint8ClampedArray) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const img = celRegionToImageData(buf, width, lut, 0, 0, width, height);
  ctx.putImageData(img, 0, 0);
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
}
