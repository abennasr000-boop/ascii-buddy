// Focus mode (§12.2, `F`): hides everything except the canvas and a small exit button. The pencil and the
// touch gestures keep working. Not persisted — it always starts off, and is cleared when a project closes.
import { signal } from '@preact/signals';

export const focusMode = signal(false);

export function toggleFocusMode(): void {
  focusMode.value = !focusMode.value;
}
