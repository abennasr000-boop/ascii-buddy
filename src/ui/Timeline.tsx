// The timeline panel at the bottom of the editor: collapsed (a transport strip)
// and expanded (a track×frame grid) states. See ASCII_BUDDY_SPEC.md §9.1, §9.4.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { ID, Project } from '../types/model';
import { IconButton } from './Button';
import { Icon } from './icons';
import {
  addFrame,
  duplicateFrame,
  deleteFrame,
  reorderFrames,
  navigateFrame,
  deleteFrames,
  duplicateFrames,
} from '../state/framesActions';
import {
  selectedFrameIds,
  isFrameSelected,
  selectOnlyFrame,
  selectFrameRange,
  toggleFrameInSelection,
  clearFrameSelection,
  frameRangeMode,
} from '../state/frameSelection';
import { isPlaying, togglePlayback, effectiveCurrentFrameId } from '../state/playback';
import { updateProjectData } from '../state/projects';
import { hasFrameContent, hasCelOverride } from '../state/frameContent';
import { timelineExpanded } from '../state/timelineUi';
import { playbackPreparing } from '../state/playbackCache';
import { FrameHoldDialog } from './FrameHoldDialog';
import { FpsDialog } from './FpsDialog';
import { safeSetPointerCapture } from './pointerCapture';

const LONG_PRESS_MS = 450;
const DRAG_START_PX = 8; // a mouse tap that drifts less than this is still a tap, never a reorder
const SCROLL_CANCEL_PX = 8; // a touch that moves this far before the long-press is a scroll, not a press
const EDGE_SCROLL_ZONE_PX = 28;
const EDGE_SCROLL_STEP_PX = 14;
const TAP_MAX_MOVE_PX = 8;
const GRID_HEADER_INSET_PX = 120; // the sticky track-name column that covers the grid's left edge

interface FrameDrag {
  frameId: ID;
  pointerType: string;
  startX: number;
  startY: number;
  timer: ReturnType<typeof setTimeout> | null;
  longPressed: boolean;
  /** Reordering is armed: for touch/pen only after a long-press (so a plain swipe scrolls), for a mouse from the start. */
  armed: boolean;
  /** Moved far enough, while armed, that this is now a reorder drag. */
  active: boolean;
  movingIds: ID[];
}

interface FrameMenuState {
  frameId: ID;
  x: number;
  y: number;
}

