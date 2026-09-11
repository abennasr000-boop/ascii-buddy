// The ASCII floating window (§12.3). Phase 2 scope only: Columns, a style
// selector (Ramp — Hybrid/Shape shown disabled, Phase 6), Ramp preset +
// custom field, Threshold, Density. The settings cascade ("Apply to"),
// Character set, ASCII font, Crisp glyphs and "Characters by color" are all
// Phase 6 — see DECISIONS.md.
import { FloatingWindow } from './FloatingWindow';
import { Slider } from './Slider';
import type { Project, ConversionSettings } from '../types/model';
import { updateProjectData } from '../state/projects';
import { COLUMN_PRESETS, RAMP_PRESETS, gridReadout } from '../model/defaults';
import { pulseColumnsSliderActive } from '../state/viewSettings';

function patchConversion(project: Project, patch: Partial<ConversionSettings>) {
  updateProjectData(project.id, { conversion: { ...project.conversion, ...patch } });
}

export function AsciiWindow({ project, onClose }: { project: Project; onClose: () => void }) {
  const conversion = project.conversion;
  const activePreset = Object.entries(RAMP_PRESETS).find(([, v]) => v === conversion.ramp)?.[0] ?? null;

  return (
    <FloatingWindow id="ascii" title="ASCII" onClose={onClose} defaultPosition={{ x: 260, y: 48 }} width={260}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div class="ab-field">
          <span class="ab-field__label">Columns</span>
          <div class="ab-preset-row">
            {COLUMN_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                class={`ab-preset-button${project.grid.columns === p.columns ? ' ab-preset-button--selected' : ''}`}
                onClick={() => updateProjectData(project.id, { grid: { columns: p.columns } })}
              >
                {p.label}
              </button>
            ))}
          </div>
          <Slider
            label="Columns"
            readout={gridReadout(project.grid.columns, project.canvas.width, project.canvas.height)}
            value={project.grid.columns}
            min={10}
            max={320}
            onChange={(v) => {
              pulseColumnsSliderActive();
              updateProjectData(project.id, { grid: { columns: Math.round(v) } });
            }}
          />
        </div>

        <div class="ab-field">
          <span class="ab-field__label">Style</span>
          <div class="ab-segmented">
            <button type="button" class="ab-segmented__option ab-segmented__option--selected">
              Ramp
            </button>
            <button type="button" class="ab-segmented__option" disabled title="Hybrid — arrives in Phase 6">
              Hybrid
            </button>
            <button type="button" class="ab-segmented__option" disabled title="Shape — arrives in Phase 6">
              Shape
            </button>
          </div>
        </div>

        <div class="ab-field">
          <span class="ab-field__label">Ramp</span>
          <div class="ab-preset-row">
            {Object.keys(RAMP_PRESETS).map((name) => (
              <button
                key={name}
                type="button"
                class={`ab-preset-button${activePreset === name ? ' ab-preset-button--selected' : ''}`}
                onClick={() => patchConversion(project, { ramp: RAMP_PRESETS[name] })}
              >
                {name}
              </button>
            ))}
          </div>
          <input
            class="ab-input"
            type="text"
            value={conversion.ramp}
            placeholder="Custom ramp, light → dense"
            onInput={(e) => {
              const value = (e.target as HTMLInputElement).value;
              if (value.length > 0) patchConversion(project, { ramp: value });
            }}
          />
        </div>

        <Slider
          label="Threshold"
          readout={conversion.threshold.toFixed(2)}
          value={conversion.threshold}
          min={0}
          max={0.9}
          step={0.01}
          onChange={(v) => patchConversion(project, { threshold: v })}
        />
        <Slider
          label="Density"
          readout={conversion.density.toFixed(2)}
          value={conversion.density}
          min={0.2}
          max={3}
          step={0.01}
          onChange={(v) => patchConversion(project, { density: v })}
        />
      </div>
    </FloatingWindow>
  );
}
