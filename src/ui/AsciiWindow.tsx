// The ASCII floating window (§12.3): the main control panel for conversion.
// "Apply to: Project | Track | Cel" chooses which level of the settings cascade
// (§5.7) the controls edit; a dot beside a control marks it as overridden at that
// level (tap it to inherit again) and "Reset to inherited" clears the whole level.
// Columns, character set, ASCII font, crisp glyphs and colors-to-characters are
// project-only, so they're editable only when Apply to is Project.
import { useState } from 'preact/hooks';
import { FloatingWindow } from './FloatingWindow';
import { Slider } from './Slider';
import { SegmentedControl } from './SegmentedControl';
import { ColorCharsDialog } from './ColorCharsDialog';
import type { Project, ConversionSettings } from '../types/model';
import { updateProjectData } from '../state/projects';
import { COLUMN_PRESETS, RAMP_PRESETS, EXTENDED_RAMP_PRESETS, DEFAULT_SHAPE_CHARS, gridReadout } from '../model/defaults';
import { pulseColumnsSliderActive } from '../state/viewSettings';
import {
  asciiApplyTo,
  availableLevels,
  overrideAt,
  effectiveAt,
  patchConversion,
  clearOverrideField,
  resetOverride,
  isEmptyOverride,
  type ApplyTo,
} from '../state/conversionOverrides';

