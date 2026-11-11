// Opens the import dialog from anywhere (File menu, toolbar, drag-and-drop).
import { signal } from '@preact/signals';

export type ImportRequest = { kind: 'images'; files: File[] } | { kind: 'video'; file: File };

export const importRequest = signal<ImportRequest | null>(null);

export function isVideoFile(file: File): boolean {
  return file.type.startsWith('video/') || /\.(mov|mp4|m4v|webm)$/i.test(file.name);
}
