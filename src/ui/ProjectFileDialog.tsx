// "Export project file": builds the `.buddy` backup, then hands it over for sharing or download (§14.2).
import { useEffect, useState } from 'preact/hooks';
import { Dialog } from './Dialog';
import { Button } from './Button';
import { DeliverPanel } from './DeliverPanel';
import { buildProjectFile, type ProjectFileResult } from '../state/projectFileActions';

export function ProjectFileDialog({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [status, setStatus] = useState('Preparing…');
  const [result, setResult] = useState<ProjectFileResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    buildProjectFile(projectId, (message) => !cancelled && setStatus(message))
      .then((r) => !cancelled && setResult(r))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : String(err)));
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return (
    <Dialog title="Export project file" onCancel={onClose} actions={<Button isDefault={!!result || !!error} onClick={onClose}>{result || error ? 'Done' : 'Cancel'}</Button>}>
      {error ? (
        <p style={{ margin: 0 }}>⚠ The project file couldn't be created: {error}</p>
      ) : result ? (
        <>
          <DeliverPanel blob={result.blob} filename={result.filename} />
          <p style={{ margin: 0, fontSize: 11, opacity: 0.75 }}>A .buddy file holds the whole project — drawings, references and settings. Keep it somewhere safe; it's your backup.</p>
        </>
      ) : (
        <span>{status}</span>
      )}
    </Dialog>
  );
}
