// Renders one reference track's image at its transform and opacity. When
// it's the current track and the Select tool is active, it becomes the
// transform tool (§6.3): drag to move, corner handles to scale (uniformly —
// see DECISIONS.md), a handle above to rotate.
import { useRef } from 'preact/hooks';
import type { Track, ReferenceCel } from '../types/model';
import { liveReferences, previewReferenceTransform, setReferenceTransform } from '../state/referenceStore';
import { viewport } from '../state/viewport';
import { touchCount } from '../state/strokeState';
import { safeSetPointerCapture } from '../ui/pointerCapture';

const HANDLE_SIZE = 24; // on-screen px — see the zoom/scale counter-transform below

type DragMode = 'move' | 'scale' | 'rotate';
interface DragState {
  mode: DragMode;
  pointerId: number;
  startCanvasX: number;
  startCanvasY: number;
  startTransform: ReferenceCel['transform'];
  baseCornerDist: number; // distance from center to a corner at scale=1
}

function clientToCanvas(clientX: number, clientY: number, containerRect: DOMRect) {
  const v = viewport.value;
  return { x: (clientX - containerRect.left - v.panX) / v.zoom, y: (clientY - containerRect.top - v.panY) / v.zoom };
}

export function ReferenceLayer({
  track,
  transformable,
  containerRef,
}: {
  track: Track;
  transformable: boolean;
  containerRef: { current: HTMLElement | null };
}) {
  const live = liveReferences.value.get(track.id);
  const dragRef = useRef<DragState | null>(null);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const zoom = viewport.value.zoom; // reactive read — handle counter-scale must track viewport zoom too

  if (!live) return null;
  const { naturalWidth: w, naturalHeight: h } = live;
  const { x, y, scale, rotation } = live.cel.transform;

  // Safety net: `lostpointercapture` (below) should already catch a missed
  // pointerup/pointercancel, but real iPad Safari apparently found a way to
  // leave a drag stuck active forever (every future drag attempt then
  // silently no-ops via the `dragRef.current` guard, with no way to recover
  // short of reloading). This watchdog force-clears a drag that's gone 2s
  // without a single pointermove — well past normal, so it only ever fires
  // on a genuinely abandoned drag.
  function armWatchdog() {
    if (watchdogRef.current) clearTimeout(watchdogRef.current);
    watchdogRef.current = setTimeout(() => {
      dragRef.current = null;
      watchdogRef.current = null;
    }, 2000);
  }
  function disarmWatchdog() {
    if (watchdogRef.current) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  }

  function beginDrag(mode: DragMode, e: PointerEvent) {
    if (!transformable) return;
    // No stopPropagation: DrawingCanvas's own pointerdown listener on the
    // container must still see every touch to track how many fingers are
    // down (it needs that count for two-finger pan/zoom) — it already no-ops
    // any drawing action on a reference track, so letting it see this event
    // is harmless. Bail if a drag is already active so a second concurrent
    // pointer can't clobber the single shared drag state — deliberately NOT
    // also gating on touchCount here (tried that; on a real device it could
    // apparently end up permanently >0, which blocked every drag from the
    // second attempt on). onDragMove still hands off to a two-finger pinch
    // once one actually starts, via the touchCount>1 check below.
    if (dragRef.current) return;
    const el = e.currentTarget as HTMLElement;
    safeSetPointerCapture(el, e.pointerId);
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const p = clientToCanvas(e.clientX, e.clientY, rect);
    dragRef.current = {
      mode,
      pointerId: e.pointerId,
      startCanvasX: p.x,
      startCanvasY: p.y,
      startTransform: live!.cel.transform,
      baseCornerDist: Math.hypot(w / 2, h / 2),
    };
    armWatchdog();
  }

  function onDragMove(e: PointerEvent) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    if (e.pointerType === 'touch' && touchCount.value > 1) {
      // A second finger arrived mid-drag — hand off to the canvas's own
      // pinch/pan gesture instead of continuing to move/scale/rotate.
      dragRef.current = null;
      disarmWatchdog();
      return;
    }
    armWatchdog();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const p = clientToCanvas(e.clientX, e.clientY, rect);
    const { startTransform } = drag;

    if (drag.mode === 'move') {
      const dx = p.x - drag.startCanvasX;
      const dy = p.y - drag.startCanvasY;
      previewReferenceTransform(track.id, { ...startTransform, x: startTransform.x + dx, y: startTransform.y + dy });
    } else if (drag.mode === 'scale') {
      const dist = Math.hypot(p.x - startTransform.x, p.y - startTransform.y);
      const scale = Math.max(0.02, dist / drag.baseCornerDist);
      previewReferenceTransform(track.id, { ...startTransform, scale });
    } else {
      const angle = Math.atan2(p.y - startTransform.y, p.x - startTransform.x) + Math.PI / 2;
      previewReferenceTransform(track.id, { ...startTransform, rotation: angle });
    }
  }

  function endDrag(e: PointerEvent) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    disarmWatchdog();
    const current = liveReferences.value.get(track.id);
    if (current) void setReferenceTransform(track.id, current.cel.transform);
  }

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: w,
        height: h,
        transformOrigin: 'center',
        transform: `translate(${x - w / 2}px, ${y - h / 2}px) rotate(${rotation}rad) scale(${scale})`,
      }}
    >
      <img
        src={live.imageUrl}
        width={w}
        height={h}
        draggable={false}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          opacity: track.opacity,
          touchAction: 'none',
          cursor: transformable ? 'move' : undefined,
          pointerEvents: transformable ? 'auto' : 'none',
        }}
        onPointerDown={(e) => beginDrag('move', e as unknown as PointerEvent)}
        onPointerMove={(e) => onDragMove(e as unknown as PointerEvent)}
        onPointerUp={(e) => endDrag(e as unknown as PointerEvent)}
        onPointerCancel={(e) => endDrag(e as unknown as PointerEvent)}
        onLostPointerCapture={(e) => endDrag(e as unknown as PointerEvent)}
      />
      {transformable ? (
        <>
          {([
            ['nw', 0, 0],
            ['ne', w, 0],
            ['sw', 0, h],
            ['se', w, h],
          ] as const).map(([key, hx, hy]) => (
            <div
              key={key}
              style={{
                position: 'absolute',
                left: hx,
                top: hy,
                width: HANDLE_SIZE,
                height: HANDLE_SIZE,
                marginLeft: -HANDLE_SIZE / 2,
                marginTop: -HANDLE_SIZE / 2,
                background: 'var(--paper)',
                border: '2px solid var(--ink)',
                borderRadius: 0, // sharp corners — matches the app's 1-bit aesthetic
                transform: `scale(${1 / (scale * zoom)})`,
                touchAction: 'none',
                cursor: 'nwse-resize',
              }}
              onPointerDown={(e) => beginDrag('scale', e as unknown as PointerEvent)}
              onPointerMove={(e) => onDragMove(e as unknown as PointerEvent)}
              onPointerUp={(e) => endDrag(e as unknown as PointerEvent)}
              onPointerCancel={(e) => endDrag(e as unknown as PointerEvent)}
              onLostPointerCapture={(e) => endDrag(e as unknown as PointerEvent)}
            />
          ))}
          <div
            style={{
              position: 'absolute',
              left: w / 2,
              top: -40,
              width: HANDLE_SIZE,
              height: HANDLE_SIZE,
              marginLeft: -HANDLE_SIZE / 2,
              marginTop: -HANDLE_SIZE / 2,
              background: 'var(--paper)',
              border: '2px solid var(--ink)',
              borderRadius: '50%',
              transform: `scale(${1 / (scale * zoom)})`,
              touchAction: 'none',
              cursor: 'grab',
            }}
            onPointerDown={(e) => beginDrag('rotate', e as unknown as PointerEvent)}
            onPointerMove={(e) => onDragMove(e as unknown as PointerEvent)}
            onPointerUp={(e) => endDrag(e as unknown as PointerEvent)}
            onPointerCancel={(e) => endDrag(e as unknown as PointerEvent)}
            onLostPointerCapture={(e) => endDrag(e as unknown as PointerEvent)}
          />
        </>
      ) : null}
    </div>
  );
}
