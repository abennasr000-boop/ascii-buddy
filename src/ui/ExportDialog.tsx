// The export dialog (§15.1): pick a format and options, render, then share or download the result.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import type { Project } from '../types/model';
import { Dialog } from './Dialog';
import { Button } from './Button';
import { SegmentedControl } from './SegmentedControl';
import { DeliverPanel } from './DeliverPanel';
import { flush } from '../state/autosave';
import { GIF_MAX_FPS, outputSize, selectFrameIndices, sizeProblem } from '../engine/exportPlan';
import { defaultExportOptions, effectiveOptions, formatInfo, FORMATS, type ExportFormat, type ExportOptions } from '../export/options';
import { ExportCancelled, ExportProblem, type ExportOutput } from '../export/context';
import { runExport } from '../export/exporters';

/** The choices carry over from one export to the next within a session. */
const remembered = signal<ExportOptions | null>(null);

type Phase = { name: 'options' } | { name: 'running'; done: number; total: number } | { name: 'done'; output: ExportOutput } | { name: 'error'; message: string };

export function ExportDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const frameCount = project.frames.length;
  const currentIndex = Math.max(0, project.frames.findIndex((f) => f.id === project.ui.currentFrameId));
  const [options, setOptionsState] = useState<ExportOptions>(() => {
    const base = remembered.value ?? defaultExportOptions('gif', frameCount);
    return { ...base, from: Math.min(base.from, frameCount), to: Math.min(Math.max(base.to, 1), frameCount) };
  });
  const [customWidth, setCustomWidth] = useState(project.canvas.width);
  const [phase, setPhase] = useState<Phase>({ name: 'options' });
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const setOptions = (patch: Partial<ExportOptions>) => {
    const next = { ...options, ...patch };
    setOptionsState(next);
    remembered.value = next;
  };
  const chooseFormat = (format: ExportFormat) => setOptions({ format });

  const opts = effectiveOptions(options);
  const info = formatInfo(opts.format);
  const indices = useMemo(
    () => selectFrameIndices(frameCount, opts.frames, currentIndex, opts.from, opts.to),
    [frameCount, currentIndex, opts.frames, opts.from, opts.to],
  );
  const size = outputSize(project.canvas.width, project.canvas.height, opts.size, opts.format === 'mp4');
  const problem = info.sizeChoice ? sizeProblem(size) : null;
  const running = phase.name === 'running';

  useEffect(() => () => abortRef.current?.abort(), []);

  async function start() {
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase({ name: 'running', done: 0, total: indices.length });
    try {
      await flush(); // include the very latest strokes
      const output = await runExport(project, options, {
        signal: controller.signal,
        onProgress: (done, total) => setPhase({ name: 'running', done, total }),
      });
      setPhase({ name: 'done', output });
    } catch (err) {
      if (err instanceof ExportCancelled) setPhase({ name: 'options' });
      else if (err instanceof ExportProblem) setPhase({ name: 'error', message: err.message });
      else setPhase({ name: 'error', message: `The export failed${err instanceof Error && err.message ? `: ${err.message}` : '.'} Try a smaller size or fewer frames.` });
    }
  }

  const cancelOrClose = () => {
    if (running) abortRef.current?.abort();
    else onClose();
  };

  const isText = opts.format === 'copy';
  const warnings: string[] = [];
  if (opts.format === 'gif' && project.fps > GIF_MAX_FPS) warnings.push(`GIF can't show frames faster than ${GIF_MAX_FPS} per second, so this will play slower than ${project.fps} fps. MP4 keeps the speed.`);
  if (opts.format === 'gif' && indices.length * size.width * size.height > 400_000_000) warnings.push('This is a large GIF and may take a while and use a lot of memory.');
  if (opts.format === 'mp4' && (size.width !== outputSize(project.canvas.width, project.canvas.height, opts.size).width || size.height !== outputSize(project.canvas.width, project.canvas.height, opts.size).height)) {
    warnings.push(`Video needs even dimensions, so the size is ${size.width} × ${size.height}.`);
  }

  return (
    <Dialog
      title="Export"
      onCancel={cancelOrClose}
      actions={
        phase.name === 'options' ? (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button isDefault disabled={!!problem || indices.length === 0} onClick={() => void start()}>
              {isText ? 'Copy…' : 'Export'}
            </Button>
          </>
        ) : running ? (
          <Button onClick={cancelOrClose}>Cancel</Button>
        ) : phase.name === 'error' ? (
          <>
            <Button onClick={onClose}>Close</Button>
            <Button isDefault onClick={() => setPhase({ name: 'options' })}>
              Back
            </Button>
          </>
        ) : (
          <>
            <Button onClick={() => setPhase({ name: 'options' })}>Back</Button>
            <Button isDefault onClick={onClose}>
              Done
            </Button>
          </>
        )
      }
    >
      {phase.name === 'running' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span>
            Exporting… {phase.done} of {phase.total}
          </span>
          <div class="ab-progress" role="progressbar" aria-valuemin={0} aria-valuemax={phase.total} aria-valuenow={phase.done}>
            <div class="ab-progress__bar" style={{ width: `${(100 * phase.done) / Math.max(1, phase.total)}%` }} />
          </div>
          {opts.format === 'mp4' ? <span style={{ fontSize: 10, opacity: 0.7 }}>Cancel stops here; nothing is saved.</span> : null}
        </div>
      ) : phase.name === 'error' ? (
        <p style={{ margin: 0 }}>⚠ {phase.message}</p>
      ) : phase.name === 'done' ? (
        phase.output.kind === 'text' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <pre style={{ margin: 0, maxHeight: 200, overflow: 'auto', border: '1px solid var(--ink)', padding: 6, fontSize: 9, lineHeight: 1 }}>{phase.output.text}</pre>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <Button
                isDefault
                onClick={() => {
                  navigator.clipboard
                    .writeText((phase.output as { text: string }).text)
                    .then(() => setCopied(true))
                    .catch(() => setCopied(false));
                }}
              >
                Copy
              </Button>
              <span style={{ fontSize: 11 }}>{copied ? 'Copied to the clipboard.' : ''}</span>
            </div>
          </div>
        ) : (
          <DeliverPanel blob={phase.output.blob} filename={phase.output.filename} />
        )
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 'calc(100dvh - 220px)', overflowY: 'auto' }}>
          <div class="ab-field">
            <span class="ab-field__label">Format</span>
            <select class="ab-input" value={options.format} style={{ minHeight: 36 }} onChange={(e) => chooseFormat((e.target as HTMLSelectElement).value as ExportFormat)}>
              {FORMATS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
            <span style={{ fontSize: 10, opacity: 0.7 }}>{info.hint}</span>
          </div>

          {info.contentChoice ? (
            <div class="ab-field">
              <span class="ab-field__label">Content</span>
              <SegmentedControl
                options={[
                  { value: 'ascii', label: 'ASCII view' },
                  { value: 'raster', label: 'Raster view' },
                ]}
                value={options.content}
                onChange={(content) => setOptions({ content })}
              />
            </div>
          ) : null}

          {info.frameChoice ? (
            <div class="ab-field">
              <span class="ab-field__label">Frames</span>
              <SegmentedControl
                options={[
                  { value: 'all', label: 'All frames' },
                  { value: 'current', label: 'Current' },
                  { value: 'range', label: 'Range' },
                ]}
                value={options.frames}
                onChange={(frames) => setOptions({ frames })}
              />
              {options.frames === 'range' ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span>From</span>
                  <NumberField value={options.from} min={1} max={frameCount} onChange={(from) => setOptions({ from })} />
                  <span>to</span>
                  <NumberField value={options.to} min={1} max={frameCount} onChange={(to) => setOptions({ to })} />
                  <span style={{ opacity: 0.7 }}>of {frameCount}</span>
                </div>
              ) : null}
            </div>
          ) : null}

          {info.sizeChoice ? (
            <div class="ab-field">
              <span class="ab-field__label">Size</span>
              <SegmentedControl
                options={[
                  { value: '1', label: '1×' },
                  { value: '2', label: '2×' },
                  { value: '4', label: '4×' },
                  { value: 'custom', label: 'Custom' },
                ]}
                value={options.size.kind === 'scale' ? String(options.size.scale) : 'custom'}
                onChange={(v) => setOptions({ size: v === 'custom' ? { kind: 'width', width: customWidth } : { kind: 'scale', scale: Number(v) } })}
              />
              {options.size.kind === 'width' ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span>Width</span>
                  <NumberField
                    value={customWidth}
                    min={16}
                    max={16384}
                    onChange={(w) => {
                      setCustomWidth(w);
                      setOptions({ size: { kind: 'width', width: w } });
                    }}
                  />
                  <span>px</span>
                </div>
              ) : null}
              <span style={{ fontSize: 11 }}>
                {size.width} × {size.height} px
              </span>
              {problem ? <span style={{ fontSize: 11 }}>⚠ {problem}</span> : null}
            </div>
          ) : null}

          {info.transparency ? (
            <div class="ab-field">
              <span class="ab-field__label">Background</span>
              <SegmentedControl
                options={[
                  { value: 'color', label: 'Project color' },
                  { value: 'transparent', label: 'Transparent' },
                ]}
                value={options.transparent ? 'transparent' : 'color'}
                onChange={(v) => setOptions({ transparent: v === 'transparent' })}
              />
            </div>
          ) : null}

          {opts.format === 'png-seq' ? (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={options.repeatHeldFrames} onChange={(e) => setOptions({ repeatHeldFrames: (e.target as HTMLInputElement).checked })} />
              <span>Repeat held frames as duplicate files</span>
            </label>
          ) : null}

          {opts.format === 'gif' ? (
            <div class="ab-field">
              <span class="ab-field__label">Loop</span>
              <SegmentedControl
                options={[
                  { value: 'forever', label: 'Forever' },
                  { value: 'once', label: 'Once' },
                ]}
                value={options.gifLoop}
                onChange={(gifLoop) => setOptions({ gifLoop })}
              />
            </div>
          ) : null}

          {opts.format === 'mp4' ? (
            <>
              <div class="ab-field">
                <span class="ab-field__label">Quality</span>
                <SegmentedControl
                  options={[
                    { value: 'standard', label: 'Standard' },
                    { value: 'high', label: 'High' },
                  ]}
                  value={options.mp4Quality}
                  onChange={(mp4Quality) => setOptions({ mp4Quality })}
                />
              </div>
              <div class="ab-field">
                <span class="ab-field__label">Repeat animation</span>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <NumberField value={options.mp4Repeat} min={1} max={99} onChange={(mp4Repeat) => setOptions({ mp4Repeat })} />
                  <span>time{options.mp4Repeat === 1 ? '' : 's'} (MP4 doesn't loop by itself)</span>
                </div>
              </div>
            </>
          ) : null}

          {opts.format === 'pdf' ? (
            <>
              <div class="ab-field">
                <span class="ab-field__label">Layout</span>
                <SegmentedControl
                  options={[
                    { value: 'pages', label: 'One per page' },
                    { value: 'contact', label: 'Contact sheet' },
                  ]}
                  value={options.pdfLayout}
                  onChange={(pdfLayout) => setOptions({ pdfLayout })}
                />
              </div>
              <div class="ab-field">
                <span class="ab-field__label">Page</span>
                <SegmentedControl
                  options={[
                    { value: 'a4', label: 'A4' },
                    { value: 'letter', label: 'Letter' },
                    ...(options.pdfLayout === 'pages' ? [{ value: 'fit' as const, label: 'Fit artwork' }] : []),
                  ]}
                  value={options.pdfLayout === 'contact' && options.pdfPage === 'fit' ? 'a4' : options.pdfPage}
                  onChange={(pdfPage) => setOptions({ pdfPage })}
                />
              </div>
              {options.pdfLayout === 'contact' || options.pdfPage !== 'fit' ? (
                <div class="ab-field">
                  <span class="ab-field__label">Orientation</span>
                  <SegmentedControl
                    options={[
                      { value: 'auto', label: 'Automatic' },
                      { value: 'portrait', label: 'Portrait' },
                      { value: 'landscape', label: 'Landscape' },
                    ]}
                    value={options.pdfOrientation}
                    onChange={(pdfOrientation) => setOptions({ pdfOrientation })}
                  />
                </div>
              ) : null}
            </>
          ) : null}

          {opts.format === 'txt' ? (
            <>
              <div class="ab-field">
                <span class="ab-field__label">Between frames</span>
                <SegmentedControl
                  options={[
                    { value: 'marker', label: '--- frame N ---' },
                    { value: 'formfeed', label: 'Form feed' },
                  ]}
                  value={options.txtSeparator}
                  onChange={(txtSeparator) => setOptions({ txtSeparator })}
                />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={options.txtTrim} onChange={(e) => setOptions({ txtTrim: (e.target as HTMLInputElement).checked })} />
                <span>Trim trailing spaces</span>
              </label>
            </>
          ) : null}

          {opts.format === 'ansi' ? (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={options.ansiBackground} onChange={(e) => setOptions({ ansiBackground: (e.target as HTMLInputElement).checked })} />
              <span>Paint the project's background color</span>
            </label>
          ) : null}

          {opts.format === 'sprite' ? (
            <>
              <div class="ab-field">
                <span class="ab-field__label">Columns</span>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <NumberField value={options.spriteColumns} min={0} max={100} onChange={(spriteColumns) => setOptions({ spriteColumns })} />
                  <span style={{ opacity: 0.7 }}>0 = automatic</span>
                </div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={options.spriteJson} onChange={(e) => setOptions({ spriteJson: (e.target as HTMLInputElement).checked })} />
                <span>Also write a JSON file with each frame's rectangle and duration (delivered as a .zip)</span>
              </label>
            </>
          ) : null}

          <div style={{ borderTop: '1px solid var(--ink)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span>
              {indices.length} frame{indices.length === 1 ? '' : 's'}
              {info.sizeChoice ? ` · ${size.width} × ${size.height} px` : ''}
            </span>
            {info.frameChoice && info.animated && indices.length > 1 && opts.format !== 'txt' && opts.format !== 'ansi' && opts.format !== 'pdf' && opts.format !== 'sprite' && opts.format !== 'png-seq' ? (
              <span style={{ fontSize: 11, opacity: 0.7 }}>Held frames keep their timing.</span>
            ) : null}
            {warnings.map((w) => (
              <span key={w} style={{ fontSize: 11 }}>
                ⚠ {w}
              </span>
            ))}
          </div>
        </div>
      )}
    </Dialog>
  );
}

function NumberField({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <input
      class="ab-input"
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={value}
      style={{ width: 84, minHeight: 36 }}
      onInput={(e) => {
        const n = Number((e.target as HTMLInputElement).value);
        if (Number.isFinite(n)) onChange(Math.max(min, Math.min(max, Math.round(n))));
      }}
    />
  );
}
