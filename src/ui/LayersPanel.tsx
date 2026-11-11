// Track list panel (§8). A floating window for now — Phase 4's expanded
// timeline will eventually host track headers in its left column (§9.4);
// until frames exist, a plain list is the simplest place for this. See
// DECISIONS.md.
import { importRequest } from '../state/importUi';
import { useRef, useState } from 'preact/hooks';
import type { ID, Project, Track } from '../types/model';
import { FloatingWindow } from './FloatingWindow';
import { IconButton } from './Button';
import { Icon } from './icons';
import { Slider } from './Slider';
import { Alert } from './Dialog';
import { updateProjectData } from '../state/projects';
import {
  addDrawingTrack,
  addReferenceTrack,
  duplicateTrack,
  deleteTrack,
  renameTrack,
  setTrackVisible,
  setTrackLocked,
  setReferenceOpacity,
  reorderTrack,
  setTrackStatic,
  mergeTrackDown,
  warnIfOverTrackLimit,
  importImageAsReference,
} from '../state/tracksActions';
import { applyTransformToAllCels, fitTransform, fillTransform, resetTransform, setReferenceTransform, liveReferences } from '../state/referenceStore';
import { safeSetPointerCapture } from './pointerCapture';

/** A track's settings, rendered inside its own small floating window (opened
 * to the side of the main Layers panel) rather than an inline dropdown —
 * an inline popup nested inside the track list's own scroll area meant its
 * lower items (Fit/Fill/Reset/Apply) needed a second, confusing scroll to
 * reach. A real window has no such limit and can be dragged out of the way. */
function TrackSettings({
  project,
  track,
  onClose,
}: {
  project: Project;
  track: Track;
  onClose: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(track.name);
  const index = project.tracks.findIndex((t) => t.id === track.id);
  const hasDrawingBelow = project.tracks.slice(index + 1).some((t) => t.kind === 'drawing');
  const live = track.kind === 'reference' ? liveReferences.value.get(track.id) : undefined;

  return (
    <div class="ab-menu" style={{ position: 'static', boxShadow: 'none', border: 'none' }}>
      {renaming ? (
        <div style={{ padding: 8 }}>
          <input
            class="ab-input"
            value={name}
            autofocus
            onInput={(e) => setName((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                renameTrack(project, track.id, name);
                setRenaming(false);
              }
            }}
          />
        </div>
      ) : (
        <div class="ab-menu__item" onClick={() => setRenaming(true)}>
          <span>Rename</span>
        </div>
      )}
      <div class="ab-menu__item" onClick={() => void duplicateTrack(project, track.id)}>
        <span>Duplicate</span>
      </div>
      <div
        class="ab-menu__item"
        onClick={() => {
          void deleteTrack(project, track.id);
          onClose(); // the track (and this panel's subject) no longer exists
        }}
      >
        <span>Delete</span>
      </div>
      {track.kind === 'drawing' ? (
        <div class="ab-menu__item" onClick={() => void setTrackStatic(project, track.id, !track.isStatic)}>
          <span>{track.isStatic ? 'Make animated' : 'Make static'}</span>
        </div>
      ) : null}
      {track.kind === 'drawing' && hasDrawingBelow ? (
        <div
          class="ab-menu__item"
          onClick={() => {
            void mergeTrackDown(project, track.id);
            onClose(); // this track gets merged away
          }}
        >
          <span>Merge down</span>
        </div>
      ) : null}
      {track.kind === 'reference' ? (
        <div style={{ padding: '8px 14px', width: 200 }}>
          <Slider
            label="Opacity"
            readout={`${Math.round(track.opacity * 100)}%`}
            value={track.opacity}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => setReferenceOpacity(project, track.id, v)}
          />
        </div>
      ) : null}
      {track.kind === 'reference' && live ? (
        <>
          <div class="ab-menu__separator" />
          <div
            class="ab-menu__item"
            onClick={() =>
              void setReferenceTransform(track.id, fitTransform(live.naturalWidth, live.naturalHeight, project.canvas.width, project.canvas.height))
            }
          >
            <span>Fit</span>
          </div>
          <div
            class="ab-menu__item"
            onClick={() =>
              void setReferenceTransform(track.id, fillTransform(live.naturalWidth, live.naturalHeight, project.canvas.width, project.canvas.height))
            }
          >
            <span>Fill</span>
          </div>
          <div
            class="ab-menu__item"
            onClick={() => void setReferenceTransform(track.id, resetTransform(project.canvas.width, project.canvas.height))}
          >
            <span>Reset</span>
          </div>
          <div class="ab-menu__item" onClick={() => void applyTransformToAllCels(project, track)}>
            <span>Apply to all cels in track</span>
          </div>
        </>
      ) : null}
    </div>
  );
}

