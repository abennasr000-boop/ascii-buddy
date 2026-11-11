// Everything the editor keeps in module-level state while a project is open —
// live cel buffers, ASCII stats/frame, onion previews, the timeline's content
// dots and frame selection, live reference images, playback, selection. None of
// it is keyed by project, so it MUST be cleared whenever the editor opens or
// leaves a project; otherwise the next project briefly (or, if a late async load
// lands, persistently) shows the previous project's data.
import { liveCels } from './celStore';
import { trackStats, asciiFrame, invalidateAsciiFrame } from './asciiState';
import { clearOnion } from './onion';
import { frameContentKeys, celOverrideKeys } from './frameContent';
import { resetCelShapeChars } from './shapeTemplates';
import { unloadAllReferences } from './referenceStore';
import { clearFrameSelection } from './frameSelection';
import { isPlaying, stopPlayback } from './playback';
import { clearPlaybackCache } from './playbackCache';
import { cancelPendingReloads } from './canvasData';
import { discardSelection } from './selection';
import { clearHistory } from './history';
import { userAdjustedViewport } from './viewport';
import { strokeInProgress } from './strokeState';
import { importRequest } from './importUi';
import { focusMode } from './focusMode';

/** Call after the project's pending edits have been flushed (flush snapshots the live cels synchronously). */
export function resetEditorSession(projectId?: string): void {
  cancelPendingReloads(); // no queued/in-flight reload may land after this
  if (isPlaying.value && projectId) stopPlayback(projectId);
  clearPlaybackCache();
  discardSelection();
  clearHistory();
  liveCels.value = new Map();
  trackStats.value = new Map();
  invalidateAsciiFrame();
  asciiFrame.value = null;
  clearOnion();
  frameContentKeys.value = new Set();
  celOverrideKeys.value = new Set();
  resetCelShapeChars();
  unloadAllReferences();
  clearFrameSelection();
  userAdjustedViewport.value = false;
  strokeInProgress.value = false;
  importRequest.value = null;
  focusMode.value = false;
}
