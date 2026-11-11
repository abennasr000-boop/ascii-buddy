// MP4 (H.264) encoding through Mediabunny + WebCodecs (§15.2). Kept in its own module so the (large) video
// library is only fetched when an MP4 export is actually run.
import { BufferTarget, CanvasSource, Mp4OutputFormat, Output, QUALITY_HIGH, QUALITY_VERY_HIGH, canEncodeVideo } from 'mediabunny';
import { videoTimeline } from '../engine/exportPlan';
import { createFrameLoader } from './frameLoader';
import { createFrameRenderer } from './frameRenderer';
import { ExportProblem, checkAbort, needsFor, yieldToUi, type Ctx, type ExportOutput } from './context';

const qualityFor = (q: 'standard' | 'high') => (q === 'high' ? QUALITY_VERY_HIGH : QUALITY_HIGH);

/** True when this browser's WebCodecs can produce H.264 at this size. */
export async function canEncodeAvc(width: number, height: number, quality: 'standard' | 'high'): Promise<boolean> {
  if (typeof VideoEncoder === 'undefined') return false;
  return canEncodeVideo('avc', { width, height, quality: qualityFor(quality) }).catch(() => false);
}

export async function encodeMp4({ project, opts, indices, durations, size, hooks, name }: Ctx): Promise<ExportOutput> {
  const renderer = await createFrameRenderer(project, opts.content, size, false);
  const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
  const source = new CanvasSource(renderer.canvas, { codec: 'avc', quality: qualityFor(opts.mp4Quality) });
  output.addVideoTrack(source, { frameRate: project.fps });
  const timeline = videoTimeline(durations, project.fps, opts.mp4Repeat);
  const loader = createFrameLoader(project);
  try {
    await output.start();
    let drawn = -1;
    for (let t = 0; t < timeline.length; t++) {
      checkAbort(hooks);
      const entry = timeline[t];
      // A hold is one long sample; "repeat N times" revisits every frame, so a frame is drawn again each pass.
      if (drawn !== entry.index) {
        const art = await loader.load(indices[entry.index], needsFor(opts));
        renderer.render(art);
        art.release();
        drawn = entry.index;
      }
      await source.add(entry.start, entry.duration);
      hooks.onProgress(t + 1, timeline.length);
      if (t % 4 === 3) await yieldToUi();
    }
    await output.finalize();
  } catch (err) {
    await output.cancel().catch(() => undefined);
    throw err;
  } finally {
    loader.dispose();
    renderer.dispose();
  }
  const buffer = output.target.buffer;
  if (!buffer) throw new ExportProblem('The video could not be created.');
  return { kind: 'file', blob: new Blob([buffer], { type: 'video/mp4' }), filename: name('mp4') };
}
