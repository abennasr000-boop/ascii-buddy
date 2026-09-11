import type { ComponentChildren } from 'preact';
import { useEffect } from 'preact/hooks';
import { Window } from './Window';
import { Button } from './Button';

export function Dialog({
  title,
  children,
  actions,
  onCancel,
}: {
  title: string;
  children: ComponentChildren;
  actions: ComponentChildren;
  onCancel?: () => void;
}) {
  useEffect(() => {
    if (!onCancel) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCancel]);

  return (
    <div class="ab-modal-overlay" onClick={(e) => e.target === e.currentTarget && onCancel?.()}>
      <Window title={title} onClose={onCancel} style={{ width: 'min(440px, 100%)' }}>
        <div class="ab-dialog">
          <div class="ab-dialog__body">{children}</div>
          <div class="ab-dialog__actions">{actions}</div>
        </div>
      </Window>
    </div>
  );
}

/** Mac-style confirmation alert, e.g. "Delete 'Walk cycle'? This can't be undone." */
export function Alert({
  message,
  detail,
  confirmLabel = 'OK',
  cancelLabel = 'Cancel',
  destructive,
  onConfirm,
  onCancel,
}: {
  message: string;
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
}) {
  return (
    <Dialog
      title="ascii_buddy<3"
      onCancel={onCancel}
      actions={
        <>
          {onCancel ? <Button onClick={onCancel}>{cancelLabel}</Button> : null}
          <Button
            isDefault
            onClick={() => {
              onConfirm();
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p style={{ margin: 0, fontWeight: destructive ? 'bold' : 'normal' }}>{message}</p>
      {detail ? <p style={{ margin: 0, opacity: 0.8 }}>{detail}</p> : null}
    </Dialog>
  );
}