export function Timeline({ project, onOpenLayers }: { project: Project; onOpenLayers: () => void }) {
  const expanded = timelineExpanded.value;
  const [frameMenu, setFrameMenu] = useState<FrameMenuState | null>(null);
  const [holdDialogFor, setHoldDialogFor] = useState<{ frameId: ID; frameIds?: ID[] } | null>(null);
  const [showFpsDialog, setShowFpsDialog] = useState(false);
  const stripRef = useRef<HTMLDivElement>(null);

  const drag = useRef<FrameDrag | null>(null);
  // Where the dragged frame(s) would land, shown as an insertion marker. Reordering is applied once, on
  // release, rather than live during the drag — re-rendering (and re-keying) the strip on every pointer
  // move was both slow and what made frames jump around under the finger.
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [draggingIds, setDraggingIds] = useState<ID[]>([]);
  /** The frame that has been long-pressed and is now "lifted" — dragging it reorders. */
  const [armedId, setArmedId] = useState<ID | null>(null);
  /** Bumped by the transport buttons so the strip always re-centres on the current frame,
   * even when the current frame didn't change (e.g. pressing |◀ after scrolling away from frame 1). */
  const [scrollNonce, setScrollNonce] = useState(0);
  const preparing = playbackPreparing.value;

  const playing = isPlaying.value;
  const currentFrameId = effectiveCurrentFrameId(project);
  const selection = selectedFrameIds.value;
  const frames = project.frames;
  const frameIds = frames.map((f) => f.id);

  /** Scrolls the strip/grid so the frame is visible (or centred when `center`). Explicit scrollLeft maths
   * rather than scrollIntoView, which also scrolls ancestors and is unreliable inside iOS scroll containers. */
  function scrollToFrame(frameId: ID, center: boolean) {
    const scroller = stripRef.current;
    if (!scroller) return;
    const el = scroller.querySelector<HTMLElement>(`[data-frame-id="${frameId}"]`);
    if (!el) return;
    const s = scroller.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const inset = expanded ? GRID_HEADER_INSET_PX : 0;
    const margin = 12;
    if (!center && r.left >= s.left + inset + margin && r.right <= s.right - margin) return; // already comfortably visible
    scroller.scrollLeft += r.left + r.width / 2 - (s.left + inset + (s.width - inset) / 2);
  }

  // Keep the current frame visible (§9.4) when it changes.
  useEffect(() => {
    scrollToFrame(currentFrameId, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFrameId, expanded]);
  useEffect(() => {
    if (scrollNonce > 0) scrollToFrame(currentFrameId, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollNonce]);

  // A swipe on the strip scrolls it (touch-action: pan-x). Once a frame has been long-pressed, though, the
  // finger is reordering it, so its movement must not also scroll the strip.
  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const block = (e: TouchEvent) => {
      if (drag.current?.armed) e.preventDefault();
    };
    el.addEventListener('touchmove', block, { passive: false });
    return () => el.removeEventListener('touchmove', block);
  }, [expanded]);

  function go(direction: 'first' | 'previous' | 'next' | 'last') {
    navigateFrame(project, direction);
    setScrollNonce((n) => n + 1);
  }

  function selectFrame(frameId: ID, e: { shiftKey?: boolean }) {
    if (playing) return;
    if (selection.size > 0 || e.shiftKey) {
      // Selecting is frame by frame; the "Range" toggle (or Shift) makes a tap select everything from the anchor.
      if (frameRangeMode.value || (e.shiftKey && selection.size > 0)) selectFrameRange(frameIds, frameId);
      else toggleFrameInSelection(frameId);
      return;
    }
    updateProjectData(project.id, { ui: { ...project.ui, currentFrameId: frameId } });
  }

  function onFrameChipPointerDown(e: PointerEvent, frameId: ID) {
    if (playing) return;
    const isMouse = e.pointerType === 'mouse';
    const press: FrameDrag = {
      frameId,
      pointerType: e.pointerType,
      startX: e.clientX,
      startY: e.clientY,
      timer: null,
      longPressed: false,
      armed: isMouse, // a mouse can't scroll by dragging, so dragging it means "reorder"; a finger must long-press first
      active: false,
      movingIds: selection.has(frameId) ? frameIds.filter((id) => selection.has(id)) : [frameId],
    };
    if (isMouse) safeSetPointerCapture(e.currentTarget as Element, e.pointerId);
    press.timer = setTimeout(() => {
      press.timer = null;
      press.longPressed = true;
      press.armed = true;
      // From here on the finger belongs to this frame, not to scrolling.
      safeSetPointerCapture(e.currentTarget as Element, e.pointerId);
      if (!selectedFrameIds.value.has(frameId)) selectOnlyFrame(frameId);
      setArmedId(frameId);
      navigator.vibrate?.(8);
    }, LONG_PRESS_MS);
    drag.current = press;
  }

  function frameChips(): HTMLElement[] {
    return [...(stripRef.current?.querySelectorAll<HTMLElement>('[data-frame-id]') ?? [])];
  }

  function onFrameChipPointerMove(e: PointerEvent) {
    const press = drag.current;
    if (!press) return;
    const moved = Math.hypot(e.clientX - press.startX, e.clientY - press.startY);

    if (!press.armed) {
      // A finger that moves before the long-press fires is scrolling: abandon the press and let the browser scroll.
      if (moved > SCROLL_CANCEL_PX) {
        if (press.timer) clearTimeout(press.timer);
        drag.current = null;
      }
      return;
    }
    if (!press.active) {
      if (moved <= DRAG_START_PX) return;
      press.active = true;
      if (press.timer) {
        clearTimeout(press.timer);
        press.timer = null;
      }
      setDraggingIds(press.movingIds);
    }

    const chips = frameChips();
    const scroller = stripRef.current;
    if (scroller) {
      const bounds = scroller.getBoundingClientRect();
      const inset = expanded ? GRID_HEADER_INSET_PX : 0;
      if (e.clientX < bounds.left + inset + EDGE_SCROLL_ZONE_PX) scroller.scrollLeft -= EDGE_SCROLL_STEP_PX;
      else if (e.clientX > bounds.right - EDGE_SCROLL_ZONE_PX) scroller.scrollLeft += EDGE_SCROLL_STEP_PX;
    }

    // The frame goes before the first chip whose midpoint is right of the pointer.
    let target = chips.length;
    for (let i = 0; i < chips.length; i++) {
      const rect = chips[i].getBoundingClientRect();
      if (e.clientX < rect.left + rect.width / 2) {
        target = i;
        break;
      }
    }
    if (target !== dropIndex) setDropIndex(target);
  }

  function endFrameDrag() {
    const press = drag.current;
    drag.current = null;
    if (press?.timer) clearTimeout(press.timer);
    setDropIndex(null);
    setDraggingIds([]);
    setArmedId(null);
    return press;
  }

  function onFrameChipPointerUp(e: PointerEvent, frameId: ID) {
    const target = dropIndex;
    const press = endFrameDrag();
    if (!press) return;
    if (press.active) {
      if (target !== null) void reorderFrames(project, press.movingIds, target);
      if (press.longPressed) clearFrameSelection(); // the long-press only "lifted" the frame; the move is done
      return;
    }
    if (!press.longPressed) selectFrame(frameId, e as unknown as MouseEvent);
  }

  function dropClass(index: number): string {
    if (dropIndex === null) return '';
    if (index === dropIndex) return ' ab-timeline__drop-before';
    if (dropIndex >= frames.length && index === frames.length - 1) return ' ab-timeline__drop-after';
    return '';
  }

  function dragClass(id: ID): string {
    if (draggingIds.includes(id)) return ' ab-timeline__dragging';
    return armedId === id ? ' ab-timeline__armed' : '';
  }

  function openFrameMenu(frameId: ID, e: PointerEvent) {
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setFrameMenu({ frameId, x: rect.left, y: rect.bottom });
  }

  const hasSelection = selection.size > 0 && !playing;

  return (
    <div class="ab-timeline">
      <div class="ab-timeline__transport">
        <IconButton title="First frame" disabled={playing} onClick={() => go('first')}>
          <Icon name="first" size={32} />
        </IconButton>
        <IconButton title="Previous frame" disabled={playing} onClick={() => go('previous')}>
          <Icon name="previous" size={32} />
        </IconButton>
        <IconButton title={playing ? 'Stop' : 'Play'} onClick={() => togglePlayback(project)}>
          <Icon name={playing ? 'stop' : 'play'} size={32} />
        </IconButton>
        <IconButton title="Next frame" disabled={playing} onClick={() => go('next')}>
          <Icon name="next" size={32} />
        </IconButton>
        <IconButton title="Last frame" disabled={playing} onClick={() => go('last')}>
          <Icon name="last" size={32} />
        </IconButton>
        <IconButton title="New frame" disabled={playing} onClick={() => void addFrame(project)}>
          <Icon name="newFrame" size={32} />
        </IconButton>

        {!expanded ? (
          <div ref={stripRef} class="ab-timeline__strip">
            {frames.map((frame, index) => (
              <div
                key={frame.id}
                data-frame-id={frame.id}
                class={`ab-timeline__chip${frame.id === currentFrameId ? ' ab-timeline__chip--current' : ''}${isFrameSelected(frame.id) ? ' ab-timeline__chip--selected' : ''}${dropClass(index)}${dragClass(frame.id)}`}
                onPointerDown={(e) => onFrameChipPointerDown(e as unknown as PointerEvent, frame.id)}
                onPointerMove={(e) => onFrameChipPointerMove(e as unknown as PointerEvent)}
                onPointerUp={(e) => onFrameChipPointerUp(e as unknown as PointerEvent, frame.id)}
                onPointerCancel={endFrameDrag}
                onContextMenu={(e) => openFrameMenu(frame.id, e as unknown as PointerEvent)}
              >
                {index + 1}
                {frame.duration > 1 ? <span class="ab-timeline__hold"> ×{frame.duration}</span> : null}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ flex: 1 }} />
        )}

        {preparing ? (
          <span class="ab-timeline__prep" title="Rendering every frame once so playback is smooth">
            Preparing {preparing.done}/{preparing.total}…
          </span>
        ) : null}
        <button type="button" class="ab-timeline__fps" onClick={() => setShowFpsDialog(true)}>
          {project.fps} fps
        </button>
        <SegmentedModeLabel project={project} />
        <IconButton title={expanded ? 'Collapse timeline' : 'Expand timeline'} onClick={() => (timelineExpanded.value = !timelineExpanded.value)}>
          <Icon name={expanded ? 'chevronDown' : 'chevronUp'} size={32} />
        </IconButton>
      </div>

      {expanded ? (
        <div class="ab-timeline__grid-wrap" ref={stripRef}>
          <div class="ab-timeline__grid" style={{ gridTemplateColumns: `120px ${frames.map((f) => `${28 * Math.min(4, f.duration)}px`).join(' ')}` }}>
            <div class="ab-timeline__corner" />
            {frames.map((frame, index) => (
              <div
                key={frame.id}
                data-frame-id={frame.id}
                class={`ab-timeline__col-header${frame.id === currentFrameId ? ' ab-timeline__col-header--current' : ''}${isFrameSelected(frame.id) ? ' ab-timeline__col-header--selected' : ''}${dropClass(index)}${dragClass(frame.id)}`}
                onPointerDown={(e) => onFrameChipPointerDown(e as unknown as PointerEvent, frame.id)}
                onPointerMove={(e) => onFrameChipPointerMove(e as unknown as PointerEvent)}
                onPointerUp={(e) => onFrameChipPointerUp(e as unknown as PointerEvent, frame.id)}
                onPointerCancel={endFrameDrag}
                onContextMenu={(e) => openFrameMenu(frame.id, e as unknown as PointerEvent)}
              >
                {index + 1}
                {frame.duration > 1 ? <span class="ab-timeline__hold"> ×{frame.duration}</span> : null}
              </div>
            ))}

            {[...project.tracks].map((track) => (
              <>
                <div
                  key={`${track.id}-label`}
                  class={`ab-timeline__row-header${track.id === project.ui.currentTrackId ? ' ab-timeline__row-header--current' : ''}`}
                  {...tapHandlers(() => updateProjectData(project.id, { ui: { ...project.ui, currentTrackId: track.id } }))}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    onOpenLayers();
                  }}
                >
                  {track.name}
                  {track.isStatic ? ' [S]' : ''}
                  {track.conversion && Object.keys(track.conversion).length > 0 ? (
                    <span title="This track has its own ASCII settings"> ◆</span>
                  ) : null}
                </div>
                {track.isStatic ? (
                  <div key={`${track.id}-static`} class="ab-timeline__static-bar" style={{ gridColumn: `span ${frames.length}` }} />
                ) : (
                  frames.map((frame) => (
                    <FrameCell key={`${track.id}-${frame.id}`} project={project} trackId={track.id} frameId={frame.id} isCurrentFrame={frame.id === currentFrameId} />
                  ))
                )}
              </>
            ))}
          </div>
        </div>
      ) : null}

      {hasSelection ? (
        <div class="ab-timeline__selection-bar">
          <span>{selection.size} selected</span>
          <button
            type="button"
            class={`ab-button${frameRangeMode.value ? ' ab-button--active' : ''}`}
            aria-pressed={frameRangeMode.value}
            title="When on, tapping a frame selects everything between it and the last frame you selected"
            onClick={() => (frameRangeMode.value = !frameRangeMode.value)}
          >
            Range
          </button>
          <button type="button" class="ab-button" onClick={() => void duplicateFrames(project, [...selection])}>
            Duplicate
          </button>
          <button
            type="button"
            class="ab-button"
            onClick={() => setHoldDialogFor({ frameId: [...selection][0], frameIds: [...selection] })}
          >
            Hold…
          </button>
          <button type="button" class="ab-button" onClick={() => void deleteFrames(project, [...selection])}>
            Delete
          </button>
          <button type="button" class="ab-button" onClick={clearFrameSelection}>
            Done
          </button>
        </div>
      ) : null}

      {frameMenu ? (
        <>
          <div class="ab-modal-overlay" style={{ background: 'transparent' }} onClick={() => setFrameMenu(null)} />
          <div class="ab-menu" style={{ position: 'fixed', left: frameMenu.x, top: frameMenu.y - 4, transform: 'translateY(-100%)' }}>
            <div
              class="ab-menu__item"
              onClick={() => {
                void duplicateFrame(project, frameMenu.frameId);
                setFrameMenu(null);
              }}
            >
              <span>Duplicate frame</span>
            </div>
            <div
              class="ab-menu__item"
              onClick={() => {
                setHoldDialogFor({ frameId: frameMenu.frameId });
                setFrameMenu(null);
              }}
            >
              <span>Hold…</span>
            </div>
            <div
              class="ab-menu__item"
              onClick={() => {
                void deleteFrame(project, frameMenu.frameId);
                setFrameMenu(null);
              }}
            >
              <span>Delete frame</span>
            </div>
          </div>
        </>
      ) : null}

      {holdDialogFor ? (
        <FrameHoldDialog project={project} frameId={holdDialogFor.frameId} frameIds={holdDialogFor.frameIds} onClose={() => setHoldDialogFor(null)} />
      ) : null}
      {showFpsDialog ? <FpsDialog project={project} onClose={() => setShowFpsDialog(false)} /> : null}
    </div>
  );
}

