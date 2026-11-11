// A one-field text prompt (rename / name a new palette). Enter confirms, Esc cancels.
import { useState } from 'preact/hooks';
import { Dialog } from './Dialog';
import { Button } from './Button';

export function PromptDialog({
  title,
  label,
  initial = '',
  confirmLabel = 'OK',
  onSubmit,
  onCancel,
}: {
  title: string;
  label: string;
  initial?: string;
  confirmLabel?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const submit = () => value.trim() && onSubmit(value.trim());
  return (
    <Dialog
      title={title}
      onCancel={onCancel}
      actions={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button isDefault onClick={submit} disabled={!value.trim()}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div class="ab-field">
        <span class="ab-field__label">{label}</span>
        <input
          class="ab-input"
          type="text"
          value={value}
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          onInput={(e) => setValue((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
        />
      </div>
    </Dialog>
  );
}