export function AsciiWindow({ project, onClose }: { project: Project; onClose: () => void }) {
  const [showColorChars, setShowColorChars] = useState(false);
  const avail = availableLevels(project);
  // A level that can't be edited right now (e.g. a reference track is selected) falls back to Project.
  let level: ApplyTo = asciiApplyTo.value;
  if ((level === 'track' && !avail.track) || (level === 'cel' && !avail.cel)) level = 'project';

  const track = project.tracks.find((t) => t.id === project.ui.currentTrackId);
  const frameNumber = project.frames.findIndex((f) => f.id === project.ui.currentFrameId) + 1;
  const eff = effectiveAt(project, level);
  const override = overrideAt(project, level);
  const isOverridden = (key: keyof ConversionSettings) => level !== 'project' && !!override && key in override;
  const set = (patch: Partial<ConversionSettings>) => patchConversion(project, level, patch);
  const reset = (key: keyof ConversionSettings) => level !== 'project' && clearOverrideField(project, level, key);
  const projectOnly = level === 'project';

  const rampPresets = { ...RAMP_PRESETS, ...(project.charset === 'extended' ? EXTENDED_RAMP_PRESETS : {}) };
  const activePreset = Object.entries(rampPresets).find(([, v]) => v === eff.ramp)?.[0] ?? null;
  const showRamp = eff.style === 'ramp' || eff.style === 'hybrid';
  const showShape = eff.style === 'shape' || eff.style === 'hybrid';

  const label = (text: string, key: keyof ConversionSettings) => (
    <span class="ab-field__label">
      {text}
      {isOverridden(key) ? (
        <button type="button" class="ab-override-dot" title="Overridden here — tap to inherit again" onClick={() => reset(key)}>
          ●
        </button>
      ) : null}
    </span>
  );

  const scopeHint =
    level === 'project'
      ? 'Default for every track and frame.'
      : level === 'track'
        ? `Overrides for “${track?.name ?? 'this track'}” (every frame).`
        : track?.isStatic
          ? `Overrides for “${track.name}”'s static cel.`
          : `Overrides for “${track?.name ?? 'this track'}”, frame ${frameNumber} only.`;

  return (
    <FloatingWindow id="ascii" title="ASCII" onClose={onClose} defaultPosition={{ x: 260, y: 48 }} width={276}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxHeight: 'calc(100dvh - 150px)', overflowY: 'auto', paddingRight: 2 }}>
        <div class="ab-field">
          <span class="ab-field__label">Apply to</span>
          <div class="ab-segmented">
            {(['project', 'track', 'cel'] as const).map((l) => {
              const enabled = l === 'project' || (l === 'track' ? avail.track : avail.cel);
              return (
                <button
                  key={l}
                  type="button"
                  disabled={!enabled}
                  class={`ab-segmented__option${level === l ? ' ab-segmented__option--selected' : ''}`}
                  onClick={() => (asciiApplyTo.value = l)}
                >
                  {l === 'project' ? 'Project' : l === 'track' ? 'Track' : 'Cel'}
                </button>
              );
            })}
          </div>
          <span style={{ fontSize: 10, opacity: 0.7 }}>{scopeHint}</span>
          {level !== 'project' ? (
            <button
              type="button"
              class="ab-preset-button"
              disabled={isEmptyOverride(override)}
              onClick={() => resetOverride(project, level as 'track' | 'cel')}
            >
              Reset to inherited
            </button>
          ) : null}
        </div>

        <div class="ab-field" style={{ opacity: projectOnly ? 1 : 0.5, pointerEvents: projectOnly ? 'auto' : 'none' }}>
          <span class="ab-field__label">Columns {projectOnly ? '' : '(project-wide)'}</span>
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
          {label('Style', 'style')}
          <SegmentedControl
            options={[
              { value: 'ramp', label: 'Ramp' },
              { value: 'hybrid', label: 'Hybrid' },
              { value: 'shape', label: 'Shape' },
            ]}
            value={eff.style}
            onChange={(style) => set({ style })}
          />
        </div>

        {showRamp ? (
          <div class="ab-field">
            {label('Ramp', 'ramp')}
            <div class="ab-preset-row">
              {Object.keys(rampPresets).map((name) => (
                <button
                  key={name}
                  type="button"
                  class={`ab-preset-button${activePreset === name ? ' ab-preset-button--selected' : ''}`}
                  onClick={() => set({ ramp: rampPresets[name] })}
                >
                  {name}
                </button>
              ))}
            </div>
            <input
              class="ab-input"
              type="text"
              value={eff.ramp}
              placeholder="Custom ramp, light → dense"
              onInput={(e) => {
                const value = (e.target as HTMLInputElement).value;
                if (value.length > 0) set({ ramp: value });
              }}
            />
          </div>
        ) : null}

        {showShape ? (
          <div class="ab-field">
            {label('Shape characters', 'shapeChars')}
            <div class="ab-preset-row">
              <button
                type="button"
                class={`ab-preset-button${eff.shapeChars === DEFAULT_SHAPE_CHARS ? ' ab-preset-button--selected' : ''}`}
                title="The tuned default set"
                onClick={() => set({ shapeChars: DEFAULT_SHAPE_CHARS })}
              >
                Default
              </button>
              <button
                type="button"
                class="ab-preset-button"
                title="Add the heavier glyphs (+ x = o [ ] < > ^ v) back as candidates"
                onClick={() => set({ shapeChars: DEFAULT_SHAPE_CHARS + '+x=o[]<>^v' })}
              >
                + Heavy
              </button>
            </div>
            <input
              class="ab-input"
              type="text"
              value={eff.shapeChars}
              placeholder="Characters to match lines against"
              onInput={(e) => set({ shapeChars: (e.target as HTMLInputElement).value })}
            />
            {project.charset === 'extended' ? <span style={{ fontSize: 10, opacity: 0.7 }}>Extended set: box-drawing and block characters are also candidates.</span> : null}
          </div>
        ) : null}

        <Slider
          label="Threshold"
          readout={eff.threshold.toFixed(2)}
          value={eff.threshold}
          min={0}
          max={0.9}
          step={0.01}
          onChange={(v) => set({ threshold: v })}
          overridden={isOverridden('threshold')}
          onReset={() => reset('threshold')}
        />
        {showRamp ? (
          <Slider
            label="Density"
            readout={eff.density.toFixed(2)}
            value={eff.density}
            min={0.2}
            max={3}
            step={0.01}
            onChange={(v) => set({ density: v })}
            overridden={isOverridden('density')}
            onReset={() => reset('density')}
          />
        ) : null}
        {eff.style === 'hybrid' ? (
          <Slider
            label="Hybrid cutoff"
            readout={eff.hybridCutoff.toFixed(2)}
            value={eff.hybridCutoff}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => set({ hybridCutoff: v })}
            overridden={isOverridden('hybridCutoff')}
            onReset={() => reset('hybridCutoff')}
          />
        ) : null}

        <div class="ab-field" style={{ borderTop: '1px solid var(--ink)', paddingTop: 10, opacity: projectOnly ? 1 : 0.5, pointerEvents: projectOnly ? 'auto' : 'none' }}>
          <span class="ab-field__label">Project-wide {projectOnly ? '' : '— switch Apply to → Project to change'}</span>
          <span class="ab-field__label">Character set</span>
          <SegmentedControl
            options={[
              { value: 'ascii', label: 'ASCII' },
              { value: 'extended', label: 'Extended' },
            ]}
            value={project.charset}
            onChange={(charset) => updateProjectData(project.id, { charset })}
          />
          <span class="ab-field__label">ASCII font</span>
          <SegmentedControl
            options={[
              { value: 'pixel', label: 'Pixel' },
              { value: 'smooth', label: 'Smooth' },
            ]}
            value={project.asciiFont}
            onChange={(asciiFont) => updateProjectData(project.id, { asciiFont })}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={project.crispGlyphs}
              onChange={(e) => updateProjectData(project.id, { crispGlyphs: (e.target as HTMLInputElement).checked })}
            />
            <span>Crisp glyphs (hard 1-bit edges)</span>
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={project.colorChars.enabled}
                onChange={(e) => updateProjectData(project.id, { colorChars: { ...project.colorChars, enabled: (e.target as HTMLInputElement).checked } })}
              />
              <span>Characters by color</span>
            </label>
            <button type="button" class="ab-preset-button" onClick={() => setShowColorChars(true)}>
              Edit…
            </button>
          </div>
        </div>
      </div>
      {showColorChars ? <ColorCharsDialog project={project} onClose={() => setShowColorChars(false)} /> : null}
    </FloatingWindow>
  );
}
