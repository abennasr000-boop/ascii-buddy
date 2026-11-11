// The app's icons: hand-drawn 16×16 pixel bitmaps (iconBitmaps.ts), drawn as inline SVG with hard edges
// (ASCII_BUDDY_SPEC.md §12.1). They are always drawn at a whole-number multiple of 16 px — 16 (1×) inline,
// 32 (2×) on buttons — so every icon pixel is an exact block of screen pixels and never blurs.
import type { JSX } from 'preact';
import { ICON_BITMAPS, ICON_SIZE } from './iconBitmaps';

export type IconName = keyof typeof ICON_BITMAPS;

/** Merges each icon's pixels into horizontal runs, so an icon is a few dozen rects rather than hundreds. */
function runsFor(name: string): Array<{ x: number; y: number; w: number }> {
  const runs: Array<{ x: number; y: number; w: number }> = [];
  ICON_BITMAPS[name].forEach((row, y) => {
    let start = -1;
    for (let x = 0; x <= ICON_SIZE; x++) {
      const on = x < ICON_SIZE && row[x] === '#';
      if (on && start === -1) start = x;
      if (!on && start !== -1) {
        runs.push({ x: start, y, w: x - start });
        start = -1;
      }
    }
  });
  return runs;
}

const runCache = new Map<string, Array<{ x: number; y: number; w: number }>>();

/** `size` is snapped to a whole multiple of 16 px (anything under 24 draws at 16, otherwise 32, 48, …). */
export function Icon({ name, size = 32, title }: { name: IconName; size?: number; title?: string }) {
  let runs = runCache.get(name);
  if (!runs) {
    runs = runsFor(name);
    runCache.set(name, runs);
  }
  const px = ICON_SIZE * Math.max(1, Math.round(size / ICON_SIZE - 0.25));
  const rects: JSX.Element[] = runs.map((r) => <rect key={`${r.y}-${r.x}`} x={r.x} y={r.y} width={r.w} height={1} />);
  return (
    <svg
      viewBox={`0 0 ${ICON_SIZE} ${ICON_SIZE}`}
      width={px}
      height={px}
      shape-rendering="crispEdges"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      class="ab-icon"
    >
      {title ? <title>{title}</title> : null}
      <g fill="currentColor">{rects}</g>
    </svg>
  );
}
