import { useEffect, useRef, useState } from 'preact/hooks';
import { MenuBar, type MenuDef } from '../ui/MenuBar';
import { IconButton } from '../ui/Button';
import { Icon } from '../ui/icons';
import { SegmentedControl } from '../ui/SegmentedControl';
import { Alert } from '../ui/Dialog';
import { projects } from '../state/projects';
import { goHome } from '../state/router';
import { resetEditorSession } from '../state/session';
import { AppSettingsDialog } from './AppSettingsDialog';
import { AboutDialog } from './AboutDialog';
import { DrawingCanvas } from '../canvas/DrawingCanvas';
import { ToolPalette, isToolEnabled } from '../ui/ToolPalette';
import { ColorsWindow } from '../ui/ColorsWindow';
import { currentTool, currentColor, setActiveSize, activeSize, selectMode, type ToolName } from '../state/tools';
import {
  selection,
  hasClipboard,
  selectAll,
  copySelection,
  cutSelection,
  pasteClipboard,
  deleteSelection,
  commitSelection,
  nudgeSelection,
  gridCellSize,
  internalClipboardIsFresh,
} from '../state/selection';
import { canUndo, canRedo, undo, redo } from '../state/history';
import { clearCel } from '../state/celActions';
import { colorTableFull, replaceColorRequest, removeUnusedRequested } from '../state/uiFlags';
import { ReplaceColorDialog } from '../ui/ReplaceColorDialog';
import { ImportDialog } from '../ui/ImportDialog';
import { ExportDialog } from '../ui/ExportDialog';
import { ProjectFileDialog } from '../ui/ProjectFileDialog';
import { ProjectSettingsDialog } from '../ui/ProjectSettingsDialog';
import { copyFrameAsText } from '../export/copyText';
import { storageError } from '../state/storage';
import { focusMode, toggleFocusMode } from '../state/focusMode';
import { refreshThumbnail } from '../state/thumbnails';
import { importRequest } from '../state/importUi';
import { asciiApplyTo } from '../state/conversionOverrides';
import { countUnusedColors, removeUnusedColors } from '../state/colorOps';
import { appSettings } from '../state/appSettings';
import { saveStatus, flush } from '../state/autosave';
import { requestFitToScreen, requestActualPixels, zoomAround, viewport } from '../state/viewport';
import { AsciiWindow } from '../ui/AsciiWindow';
import { LayersPanel } from '../ui/LayersPanel';
import { Timeline } from '../ui/Timeline';
import { OnionSettingsWindow } from '../ui/OnionSettingsWindow';
import { FrameHoldDialog } from '../ui/FrameHoldDialog';
import { FpsDialog } from '../ui/FpsDialog';
import { updateProjectData } from '../state/projects';
import { gridOverlay, showDrawingUnderAscii, hideAllReferences } from '../state/viewSettings';
import { timelineExpanded } from '../state/timelineUi';
import { addDrawingTrack, addReferenceTrack, duplicateTrack, deleteTrack, setTrackStatic, mergeTrackDown, importImageAsReference } from '../state/tracksActions';
import { addFrame, duplicateFrame, deleteFrame, navigateFrame } from '../state/framesActions';
import { isPlaying, togglePlayback } from '../state/playback';
import { updateOnionSettings } from '../state/onion';

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
}

