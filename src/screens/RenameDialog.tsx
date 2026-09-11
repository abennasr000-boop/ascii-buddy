import { useState } from 'preact/hooks';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';

export function RenameDialog({
  initialName,
  onRename,
  onCancel,
}: {
  initialName: string;
  onRename: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const submit = () => {
    if (name.trim()) onRename(name.trim());
  };
  return (
    <Dialog
      title="Rename project"
      onCancel={onCancel}
      actions={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button isDefault onClick={submit}>
            Rename
          </Button>
        </>
      }
    >
      <input
        class="ab-input"
        type="text"
        value={name}
        autofocus
        onInput={(e) => setName((e.target as HTMLInputElement).value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
    </Dialog>
  );
}
