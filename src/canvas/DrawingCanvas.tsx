// The interactive canvas: pan/zoom viewport, indexed-buffer rasterization,
// multi-track compositing, and Pointer Events-based input (pen draws, touch
// navigates, mouse draws + Space-pans + wheel-zooms). See ASCII_BUDDY_SPEC.md
// §4.4, §6.1, §6.2, §6.3, §6.4, §8, §11.
import { useEffect, useRef } from 'preact/hooks';
import type { ID, Project } from '../types/model';
import { rowsFor } from '../types/model';
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
import { liveCels, bumpCelVersion } from '../state/celStore';
import { currentTool, activeSize, activeTip, currentColor } from '../state/tools';
import { appSettings } from '../state/appSettings';
import { projects } from '../state/projects';
import { ensureColorIndex } from '../state/colorTable';
import { scheduleAutosave } from '../state/autosave';
import { pushCommand, undo, redo } from '../state/history';
import { fillAt } from '../state/fill';
import { eyedropAt, pickFeedback, nextPickId } from '../state/eyedropper';
import { selectionPointerDown, selectionPointerMove, selectionPointerUp, selectionPointerCancel } from '../state/selection';
import { emptyBBox, bboxIsEmpty, strokeSegment, unionBBoxInto, type MutableBBox } from '../engine/rasterCel';
import { buildLUT, celRegionToImageData } from '../engine/lut';
import { colorTableFull } from '../state/uiFlags';
import { recomputeStatsRegion } from '../state/asciiState';
import { reloadAllTrackData, isTrackDataLoaded } from '../state/canvasData';
import { strokeInProgress, touchCount } from '../state/strokeState';
import { gridOverlay, showDrawingUnderAscii, columnsSliderActive, hideAllReferences } from '../state/viewSettings';
import { importImageAsReference } from '../state/tracksActions';
import { importRequest, isVideoFile } from '../state/importUi';
import { isPlaying, playbackFrameIndex, stopPlayback } from '../state/playback';
import { playbackCache } from '../state/playbackCache';
import { onionLayers } from '../state/onion';
import { AsciiCanvas } from './AsciiCanvas';
import { GridOverlay } from './GridOverlay';
import { TrackCanvas } from './TrackCanvas';
import { ReferenceLayer } from './ReferenceLayer';
import { OnionOverlay } from './OnionOverlay';
import { PlaybackCanvas } from './PlaybackCanvas';
import { SelectionOverlay } from './SelectionOverlay';
import { SelectionBar } from '../ui/SelectionBar';
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
  trackId: ID;
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
    redrawCurrent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.colors]);

  function redrawCurrent() {
    const cel = liveCels.value.get(trackId);
    const canvas = canvasRef.current;
    if (!cel || !canvas) return;
    if (canvas.width !== cel.width || canvas.height !== cel.height) {
      canvas.width = cel.width;
      canvas.height = cel.height;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.imageSmoothingEnabled = false;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = celRegionToImageData(cel.buf, cel.width, lutRef.current, 0, 0, cel.width, cel.height);
    ctx.putImageData(img, 0, 0);
  }

  // Load every track's live data for this frame, then paint. Structural track/frame
  // changes reload via their own actions; this effect covers navigation and a new
  // project. If those already loaded this frame it does nothing but repaint, so it can
  // never overwrite an undo/redo applied in between. Fit-to-screen only happens when a
  // project opens — not on every frame change, which would reset the user's zoom/pan.
  const fittedProjectRef = useRef<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const loading = isTrackDataLoaded(project) ? Promise.resolve() : reloadAllTrackData(project);
    loading.then(() => {
      if (cancelled) return;
      redrawCurrent();
      const el = containerRef.current;
      if (el && fittedProjectRef.current !== project.id) {
        fittedProjectRef.current = project.id;
        fitToScreen(project.canvas.width, project.canvas.height, el.clientWidth, el.clientHeight);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, frameId]);

  // Redraws the current track whenever its version changes from outside a live
  // stroke (undo/redo, Clear cel, track switch) — an in-progress stroke already
  // blits incrementally.
  const version = liveCels.value.get(trackId)?.version;
  useEffect(() => {
    redrawCurrent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackId, version]);

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
    // Deliberately NOT gated on canvasRef.current: that element only exists
    // while the current track is a drawing track (see the render below) — if
    // this effect also required it, switching to a reference track would
    // tear down pan/zoom/pinch entirely along with drawing, since they all
    // live in this one listener set. Drawing-only code below re-reads
    // canvasRef.current fresh at the point of use instead.
    if (!container) return;

    let stroke: StrokeState | null = null;
    let penActive = false;
    const touches = new Map<number, TouchInfo>();
    function syncTouchCount() {
      touchCount.value = touches.size;
    }
    let gestureBase: GestureBase | null = null;
    let gesturePeakCount = 0;
    let gestureMoved = false;
    let gestureStartTime = 0;
    let spaceHeld = false;

    const getProject = () => projects.value.find((p) => p.id === project.id) ?? project;
    const getCurrentTrack = () => getProject().tracks.find((t) => t.id === trackId);

    const clientToCanvasPoint = (clientX: number, clientY: number) => {
      const rect = container.getBoundingClientRect();
      return viewportToCanvasPoint(clientX - rect.left, clientY - rect.top);
    };

    function blit(x0: number, y0: number, x1: number, y1: number) {
      const canvasEl = canvasRef.current;
      const cel = liveCels.value.get(trackId);
      const ctx = canvasEl?.getContext('2d');
      if (!cel || !ctx) return;
      const cx0 = Math.max(0, x0);
      const cy0 = Math.max(0, y0);
      const cx1 = Math.min(cel.width - 1, x1);
      const cy1 = Math.min(cel.height - 1, y1);
      if (cx1 < cx0 || cy1 < cy0) return;
      const img = celRegionToImageData(cel.buf, cel.width, lutRef.current, cx0, cy0, cx1 - cx0 + 1, cy1 - cy0 + 1);
      ctx.putImageData(img, cx0, cy0);
    }

    // The eyedropper only reads, so it works anywhere (locked and reference tracks included).
    // Everything else needs an unlocked drawing track — the Select tool on a reference track is
    // the transform tool, handled by ReferenceLayer instead.
    function canDrawOnCurrentTrack(): boolean {
      const track = getCurrentTrack();
      if (!track) return false;
      if (currentTool.value === 'eyedropper') return true;
      return track.kind === 'drawing' && !track.locked;
    }

    /** Set while a Select-tool drag (marquee / move / scale) owns a pointer, like `stroke` for the pen. */
    let selDrag: number | null = null;
    let longPressTimer: ReturnType<typeof setTimeout> | null = null;
    const LONG_PRESS_PICK_MS = 400;

    function pickAt(clientX: number, clientY: number) {
      const pt = clientToCanvasPoint(clientX, clientY);
      const rect = container!.getBoundingClientRect();
      void eyedropAt(project.id, pt.x, pt.y).then((hex) => {
        if (hex) pickFeedback.value = { x: clientX - rect.left, y: clientY - rect.top, hex, id: nextPickId() };
      });
    }

    const isDragging = (pointerId: number) => stroke?.pointerId === pointerId || selDrag === pointerId;
    function extendDrag(clientX: number, clientY: number) {
      if (stroke) extendStroke(clientX, clientY);
      else if (selDrag !== null) selectionPointerMove(clientToCanvasPoint(clientX, clientY));
    }
    function endDrag(pointerId: number) {
      if (stroke?.pointerId === pointerId) endStroke();
      if (selDrag === pointerId) {
        selDrag = null;
        selectionPointerUp();
      }
    }
    function abortSelectionDrag() {
      if (selDrag !== null) {
        selDrag = null;
        selectionPointerCancel();
      }
    }

    function beginStroke(pointerId: number, clientX: number, clientY: number, altKey = false) {
      // Starting to draw stops playback (§9.2) — covers pen, touch and mouse alike,
      // since every draw entry point funnels through here.
      if (isPlaying.value) {
        stopPlayback(project.id);
        return;
      }
      if (!canDrawOnCurrentTrack()) return;
      // Option-click is the mouse's quick eyedropper, whatever the tool (§6.3).
      const tool = altKey ? 'eyedropper' : currentTool.value;
      if (tool === 'eyedropper') {
        pickAt(clientX, clientY);
        return;
      }
      const p = getProject();
      const cel = liveCels.value.get(trackId);
      if (!cel || cel.frameId !== frameId) return;

      if (tool === 'fill') {
        const at = clientToCanvasPoint(clientX, clientY);
        fillAt(p, trackId, at.x, at.y);
        return;
      }
      if (tool === 'select') {
        selDrag = pointerId;
        selectionPointerDown(clientToCanvasPoint(clientX, clientY), { project: p, trackId, frameId, zoom: viewport.value.zoom });
        safeSetPointerCapture(container!, pointerId);
        return;
      }

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

      const canvasEl = canvasRef.current;
      if (!canvasEl) return;
      stroke = { pointerId, trackId, colorIndex, before, dirty, lastX: pt.x, lastY: pt.y };
      strokeInProgress.value = true;
      safeSetPointerCapture(canvasEl, pointerId);
    }

    function extendStroke(clientX: number, clientY: number) {
      if (!stroke) return;
      const cel = liveCels.value.get(stroke.trackId);
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
      const s = stroke;
      const cel = liveCels.value.get(s.trackId);
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
        trackId: s.trackId,
        frameId: cel.frameId,
        bbox: { x: x0, y: y0, w, h },
        before: beforeCrop,
        after: afterCrop,
      });
      bumpCelVersion(s.trackId);
      recomputeStatsRegion(s.trackId, { x: x0, y: y0, w, h });
      scheduleAutosave(project.id, s.trackId);
    }

    function shouldDrawFor(pointerType: string): boolean {
      if (!canDrawOnCurrentTrack()) return false;
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
        syncTouchCount();
        gestureBase = null;
        beginStroke(e.pointerId, e.clientX, e.clientY);
        e.preventDefault();
        return;
      }

      if (penActive) return; // still ignore touch while the pen is down

      if (e.pointerType === 'touch') {
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, startTime: performance.now() });
        syncTouchCount();
        if (touches.size === 1) {
          gesturePeakCount = 1;
          gestureMoved = false;
          gestureStartTime = performance.now();
          // A one-finger tap stops playback (§9.2) even on a track that can't be
          // drawn on — beginStroke() only covers this when it's actually reached.
          if (isPlaying.value) stopPlayback(project.id);
          if (shouldDrawFor('touch')) {
            beginStroke(e.pointerId, e.clientX, e.clientY);
          } else if (!appSettings.value.drawWithFinger) {
            // One-finger long-press = eyedropper when finger drawing is off (§6.3).
            const x = e.clientX;
            const y = e.clientY;
            longPressTimer = setTimeout(() => {
              longPressTimer = null;
              if (touches.size === 1 && !gestureMoved && !isPlaying.value) pickAt(x, y);
            }, LONG_PRESS_PICK_MS);
          }
        } else {
          // A second (or third+) finger arrived: abandon any single-finger draw in
          // progress and switch to a navigation gesture.
          if (stroke && touches.has(stroke.pointerId)) endStroke();
          if (selDrag !== null && touches.has(selDrag)) abortSelectionDrag();
          if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
          }
          gesturePeakCount = Math.max(gesturePeakCount, touches.size);
          if (touches.size === 2) {
            const pts = [...touches.values()];
            const midX = (pts[0].x + pts[1].x) / 2;
            const midY = (pts[0].y + pts[1].y) / 2;
            const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
            const rect = container!.getBoundingClientRect();
            const anchor = viewportToCanvasPoint(midX - rect.left, midY - rect.top);
            gestureBase = { midX, midY, dist, zoom: viewport.value.zoom, canvasAnchorX: anchor.x, canvasAnchorY: anchor.y };
          }
        }
        e.preventDefault();
        return;
      }

      if (e.pointerType === 'mouse') {
        if (e.button !== 0) return;
        if (spaceHeld) return; // panning handled in pointermove while the button is down
        beginStroke(e.pointerId, e.clientX, e.clientY, e.altKey);
      }
    }

    function onPointerMove(e: PointerEvent) {
      if (e.pointerType === 'pen') {
        if (!isDragging(e.pointerId)) return;
        for (const ev of coalesced(e)) extendDrag(ev.clientX, ev.clientY);
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

        if (touches.size === 1 && isDragging(e.pointerId)) {
          for (const ev of coalesced(e)) extendDrag(ev.clientX, ev.clientY);
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
        if (isDragging(e.pointerId)) {
          for (const ev of coalesced(e)) extendDrag(ev.clientX, ev.clientY);
        }
      }
    }

    function finishTouch(e: PointerEvent) {
      touches.delete(e.pointerId);
      syncTouchCount();
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      endDrag(e.pointerId);

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
        endDrag(e.pointerId);
        penActive = false;
        return;
      }
      if (e.pointerType === 'touch') {
        finishTouch(e);
        return;
      }
      endDrag(e.pointerId);
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
      if (selDrag === e.pointerId) abortSelectionDrag();
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

    function onDragOver(e: DragEvent) {
      e.preventDefault();
    }
    function onDrop(e: DragEvent) {
      e.preventDefault();
      const files = [...(e.dataTransfer?.files ?? [])];
      const video = files.find(isVideoFile);
      const images = files.filter((f) => f.type.startsWith('image/'));
      if (video) importRequest.value = { kind: 'video', file: video };
      else if (images.length > 1) importRequest.value = { kind: 'images', files: images }; // bulk → the import dialog (§10.2)
      else if (images.length === 1) void importImageAsReference(getProject(), images[0]); // a single image → the current reference track (§10.1)
    }

    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerup', onPointerUp);
    container.addEventListener('pointercancel', onPointerCancel);
    container.addEventListener('wheel', onWheel, { passive: false });
    container.addEventListener('dragover', onDragOver);
    container.addEventListener('drop', onDrop);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    const blockGesture = (e: Event) => e.preventDefault();
    container.addEventListener('gesturestart', blockGesture);

    return () => {
      if (longPressTimer) clearTimeout(longPressTimer);
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerup', onPointerUp);
      container.removeEventListener('pointercancel', onPointerCancel);
      container.removeEventListener('wheel', onWheel);
      container.removeEventListener('dragover', onDragOver);
      container.removeEventListener('drop', onDrop);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      container.removeEventListener('gesturestart', blockGesture);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, trackId, frameId]);

  const v = viewport.value;
  const view = project.ui.view;
  const stroking = strokeInProgress.value;
  const rows = rowsFor(project.grid.columns, project.canvas.width, project.canvas.height);
  const showGridOverlay = view === 'raster' && (gridOverlay.value || columnsSliderActive.value);
  const playing = isPlaying.value;
  const showOnion = !playing && project.onion.enabled && onionLayers.value.length > 0;
  const playbackAsciiFrame = playing ? (playbackCache.value.get(project.frames[playbackFrameIndex.value]?.id ?? '')?.ascii ?? null) : undefined;

  // Raster opacity per track: always visible in Raster view; in ASCII view only
  // the actively-stroked track previews at full opacity, others follow
  // "Show drawing under ASCII" (or stay hidden). §11.
  function rasterOpacityFor(isCurrent: boolean): number {
    if (view === 'raster') return 1;
    if (isCurrent && stroking) return 1;
    return showDrawingUnderAscii.value ? 0.2 : 0;
  }

  return (
    <div ref={containerRef} class="ab-canvas-viewport" style={{ touchAction: 'none' }}>
      <div
        class="ab-canvas-stage"
        style={{
          width: project.canvas.width,
          height: project.canvas.height,
          background: project.background,
          transform: `translate(${v.panX}px, ${v.panY}px) scale(${v.zoom})`,
        }}
      >
        {view === 'raster' && showOnion ? <OnionOverlay project={project} /> : null}
        {playing ? <PlaybackCanvas project={project} view={view} ghost={showDrawingUnderAscii.value} /> : null}
        {[...project.tracks]
          .reverse() // index 0 = top of the stack = painted last (on top) in the DOM
          .map((track) => {
            if (!track.visible) return null;
            if (track.kind === 'reference') {
              if (hideAllReferences.value) return null;
              // While playing, references come from the playback cache (one image per frame, so an imported
              // video actually plays) instead of the single live image for the settled frame.
              if (playing) return null;
              return (
                <ReferenceLayer
                  key={track.id}
                  track={track}
                  transformable={track.id === trackId && currentTool.value === 'select'}
                  containerRef={containerRef}
                />
              );
            }
            // While playing, drawing tracks are replaced by the single flattened
            // PlaybackCanvas bitmap above — see state/playbackCache.ts.
            if (playing) return null;
            if (track.id === trackId) {
              // A bare <canvas>, not a component, has no mount effect of its own — so when
              // it unmounts (track hidden) and later remounts (shown again), nothing would
              // otherwise repaint it. The callback ref redraws on every (re)attach.
              return (
                <canvas
                  key={track.id}
                  ref={(el) => {
                    canvasRef.current = el;
                    if (el) redrawCurrent();
                  }}
                  class="ab-canvas-layer"
                  style={{ opacity: rasterOpacityFor(true) }}
                />
              );
            }
            return <TrackCanvas key={track.id} trackId={track.id} colors={project.colors} opacity={rasterOpacityFor(false)} />;
          })}
        {view === 'ascii' ? (
          <div class="ab-ascii-canvas-wrap" style={{ opacity: stroking ? 0 : 1 }}>
            <AsciiCanvas project={project} overrideFrame={playbackAsciiFrame} />
          </div>
        ) : null}
        <SelectionOverlay project={project} trackId={trackId} />
        {showGridOverlay ? (
          <GridOverlay columns={project.grid.columns} rows={rows} canvasWidth={project.canvas.width} canvasHeight={project.canvas.height} />
        ) : null}
      </div>
      <SelectionBar project={project} trackId={trackId} />
      {pickFeedback.value ? (
        <div
          key={pickFeedback.value.id}
          class="ab-pick-ring"
          style={{ left: pickFeedback.value.x, top: pickFeedback.value.y, background: pickFeedback.value.hex }}
        />
      ) : null}
    </div>
  );
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
}
