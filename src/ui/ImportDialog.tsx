// The import dialog for images (single or bulk) and video. See ASCII_BUDDY_SPEC.md §10.2, §10.3.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Project } from '../types/model';
import { Dialog, Alert } from './Dialog';
import { Button } from './Button';
import { SegmentedControl } from './SegmentedControl';
import { Slider } from './Slider';
import { frameHasContent } from '../state/framesActions';
import {
  countReplacedCels,
  describeImport,
  itemCount,
  runImport,
  type ImportOptions,
  type ImportResult,
  type ImportSource,
} from '../state/importActions';
import { openVideo, type VideoHandle } from '../state/videoImport';
import { defaultStartAt, VIDEO_FRAME_WARNING, type ImportOrder, type ImportSize, type ImportStartAt } from '../engine/importPlan';
import type { ImportRequest } from '../state/importUi';

const PREVIEW_W = 240;

export function ImportDialog({
  project,
  request,
  onClose,
  onDone,
}: {
  project: Project;
  request: ImportRequest;
  onClose: () => void;
  onDone: (result: ImportResult) => void;
}) {
  const isVideo = request.kind === 'video';
  const [order, setOrder] = useState<ImportOrder>('name');
  const [size, setSize] = useState<ImportSize>('fit');
  const [startAt, setStartAt] = useState<ImportStartAt>('after');
  const [targetId, setTargetId] = useState<string>('new'); // 'new' or an existing reference track id
  const [replaced, setReplaced] = useState(0);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // video
  const [handle, setHandle] = useState<VideoHandle | null>(null);
  const [videoStatus, setVideoStatus] = useState<'loading' | 'ready' | 'error'>(isVideo ? 'loading' : 'ready');
  const [trim, setTrim] = useState<[number, number]>([0, 0]);
  const [fps, setFps] = useState(project.fps);
  const [setProjectFps, setSetProjectFps] = useState(false);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const previewSeq = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const referenceTracks = project.tracks.filter((t) => t.kind === 'reference');

  // §10.2 default: Frame 1 for a single empty frame, otherwise after the last frame.
  useEffect(() => {
    let cancelled = false;
    frameHasContent(project, project.frames[0].id).then((has) => {
      if (!cancelled) setStartAt(defaultStartAt(project.frames.length, has));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Open the video once and release it when the dialog goes away.
  useEffect(() => {
    if (request.kind !== 'video') return;
    let cancelled = false;
    let opened: VideoHandle | null = null;
    openVideo(request.file)
      .then((h) => {
        if (cancelled) {
          h.dispose();
          return;
        }
        opened = h;
        setHandle(h);
        setTrim([0, h.duration]);
        setVideoStatus('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        setVideoStatus('error');
        setError(err instanceof Error ? err.message : "This video can't be read.");
      });
    return () => {
      cancelled = true;
      opened?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function drawPreview(time: number) {
    const h = handle;
    const canvas = previewRef.current;
    if (!h || !canvas) return;
    const seq = ++previewSeq.current;
    void h.seek(time).then(() => {
      if (seq !== previewSeq.current || progress) return; // a newer scrub (or the import itself) owns the video now
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.drawImage(h.element, 0, 0, canvas.width, canvas.height);
    }).catch(() => undefined);
  }
  useEffect(() => {
    if (handle) drawPreview(trim[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle]);

  const source: ImportSource | null =
    request.kind === 'images'
      ? { kind: 'images', files: request.files, order }
      : handle
        ? { kind: 'video', handle, start: trim[0], end: trim[1], fps, setProjectFps }
        : null;
  const count = source ? itemCount(source) : 0;
  const options: ImportOptions = { size, startAt, target: targetId === 'new' ? { kind: 'new' } : { kind: 'existing', trackId: targetId } };
  const summary = describeImport(project, count, options);

  // How many existing cels the import would replace (needs confirmation).
  useEffect(() => {
    let cancelled = false;
    void countReplacedCels(project, count, options).then((n) => {
      if (!cancelled) setReplaced(n);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, startAt, targetId, project.frames.length]);

  async function start() {
    if (!source || count === 0) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);
    setProgress({ done: 0, total: count });
    try {
      const result = await runImport(project.id, source, options, {
        onProgress: (done, total) => setProgress({ done, total }),
        signal: controller.signal,
      });
      if (result.cancelled) {
        onClose();
        return;
      }
      onDone(result);
    } catch (err) {
      setProgress(null);
      setError(err instanceof Error ? err.message : 'The import failed.');
    } finally {
      abortRef.current = null;
    }
  }

  function requestClose() {
    if (abortRef.current) abortRef.current.abort(); // Cancel: the running import rolls itself back, then closes
    else onClose();
  }

  const running = progress !== null;
  const durationText = handle ? `${(trim[1] - trim[0]).toFixed(1)} s × ${fps} fps = ${count} frames` : '';
  const trackText = summary.isNewTrack ? `new track “${summary.trackName}”` : `track “${summary.trackName}”`;
  const summaryText = isVideo
    ? `${durationText} → frames ${summary.firstFrame}–${summary.lastFrame} on ${trackText}`
    : `${count} image${count === 1 ? '' : 's'} → frame${count === 1 ? '' : 's'} ${count === 1 ? summary.firstFrame : `${summary.firstFrame}–${summary.lastFrame}`} on ${trackText}`;

  return (
    <>
      <Dialog
        title={isVideo ? 'Import video' : 'Import images'}
        onCancel={requestClose}
        actions={
          running ? (
            <Button onClick={requestClose}>Cancel</Button>
          ) : (
            <>
              <Button onClick={onClose}>Cancel</Button>
              <Button isDefault disabled={!source || count === 0 || videoStatus !== 'ready'} onClick={() => (replaced > 0 ? setConfirmReplace(true) : void start())}>
                Import
              </Button>
            </>
          )
        }
      >
        {running ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span>
              {isVideo ? 'Extracting frames' : 'Importing images'}… {progress!.done} of {progress!.total}
            </span>
            <div class="ab-progress" role="progressbar" aria-valuemin={0} aria-valuemax={progress!.total} aria-valuenow={progress!.done}>
              <div class="ab-progress__bar" style={{ width: `${(100 * progress!.done) / Math.max(1, progress!.total)}%` }} />
            </div>
            <span style={{ fontSize: 11, opacity: 0.7 }}>Cancel stops here and leaves the project exactly as it was.</span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 'calc(100dvh - 220px)', overflowY: 'auto' }}>
            {isVideo ? (
              <div class="ab-field">
                {videoStatus === 'loading' ? <span>Reading video…</span> : null}
                {videoStatus === 'error' ? <span>{error}</span> : null}
                {handle ? (
                  <>
                    <canvas
                      ref={previewRef}
                      width={PREVIEW_W}
                      height={Math.max(1, Math.round((PREVIEW_W * handle.height) / handle.width))}
                      style={{ width: PREVIEW_W, maxWidth: '100%', border: '1px solid var(--ink)', background: '#000' }}
                    />
                    <Slider
                      label="Start"
                      readout={`${trim[0].toFixed(2)} s`}
                      value={trim[0]}
                      min={0}
                      max={handle.duration}
                      step={0.05}
                      onChange={(v) => {
                        const start = Math.min(v, trim[1] - 0.05);
                        setTrim([Math.max(0, start), trim[1]]);
                        drawPreview(Math.max(0, start));
                      }}
                    />
                    <Slider
                      label="End"
                      readout={`${trim[1].toFixed(2)} s of ${handle.duration.toFixed(2)} s`}
                      value={trim[1]}
                      min={0}
                      max={handle.duration}
                      step={0.05}
                      onChange={(v) => {
                        const end = Math.max(v, trim[0] + 0.05);
                        setTrim([trim[0], Math.min(handle.duration, end)]);
                        drawPreview(Math.min(handle.duration, end));
                      }}
                    />
                    <Slider label="Sampling FPS" readout={`${fps} fps`} value={fps} min={1} max={60} onChange={(v) => setFps(Math.round(v))} />
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="checkbox" checked={setProjectFps} onChange={(e) => setSetProjectFps((e.target as HTMLInputElement).checked)} />
                      <span>Set project FPS to match ({project.fps} → {fps})</span>
                    </label>
                  </>
                ) : null}
              </div>
            ) : request.files.length > 1 ? (
              <div class="ab-field">
                <span class="ab-field__label">Order</span>
                <SegmentedControl
                  options={[
                    { value: 'name', label: 'By file name' },
                    { value: 'selected', label: 'As selected' },
                  ]}
                  value={order}
                  onChange={setOrder}
                />
              </div>
            ) : null}

            <div class="ab-field">
              <span class="ab-field__label">Size</span>
              <SegmentedControl
                options={[
                  { value: 'fit', label: 'Fit' },
                  { value: 'fill', label: 'Fill' },
                  { value: 'stretch', label: 'Stretch' },
                  { value: 'original', label: 'Original' },
                ]}
                value={size}
                onChange={setSize}
              />
              <span style={{ fontSize: 10, opacity: 0.7 }}>
                {size === 'fit' ? 'Whole image inside the canvas.' : size === 'fill' ? 'Covers the canvas; the overflow is cropped.' : size === 'stretch' ? 'Distorted to the canvas shape.' : 'Native pixel size, centred (shrunk if larger than the canvas).'}
              </span>
            </div>

            <div class="ab-field">
              <span class="ab-field__label">Start at</span>
              <SegmentedControl
                options={[
                  { value: 'first', label: 'Frame 1' },
                  { value: 'current', label: 'Current frame' },
                  { value: 'after', label: 'After last' },
                ]}
                value={startAt}
                onChange={setStartAt}
              />
            </div>

            <div class="ab-field">
              <span class="ab-field__label">Into</span>
              <select class="ab-input" value={targetId} onChange={(e) => setTargetId((e.target as HTMLSelectElement).value)} style={{ minHeight: 32 }}>
                <option value="new">New reference track</option>
                {referenceTracks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ borderTop: '1px solid var(--ink)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span>{source ? summaryText : ''}</span>
              {summary.newFrames > 0 ? <span style={{ fontSize: 11, opacity: 0.7 }}>{summary.newFrames} new frame{summary.newFrames === 1 ? '' : 's'} will be added.</span> : null}
              {replaced > 0 ? <span style={{ fontSize: 11 }}>⚠ Replaces {replaced} existing cel{replaced === 1 ? '' : 's'} on “{summary.trackName}”.</span> : null}
              {isVideo && count > VIDEO_FRAME_WARNING ? (
                <span style={{ fontSize: 11 }}>⚠ {count} frames is a lot — it uses a lot of memory and storage. Consider a lower sampling FPS or a shorter trim.</span>
              ) : null}
              {error && videoStatus !== 'error' ? <span style={{ fontSize: 11 }}>⚠ {error}</span> : null}
            </div>
          </div>
        )}
      </Dialog>

      {confirmReplace ? (
        <Alert
          message={`Replace ${replaced} existing cel${replaced === 1 ? '' : 's'}?`}
          detail={`The images already on “${summary.trackName}” in those frames will be replaced. You can undo this.`}
          confirmLabel="Replace"
          onCancel={() => setConfirmReplace(false)}
          onConfirm={() => {
            setConfirmReplace(false);
            void start();
          }}
        />
      ) : null}
    </>
  );
}
