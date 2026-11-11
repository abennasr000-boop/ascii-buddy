// Orchestrates loading every track's live data (drawing cels + reference
// images) for the current frame, and recomputing ASCII stats from it. Used
// on mount and after any structural track/frame change.
import type { ID, Project } from '../types/model';
import { liveCels, loadAllDrawingCels, frameIdForTrack } from './celStore';
import { loadAllReferenceTracks } from './referenceStore';
import { recomputeAllStats } from './asciiState';
import { recomputeOnion } from './onion';
import { refreshFrameContent } from './frameContent';
import { flush } from './autosave';
import { projects } from './projects';

let generation = 0;
let chain: Promise<void> = Promise.resolve();
let latest: Promise<void> = Promise.resolve();

/** True when every drawing track's live cel already belongs to the project's current frame — lets a
 * caller skip a redundant reload (and, importantly, not clobber live edits made since the last one). */
export function isTrackDataLoaded(project: Project): boolean {
  const cels = liveCels.value;
  const drawing = project.tracks.filter((t) => t.kind === 'drawing');
  return drawing.every((t) => {
    const cel = cels.get(t.id);
    return cel !== undefined && cel.projectId === project.id && cel.frameId === frameIdForTrack(t, project.ui.currentFrameId);
  });
}

/** Reloads every track's live data for the project's current frame.
 *
 * Pending edits to the *outgoing* frame are written to IndexedDB first: the debounced
 * autosave saves whatever cel is live when it fires, so without this a stroke made
 * shortly before changing frames would be replaced by the new frame's cel and lost.
 *
 * Calls are serialised and a call superseded by a newer one before it starts is skipped,
 * so rapid navigation can't leave an older frame's data loaded last. */
export function reloadAllTrackData(project: Project): Promise<void> {
  const mine = ++generation;
  const run = chain.then(async () => {
    if (mine !== generation) return; // a newer reload will do the work
    await flush();
    if (mine !== generation) return; // superseded (or cancelled by leaving the project) while saving
    const fresh: Project = projects.value.find((p) => p.id === project.id) ?? project;
    const frameId: ID = fresh.ui.currentFrameId;
    await Promise.all([loadAllDrawingCels(fresh, frameId, () => mine !== generation), loadAllReferenceTracks(fresh, frameId, () => mine !== generation)]);
    if (mine !== generation) return;
    recomputeAllStats();
    void recomputeOnion(fresh); // secondary preview data — never blocks the main load path
    void refreshFrameContent(fresh);
  });
  chain = run.catch(() => undefined);
  latest = run;
  return settled(run);
}

/** Invalidates every reload that is queued or in flight, so none of them can land after the editor has
 * moved on to a different project (they would repopulate the live buffers with the old project's data). */
export function cancelPendingReloads(): void {
  generation++;
}

/** Resolves only once the *newest* reload has finished — a reload superseded by a later one (e.g. the
 * canvas's own frame effect racing an undo's jump) must not report "loaded" while the frame it was
 * asked for is still being read, or the caller would act on the previous frame's data. */
async function settled(run: Promise<void>): Promise<void> {
  await run;
  let seen = run;
  while (latest !== seen) {
    seen = latest;
    await seen;
  }
}
