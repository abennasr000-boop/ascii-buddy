import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { appSettings, updateAppSettings } from '../state/appSettings';

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function Row({ label, children }: { label: string; children: ComponentChildren }) {
  return (
    <div class="ab-settings-row">
      <span>{label}</span>
      {children}
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Row label={label}>
      <input
        type="checkbox"
        class="ab-checkbox"
        checked={checked}
        onChange={(e) => onChange((e.target as HTMLInputElement).checked)}
      />
    </Row>
  );
}

export function AppSettingsDialog({ onClose, onAbout }: { onClose: () => void; onAbout: () => void }) {
  const s = appSettings.value;
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);

  useEffect(() => {
    navigator.storage?.estimate?.().then((e) => setUsage({ usage: e.usage ?? 0, quota: e.quota ?? 0 }));
    navigator.storage?.persisted?.().then(setPersisted);
  }, []);

  const requestPersistence = async () => {
    const ok = await navigator.storage?.persist?.();
    setPersisted(ok ?? null);
  };

  return (
    <Dialog title="App settings" onCancel={onClose} actions={<Button isDefault onClick={onClose}>Done</Button>}>
      <ToggleRow
        label="Draw with finger"
        checked={s.drawWithFinger}
        onChange={(v) => updateAppSettings({ drawWithFinger: v })}
      />
      <ToggleRow
        label="Left-handed layout"
        checked={s.leftHanded}
        onChange={(v) => updateAppSettings({ leftHanded: v })}
      />
      <ToggleRow
        label="Canvas rotation gesture"
        checked={s.canvasRotation}
        onChange={(v) => updateAppSettings({ canvasRotation: v })}
      />
      <ToggleRow
        label="Two-finger tap undo / three-finger tap redo"
        checked={s.tapGestures}
        onChange={(v) => updateAppSettings({ tapGestures: v })}
      />
      <ToggleRow
        label="Hide references during playback"
        checked={s.hideReferencesDuringPlayback}
        onChange={(v) => updateAppSettings({ hideReferencesDuringPlayback: v })}
      />
      <Row label="Autosave delay">
        <span>{(s.autosaveDelayMs / 1000).toFixed(1)} s</span>
      </Row>
      <Row label="Storage used">
        <span>{usage ? `${formatBytes(usage.usage)} of ${formatBytes(usage.quota)}` : '—'}</span>
      </Row>
      <Row label="Persistent storage">
        {persisted ? (
          <span>Granted</span>
        ) : (
          <Button onClick={requestPersistence}>Request</Button>
        )}
      </Row>
      <Row label="About and licenses">
        <Button onClick={onAbout}>About</Button>
      </Row>
    </Dialog>
  );
}