function TrackRow({
  project,
  track,
  isCurrent,
  onSelect,
  onOpenSettings,
  dragHandleProps,
}: {
  project: Project;
  track: Track;
  isCurrent: boolean;
  onSelect: () => void;
  onOpenSettings: () => void;
  dragHandleProps: preact.JSX.HTMLAttributes<HTMLDivElement>;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 4px',
        background: isCurrent ? 'var(--ink)' : 'transparent',
        color: isCurrent ? 'var(--paper)' : 'var(--ink)',
        cursor: 'pointer',
      }}
      onClick={onSelect}
    >
      <div {...dragHandleProps} style={{ cursor: 'grab', display: 'flex', padding: 4, touchAction: 'none' }}>
        ⠿
      </div>
      <Icon name={track.kind === 'drawing' ? 'pen' : 'photo'} size={16} />
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11 }}>
        {track.name}
        {track.isStatic ? ' [S]' : ''}
        {track.conversion && Object.keys(track.conversion).length > 0 ? <span title="This track has its own ASCII settings"> ◆</span> : null}
      </span>
      <span onClick={(e) => e.stopPropagation()}>
        <IconButton
          title={track.visible ? 'Hide' : 'Show'}
          onClick={() => {
            setTrackVisible(project, track.id, !track.visible);
          }}
        >
          <span style={{ color: isCurrent ? 'var(--paper)' : 'var(--ink)', display: 'flex' }}>
            <Icon name={track.visible ? 'eye' : 'eyeOff'} size={32} />
          </span>
        </IconButton>
      </span>
      <span onClick={(e) => e.stopPropagation()}>
        <IconButton
          title={track.locked ? 'Unlock' : 'Lock'}
          onClick={() => {
            setTrackLocked(project, track.id, !track.locked);
          }}
        >
          <span style={{ color: isCurrent ? 'var(--paper)' : 'var(--ink)', display: 'flex' }}>
            <Icon name={track.locked ? 'lock' : 'lockOpen'} size={32} />
          </span>
        </IconButton>
      </span>
      <span onClick={(e) => e.stopPropagation()}>
        <IconButton title="Track settings…" onClick={onOpenSettings}>
          <span style={{ color: isCurrent ? 'var(--paper)' : 'var(--ink)', display: 'flex' }}>
            <Icon name="hammerAndSickle" size={32} />
          </span>
        </IconButton>
      </span>
    </div>
  );
}

const LAYERS_PANEL_WIDTH = 300;
const LAYERS_PANEL_DEFAULT_X = 460;
const SETTINGS_PANEL_WIDTH = 220;

