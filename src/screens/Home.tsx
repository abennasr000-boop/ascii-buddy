import { useEffect, useRef, useState } from 'preact/hooks';
import { Window } from '../ui/Window';
import { Button, IconButton } from '../ui/Button';
import { Icon } from '../ui/icons';
import { Alert } from '../ui/Dialog';
import { projects, projectsLoaded, createAndSaveProject, renameProject, duplicateProject, removeProject, nextUntitledName } from '../state/projects';
import { storageError } from '../state/storage';
import { openProject } from '../state/router';
import { NewProjectDialog } from './NewProjectDialog';
import { RenameDialog } from './RenameDialog';
import { AppSettingsDialog } from './AppSettingsDialog';
import { AboutDialog } from './AboutDialog';
import { ProjectFileDialog } from '../ui/ProjectFileDialog';
import { importProjectFile } from '../state/projectFileActions';
import { ProjectFileError } from '../engine/projectFile';
import { backupLabel } from '../engine/backupLabel';
import { thumbnailUrls, copyThumbnail, forgetThumbnail, refreshThumbnail } from '../state/thumbnails';
import type { Project } from '../types/model';

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function ProjectThumbnail({ project }: { project: Project }) {
  const url = thumbnailUrls.value.get(project.id);
  return (
    <div
      style={{
        aspectRatio: `${project.canvas.aspect[0]} / ${project.canvas.aspect[1]}`,
        background: project.background,
        border: '1px solid var(--ink)',
        width: '100%',
        overflow: 'hidden',
      }}
    >
      {url ? <img src={url} alt="" draggable={false} style={{ display: 'block', width: '100%', height: '100%', imageRendering: 'pixelated' }} /> : null}
    </div>
  );
}

