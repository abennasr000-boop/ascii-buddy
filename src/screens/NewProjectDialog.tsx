import { useState } from 'preact/hooks';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Slider } from '../ui/Slider';
import { CANVAS_PRESETS, sizeForPreset, type CanvasPreset } from '../model/canvas';
import { COLUMN_PRESETS, DEFAULT_CANVAS_PRESET, DEFAULT_COLUMNS, gridReadout } from '../model/defaults';
import { rowsFor } from '../types/model';
import type { NewProjectOptions } from '../model/defaults';

const FPS_PRESETS = [6, 8, 12, 15, 24, 30];

export function NewProjectDialog({
  defaultName,
  onCreate,
  onCancel,
}: {
  defaultName: string;
  onCreate: (opts: NewProjectOptions) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(defaultName);
  const [presetId, setPresetId] = useState<string>(DEFAULT_CANVAS_PRESET.id);
  const [customW, setCustomW] = useState(4);
  const [customH, setCustomH] = useState(3);
  const [columns, setColumns] = useState(DEFAULT_COLUMNS);
  const [background, setBackground] = useState('#FFFFFF');
  const [fps, setFps] = useState(12);

  const preset: CanvasPreset =
    presetId === 'custom'
      ? { id: 'custom', label: 'Custom', aspect: [customW, customH] }
      : (CANVAS_PRESETS.find((p) => p.id === presetId) ?? DEFAULT_CANVAS_PRESET);
  const size = sizeForPreset(preset);
  const rows = rowsFor(columns, size.width, size.height);

  const submit = () => {
    if (!name.trim()) return;
    onCreate({ name: name.trim(), canvasPreset: preset, columns, background, fps });
  };

  return (
    <Dialog
      title="New project"
      onCancel={onCancel}
      actions={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button isDefault onClick={submit}>
            Create
          </Button>
        </>
      }
    >
      <div class="ab-field">
        <label class="ab-field__label" for="np-name">
          Name
        </label>
        <input
          id="np-name"
          class="ab-input"
          type="text"
          value={name}
          onInput={(e) => setName((e.target as HTMLInputElement).value)}
        />
      </div>

      <div class="ab-field">
        <span class="ab-field__label">Canvas shape</span>
        <div class="ab-preset-row">
          {CANVAS_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              class={`ab-preset-button${presetId === p.id ? ' ab-preset-button--selected' : ''}`}
              onClick={() => setPresetId(p.id)}
              title={p.label}
            >
              <span
                class="ab-aspect-swatch"
                style={{ aspectRatio: `${p.aspect[0]} / ${p.aspect[1]}` }}
              />
              <span>{p.label}</span>
            </button>
          ))}
          <button
            type="button"
            class={`ab-preset-button${presetId === 'custom' ? ' ab-preset-button--selected' : ''}`}
            onClick={() => setPresetId('custom')}
          >
            <span class="ab-aspect-swatch" style={{ aspectRatio: `${customW} / ${customH}` }} />
            <span>Custom</span>
          </button>
        </div>
        {presetId === 'custom' ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              class="ab-input"
              type="number"
              min={1}
              max={99}
              value={customW}
              style={{ width: 70 }}
              onInput={(e) => setCustomW(Math.max(1, Number((e.target as HTMLInputElement).value) || 1))}
            />
            <span>:</span>
            <input
              class="ab-input"
              type="number"
              min={1}
              max={99}
              value={customH}
              style={{ width: 70 }}
              onInput={(e) => setCustomH(Math.max(1, Number((e.target as HTMLInputElement).value) || 1))}
            />
          </div>
        ) : null}
        <span style={{ opacity: 0.7 }}>
          {size.width} × {size.height} px
        </span>
      </div>

      <div class="ab-field">
        <span class="ab-field__label">Resolution</span>
        <div class="ab-preset-row">
          {COLUMN_PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              class={`ab-preset-button${columns === p.columns ? ' ab-preset-button--selected' : ''}`}
              onClick={() => setColumns(p.columns)}
            >
              <span>{p.label}</span>
            </button>
          ))}
        </div>
        <Slider
          label="Columns"
          readout={gridReadout(columns, size.width, size.height)}
          value={columns}
          min={10}
          max={320}
          onChange={setColumns}
        />
        <span style={{ opacity: 0.7 }}>
          {columns} × {rows} characters
        </span>
      </div>

      <div style={{ display: 'flex', gap: 16 }}>
        <div class="ab-field" style={{ flex: 1 }}>
          <label class="ab-field__label" for="np-bg">
            Background
          </label>
          <input
            id="np-bg"
            type="color"
            value={background}
            onInput={(e) => setBackground((e.target as HTMLInputElement).value)}
            style={{ width: '100%', height: 44 }}
          />
        </div>
        <div class="ab-field" style={{ flex: 1 }}>
          <label class="ab-field__label" for="np-fps">
            FPS
          </label>
          <select
            id="np-fps"
            class="ab-input"
            value={fps}
            onChange={(e) => setFps(Number((e.target as HTMLSelectElement).value))}
          >
            {FPS_PRESETS.map((f) => (
              <option value={f} key={f}>
                {f}
              </option>
            ))}
          </select>
        </div>
      </div>
    </Dialog>
  );
}