export function LayersPanel({ project, onClose }: { project: Project; onClose: () => void }) {
  const [showLimitWarning, setShowLimitWarning] = useState(false);
  const [settingsTrackId, setSettingsTrackId] = useState<ID | null>(null);
  const dragFromRef = useRef<number | null>(null);
  const rowElsRef = useRef<Map<ID, HTMLDivElement>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const settingsTrack = project.tracks.find((t) => t.id === settingsTrackId) ?? null;

  async function handleAddDrawing() {
    await addDrawingTrack(project);
    if (warnIfOverTrackLimit(project)) setShowLimitWarning(true);
  }

  async function handleAddEmptyReference() {
    await addReferenceTrack(project);
    if (warnIfOverTrackLimit(project)) setShowLimitWarning(true);
  }

  async function handleImportFileChange(e: Event) {
    const input = e.target as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = ''; // allow picking the same file again later
    if (files.length === 0) return;
    if (files.length > 1) {
      importRequest.value = { kind: 'images', files }; // several images → the import dialog (§10.2)
      return;
    }
    await importImageAsReference(project, files[0]);
    if (warnIfOverTrackLimit(project)) setShowLimitWarning(true);
  }

  function onDragStart(e: PointerEvent, index: number) {
    safeSetPointerCapture(e.currentTarget as Element, e.pointerId);
    dragFromRef.current = index;
  }
  function onDragMove(e: PointerEvent) {
    if (dragFromRef.current === null) return;
    for (let i = 0; i < project.tracks.length; i++) {
      const el = rowElsRef.current.get(project.tracks[i].id);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (e.clientY >= rect.top && e.clientY <= rect.bottom && i !== dragFromRef.current) {
        reorderTrack(project, dragFromRef.current, i);
        dragFromRef.current = i;
        break;
      }
    }
  }
  function onDragEnd() {
    dragFromRef.current = null;
  }

  return (
    <>
      <FloatingWindow id="layers" title="Layers" onClose={onClose} defaultPosition={{ x: LAYERS_PANEL_DEFAULT_X, y: 56 }} width={LAYERS_PANEL_WIDTH}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            <IconButton title="New drawing track" onClick={() => void handleAddDrawing()}>
              <Icon name="plus" size={16} />
              <Icon name="pen" size={16} />
            </IconButton>
            <IconButton title="Import image as reference…" onClick={() => fileInputRef.current?.click()}>
              <Icon name="plus" size={16} />
              <Icon name="photo" size={16} />
            </IconButton>
            <IconButton title="New empty reference track" onClick={() => void handleAddEmptyReference()}>
              <Icon name="plus" size={16} />
              <Icon name="select" size={16} />
            </IconButton>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => void handleImportFileChange(e)}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 420, overflowY: 'auto' }}>
            {project.tracks.map((track, index) => (
              <div
                key={track.id}
                ref={(el) => {
                  if (el) rowElsRef.current.set(track.id, el);
                }}
              >
                <TrackRow
                  project={project}
                  track={track}
                  isCurrent={track.id === project.ui.currentTrackId}
                  onSelect={() => updateProjectData(project.id, { ui: { ...project.ui, currentTrackId: track.id } })}
                  onOpenSettings={() => setSettingsTrackId(track.id)}
                  dragHandleProps={{
                    onPointerDown: (e) => onDragStart(e as unknown as PointerEvent, index),
                    onPointerMove: (e) => onDragMove(e as unknown as PointerEvent),
                    onPointerUp: onDragEnd,
                    onPointerCancel: onDragEnd,
                  }}
                />
              </div>
            ))}
          </div>
        </div>

        {showLimitWarning ? (
          <Alert
            message="This project now has more than 16 tracks."
            detail="More tracks use more memory. Consider merging some down or deleting ones you no longer need."
            confirmLabel="OK"
            onConfirm={() => setShowLimitWarning(false)}
          />
        ) : null}
      </FloatingWindow>

      {settingsTrack ? (
        <FloatingWindow
          id="layer-settings"
          title={settingsTrack.name}
          onClose={() => setSettingsTrackId(null)}
          defaultPosition={{
            x: Math.max(8, Math.min(LAYERS_PANEL_DEFAULT_X + LAYERS_PANEL_WIDTH + 16, window.innerWidth - SETTINGS_PANEL_WIDTH - 8)),
            y: 56,
          }}
          width={SETTINGS_PANEL_WIDTH}
        >
          <TrackSettings project={project} track={settingsTrack} onClose={() => setSettingsTrackId(null)} />
        </FloatingWindow>
      ) : null}
    </>
  );
}
