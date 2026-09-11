// Vertical tool palette. See ASCII_BUDDY_SPEC.md §12.2. Fill/Eyedropper/Select
// are shown as disabled chrome (Phase 5) so the final layout doesn't reflow later.
import { IconButton } from './Button';
import { Icon, type IconName } from './icons';
import { currentTool, activeSize, setActiveSize, SIZE_PRESETS, SIZE_MIN, SIZE_MAX } from '../state/tools';
import type { ToolName } from '../state/tools';

const TOOLS: { name: ToolName; icon: IconName; label: string; enabled: boolean }[] = [
  { name: 'pen', icon: 'pen', label: 'Pen (B)', enabled: true },
  { name: 'eraser', icon: 'eraser', label: 'Eraser (E)', enabled: true },
  { name: 'fill', icon: 'fill', label: 'Fill — arrives in Phase 5', enabled: false },
  { name: 'eyedropper', icon: 'eyedropper', label: 'Eyedropper — arrives in Phase 5', enabled: false },
  { name: 'select', icon: 'select', label: 'Select — arrives in Phase 5', enabled: false },
];

export function ToolPalette({
  onOpenColors,
  onOpenPaper,
  currentColorHex,
  paperHex,
}: {
  onOpenColors: () => void;
  onOpenPaper: () => void;
  currentColorHex: string;
  paperHex: string;
}) {
  return (
    <div class="ab-tool-palette">
      {TOOLS.map((t) => (
        <IconButton
          key={t.name}
          title={t.label}
          disabled={!t.enabled}
          pressed={currentTool.value === t.name}
          onClick={() => t.enabled && (currentTool.value = t.name)}
        >
          <Icon name={t.icon} size={28} />
        </IconButton>
      ))}

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