function SegmentedModeLabel({ project }: { project: Project }) {
  function cycle() {
    const order: Project['playbackMode'][] = ['loop', 'pingpong', 'once'];
    const next = order[(order.indexOf(project.playbackMode) + 1) % order.length];
    updateProjectData(project.id, { playbackMode: next });
  }
  const label = project.playbackMode === 'pingpong' ? 'Ping-pong' : project.playbackMode === 'once' ? 'Once' : 'Loop';
  return (
    <button type="button" class="ab-timeline__mode" onClick={cycle} title="Playback mode">
      {label}
    </button>
  );
}

/** Selects on release, and only if the pointer barely moved: the grid scrolls by swiping, so a press that turns
 * into a scroll (the browser then cancels the pointer) must not also select whatever was under the finger. */
let tapStart: { x: number; y: number } | null = null; // module-level: it must survive a re-render between press and release

function tapHandlers(onTap: () => void) {
  return {
    onPointerDown: (e: PointerEvent) => {
      tapStart = { x: e.clientX, y: e.clientY };
    },
    onPointerUp: (e: PointerEvent) => {
      const moved = tapStart ? Math.hypot(e.clientX - tapStart.x, e.clientY - tapStart.y) : Infinity;
      tapStart = null;
      if (moved <= TAP_MAX_MOVE_PX) onTap();
    },
    onPointerCancel: () => {
      tapStart = null;
    },
  } as unknown as Record<string, never>;
}

function FrameCell({
  project,
  trackId,
  frameId,
  isCurrentFrame,
}: {
  project: Project;
  trackId: ID;
  frameId: ID;
  isCurrentFrame: boolean;
}) {
  const hasContent = hasFrameContent(trackId, frameId, false);
  const overridden = hasCelOverride(trackId, frameId, false);
  return (
    <div
      class={`ab-timeline__cell${isCurrentFrame ? ' ab-timeline__cell--current' : ''}`}
      {...tapHandlers(() => updateProjectData(project.id, { ui: { ...project.ui, currentFrameId: frameId, currentTrackId: trackId } }))}
    >
      {hasContent ? <div class="ab-timeline__dot" /> : null}
      {overridden ? <span class="ab-timeline__override-mark" title="This cel has its own ASCII settings">◆</span> : null}
    </div>
  );
}
