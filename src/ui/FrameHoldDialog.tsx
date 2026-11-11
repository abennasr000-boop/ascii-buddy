// Sets a frame's hold (duration in ticks), or every selected frame's hold at
// once if a multi-selection is active. See ASCII_BUDDY_SPEC.md §9.1.
import { useRef, useState } from 'preact/hooks';
import type { Project } from '../types/model';
import { Dialog } from './Dialog';
import { Button } from './Button';
import { Slider } from './Slider';
import { setFrameHold, setFramesHold, recordFramesEdit, MIN_HOLD, MAX_HOLD } from '../state/framesActions';

const PRESETS = [1, 2, 3, 4];

export function FrameHoldDialog({
  project,
  frameId,
  frameIds,
  onClose,
}: {
  project: Project;
  frameId: string;
  frameIds?: string[];
  onClose: () => void;
}) {
  const initial = project.frames.find((f) => f.id === frameId)?.duration ?? 1;
  const [hold, setHold] = useState(initial);
  const framesBefore = useRef(project.frames);

  // The slider fires continuously; the whole dialog session becomes a single undo step on close.
  function close() {
    recordFramesEdit(project.id, framesBefore.current, 'Change hold');
    onClose();
  }

  function commit(value: number) {
    setHold(value);
    if (frameIds && frameIds.length > 1) setFramesHold(project, frameIds, value);
    else setFrameHold(project, frameId, value);
  }

  return (
    <Dialog
      title={frameIds && frameIds.length > 1 ? `Hold (${frameIds.length} frames)` : 'Hold'}
      onCancel={close}
      actions={
        <Button isDefault onClick={close}>
          Done
        </Button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Slider label="Ticks" readout={`${hold}`} value={hold} min={MIN_HOLD} max={MAX_HOLD} onChange={commit} />
        <div style={{ display: 'flex', gap: 6 }}>
          {PRESETS.map((p) => (
            <button key={p} type="button" class={`ab-preset-button${hold === p ? ' ab-preset-button--selected' : ''}`} onClick={() => commit(p)}>
              {p}
            </button>
          ))}
        </div>
      </div>
    </Dialog>
  );
}
