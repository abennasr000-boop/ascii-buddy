// Draggable Mac-style window with a close box, remembering its position per
// orientation. See ASCII_BUDDY_SPEC.md §12.3. Position memory uses
// localStorage — it's a per-viewer UI convenience, not project data.
import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { Window } from './Window';
import { safeSetPointerCapture } from './pointerCapture';

function orientationKey(): string {
  return window.innerWidth >= window.innerHeight ? 'landscape' : 'portrait';
}

function storageKey(id: string): string {
  return `ascii_buddy:window:${id}:${orientationKey()}`;
}

function readStoredPosition(id: string): { x: number; y: number } | null {
  try {
    const raw = localStorage.getItem(storageKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number') return parsed;
  } catch {
    // ignore — falls back to the default position
  }
  return null;
}

function writeStoredPosition(id: string, pos: { x: number; y: number }) {
  try {
    localStorage.setItem(storageKey(id), JSON.stringify(pos));
  } catch {
    // best-effort only
  }
}

export function FloatingWindow({
  id,
  title,
  onClose,
  children,
  defaultPosition,
  width = 260,
}: {
  id: string;
  title: string;
  onClose: () => void;
  children: ComponentChildren;
  defaultPosition: { x: number; y: number };
  width?: number;
}) {
  const [pos, setPos] = useState(() => readStoredPosition(id) ?? defaultPosition);
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  // setPos (React state) can lag behind rapid pointermove events within the
  // same tick, so endDrag reads the latest position from here instead of
  // from `pos` — otherwise it can persist a stale, pre-drag position.
  const latestPosRef = useRef(pos);
  latestPosRef.current = pos;

  useEffect(() => {
    const onResize = () => {
      const stored = readStoredPosition(id);
      if (stored) setPos(stored);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [id]);

  const startDrag = (e: PointerEvent) => {
    safeSetPointerCapture(e.currentTarget as HTMLElement, e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, originX: pos.x, originY: pos.y };
  };
  const onDrag = (e: PointerEvent) => {
    if (!dragRef.current) return;
    const { startX, startY, originX, originY } = dragRef.current;
    const next = {
      x: Math.max(0, originX + (e.clientX - startX)),
      y: Math.max(0, originY + (e.clientY - startY)),
    };
    latestPosRef.current = next;
    setPos(next);
  };
  const endDrag = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    writeStoredPosition(id, latestPosRef.current);
  };

  return (
    <div style={{ position: 'fixed', left: pos.x, top: pos.y, zIndex: 40 }}>
      <Window
        title={title}
        onClose={onClose}
        style={{ width }}
        titleBarProps={{
          onPointerDown: startDrag as unknown as JSX.GenericEventHandler<HTMLDivElement>,
          onPointerMove: onDrag as unknown as JSX.GenericEventHandler<HTMLDivElement>,
          onPointerUp: endDrag,
          onPointerCancel: endDrag,
          style: { cursor: 'move', touchAction: 'none' },
        }}
      >
        {children}
      </Window>
    </div>
  );
}