function ProjectCard({
  project,
  onOpen,
  onRename,
  onDuplicate,
  onExport,
  onDelete,
}: {
  project: Project;
  onOpen: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onExport: () => void;
  onDelete: () => void;
}) {
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuPos) return;
    const close = (e: PointerEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      setMenuPos(null);
    };
    const closeAll = () => setMenuPos(null);
    // Delay so the opening click (a pointerdown) doesn't immediately close it.
    const id = requestAnimationFrame(() => {
      window.addEventListener('pointerdown', close);
      window.addEventListener('scroll', closeAll, true);
    });
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('scroll', closeAll, true);
    };
  }, [menuPos]);

  // §13.1: long-press a project to open the same menu as the ⋯ button. The tap that ends a long-press must not also open the project.
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const startPress = () => {
    longPressed.current = false;
    pressTimer.current = setTimeout(() => {
      longPressed.current = true;
      openMenu();
    }, 500);
  };
  const cancelPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };

  const openMenu = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMenuPos({ top: rect.bottom, left: Math.max(8, rect.right - 220) });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, position: 'relative' }}>
      <div
        onClick={() => {
          if (longPressed.current) longPressed.current = false;
          else onOpen();
        }}
        onPointerDown={startPress}
        onPointerUp={cancelPress}
        onPointerLeave={cancelPress}
        onPointerCancel={cancelPress}
        onPointerMove={(e) => Math.abs(e.movementX) + Math.abs(e.movementY) > 6 && cancelPress()}
        onContextMenu={(e) => e.preventDefault()}
        style={{ cursor: 'pointer', WebkitTouchCallout: 'none' }}
      >
        <ProjectThumbnail project={project} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
        <div style={{ overflow: 'hidden' }}>
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.name}</div>
          <div style={{ opacity: 0.6, fontSize: 10 }}>{formatDate(project.updatedAt)}</div>
        </div>
        <button
          ref={buttonRef}
          type="button"
          class="ab-icon-button"
          title="Project actions"
          aria-label="Project actions"
          onClick={openMenu}
        >
          <Icon name="more" size={32} />
        </button>
      </div>
      {menuPos ? (
        <div ref={menuRef} class="ab-menu" style={{ position: 'fixed', top: menuPos.top, left: menuPos.left }}>
          <div
            class="ab-menu__item"
            onClick={() => {
              setMenuPos(null);
              onRename();
            }}
          >
            <span>Rename</span>
          </div>
          <div
            class="ab-menu__item"
            onClick={() => {
              setMenuPos(null);
              onDuplicate();
            }}
          >
            <span>Duplicate</span>
          </div>
          <div
            class="ab-menu__item"
            onClick={() => {
              setMenuPos(null);
              onExport();
            }}
          >
            <span>Export project file…</span>
          </div>
          <div class="ab-menu__item" style={{ opacity: 0.6, fontSize: 10, pointerEvents: 'none' }}>
            <span>{backupLabel(project.lastExportedAt)}</span>
          </div>
          <div class="ab-menu__separator" />
          <div
            class="ab-menu__item"
            onClick={() => {
              setMenuPos(null);
              onDelete();
            }}
          >
            <span>Delete</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function Home() {
  const [showNewProject, setShowNewProject] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Project | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [usage, setUsage] = useState<number | null>(null);
  const [exportTarget, setExportTarget] = useState<Project | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  // The project list is loaded once at app start (App.tsx) and then kept in memory. It used to be re-read
  // from storage every time this screen appeared — which could return an older copy of a project whose
  // save was still in flight (then overwrite the newer in-memory one), and re-sorted the grid a moment
  // after it appeared, so a tap could land on a different project than the one under the finger.

  useEffect(() => {
    navigator.storage?.estimate?.().then((e) => setUsage(e.usage ?? 0));
  }, [projects.value.length]);

  // Most recently modified first; ties broken by id so the order is fully deterministic.
  const list = [...projects.value].sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));

  return (
    <div class="ab-desktop" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Window title="Projects" style={{ width: 'min(900px, 100%)', maxHeight: '90dvh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <Button isDefault onClick={() => setShowNewProject(true)}>
              <Icon name="plus" size={16} /> New project
            </Button>
            <Button onClick={() => importInputRef.current?.click()} disabled={importing}>
              {importing ? 'Importing…' : 'Import project file'}
            </Button>
            <input
              ref={importInputRef}
              type="file"
              style={{ display: 'none' }}
              onChange={async (e) => {
                const input = e.target as HTMLInputElement;
                const file = input.files?.[0];
                input.value = '';
                if (!file) return;
                setImporting(true);
                try {
                  const project = await importProjectFile(file);
                  void refreshThumbnail(project);
                  setImportMessage(`Imported “${project.name}”.`);
                } catch (err) {
                  setImportMessage(err instanceof ProjectFileError ? err.message : `The file couldn't be imported: ${err instanceof Error ? err.message : String(err)}`);
                } finally {
                  setImporting(false);
                }
              }}
            />
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
              <IconButton title="App settings" onClick={() => setShowSettings(true)}>
                <Icon name="hammerAndSickle" size={32} />
              </IconButton>
              <IconButton title="About ascii_buddy<3" onClick={() => setShowAbout(true)}>
                <Icon name="info" size={32} />
              </IconButton>
            </div>
          </div>

          {window.innerWidth < 600 ? (
            <div style={{ border: '1px solid var(--ink)', padding: 8, opacity: 0.85 }}>Works best on iPad or desktop.</div>
          ) : null}

          {storageError.value ? (
            <div style={{ border: '1px solid var(--ink)', padding: 8, opacity: 0.85 }}>
              Storage isn't available here, so projects won't be saved. Open this app from a hosted URL (see
              README.md) or a local dev server instead of a local file.
            </div>
          ) : null}

          {!projectsLoaded.value ? (
            <div style={{ padding: 40, textAlign: 'center', opacity: 0.6 }}>Loading…</div>
          ) : list.length === 0 ? (
            <div style={{ padding: '40px 0', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' }}>
              <span>No projects yet.</span>
              <Button isDefault onClick={() => setShowNewProject(true)}>
                New project
              </Button>
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                gap: 20,
                overflow: 'auto',
                paddingBottom: 4,
              }}
            >
              {list.map((p) => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  onOpen={() => openProject(p.id)}
                  onRename={() => setRenameTarget(p)}
                  onDuplicate={() =>
                    duplicateProject(p.id)
                      .then((copy) => copy && copyThumbnail(p.id, copy.id))
                      .catch(() => {})
                  }
                  onExport={() => setExportTarget(p)}
                  onDelete={() => setDeleteTarget(p)}
                />
              ))}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--ink)', paddingTop: 8, opacity: 0.7, fontSize: 10 }}>
            <span>{usage !== null ? `${formatBytes(usage)} used` : ''}</span>
            <span>Project files are the backup — export regularly.</span>
          </div>
        </div>
      </Window>

      {showNewProject ? (
        <NewProjectDialog
          defaultName={nextUntitledName()}
          onCancel={() => setShowNewProject(false)}
          onCreate={async (opts) => {
            try {
              const project = await createAndSaveProject(opts);
              setShowNewProject(false);
              openProject(project.id);
            } catch {
              // storageError banner already reflects this; leave the dialog open.
            }
          }}
        />
      ) : null}

      {renameTarget ? (
        <RenameDialog
          initialName={renameTarget.name}
          onCancel={() => setRenameTarget(null)}
          onRename={async (name) => {
            try {
              await renameProject(renameTarget.id, name);
            } catch {
              // storageError banner already reflects this.
            }
            setRenameTarget(null);
          }}
        />
      ) : null}

      {deleteTarget ? (
        <Alert
          message={`Delete '${deleteTarget.name}'?`}
          detail="This can't be undone."
          confirmLabel="Delete"
          destructive
          onCancel={() => setDeleteTarget(null)}
          onConfirm={async () => {
            try {
              await removeProject(deleteTarget.id);
              forgetThumbnail(deleteTarget.id);
            } catch {
              // storageError banner already reflects this.
            }
            setDeleteTarget(null);
          }}
        />
      ) : null}

      {exportTarget ? <ProjectFileDialog projectId={exportTarget.id} onClose={() => setExportTarget(null)} /> : null}
      {importMessage ? <Alert message={importMessage} confirmLabel="OK" onConfirm={() => setImportMessage(null)} onCancel={() => setImportMessage(null)} /> : null}

      {showSettings ? <AppSettingsDialog onClose={() => setShowSettings(false)} onAbout={() => setShowAbout(true)} /> : null}
      {showAbout ? <AboutDialog onClose={() => setShowAbout(false)} /> : null}
    </div>
  );
}
