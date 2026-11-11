// The "your file is ready" step shared by every export: Share… (the system share sheet, where the device
// has one) and Download. It is a separate step, after the file exists, because the share sheet only opens
// from a fresh tap — a long render in between would have used up the tap that started it (§15.1).
import { useState } from 'preact/hooks';
import { Button } from './Button';
import { canShareFile, downloadBlob, formatFileSize, makeFile, shareFile } from '../export/deliver';

export function DeliverPanel({ blob, filename, note }: { blob: Blob; filename: string; note?: string }) {
  const file = makeFile(blob, filename);
  const [message, setMessage] = useState<string | null>(null);
  const shareable = canShareFile(file);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontWeight: 'bold' }}>Ready.</span>
        <span style={{ wordBreak: 'break-all' }}>{filename}</span>
        <span style={{ opacity: 0.7 }}>{formatFileSize(blob.size)}</span>
        {note ? <span style={{ fontSize: 11, opacity: 0.8 }}>{note}</span> : null}
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {shareable ? (
          <Button
            isDefault
            onClick={() => {
              shareFile(file, filename)
                .then((shared) => setMessage(shared ? 'Shared.' : null))
                .catch(() => setMessage("The share sheet couldn't open. Use Download instead."));
            }}
          >
            Share…
          </Button>
        ) : null}
        <Button
          isDefault={!shareable}
          onClick={() => {
            downloadBlob(blob, filename);
            setMessage('Download started.');
          }}
        >
          Download
        </Button>
      </div>
      {message ? <span style={{ fontSize: 11 }}>{message}</span> : null}
    </div>
  );
}
