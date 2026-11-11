// File → "Project settings…" (§13.3): General (name, background, FPS, playback mode), Canvas (read-only
// size, columns, pixels per grid cell), ASCII (opens the ASCII window) and Onion skin.
import { useState } from 'preact/hooks';
import type { Project } from '../types/model';
import { rowsFor } from '../types/model';
import { Dialog } from './Dialog';
import { Button } from './Button';
import { SegmentedControl } from './SegmentedControl';
import { Slider } from './Slider';
import { updateProjectData } from '../state/projects';
import { updateOnionSettings } from '../state/onion';
import { gridReadout } from '../model/defaults';

type Tab = 'general' | 'canvas' | 'ascii' | 'onion';

export function ProjectSettingsDialog({
  project,
  onClose,
  onOpenAscii,
  onOpenOnion,
}: {
  project: Project;
  onClose: () => void;
  onOpenAscii: () => void;
  onOpenOnion: () => void;
}) {
  const [tab, setTab] = useState<Tab>('general');
  const [name, setName] = useState(project.name);
  const { width, height } = project.canvas;
  const rows = rowsFor(project.grid.columns, width, height);

  return (
    <Dialog title="Project settings" onCancel={onClose} actions={<Button isDefault onClick={onClose}>Done</Button>}>
      <SegmentedControl
        options={[
          { value: 'general', label: 'General' },
          { value: 'canvas', label: 'Canvas' },
          { value: 'ascii', label: 'ASCII' },
          { value: 'onion', label: 'Onion' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'general' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div class="ab-field">
            <span class="ab-field__label">Name</span>
            <input
              class="ab-input"
              type="text"
              value={name}
              onInput={(e) => setName((e.target as HTMLInputElement).value)}
              onBlur={() => {
                const trimmed = name.trim();
                if (trimmed && trimmed !== project.name) updateProjectData(project.id, { name: trimmed });
                else setName(project.name);
              }}
            />
          </div>
          <div class="ab-field">
            <span class="ab-field__label">Background (paper)</span>
            <input
              class="ab-input"
              type="color"
              value={project.background}
              style={{ padding: 2 }}
              onInput={(e) => updateProjectData(project.id, { background: (e.target as HTMLInputElement).value.toUpperCase() })}
            />
          </div>
          <Slider label="Frames per second" readout={`${project.fps}`} value={project.fps} min={1} max={60} onChange={(v) => updateProjectData(project.id, { fps: Math.round(v) })} />
          <div class="ab-field">
            <span class="ab-field__label">Playback mode</span>
            <SegmentedControl
              options={[
                { value: 'loop', label: 'Loop' },
                { value: 'pingpong', label: 'Ping-pong' },
                { value: 'once', label: 'Once' },
              ]}
              value={project.playbackMode}
              onChange={(playbackMode) => updateProjectData(project.id, { playbackMode })}
            />
          </div>
        </div>
      ) : null}

      {tab === 'canvas' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div class="ab-field">
            <span class="ab-field__label">Canvas</span>
            <span>
              {project.canvas.aspect[0]}:{project.canvas.aspect[1]} · {width} × {height} px
            </span>
            <span style={{ fontSize: 10, opacity: 0.7 }}>The canvas size is fixed when a project is made.</span>
          </div>
          <Slider
            label="Columns"
            readout={gridReadout(project.grid.columns, width, height)}
            value={project.grid.columns}
            min={10}
            max={320}
            onChange={(v) => updateProjectData(project.id, { grid: { columns: Math.round(v) } })}
          />
          <span style={{ fontSize: 11, opacity: 0.8 }}>
            Each character covers {(width / project.grid.columns).toFixed(1)} × {(height / rows).toFixed(1)} pixels.
          </span>
        </div>
      ) : null}

      {tab === 'ascii' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span>Style, characters, threshold, density, font and colors-to-characters live in the ASCII window.</span>
          <div>
            <Button
              onClick={() => {
                onClose();
                onOpenAscii();
              }}
            >
              Open the ASCII window
            </Button>
          </div>
        </div>
      ) : null}

      {tab === 'onion' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={project.onion.enabled} onChange={(e) => updateOnionSettings(project, { enabled: (e.target as HTMLInputElement).checked })} />
            <span>Onion skin on</span>
          </label>
          <div>
            <Button
              onClick={() => {
                onClose();
                onOpenOnion();
              }}
            >
              Onion skin settings…
            </Button>
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}
