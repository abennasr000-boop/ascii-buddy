// Collapsed/expanded state for the bottom timeline panel (§9.4) — a plain
// signal (not persisted) so both the timeline's own expand button and the
// View menu's "Expand timeline" item drive the same state.
import { signal } from '@preact/signals';

function defaultExpanded(): boolean {
  return window.innerWidth < window.innerHeight; // portrait defaults expanded
}

export const timelineExpanded = signal(defaultExpanded());

// The default follows orientation (§9.4: expanded in portrait, collapsed in landscape), so rotating
// the iPad (or resizing a Split View window across the portrait/landscape line) re-applies it.
// Tapping the toggle in between still works; it just gets re-defaulted the next time orientation flips.
let wasPortrait = defaultExpanded();
window.addEventListener('resize', () => {
  const portrait = defaultExpanded();
  if (portrait === wasPortrait) return;
  wasPortrait = portrait;
  timelineExpanded.value = portrait;
});
