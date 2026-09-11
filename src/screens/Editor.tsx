import { useEffect, useState } from 'preact/hooks';
import { MenuBar, type MenuDef } from '../ui/MenuBar';
import { IconButton } from '../ui/Button';
import { Icon } from '../ui/icons';
import { SegmentedControl } from '../ui/SegmentedControl';
import { Alert } from '../ui/Dialog';
import { projects } from '../state/projects';
import { goHome } from '../state/router';
import { AppSettingsDialog } from './AppSettingsDialog';
import { AboutDialog } from './AboutDialog';
import { DrawingCanvas } from '../canvas/DrawingCanvas';
import { ToolPalette } from '../ui/ToolPalette';
import { ColorsWindow } from '../ui/ColorsWindow';
import { currentTool, currentColor, setActiveSize, activeSize } from '../state/tools';
import { canUndo, canRedo, undo, redo, clearHistory } from '../state/history';
import { clearCel } from '../state/celActions';
import { colorTableFull } from '../state/uiFlags';
import { appSettings } from '../state/appSettings';
import { saveStatus, flush } from '../state/autosave';
import { requestFitToScreen, requestActualPixels, zoomAround, viewport } from '../state/viewport';
import { AsciiWindow } from '../ui/AsciiWindow';
import { updateProjectData } from '../state/projects';
import { gridOverlay, showDrawingUnderAscii } from '../state/viewSettings';

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
  const project = projects.value.find((p) => p.id === projectId);

  function toggleView() {
    const p = projects.value.find((x) => x.id === projectId);
    if (!p) return;
    updateProjectData(p.id, { ui: { ...p.ui, view: p.ui.view === 'raster' ? 'ascii' : 'raster' } });
  }

  useEffect(() => {
    clearHistory();
  }, [projectId]);

  // Global keyboard shortcuts (Appendix A) relevant to Phase 1.
  useEffect(() => {
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
      if (meta) return;
      switch (e.key) {
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
          <button class="ab-button" type="button" onClick={goHome}>
            Back to projects
          </button>
        </div>
      </div>
    );
  }

  const trackId = project.ui.currentTrackId;
  const frameId = project.ui.currentFrameId;

  const menus: MenuDef[] = [
    {
      id: 'app',
      title: '▣',
      items: [
        { label: 'About ascii_buddy<3', onSelect: () => setShowAbout(true) },
        { label: 'App settings…', onSelect: () => setShowSettings(true) },
        { separator: true, label: '' },
        { label: 'Back to projects', onSelect: goHome },
      ],
    },
    {
      id: 'file',
      title: 'File',
      items: [
        { label: 'Save now', onSelect: () => void flush(), shortcut: '⌘S' },
        { label: 'Import images…', disabled: true },
        { label: 'Import video…', disabled: true },
        { label: 'Export…', disabled: true, shortcut: '⌘E' },
        { label: 'Export project file…', disabled: true },
        { label: 'Project settings…', disabled: true },
        { separator: true, label: '' },
        { label: 'Close project', onSelect: goHome },
      ],
    },
    {
      id: 'edit',
      title: 'Edit',
      items: [
        { label: 'Undo', onSelect: undo, disabled: !canUndo.value, shortcut: '⌘Z' },
        { label: 'Redo', onSelect: redo, disabled: !canRedo.value, shortcut: '⇧⌘Z' },
        { separator: true, label: '' },
        { label: 'Cut', disabled: true, shortcut: '⌘X' },
        { label: 'Copy', disabled: true, shortcut: '⌘C' },
        { label: 'Paste', disabled: true, shortcut: '⌘V' },
        { label: 'Paste image as reference', disabled: true },
        { separator: true, label: '' },
        { label: 'Select all', disabled: true, shortcut: '⌘A' },
        { label: 'Deselect', disabled: true, shortcut: 'Esc' },
        { label: 'Clear cel', onSelect: () => clearCel(project.id) },
        { separator: true, label: '' },
        { label: 'Replace color…', disabled: true },
        { label: 'Remove unused colors', disabled: true },
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
        { label: 'Hide all references', disabled: true, shortcut: 'R' },
        { separator: true, label: '' },
        { label: 'Onion skin', disabled: true, shortcut: 'O' },
        { label: 'Onion settings…', disabled: true },
        { separator: true, label: '' },
        { label: 'Expand timeline', disabled: true },
        { label: 'Focus mode', disabled: true, shortcut: 'F' },
      ],
    },
    {
      id: 'frame',
      title: 'Frame',
      items: [
        { label: 'New frame', disabled: true, shortcut: 'N' },
        { label: 'Duplicate frame', disabled: true, shortcut: '⌘D' },
        { label: 'Delete frame', disabled: true },
        { label: 'Hold ▸', disabled: true },
        { label: 'Previous frame', disabled: true, shortcut: ',' },
        { label: 'Next frame', disabled: true, shortcut: '.' },
        { label: 'Play / Stop', disabled: true, shortcut: '⏎' },
        { label: 'Playback mode ▸', disabled: true },
        { label: 'FPS…', disabled: true },
      ],
    },
    {
      id: 'layer',
      title: 'Layer',
      items: [
        { label: 'New drawing track', disabled: true },
        { label: 'New reference track', disabled: true },
        { label: 'Duplicate track', disabled: true },
        { label: 'Delete track', disabled: true },
        { label: 'Make static / Make animated', disabled: true },
        { label: 'Merge down', disabled: true },
        { label: 'Opacity…', disabled: true },
        { label: 'Conversion override…', disabled: true },
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
            <IconButton title="Toggle references" disabled>
              <Icon name="info" size={20} />
            </IconButton>
            <IconButton title="Toggle onion skin" disabled>
              <Icon name="duplicate" size={20} />
            </IconButton>
            <IconButton title="Undo" onClick={undo} disabled={!canUndo.value}>
              ↶
            </IconButton>
            <IconButton title="Redo" onClick={redo} disabled={!canRedo.value}>
              ↷
            </IconButton>
            <IconButton title="Focus mode" disabled>
              Fx
            </IconButton>
          </>
        }
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: appSettings.value.leftHanded ? 'row-reverse' : 'row', minHeight: 0 }}>
        <ToolPalette
          currentColorHex={currentColor.value}
          paperHex={project.background}
          onOpenColors={() => setColorsTarget('ink')}
          onOpenPaper={() => setColorsTarget('paper')}
        />
        <div class="ab-desktop" style={{ flex: 1, minWidth: 0 }}>
          <DrawingCanvas project={project} trackId={trackId} frameId={frameId} />
        </div>
      </div>

      <div
        style={{
          height: 48,
          borderTop: '1px solid var(--ink)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '0 12px',
          opacity: 0.5,
        }}
      >
        <span>|◀ ◀ ▶ ▶ ▶|</span>
        <span style={{ background: 'var(--ink)', color: 'var(--paper)', padding: '2px 6px' }}>1</span>
        <span style={{ marginLeft: 'auto' }}>{project.fps} fps</span>
        <span style={{ textTransform: 'capitalize' }}>{project.playbackMode}</span>
      </div>

      {colorsTarget ? (
        <ColorsWindow project={project} initialTarget={colorsTarget} onClose={() => setColorsTarget(null)} />
      ) : null}

      {showAsciiWindow ? <AsciiWindow project={project} onClose={() => setShowAsciiWindow(false)} /> : null}

      {colorTableFull.value ? (
        <Alert
          message="Color table is full."
          detail="This project already uses 255 colors. Reuse an existing color for now — removing unused colors is coming in a later phase."
          confirmLabel="OK"
          onConfirm={() => (colorTableFull.value = false)}
          onCancel={() => (colorTableFull.value = false)}
        />
      ) : null}

      {showSettings ? <AppSettingsDialog onClose={() => setShowSettings(false)} onAbout={() => setShowAbout(true)} /> : null}
      {showAbout ? <AboutDialog onClose={() => setShowAbout(false)} /> : null}
    </div>
  );
}
