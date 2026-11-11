// "Characters by color" mapping table (§5.8): every color in the project's
// color table with an optional character. A mapped dominant color decides the
// character of a claimed grid cell; unmapped colors use the normal style.
import type { Project } from '../types/model';
import { Dialog } from './Dialog';
import { Button } from './Button';
import { updateProjectData } from '../state/projects';

export function ColorCharsDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const { enabled, map } = project.colorChars;
  const entries = project.colors.map((hex, index) => ({ hex, index })).filter((e) => e.index > 0 && e.hex);

  const write = (next: Partial<Project['colorChars']>) => updateProjectData(project.id, { colorChars: { ...project.colorChars, ...next } });

  function setChar(index: number, raw: string) {
    const ch = Array.from(raw.trim())[0]; // one character (a full code point, so emoji/blocks work too)
    const nextMap = { ...map };
    if (ch) nextMap[index] = ch;
    else delete nextMap[index];
    write({ map: nextMap });
  }

  return (
    <Dialog title="Characters by color" onCancel={onClose} actions={<Button isDefault onClick={onClose}>Done</Button>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={enabled} onChange={(e) => write({ enabled: (e.target as HTMLInputElement).checked })} />
          <span>Use these characters instead of the style (when a color has one)</span>
        </label>
        <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, opacity: enabled ? 1 : 0.5 }}>
          {entries.length === 0 ? <span style={{ opacity: 0.7 }}>This project doesn't use any colors yet.</span> : null}
          {entries.map((e) => (
            <div key={e.index} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 24, height: 24, background: e.hex, border: '1px solid var(--ink)' }} />
              <span style={{ flex: 1, fontSize: 12 }}>{e.hex}</span>
              <input
                class="ab-input"
                style={{ width: 56, textAlign: 'center' }}
                type="text"
                value={map[e.index] ?? ''}
                placeholder="—"
                onInput={(ev) => setChar(e.index, (ev.target as HTMLInputElement).value)}
              />
            </div>
          ))}
        </div>
        <span style={{ fontSize: 11, opacity: 0.7 }}>Colors without a character use the style as usual. The threshold still decides which cells are empty.</span>
        {Object.keys(map).length > 0 ? <Button onClick={() => write({ map: {} })}>Clear all</Button> : null}
      </div>
    </Dialog>
  );
}
