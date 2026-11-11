// The palette library manager (§7.3): load a library palette into the project,
// rename / duplicate / delete, import and export `.hex` / `.gpl`.
import { useRef, useState } from 'preact/hooks';
import type { Project } from '../types/model';
import { Dialog } from './Dialog';
import { Button } from './Button';
import { PromptDialog } from './PromptDialog';
import {
  paletteLibrary,
  renameLibraryPalette,
  duplicateLibraryPalette,
  removeLibraryPalette,
  importPaletteFile,
  exportPaletteFile,
} from '../state/paletteLibrary';
import { setProjectPalette } from '../state/colorOps';

export function PaletteManager({ project, onClose }: { project: Project; onClose: () => void }) {
  const library = paletteLibrary.value;
  const [selectedId, setSelectedId] = useState<string | null>(library[0]?.id ?? null);
  const [renaming, setRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const selected = library.find((e) => e.id === selectedId) ?? null;

  async function onImport(e: Event) {
    const input = e.target as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = '';
    let added = 0;
    let lastId: string | null = null;
    for (const file of files) {
      try {
        const entry = await importPaletteFile(file);
        if (entry) {
          added++;
          lastId = entry.id;
        }
      } catch {
        // unreadable file — reported below via the count
      }
    }
    if (lastId) setSelectedId(lastId);
    setMessage(added > 0 ? `Imported ${added} palette${added === 1 ? '' : 's'}.` : "Couldn't find any colors in that file (expected .hex or .gpl).");
  }

  return (
    <>
      <Dialog title="Palette library" onCancel={onClose} actions={<Button isDefault onClick={onClose}>Done</Button>}>
        <input ref={fileRef} type="file" accept=".hex,.gpl,.txt,text/plain" multiple style={{ display: 'none' }} onChange={(e) => void onImport(e)} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
            {library.length === 0 ? <span style={{ opacity: 0.7 }}>No saved palettes yet — use “Save…” in the Colors window, or import a file.</span> : null}
            {library.map((entry) => (
              <button
                key={entry.id}
                type="button"
                class={`ab-preset-button${entry.id === selectedId ? ' ab-preset-button--selected' : ''}`}
                style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between', textAlign: 'left' }}
                onClick={() => {
                  setSelectedId(entry.id);
                  setConfirmDelete(false);
                }}
              >
                <span>{entry.name}</span>
                <span style={{ display: 'flex' }}>
                  {entry.swatches.slice(0, 10).map((hex, i) => (
                    <span key={i} style={{ width: 10, height: 14, background: hex, borderTop: '1px solid var(--ink)', borderBottom: '1px solid var(--ink)' }} />
                  ))}
                </span>
              </button>
            ))}
          </div>

          {selected ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <Button
                isDefault
                onClick={() => {
                  setProjectPalette(project, { name: selected.name, swatches: [...selected.swatches] }, 'Load palette');
                  onClose();
                }}
              >
                Load into project
              </Button>
              <Button onClick={() => setRenaming(true)}>Rename…</Button>
              <Button onClick={() => void duplicateLibraryPalette(selected.id)}>Duplicate</Button>
              <Button onClick={() => exportPaletteFile(selected.name, selected.swatches, 'hex')}>Export .hex</Button>
              <Button onClick={() => exportPaletteFile(selected.name, selected.swatches, 'gpl')}>Export .gpl</Button>
              {confirmDelete ? (
                <Button
                  onClick={() => {
                    void removeLibraryPalette(selected.id);
                    setSelectedId(null);
                    setConfirmDelete(false);
                  }}
                >
                  Really delete?
                </Button>
              ) : (
                <Button onClick={() => setConfirmDelete(true)}>Delete</Button>
              )}
            </div>
          ) : null}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Button onClick={() => fileRef.current?.click()}>Import file…</Button>
            <span style={{ fontSize: 11, opacity: 0.7 }}>.hex (one color per line, Lospec) or .gpl (GIMP)</span>
          </div>
          {message ? <span style={{ fontSize: 12 }}>{message}</span> : null}
        </div>
      </Dialog>

      {renaming && selected ? (
        <PromptDialog
          title="Rename palette"
          label="Name"
          initial={selected.name}
          confirmLabel="Rename"
          onCancel={() => setRenaming(false)}
          onSubmit={(name) => {
            void renameLibraryPalette(selected.id, name);
            setRenaming(false);
          }}
        />
      ) : null}
    </>
  );
}
