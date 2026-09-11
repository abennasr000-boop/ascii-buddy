// Tool + brush + current-color state. This is ephemeral editor session
// state, not part of the persisted Project — see DECISIONS.md ("current
// color / brush sizes are not in the §17 data model, so they don't
// survive a reload").
import { signal } from '@preact/signals';
import type { TipShape } from '../engine/rasterCel';

export type ToolName = 'pen' | 'eraser' | 'fill' | 'eyedropper' | 'select';

export const currentTool = signal<ToolName>('pen');

export const penSize = signal(4);
export const penTip = signal<TipShape>('round');
export const eraserSize = signal(16);
export const eraserTip = signal<TipShape>('round');

export const SIZE_PRESETS = [1, 2, 4, 8, 16, 32];
export const SIZE_MIN = 1;
export const SIZE_MAX = 128;

export function activeSize(): number {
  return currentTool.value === 'eraser' ? eraserSize.value : penSize.value;
}

export function setActiveSize(size: number) {
  const clamped = Math.max(SIZE_MIN, Math.min(SIZE_MAX, Math.round(size)));
  if (currentTool.value === 'eraser') eraserSize.value = clamped;
  else penSize.value = clamped;
}

export function activeTip(): TipShape {
  return currentTool.value === 'eraser' ? eraserTip.value : penTip.value;
}

export function setActiveTip(tip: TipShape) {
  if (currentTool.value === 'eraser') eraserTip.value = tip;
  else penTip.value = tip;
}

export const currentColor = signal<string>('#000000');
export const recentColors = signal<string[]>([]);

export function useColor(hex: string) {
  currentColor.value = hex;
  const upper = hex.toUpperCase();
  recentColors.value = [upper, ...recentColors.value.filter((c) => c !== upper)].slice(0, 8);
}
