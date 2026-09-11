import { signal } from '@preact/signals';
import type { AppSettings } from '../types/model';
import { defaultAppSettings } from '../model/defaults';
import { getAppSettings, putAppSettings } from '../db/db';

export const appSettings = signal<AppSettings>(defaultAppSettings());

export async function loadAppSettings() {
  try {
    appSettings.value = await getAppSettings();
  } catch {
    // Storage unavailable (e.g. file://): keep defaults. state/projects.ts's
    // loadProjects() is what surfaces the storageError banner to the user.
  }
}

export async function updateAppSettings(patch: Partial<AppSettings>) {
  const next = { ...appSettings.value, ...patch };
  appSettings.value = next;
  try {
    await putAppSettings(next);
  } catch {
    // Not persisted this session; see loadAppSettings() above.
  }
}
