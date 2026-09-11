import { useEffect, useRef, useState } from 'preact/hooks';
import { Window } from '../ui/Window';
import { Button, IconButton } from '../ui/Button';
import { Icon } from '../ui/icons';
import { Alert } from '../ui/Dialog';
import { projects, projectsLoaded, loadProjects, createAndSaveProject, renameProject, duplicateProject, removeProject, nextUntitledName } from '../state/projects';
import { storageError } from '../state/storage';
import { openProject } from '../state/router';
import { NewProjectDialog } from './NewProjectDialog';
import { RenameDialog } from './RenameDialog';
import { AppSettingsDialog } from './AppSettingsDialog';
import { AboutDialog } from './AboutDialog';
import type { Project } from '../types/model';

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function ProjectThumbnail({ project }: { project: Project }) {
  return (
    <div
      style={{
        aspectRatio: `${project.canvas.aspect[0]} / ${project.canvas.aspect[1]}`,
        background: project.background,
        border: '1px solid var(--ink)',
        width: '100%',
      }}
    />
  );
}

function ProjectCard({
  project,
  onOpen,
  onRename,
  onDuplicate,
  onDelete,
}: {
  project: Project;
  onOpen: () => void;
  onRename: () => void;
  onDuplicate: () => void;
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

  const openMenu = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMenuPos({ top: rect.bottom, left: Math.max(8, rect.right - 220) });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, position: 'relative' }}>
      <div onClick={onOpen} style={{ cursor: 'pointer' }}>
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
          …
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

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    navigator.storage?.estimate?.().then((e) => setUsage(e.usage ?? 0));
  }, [projects.value.length]);

  const list = projects.value;

  return (
    <div class="ab-desktop" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Window title="Projects" style={{ width: 'min(900px, 100%)', maxHeight: '90dvh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <Button isDefault onClick={() => setShowNewProject(true)}>
              <Icon name="plus" size={18} /> New project
            </Button>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
              <IconButton title="App settings" onClick={() => setShowSettings(true)}>
                <Icon name="gear" size={22} />
              </IconButton>
              <IconButton title="About ascii_buddy<3" onClick={() => setShowAbout(true)}>
                <Icon name="info" size={22} />
              </IconButton>
            </div>
          </div>

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
                  onDuplicate={() => duplicateProject(p.id).catch(() => {})}
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
            } catch {
              // storageError banner already reflects this.
            }
            setDeleteTarget(null);
          }}
        />
      ) : null}

      {showSettings ? <AppSettingsDialog onClose={() => setShowSettings(false)} onAbout={() => setShowAbout(true)} /> : null}
      {showAbout ? <AboutDialog onClose={() => setShowAbout(false)} /> : null}
    </div>
  );
}
