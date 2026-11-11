// Edit/File → "Copy frame as text": puts the current frame's ASCII on the clipboard in one go.
import type { Project } from '../types/model';
import { flush } from '../state/autosave';
import { defaultExportOptions } from './options';
import { runExport } from './exporters';

/** True when the text was copied. False means the browser refused (no clipboard access from a menu tap, say) — the caller falls back to the dialog. */
export async function copyFrameAsText(project: Project): Promise<boolean> {
  try {
    await flush();
    const out = await runExport(project, defaultExportOptions('copy', project.frames.length), { signal: new AbortController().signal, onProgress: () => undefined });
    if (out.kind !== 'text') return false;
    await navigator.clipboard.writeText(out.text);
    return true;
  } catch {
    return false;
  }
}
