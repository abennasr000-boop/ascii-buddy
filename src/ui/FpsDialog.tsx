// Frame menu → "FPS…". See ASCII_BUDDY_SPEC.md §9.2 (1-60, default 12, presets).
import { useState } from 'preact/hooks';
import type { Project } from '../types/model';
import { Dialog } from './Dialog';
import { Button } from './Button';
import { Slider } from './Slider';
import { updateProjectData } from '../state/projects';

const PRESETS = [6, 8, 12, 15, 24, 30];

export function FpsDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const [fps, setFps] = useState(project.fps);

  function commit(value: number) {
    setFps(value);
    updateProjectData(project.id, { fps: value });
  }

  return (
    <Dialog title="FPS" onCancel={onClose} actions={<Button isDefault onClick={onClose}>Done</Button>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Slider label="Frames per second" readout={`${fps}`} value={fps} min={1} max={60} onChange={commit} />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {PRESETS.map((p) => (
            <button key={p} type="button" class={`ab-preset-button${fps === p ? ' ab-preset-button--selected' : ''}`} onClick={() => commit(p)}>
              {p}
            </button>
          ))}
        </div>
      </div>
    </Dialog>
  );
}
