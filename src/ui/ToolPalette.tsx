// Vertical tool palette. See ASCII_BUDDY_SPEC.md §12.2. Select doubles as the
// reference-track transform tool (§6.3): on a reference track it transforms
// the image; on an unlocked drawing track it's the rectangle/lasso selection.
// Pen/Eraser/Fill are disabled on a reference or locked track since there's
// nothing paintable there; the Eyedropper only reads, so it works anywhere.
import { IconButton } from './Button';
import { Icon, type IconName } from './icons';
import { appSettings } from '../state/appSettings';
import { currentTool, activeSize, setActiveSize, SIZE_PRESETS, SIZE_MIN, SIZE_MAX, fillBoundary, selectMode } from '../state/tools';
import type { ToolName } from '../state/tools';
import type { Track } from '../types/model';

const TOOLS: { name: ToolName; icon: IconName; label: string }[] = [
  { name: 'pen', icon: 'pen', label: 'Pen (B)' },
  { name: 'eraser', icon: 'eraser', label: 'Eraser (E)' },
  { name: 'fill', icon: 'fill', label: 'Fill (G)' },
  { name: 'eyedropper', icon: 'eyedropper', label: 'Eyedropper (I)' },
  { name: 'select', icon: 'select', label: 'Select (M)' },
];

export function isToolEnabled(name: ToolName, currentTrack: Track | undefined): boolean {
  if (!currentTrack) return false;
  if (name === 'eyedropper') return true;
  if (name === 'select') return currentTrack.kind === 'reference' || !currentTrack.locked;
  return currentTrack.kind === 'drawing' && !currentTrack.locked;
}

export function ToolPalette({
  onOpenColors,
  onOpenPaper,
  currentColorHex,
  paperHex,
  currentTrack,
}: {
  onOpenColors: () => void;
  onOpenPaper: () => void;
  currentColorHex: string;
  paperHex: string;
  currentTrack: Track | undefined;
}) {
  return (
    <div class={`ab-tool-palette${appSettings.value.leftHanded ? ' ab-tool-palette--right' : ''}`}>
      {TOOLS.map((t) => {
        const enabled = isToolEnabled(t.name, currentTrack);
        return (
          <IconButton
            key={t.name}
            title={t.label}
            disabled={!enabled}
            pressed={currentTool.value === t.name}
            onClick={() => enabled && (currentTool.value = t.name)}
          >
            <Icon name={t.icon} size={32} />
          </IconButton>
        );
      })}

      {currentTool.value === 'fill' ? (
        <div class="ab-tool-palette__options" title="Fill boundaries from">
          <span style={{ fontSize: 9, opacity: 0.7 }}>Edges</span>
          <button
            type="button"
            class={`ab-preset-button${fillBoundary.value === 'all' ? ' ab-preset-button--selected' : ''}`}
            title="Boundaries from all visible drawing tracks"
            onClick={() => (fillBoundary.value = 'all')}
          >
            All
          </button>
          <button
            type="button"
            class={`ab-preset-button${fillBoundary.value === 'current' ? ' ab-preset-button--selected' : ''}`}
            title="Boundaries from the current track only"
            onClick={() => (fillBoundary.value = 'current')}
          >
            Track
          </button>
        </div>
      ) : null}
      {currentTool.value === 'select' && currentTrack?.kind === 'drawing' ? (
        <div class="ab-tool-palette__options" title="Selection shape">
          <button
            type="button"
            class={`ab-preset-button${selectMode.value === 'rect' ? ' ab-preset-button--selected' : ''}`}
            title="Rectangle selection"
            onClick={() => (selectMode.value = 'rect')}
          >
            Rect
          </button>
          <button
            type="button"
            class={`ab-preset-button${selectMode.value === 'lasso' ? ' ab-preset-button--selected' : ''}`}
            title="Lasso (freehand) selection"
            onClick={() => (selectMode.value = 'lasso')}
          >
            Lasso
          </button>
        </div>
      ) : null}

      <div class="ab-tool-palette__separator" />

      <div class="ab-tool-palette__swatches">
        <button
          type="button"
          class="ab-tool-palette__swatch ab-tool-palette__swatch--ink"
          style={{ background: currentColorHex }}
          title="Current color — opens Colors window"
          onClick={onOpenColors}
        />
        <button
          type="button"
          class="ab-tool-palette__swatch ab-tool-palette__swatch--paper"
          style={{ background: paperHex }}
          title="Paper (background) — opens Colors window"
          onClick={onOpenPaper}
        />
      </div>

      <div class="ab-tool-palette__separator" />

      <div class="ab-tool-palette__size">
        <span style={{ fontSize: 10, opacity: 0.7 }}>{activeSize()}px</span>
        <input
          class="ab-slider"
          type="range"
          min={SIZE_MIN}
          max={SIZE_MAX}
          value={activeSize()}
          style={{ width: 44 }}
          onInput={(e) => setActiveSize(Number((e.target as HTMLInputElement).value))}
        />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, justifyContent: 'center', width: 44 }}>
          {SIZE_PRESETS.map((s) => (
            <button
              key={s}
              type="button"
              class={`ab-preset-button${activeSize() === s ? ' ab-preset-button--selected' : ''}`}
              style={{ minHeight: 0, padding: '2px 4px', fontSize: 9 }}
              onClick={() => setActiveSize(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
