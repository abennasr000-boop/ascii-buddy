// Replace color… (§7.1): pick a color already in the project's table, choose
// its replacement, and every pixel using it — across all frames and tracks —
// changes at once. One undo step.
import { useState } from 'preact/hooks';
import type { Project } from '../types/model';
import { Dialog } from './Dialog';
import { Button } from './Button';
import { ColorPicker } from './ColorPicker';
import { findColorIndex } from '../state/colorTable';
import { replaceColor } from '../state/colorOps';
import { currentColor } from '../state/tools';

export function ReplaceColorDialog({ project, initialHex, onClose }: { project: Project; initialHex?: string; onClose: () => void }) {
  const entries = project.colors.map((hex, index) => ({ hex, index })).filter((e) => e.index > 0 && e.hex);
  const preferred = [initialHex, currentColor.value].map((h) => (h ? findColorIndex(project, h) : -1)).find((i) => i > 0);
  const [selected, setSelected] = useState<number>(preferred ?? entries[0]?.index ?? 0);
  const [next, setNext] = useState<string>(project.colors[selected] ?? '#000000');
  const notInTable = initialHex !== undefined && findColorIndex(project, initialHex) === -1;
  const changed = !!project.colors[selected] && project.colors[selected].toUpperCase() !== next.toUpperCase();

  function choose(index: number) {
    setSelected(index);
    setNext(project.colors[index]);
  }

  return (
    <Dialog
      title="Replace color"
      onCancel={onClose}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            isDefault
            disabled={!changed}
            onClick={() => {
              replaceColor(project.id, selected, next);
              onClose();
            }}
          >
            Replace
          </Button>
        </>
      }
    >
      {entries.length === 0 ? (
        <p style={{ margin: 0 }}>This project doesn't use any colors yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div class="ab-field">
            <span class="ab-field__label">Color to replace (used across every frame and track)</span>
            {notInTable ? <span style={{ fontSize: 11, opacity: 0.7 }}>That swatch isn't used in this project yet — pick one that is.</span> : null}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 4 }}>
              {entries.map((e) => (
                <button
                  key={e.index}
                  type="button"
                  title={e.hex}
                  onClick={() => choose(e.index)}
                  style={{
                    aspectRatio: '1',
                    background: e.hex,
                    border: '1px solid var(--ink)',
                    outline: e.index === selected ? '2px solid var(--ink)' : 'none',
                    outlineOffset: 2,
                    padding: 0,
                    cursor: 'pointer',
                  }}
                />
              ))}
            </div>
          </div>
          <div class="ab-field">
            <span class="ab-field__label">Replace with</span>
            <ColorPicker value={next} onChange={setNext} />
          </div>
        </div>
      )}
    </Dialog>
  );
}
