import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';

const APP_VERSION = '0.1.0';

export function AboutDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="About ascii_buddy<3" onCancel={onClose} actions={<Button isDefault onClick={onClose}>OK</Button>}>
      <p style={{ margin: 0, fontSize: 16 }}>ascii_buddy&lt;3</p>
      <p style={{ margin: 0, opacity: 0.8 }}>Version {APP_VERSION}</p>
      <p style={{ margin: 0 }}>
        A retro drawing and frame-by-frame animation tool that turns freehand drawings into ASCII art.
      </p>
      <p style={{ margin: 0, opacity: 0.8 }}>
        No accounts, no server, no analytics, and no network requests after the page loads.
      </p>
      <div class="ab-field">
        <span class="ab-field__label">Fonts</span>
        <p style={{ margin: 0, opacity: 0.8 }}>
          Departure Mono by Helena Zhang, licensed under the SIL Open Font License 1.1.
        </p>
      </div>
    </Dialog>
  );
}
