// The Colors floating window: current color, palette grid, recent colors,
// picker, and the paper (background) swatch. See ASCII_BUDDY_SPEC.md §7.2, §7.3.
// Palette swatches: tap = use, long-press = menu (Replace color…, Remove),
// drag = reorder. The palette here is the project's own copy; the library
// (Manage…) is the global one.
import { useRef, useState } from 'preact/hooks';
import type { Project } from '../types/model';
import { FloatingWindow } from './FloatingWindow';
import { ColorPicker } from './ColorPicker';
import { PaletteManager } from './PaletteManager';
import { PromptDialog } from './PromptDialog';
import { currentColor, recentColors, useColor } from '../state/tools';
import { updateProjectData } from '../state/projects';
import { setProjectPalette } from '../state/colorOps';
import { savePaletteToLibrary, paletteLibrary } from '../state/paletteLibrary';
import { replaceColorRequest, removeUnusedRequested } from '../state/uiFlags';
import { safeSetPointerCapture } from './pointerCapture';

type Target = 'ink' | 'paper';

const LONG_PRESS_MS = 450;
const DRAG_START_PX = 8;

interface SwatchPress {
  index: number;
  startX: number;
  startY: number;
  timer: ReturnType<typeof setTimeout> | null;
  longPressed: boolean;
  active: boolean;
}

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
  const [showManager, setShowManager] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [swatchMenu, setSwatchMenu] = useState<{ index: number; x: number; y: number } | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const press = useRef<SwatchPress | null>(null);

  const value = editing === 'ink' ? currentColor.value : project.background;
  const swatches = project.palette.swatches;

  const setValue = (hex: string) => {
    if (editing === 'ink') useColor(hex);
    else updateProjectData(project.id, { background: hex });
  };

  const addToPalette = () => {
    if (swatches.some((s) => s.toUpperCase() === value.toUpperCase())) return;
    setProjectPalette(project, { ...project.palette, swatches: [...swatches, value.toUpperCase()] }, 'Add swatch');
  };

  function nearestSwatch(x: number, y: number): number | null {
    const els = [...(gridRef.current?.querySelectorAll<HTMLElement>('[data-swatch]') ?? [])];
    let best: number | null = null;
    let bestDist = Infinity;
    for (const el of els) {
      const r = el.getBoundingClientRect();
      const d = Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2));
      if (d < bestDist) {
        bestDist = d;
        best = Number(el.dataset.swatch);
      }
    }
    return best;
  }

  function onSwatchDown(e: PointerEvent, index: number) {
    safeSetPointerCapture(e.currentTarget as Element, e.pointerId);
    const el = e.currentTarget as HTMLElement;
    const p: SwatchPress = { index, startX: e.clientX, startY: e.clientY, timer: null, longPressed: false, active: false };
    p.timer = setTimeout(() => {
      p.timer = null;
      p.longPressed = true;
      const r = el.getBoundingClientRect();
      setSwatchMenu({ index, x: r.left, y: r.bottom + 2 });
    }, LONG_PRESS_MS);
    press.current = p;
  }

  function onSwatchMove(e: PointerEvent) {
    const p = press.current;
    if (!p || p.longPressed) return;
    if (!p.active) {
      if (Math.hypot(e.clientX - p.startX, e.clientY - p.startY) <= DRAG_START_PX) return;
      p.active = true;
      if (p.timer) clearTimeout(p.timer);
      p.timer = null;
      setDragIndex(p.index);
    }
    const target = nearestSwatch(e.clientX, e.clientY);
    if (target !== null && target !== dropIndex) setDropIndex(target);
  }

  function endSwatchPress(index: number, cancelled = false) {
    const p = press.current;
    press.current = null;
    if (p?.timer) clearTimeout(p.timer);
    const target = dropIndex;
    setDropIndex(null);
    setDragIndex(null);
    if (!p || cancelled) return;
    if (p.active) {
      if (target !== null && target !== p.index) {
        const next = [...swatches];
        const [moved] = next.splice(p.index, 1);
        next.splice(target, 0, moved);
        setProjectPalette(project, { ...project.palette, swatches: next }, 'Reorder swatches');
      }
      return;
    }
    if (!p.longPressed) setValue(swatches[index]);
  }

  return (
    <FloatingWindow id="colors" title="Colors" onClose={onClose} defaultPosition={{ x: 24, y: 48 }} width={236}>
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
            <span class="ab-field__label" title="This project's palette">
              Palette · {project.palette.name}
            </span>
            <button type="button" class="ab-icon-button" title="Add current color to palette" onClick={addToPalette} style={{ minWidth: 28, minHeight: 28 }}>
              +
            </button>
          </div>
          <div ref={gridRef} style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 4 }}>
            {swatches.map((hex, i) => (
              <button
                key={`${hex}-${i}`}
                type="button"
                data-swatch={i}
                title={`${hex} — tap to use, hold for more, drag to reorder`}
                onPointerDown={(e) => onSwatchDown(e as unknown as PointerEvent, i)}
                onPointerMove={(e) => onSwatchMove(e as unknown as PointerEvent)}
                onPointerUp={() => endSwatchPress(i)}
                onPointerCancel={() => endSwatchPress(i, true)}
                onContextMenu={(e) => e.preventDefault()}
                style={{
                  aspectRatio: '1',
                  background: hex,
                  border: '1px solid var(--ink)',
                  padding: 0,
                  cursor: 'pointer',
                  touchAction: 'none',
                  opacity: dragIndex === i ? 0.4 : 1,
                  outline: dropIndex === i && dragIndex !== null ? '2px solid var(--ink)' : 'none',
                  outlineOffset: 1,
                }}
              />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              class="ab-input"
              style={{ flex: 1, minWidth: 0, minHeight: 28, padding: '2px 4px', fontSize: 11 }}
              value=""
              onChange={(e) => {
                const entry = paletteLibrary.value.find((p) => p.id === (e.target as HTMLSelectElement).value);
                if (entry) setProjectPalette(project, { name: entry.name, swatches: [...entry.swatches] }, 'Load palette');
                (e.target as HTMLSelectElement).value = '';
              }}
            >
              <option value="">Load palette…</option>
              {paletteLibrary.value.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button type="button" class="ab-preset-button" title="Save this palette to the library" onClick={() => setSavingName(true)}>
              Save…
            </button>
            <button type="button" class="ab-preset-button" title="Manage, import and export palettes" onClick={() => setShowManager(true)}>
              Manage…
            </button>
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

        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <button type="button" class="ab-preset-button" onClick={() => (replaceColorRequest.value = {})}>
            Replace color…
          </button>
          <button type="button" class="ab-preset-button" onClick={() => (removeUnusedRequested.value = true)}>
            Remove unused
          </button>
        </div>
      </div>

      {swatchMenu ? (
        <>
          <div class="ab-modal-overlay" style={{ background: 'transparent' }} onClick={() => setSwatchMenu(null)} />
          <div class="ab-menu" style={{ position: 'fixed', left: swatchMenu.x, top: swatchMenu.y }}>
            <div
              class="ab-menu__item"
              onClick={() => {
                replaceColorRequest.value = { hex: swatches[swatchMenu.index] };
                setSwatchMenu(null);
              }}
            >
              <span>Replace color…</span>
            </div>
            <div
              class="ab-menu__item"
              onClick={() => {
                setProjectPalette(project, { ...project.palette, swatches: swatches.filter((_, i) => i !== swatchMenu.index) }, 'Remove swatch');
                setSwatchMenu(null);
              }}
            >
              <span>Remove from palette</span>
            </div>
          </div>
        </>
      ) : null}

      {showManager ? <PaletteManager project={project} onClose={() => setShowManager(false)} /> : null}
      {savingName ? (
        <PromptDialog
          title="Save palette to library"
          label="Name (an existing palette with the same name is replaced)"
          initial={project.palette.name}
          confirmLabel="Save"
          onCancel={() => setSavingName(false)}
          onSubmit={(name) => {
            void savePaletteToLibrary(name, swatches);
            setProjectPalette(project, { ...project.palette, name }, 'Rename palette');
            setSavingName(false);
          }}
        />
      ) : null}
    </FloatingWindow>
  );
}
