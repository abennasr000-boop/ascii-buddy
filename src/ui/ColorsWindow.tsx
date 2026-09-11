// The Colors floating window: current color, palette grid, recent colors,
// picker, and the paper (background) swatch. See ASCII_BUDDY_SPEC.md §7.2, §7.3.
import { useState } from 'preact/hooks';
import type { Project } from '../types/model';
import { FloatingWindow } from './FloatingWindow';
import { ColorPicker } from './ColorPicker';
import { currentColor, recentColors, useColor } from '../state/tools';
import { updateProjectData } from '../state/projects';

type Target = 'ink' | 'paper';

export function ColorsWindow({
  project,
  onClose,
  initialTarget = 'ink',
}: {
  project: Project;
  onClose: () => void;
  initialTarget?: Target;
}) {
  const [editing, setEditing] = useState<Target>(initialTarget);
  const value = editing === 'ink' ? currentColor.value : project.background;

  const setValue = (hex: string) => {
    if (editing === 'ink') useColor(hex);
    else updateProjectData(project.id, { background: hex });
  };

  const addToPalette = () => {
    const swatches = project.palette.swatches;
    if (swatches.some((s) => s.toUpperCase() === value.toUpperCase())) return;
    updateProjectData(project.id, { palette: { ...project.palette, swatches: [...swatches, value] } });
  };

  return (
    <FloatingWindow id="colors" title="Colors" onClose={onClose} defaultPosition={{ x: 24, y: 48 }} width={220}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            title="Ink (drawing color)"
            onClick={() => setEditing('ink')}
            style={{
              width: 48,
              height: 48,
              background: currentColor.value,
              border: `2px solid var(--ink)`,
              outline: editing === 'ink' ? '2px solid var(--ink)' : 'none',
              outlineOffset: 2,
              borderRadius: 4,
              cursor: 'pointer',
            }}
          />
          <button
            type="button"
            title="Paper (background color)"
            onClick={() => setEditing('paper')}
            style={{
              width: 48,
              height: 48,
              background: project.background,
              border: '2px solid var(--ink)',
              outline: editing === 'paper' ? '2px solid var(--ink)' : 'none',
              outlineOffset: 2,
              borderRadius: 4,
              cursor: 'pointer',
            }}
          />
          <span style={{ alignSelf: 'center', fontSize: 10, opacity: 0.7 }}>
            Editing: {editing === 'ink' ? 'Ink' : 'Paper'}
          </span>
        </div>

        <div class="ab-field">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span class="ab-field__label">Palette</span>
            <button type="button" class="ab-icon-button" title="Add current color to palette" onClick={addToPalette} style={{ minWidth: 28, minHeight: 28 }}>
              +
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 4 }}>
            {project.palette.swatches.map((hex, i) => (
              <button
                key={`${hex}-${i}`}
                type="button"
                onClick={() => setValue(hex)}
                title={hex}
                style={{ aspectRatio: '1', background: hex, border: '1px solid var(--ink)', padding: 0, cursor: 'pointer' }}
              />
            ))}
          </div>
        </div>

        {recentColors.value.length > 0 ? (
          <div class="ab-field">
            <span class="ab-field__label">Recent</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 4 }}>
              {recentColors.value.map((hex, i) => (
                <button
                  key={`${hex}-${i}`}
                  type="button"
                  onClick={() => setValue(hex)}
                  title={hex}
                  style={{ aspectRatio: '1', background: hex, border: '1px solid var(--ink)', padding: 0, cursor: 'pointer' }}
                />
              ))}
            </div>
          </div>
        ) : null}

        <ColorPicker value={value} onChange={setValue} />
      </div>
    </FloatingWindow>
  );
}
