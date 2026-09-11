// View-only toggles (§11). Ephemeral — not part of the persisted Project
// (§17's `ui` only has view/hideReferences/currentFrameId/currentTrackId),
// consistent with how onion/reference toggles are treated in earlier phases.
import { signal } from '@preact/signals';

export const gridOverlay = signal(false);
export const showDrawingUnderAscii = signal(false);

/** True while the columns slider is being dragged, so the grid overlay shows
 * "faintly and temporarily" per §11 even when the toggle itself is off. */
export const columnsSliderActive = signal(false);

let columnsSliderTimer: ReturnType<typeof setTimeout> | null = null;
export function pulseColumnsSliderActive() {
  columnsSliderActive.value = true;
  if (columnsSliderTimer) clearTimeout(columnsSliderTimer);
  columnsSliderTimer = setTimeout(() => {
    columnsSliderActive.value = false;
  }, 600);
}
