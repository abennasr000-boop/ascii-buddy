// Onion skin settings popover, opened from the onion toggle. See
// ASCII_BUDDY_SPEC.md §9.3.
import type { Project } from '../types/model';
import { FloatingWindow } from './FloatingWindow';
import { Slider } from './Slider';
import { SegmentedControl } from './SegmentedControl';
import { updateOnionSettings } from '../state/onion';

export function OnionSettingsWindow({ project, onClose }: { project: Project; onClose: () => void }) {
  const onion = project.onion;

  function patch(next: Partial<Project['onion']>) {
    updateOnionSettings(project, next);
  }

  return (
    <FloatingWindow id="onion-settings" title="Onion skin" onClose={onClose} defaultPosition={{ x: 300, y: 56 }} width={240}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Slider label="Frames before" readout={`${onion.before}`} value={onion.before} min={0} max={5} onChange={(v) => patch({ before: v })} />
        <Slider label="Frames after" readout={`${onion.after}`} value={onion.after} min={0} max={5} onChange={(v) => patch({ after: v })} />

        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
            Before
            <input type="color" value={onion.colorBefore} onInput={(e) => patch({ colorBefore: (e.target as HTMLInputElement).value })} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
            After
            <input type="color" value={onion.colorAfter} onInput={(e) => patch({ colorAfter: (e.target as HTMLInputElement).value })} />
          </label>
        </div>

        <Slider
          label="Opacity"
          readout={`${Math.round(onion.opacity * 100)}%`}
          value={onion.opacity}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => patch({ opacity: v })}
        />
        <Slider
          label="Falloff per frame"
          readout={`×${onion.falloff.toFixed(2)}`}
          value={onion.falloff}
          min={0.1}
          max={1}
          step={0.05}
          onChange={(v) => patch({ falloff: v })}
        />

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
          <input type="checkbox" checked={onion.wrap} onChange={(e) => patch({ wrap: (e.target as HTMLInputElement).checked })} />
          Wrap around the loop
        </label>

        <div>
          <div style={{ fontSize: 11, marginBottom: 4 }}>Tracks</div>
          <SegmentedControl
            options={[
              { value: 'all', label: 'All visible' },
              { value: 'current', label: 'Current only' },
            ]}
            value={onion.scope}
            onChange={(v) => patch({ scope: v })}
          />
        </div>
      </div>
    </FloatingWindow>
  );
}
