// The small action bar that floats near a selection (§6.3): flip, rotate,
// copy/cut/delete, snap-to-grid, and Done. Rendered inside the canvas
// viewport, so it stops pointer events reaching the canvas's own handlers.
import type { Project } from '../types/model';
import {
  selection,
  marquee,
  flipSelection,
  rotateSelection,
  copySelection,
  cutSelection,
  deleteSelection,
  commitSelection,
  snapEnabled,
} from '../state/selection';
import { viewport } from '../state/viewport';
import { snapOverride } from '../state/tools';

const BAR_HALF_WIDTH = 190;
const BAR_HEIGHT = 40;

export function SelectionBar({ project, trackId }: { project: Project; trackId: string }) {
  const sel = selection.value;
  if (!sel || sel.trackId !== trackId || marquee.value) return null;
  const v = viewport.value;
  const left = v.panX + (sel.x + sel.block.width / 2) * v.zoom;
  const top = v.panY + sel.y * v.zoom;
  const bottom = v.panY + (sel.y + sel.block.height) * v.zoom;
  // Above the selection if there's room, otherwise below it, otherwise pinned inside the viewport.
  let y = top - BAR_HEIGHT - 10;
  if (y < 6) y = bottom + 10;
  y = Math.max(6, Math.min(y, window.innerHeight - 200));
  const x = Math.max(BAR_HALF_WIDTH, Math.min(left, window.innerWidth - BAR_HALF_WIDTH - 60));
  const snapOn = snapEnabled(project);

  const stop = (e: Event) => e.stopPropagation();
  return (
    <div
      class="ab-selection-bar"
      style={{ left: x, top: y }}
      onPointerDown={stop}
      onPointerMove={stop}
      onPointerUp={stop}
      onPointerCancel={stop}
      onWheel={stop}
    >
      <button type="button" class="ab-button" title="Flip horizontal" onClick={() => flipSelection('h')}>
        ⇋
      </button>
      <button type="button" class="ab-button" title="Flip vertical" onClick={() => flipSelection('v')}>
        ⇅
      </button>
      <button type="button" class="ab-button" title="Rotate 90°" onClick={rotateSelection}>
        ↻
      </button>
      <button type="button" class="ab-button" title="Copy (⌘C)" onClick={() => copySelection(project)}>
        Copy
      </button>
      <button type="button" class="ab-button" title="Cut (⌘X)" onClick={() => cutSelection(project)}>
        Cut
      </button>
      <button type="button" class="ab-button" title="Delete selection content" onClick={deleteSelection}>
        Delete
      </button>
      <button
        type="button"
        class={`ab-button${snapOn ? ' ab-button--default' : ''}`}
        title="Snap moves to whole grid cells"
        onClick={() => (snapOverride.value = !snapOn)}
      >
        Snap
      </button>
      <button type="button" class="ab-button" title="Deselect (Esc)" onClick={commitSelection}>
        Done
      </button>
    </div>
  );
}