export function Editor({ projectId }: { projectId: string }) {
  const [showSettings, setShowSettings] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [colorsTarget, setColorsTarget] = useState<'ink' | 'paper' | null>(null);
  const [showAsciiWindow, setShowAsciiWindow] = useState(false);
  const [showLayers, setShowLayers] = useState(false);
  const [showOnionSettings, setShowOnionSettings] = useState(false);
  const [showFrameHold, setShowFrameHold] = useState(false);
  const [showFpsDialog, setShowFpsDialog] = useState(false);
  const [pasteUnavailable, setPasteUnavailable] = useState(false);
  const [unusedConfirm, setUnusedConfirm] = useState<number | null>(null);
  const [colorNotice, setColorNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const [showExport, setShowExport] = useState(false);
  // The keyboard handler is installed once, so it reaches the (changing) state setter through a ref.
  const setShowExportRef = useRef(() => {});
  setShowExportRef.current = () => setShowExport(true);
  const [showProjectFile, setShowProjectFile] = useState(false);
  const [showProjectSettings, setShowProjectSettings] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [dismissedStorageError, setDismissedStorageError] = useState<string | null>(null);
  const project = projects.value.find((p) => p.id === projectId);

  /** Waits for every pending save to land before switching screens, so the project list (and the next
   * project opened) can never see an older copy than what was just being edited. */
  async function leaveEditor() {
    try {
      await flush();
      const latest = projects.value.find((p) => p.id === projectId);
      if (latest) await refreshThumbnail(latest); // the Projects screen shows frame 1 as last left
    } finally {
      goHome();
    }
  }

  /** The toolbar's photo button is the quick path: one image goes straight onto a reference track (§10.1),
   * several open the import dialog. File → Import images… always opens the dialog. */
  const dialogModeRef = useRef(false);
  function triggerImportImageFile() {
    dialogModeRef.current = false;
    fileInputRef.current?.click();
  }
  function triggerImportImagesDialog() {
    dialogModeRef.current = true;
    fileInputRef.current?.click();
  }
  function triggerImportVideo() {
    videoInputRef.current?.click();
  }

  async function handleImportFileChange(e: Event) {
    const input = e.target as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = ''; // allow picking the same file again later
    const p = projects.value.find((x) => x.id === projectId);
    if (files.length === 0 || !p) return;
    if (files.length === 1 && !dialogModeRef.current) await importImageAsReference(p, files[0]);
    else importRequest.value = { kind: 'images', files };
  }

  function handleImportVideoChange(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) importRequest.value = { kind: 'video', file };
  }

  /** "Paste image as reference" menu item: the native `paste` DOM event (⌘V,
   * handled below) already covers a hardware keyboard, but a menu tap carries
   * no clipboard data of its own, so this reads the async Clipboard API
   * directly. iPadOS Safari's support for reading image clipboard items this
   * way is inconsistent (and requires HTTPS), so on any failure this falls
   * back to pointing the user at the reliable file-picker import instead of
   * failing silently. */
  async function tryPasteFromClipboard() {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find((t) => t.startsWith('image/'));
        if (!type) continue;
        const blob = await item.getType(type);
        const p = projects.value.find((x) => x.id === projectId);
        if (p) await importImageAsReference(p, blob);
        return;
      }
      setPasteUnavailable(true); // clipboard had no image
    } catch {
      setPasteUnavailable(true); // unsupported, denied, or insecure context
    }
  }

  function toggleView() {
    const p = projects.value.find((x) => x.id === projectId);
    if (!p) return;
    updateProjectData(p.id, { ui: { ...p.ui, view: p.ui.view === 'raster' ? 'ascii' : 'raster' } });
  }

  useEffect(() => {
    // Leaving the editor: commit pending edits (flush snapshots the live cels synchronously, and
    // also commits any floating selection), then wipe every piece of per-project module state.
    return () => {
      void flush();
      resetEditorSession(projectId);
    };
  }, [projectId]);

  // Select doubles as the reference-transform tool (§6.3); switch to/from it
  // automatically when the current track changes kind, so Pen/Eraser aren't
  // left selected-but-disabled on a reference track and vice versa.
  const previousTrackKind = useRef<string | null>(null);
  useEffect(() => {
    if (!project) return;
    const track = project.tracks.find((t) => t.id === project.ui.currentTrackId);
    if (!track) return;
    const previous = previousTrackKind.current;
    previousTrackKind.current = track.kind;
    if (track.kind === 'reference') {
      if (currentTool.value !== 'select' && currentTool.value !== 'eyedropper') currentTool.value = 'select';
    } else if (previous === 'reference' && currentTool.value === 'select') {
      // Coming back from transforming a reference: Select there meant "transform", so go back to drawing.
      currentTool.value = 'pen';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.ui.currentTrackId]);

  // Clipboard paste (§10.1): an image on the clipboard becomes a reference.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const p = projects.value.find((x) => x.id === projectId);
      if (!p) return;
      const file = [...(e.clipboardData?.items ?? [])].find((item) => item.type.startsWith('image/'))?.getAsFile();
      // An image on the system clipboard becomes a reference (§10.1) — unless the user just copied
      // something inside the app, in which case ⌘V means "paste that" (§6.3).
      if (file && !internalClipboardIsFresh()) void importImageAsReference(p, file);
      else if (hasClipboard.value) {
        e.preventDefault();
        pasteClipboard(p, p.ui.currentTrackId);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [projectId]);

  // Global keyboard shortcuts (Appendix A). This effect mounts once (empty
  // deps), so its closure would otherwise see a permanently-stale `project`
  // from first render — every branch below re-fetches fresh via `getProject()`
  // instead (same fix `toggleView` already uses for the same reason).
  useEffect(() => {
    const getProject = () => projects.value.find((x) => x.id === projectId);
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (meta && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void flush();
        return;
      }
      if (meta && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        setShowExportRef.current();
        return;
      }
      if (meta && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        const p = getProject();
        if (p) void duplicateFrame(p, p.ui.currentFrameId);
        return;
      }
      if (meta && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        const p = getProject();
        const track = p?.tracks.find((t) => t.id === p.ui.currentTrackId);
        if (p && track?.kind === 'drawing' && !track.locked) selectAll(p, track.id);
        return;
      }
      if (meta && (e.key.toLowerCase() === 'c' || e.key.toLowerCase() === 'x')) {
        const p = getProject();
        if (p && selection.value) {
          e.preventDefault();
          if (e.key.toLowerCase() === 'c') copySelection(p);
          else cutSelection(p);
        }
        return;
      }
      if (meta && e.key.toLowerCase() === 'v') {
        const p = getProject();
        if (p && internalClipboardIsFresh()) {
          e.preventDefault();
          pasteClipboard(p, p.ui.currentTrackId);
        }
        return; // otherwise the `paste` event decides (system image → reference)
      }
      if (meta) return;
      // A dialog is open: it owns the keyboard (letters would otherwise switch tools underneath it).
      if (document.querySelector('.ab-modal-overlay')) return;
      const tryTool = (name: ToolName) => {
        const p = getProject();
        const track = p?.tracks.find((t) => t.id === p.ui.currentTrackId);
        if (isToolEnabled(name, track)) currentTool.value = name;
      };
      switch (e.key) {
        case 'g':
        case 'G':
          tryTool('fill');
          break;
        case 'i':
        case 'I':
          tryTool('eyedropper');
          break;
        case 'm':
        case 'M': {
          const p = getProject();
          const track = p?.tracks.find((t) => t.id === p.ui.currentTrackId);
          if (currentTool.value === 'select' && track?.kind === 'drawing') selectMode.value = selectMode.value === 'rect' ? 'lasso' : 'rect';
          else tryTool('select');
          break;
        }
        case 'Escape':
          if (selection.value) commitSelection();
          else if (focusMode.value) focusMode.value = false;
          break;
        case 'f':
        case 'F':
          toggleFocusMode();
          break;
        case 'Delete':
        case 'Backspace':
          if (selection.value) {
            e.preventDefault();
            deleteSelection();
          }
          break;
        case 'ArrowLeft':
        case 'ArrowRight':
        case 'ArrowUp':
        case 'ArrowDown': {
          const p = getProject();
          if (!p) break;
          if (selection.value) {
            e.preventDefault();
            const cell = e.shiftKey ? gridCellSize(p) : { w: 1, h: 1 }; // Shift nudges a whole grid cell
            const dx = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
            const dy = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
            nudgeSelection(Math.round(dx * cell.w), Math.round(dy * cell.h));
          } else if (!isPlaying.value && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
            navigateFrame(p, e.key === 'ArrowLeft' ? 'previous' : 'next');
          }
          break;
        }
        case 'a':
        case 'A':
          toggleView();
          break;
        case 'b':
        case 'B':
          currentTool.value = 'pen';
          break;
        case 'e':
        case 'E':
          currentTool.value = 'eraser';
          break;
        case 'r':
        case 'R':
          hideAllReferences.value = !hideAllReferences.value;
          break;
        case 'o':
        case 'O': {
          const p = getProject();
          if (p) updateOnionSettings(p, { enabled: !p.onion.enabled });
          break;
        }
        case 'n':
        case 'N': {
          const p = getProject();
          if (p) void addFrame(p);
          break;
        }
        case ',': {
          const p = getProject();
          if (p && !isPlaying.value) navigateFrame(p, 'previous');
          break;
        }
        case '.': {
          const p = getProject();
          if (p && !isPlaying.value) navigateFrame(p, 'next');
          break;
        }
        case 'Enter': {
          const p = getProject();
          if (p) togglePlayback(p);
          break;
        }
        case '[':
          setActiveSize(activeSize() - 1);
          break;
        case ']':
          setActiveSize(activeSize() + 1);
          break;
        case '0':
          requestFitToScreen();
          break;
        case '1':
          requestActualPixels();
          break;
        case '+':
        case '=':
          zoomAround(viewport.value.zoom * 1.25, window.innerWidth / 2, window.innerHeight / 2);
          break;
        case '-':
          zoomAround(viewport.value.zoom * 0.8, window.innerWidth / 2, window.innerHeight / 2);
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (!project) {
    return (
      <div class="ab-desktop" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
          <span>Project not found.</span>
          <button class="ab-button" type="button" onClick={() => void leaveEditor()}>
            Back to projects
          </button>
        </div>
      </div>
    );
  }

  const trackId = project.ui.currentTrackId;
  const frameId = project.ui.currentFrameId;
  const currentTrack = project.tracks.find((t) => t.id === trackId);
  const trackIndex = project.tracks.findIndex((t) => t.id === trackId);
  const hasDrawingBelowCurrent = project.tracks.slice(trackIndex + 1).some((t) => t.kind === 'drawing');

  const menus: MenuDef[] = [
    {
      id: 'app',
      title: <Icon name="heart" size={16} />,
      items: [
        { label: 'About ascii_buddy<3', onSelect: () => setShowAbout(true) },
        { label: 'App settings…', onSelect: () => setShowSettings(true) },
        { separator: true, label: '' },
        { label: 'Back to projects', onSelect: () => void leaveEditor() },
      ],
    },
    {
      id: 'file',
      title: 'File',
      items: [
        { label: 'Save now', onSelect: () => void flush(), shortcut: '⌘S' },
        { label: 'Import images…', onSelect: triggerImportImagesDialog },
        { label: 'Import video…', onSelect: triggerImportVideo },
        { label: 'Export…', onSelect: () => setShowExport(true), shortcut: '⌘E' },
        {
          label: 'Copy frame as text',
          onSelect: () =>
            void copyFrameAsText(project).then((ok) => (ok ? setExportNotice('Copied the frame as text.') : setShowExport(true))),
        },
        { label: 'Export project file…', onSelect: () => setShowProjectFile(true) },
        { label: 'Project settings…', onSelect: () => setShowProjectSettings(true) },
        { separator: true, label: '' },
        { label: 'Close project', onSelect: () => void leaveEditor() },
      ],
    },
    {
      id: 'edit',
      title: 'Edit',
      items: [
        { label: 'Undo', onSelect: undo, disabled: !canUndo.value, shortcut: '⌘Z' },
        { label: 'Redo', onSelect: redo, disabled: !canRedo.value, shortcut: '⇧⌘Z' },
        { separator: true, label: '' },
        { label: 'Cut', onSelect: () => cutSelection(project), disabled: !selection.value, shortcut: '⌘X' },
        { label: 'Copy', onSelect: () => copySelection(project), disabled: !selection.value, shortcut: '⌘C' },
        { label: 'Paste', onSelect: () => pasteClipboard(project, trackId), disabled: !hasClipboard.value, shortcut: '⌘V' },
        { label: 'Paste image as reference', onSelect: () => void tryPasteFromClipboard() },
        { separator: true, label: '' },
        {
          label: 'Select all',
          onSelect: () => selectAll(project, trackId),
          disabled: currentTrack?.kind !== 'drawing' || currentTrack.locked,
          shortcut: '⌘A',
        },
        { label: 'Deselect', onSelect: commitSelection, disabled: !selection.value, shortcut: 'Esc' },
        { label: 'Clear cel', onSelect: () => clearCel(project.id, trackId) },
        { separator: true, label: '' },
        { label: 'Replace color…', onSelect: () => (replaceColorRequest.value = {}) },
        { label: 'Remove unused colors', onSelect: () => (removeUnusedRequested.value = true) },
      ],
    },
    {
      id: 'view',
      title: 'View',
      items: [
        { label: `Raster / ASCII (${project.ui.view === 'ascii' ? 'ASCII' : 'Raster'})`, onSelect: toggleView, shortcut: 'A' },
        { label: 'Fit to screen', onSelect: requestFitToScreen, shortcut: '0' },
        { label: 'Actual pixels', onSelect: requestActualPixels, shortcut: '1' },
        { label: gridOverlay.value ? '✓ Grid overlay' : 'Grid overlay', onSelect: () => (gridOverlay.value = !gridOverlay.value) },
        {
          label: showDrawingUnderAscii.value ? '✓ Show drawing under ASCII' : 'Show drawing under ASCII',
          onSelect: () => (showDrawingUnderAscii.value = !showDrawingUnderAscii.value),
        },
        {
          label: hideAllReferences.value ? '✓ Hide all references' : 'Hide all references',
          onSelect: () => (hideAllReferences.value = !hideAllReferences.value),
          shortcut: 'R',
        },
        { separator: true, label: '' },
        {
          label: project.onion.enabled ? '✓ Onion skin' : 'Onion skin',
          onSelect: () => updateOnionSettings(project, { enabled: !project.onion.enabled }),
          shortcut: 'O',
        },
        { label: 'Onion settings…', onSelect: () => setShowOnionSettings(true) },
        { separator: true, label: '' },
        {
          label: timelineExpanded.value ? '✓ Expand timeline' : 'Expand timeline',
          onSelect: () => (timelineExpanded.value = !timelineExpanded.value),
        },
        { label: focusMode.value ? '✓ Focus mode' : 'Focus mode', onSelect: toggleFocusMode, shortcut: 'F' },
      ],
    },
    {
      id: 'frame',
      title: 'Frame',
      items: [
        { label: 'New frame', onSelect: () => void addFrame(project), shortcut: 'N' },
        { label: 'Duplicate frame', onSelect: () => void duplicateFrame(project, project.ui.currentFrameId), shortcut: '⌘D' },
        {
          label: 'Delete frame',
          onSelect: () => void deleteFrame(project, project.ui.currentFrameId),
          disabled: project.frames.length <= 1,
        },
        { label: 'Hold…', onSelect: () => setShowFrameHold(true) },
        { separator: true, label: '' },
        { label: 'Previous frame', onSelect: () => navigateFrame(project, 'previous'), shortcut: ',' },
        { label: 'Next frame', onSelect: () => navigateFrame(project, 'next'), shortcut: '.' },
        { label: isPlaying.value ? 'Stop' : 'Play', onSelect: () => togglePlayback(project), shortcut: '⏎' },
        { separator: true, label: '' },
        {
          label: project.playbackMode === 'loop' ? '✓ Loop' : 'Loop',
          onSelect: () => updateProjectData(project.id, { playbackMode: 'loop' }),
        },
        {
          label: project.playbackMode === 'pingpong' ? '✓ Ping-pong' : 'Ping-pong',
          onSelect: () => updateProjectData(project.id, { playbackMode: 'pingpong' }),
        },
        {
          label: project.playbackMode === 'once' ? '✓ Once' : 'Once',
          onSelect: () => updateProjectData(project.id, { playbackMode: 'once' }),
        },
        { label: `FPS… (${project.fps})`, onSelect: () => setShowFpsDialog(true) },
      ],
    },
    {
      id: 'layer',
      title: 'Layer',
      items: [
        { label: 'Open layers panel', onSelect: () => setShowLayers(true) },
        { separator: true, label: '' },
        { label: 'New drawing track', onSelect: () => void addDrawingTrack(project) },
        { label: 'New reference track', onSelect: () => void addReferenceTrack(project) },
        { label: 'Duplicate track', onSelect: () => void duplicateTrack(project, trackId), disabled: !currentTrack },
        {
          label: 'Delete track',
          onSelect: () => void deleteTrack(project, trackId),
          disabled: !currentTrack || (currentTrack.kind === 'drawing' && project.tracks.filter((t) => t.kind === 'drawing').length <= 1),
        },
        {
          label: currentTrack?.isStatic ? 'Make animated' : 'Make static',
          onSelect: () => void setTrackStatic(project, trackId, !currentTrack?.isStatic),
          disabled: currentTrack?.kind !== 'drawing',
        },
        {
          label: 'Merge down',
          onSelect: () => void mergeTrackDown(project, trackId),
          disabled: currentTrack?.kind !== 'drawing' || !hasDrawingBelowCurrent,
        },
        { label: 'Opacity…', onSelect: () => setShowLayers(true), disabled: currentTrack?.kind !== 'reference' },
        {
          label: 'Conversion override…',
          onSelect: () => {
            asciiApplyTo.value = 'track';
            setShowAsciiWindow(true);
          },
          disabled: currentTrack?.kind !== 'drawing',
        },
      ],
    },
    {
      id: 'ascii',
      title: 'ASCII',
      items: [{ label: 'Open ASCII window', onSelect: () => setShowAsciiWindow(true) }],
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => void handleImportFileChange(e)}
      />
      <input ref={videoInputRef} type="file" accept="video/*,.mov,.mp4,.m4v" style={{ display: 'none' }} onChange={handleImportVideoChange} />
      {focusMode.value ? null : (
        <MenuBar
          menus={menus}
          right={
            <>
              {saveStatus.value !== 'idle' ? (
                <span class="ab-menubar__status">{saveStatus.value === 'saving' ? 'Saving…' : 'Saved'}</span>
              ) : null}
              <SegmentedControl
                options={[
                  { value: 'raster', label: 'Raster' },
                  { value: 'ascii', label: 'ASCII' },
                ]}
                value={project.ui.view}
                onChange={(v) => updateProjectData(project.id, { ui: { ...project.ui, view: v } })}
              />
              <IconButton
                title="Hide all references (R)"
                pressed={hideAllReferences.value}
                onClick={() => (hideAllReferences.value = !hideAllReferences.value)}
              >
                <Icon name={hideAllReferences.value ? 'eyeOff' : 'eye'} size={32} />
              </IconButton>
              <IconButton title="Import image as reference…" onClick={triggerImportImageFile}>
                <Icon name="plus" size={16} />
                <Icon name="photo" size={16} />
              </IconButton>
              <IconButton title="Layers" pressed={showLayers} onClick={() => setShowLayers((v) => !v)}>
                <Icon name="layers" size={32} />
              </IconButton>
              <IconButton
                title="Toggle onion skin (O)"
                pressed={project.onion.enabled}
                onClick={() => updateOnionSettings(project, { enabled: !project.onion.enabled })}
              >
                <Icon name="onion" size={32} />
              </IconButton>
              <IconButton title="Undo" onClick={undo} disabled={!canUndo.value}>
                <Icon name="undo" size={32} />
              </IconButton>
              <IconButton title="Redo" onClick={redo} disabled={!canRedo.value}>
                <Icon name="redo" size={32} />
              </IconButton>
              <IconButton title="Focus mode (F)" pressed={focusMode.value} onClick={toggleFocusMode}>
                <Icon name="focus" size={32} />
              </IconButton>
            </>
          }
        />
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: appSettings.value.leftHanded ? 'row-reverse' : 'row', minHeight: 0 }}>
        {focusMode.value ? null : (
          <ToolPalette
            currentColorHex={currentColor.value}
            paperHex={project.background}
            onOpenColors={() => setColorsTarget('ink')}
            onOpenPaper={() => setColorsTarget('paper')}
            currentTrack={currentTrack}
          />
        )}
        <div class="ab-desktop" style={{ flex: 1, minWidth: 0 }}>
          <DrawingCanvas project={project} trackId={trackId} frameId={frameId} />
        </div>
      </div>

      {focusMode.value ? null : <Timeline project={project} onOpenLayers={() => setShowLayers(true)} />}

      {focusMode.value ? (
        <button type="button" class="ab-focus-exit" title="Exit focus mode (F)" aria-label="Exit focus mode" onClick={toggleFocusMode}>
          <Icon name="focus" size={32} />
        </button>
      ) : null}

      {colorsTarget && !focusMode.value ? (
        <ColorsWindow project={project} initialTarget={colorsTarget} onClose={() => setColorsTarget(null)} />
      ) : null}

      {showAsciiWindow && !focusMode.value ? <AsciiWindow project={project} onClose={() => setShowAsciiWindow(false)} /> : null}

      {showLayers && !focusMode.value ? <LayersPanel project={project} onClose={() => setShowLayers(false)} /> : null}

      {showOnionSettings && !focusMode.value ? <OnionSettingsWindow project={project} onClose={() => setShowOnionSettings(false)} /> : null}

      {showFrameHold ? <FrameHoldDialog project={project} frameId={project.ui.currentFrameId} onClose={() => setShowFrameHold(false)} /> : null}

      {showFpsDialog ? <FpsDialog project={project} onClose={() => setShowFpsDialog(false)} /> : null}

      {importRequest.value ? (
        <ImportDialog
          project={project}
          request={importRequest.value}
          onClose={() => (importRequest.value = null)}
          onDone={(result) => {
            importRequest.value = null;
            const skipped = result.failures.length;
            const range = result.firstFrame === result.lastFrame ? `frame ${result.firstFrame}` : `frames ${result.firstFrame}–${result.lastFrame}`;
            if (result.imported === 0) setImportNotice(skipped > 0 ? `None of the ${skipped} file${skipped === 1 ? '' : 's'} could be read as an image.` : 'Nothing was imported.');
            else if (skipped > 0) setImportNotice(`Imported ${result.imported} into ${range} on “${result.trackName}”. ${skipped} file${skipped === 1 ? '' : 's'} couldn't be read and ${skipped === 1 ? 'was' : 'were'} skipped: ${result.failures.slice(0, 3).join(', ')}${skipped > 3 ? '…' : ''}.`);
          }}
        />
      ) : null}
      {showExport ? <ExportDialog project={project} onClose={() => setShowExport(false)} /> : null}
      {showProjectSettings ? (
        <ProjectSettingsDialog
          project={project}
          onClose={() => setShowProjectSettings(false)}
          onOpenAscii={() => setShowAsciiWindow(true)}
          onOpenOnion={() => setShowOnionSettings(true)}
        />
      ) : null}
      {showProjectFile ? <ProjectFileDialog projectId={project.id} onClose={() => setShowProjectFile(false)} /> : null}
      {exportNotice ? <Alert message={exportNotice} confirmLabel="OK" onConfirm={() => setExportNotice(null)} onCancel={() => setExportNotice(null)} /> : null}
      {storageError.value && dismissedStorageError !== storageError.value ? (
        <Alert
          message={/quota/i.test(storageError.value) ? 'Storage is full.' : "Your latest changes couldn't be saved."}
          detail={
            /quota/i.test(storageError.value)
              ? "This device has no room left for ascii_buddy's data. Export a project file now so nothing is lost, then free up space (delete projects you no longer need, or clear other data on the device)."
              : `${storageError.value}. Export a project file to keep a copy of your work.`
          }
          confirmLabel="Export project file"
          cancelLabel="Dismiss"
          onCancel={() => setDismissedStorageError(storageError.value)}
          onConfirm={() => {
            setDismissedStorageError(storageError.value);
            setShowProjectFile(true);
          }}
        />
      ) : null}
      {importNotice ? <Alert message={importNotice} confirmLabel="OK" onConfirm={() => setImportNotice(null)} onCancel={() => setImportNotice(null)} /> : null}

      {replaceColorRequest.value ? (
        <ReplaceColorDialog project={project} initialHex={replaceColorRequest.value.hex} onClose={() => (replaceColorRequest.value = null)} />
      ) : null}

      {removeUnusedRequested.value ? (
        <RemoveUnusedFlow
          onCount={async () => {
            const n = await countUnusedColors(project.id);
            removeUnusedRequested.value = false;
            if (n === 0) setColorNotice('Every color in the color table is used by the artwork — nothing to remove.');
            else setUnusedConfirm(n);
          }}
        />
      ) : null}

      {unusedConfirm !== null ? (
        <Alert
          message={`Remove ${unusedConfirm} unused color${unusedConfirm === 1 ? '' : 's'}?`}
          detail="The color table is compacted and every drawing is renumbered to match. This can't be undone, and it clears the undo history."
          confirmLabel="Remove"
          destructive
          onCancel={() => setUnusedConfirm(null)}
          onConfirm={async () => {
            const n = unusedConfirm;
            setUnusedConfirm(null);
            await removeUnusedColors(project.id);
            setColorNotice(`Removed ${n} unused color${n === 1 ? '' : 's'}.`);
          }}
        />
      ) : null}

      {colorNotice ? <Alert message={colorNotice} confirmLabel="OK" onConfirm={() => setColorNotice(null)} onCancel={() => setColorNotice(null)} /> : null}

      {colorTableFull.value ? (
        <Alert
          message="Color table is full."
          detail="This project already uses 255 colors. Reuse an existing color, or free some up with Edit → Remove unused colors."
          confirmLabel="OK"
          onConfirm={() => (colorTableFull.value = false)}
          onCancel={() => (colorTableFull.value = false)}
        />
      ) : null}

      {showSettings ? <AppSettingsDialog onClose={() => setShowSettings(false)} onAbout={() => setShowAbout(true)} /> : null}
      {showAbout ? <AboutDialog onClose={() => setShowAbout(false)} /> : null}

      {pasteUnavailable ? (
        <Alert
          message="Couldn't read an image from the clipboard."
          detail="This device/browser may not support pasting images this way. Use File → Import images… instead, or drag an image onto the canvas from Photos or Files."
          confirmLabel="OK"
          onConfirm={() => setPasteUnavailable(false)}
        />
      ) : null}
    </div>
  );
}

/** Runs the (async) unused-color count once when mounted, then reports back — lets the menu item stay a plain signal flip. */
function RemoveUnusedFlow({ onCount }: { onCount: () => void | Promise<void> }) {
  useEffect(() => {
    void onCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
