// Original 16×16 pixel-art icons, rendered as inline SVG at 2× with hard
// edges (ASCII_BUDDY_SPEC.md §12.1). Bitmaps are built from small geometric
// rules rather than typed out by hand, so shapes stay legible and consistent.
import type { JSX } from 'preact';

const N = 16;

function grid(fn: (x: number, y: number) => boolean): boolean[][] {
  const rows: boolean[][] = [];
  for (let y = 0; y < N; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < N; x++) row.push(fn(x, y));
    rows.push(row);
  }
  return rows;
}

function or(...grids: boolean[][][]): boolean[][] {
  return grids[0].map((row, y) => row.map((_, x) => grids.some((g) => g[y][x])));
}

function rectOutline(x0: number, y0: number, x1: number, y1: number): boolean[][] {
  return grid((x, y) => (x >= x0 && x <= x1 && (y === y0 || y === y1)) || (y >= y0 && y <= y1 && (x === x0 || x === x1)));
}

function rectFill(x0: number, y0: number, x1: number, y1: number): boolean[][] {
  return grid((x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1);
}

function ring(cx: number, cy: number, r: number, thickness = 1): boolean[][] {
  return grid((x, y) => {
    const d = Math.hypot(x - cx, y - cy);
    return d >= r - thickness && d <= r;
  });
}

function cross(cx: number, cy: number, armLen: number, thickness: number): boolean[][] {
  const half = Math.floor(thickness / 2);
  return grid(
    (x, y) =>
      (Math.abs(x - cx) <= half && Math.abs(y - cy) <= armLen) ||
      (Math.abs(y - cy) <= half && Math.abs(x - cx) <= armLen),
  );
}

const ICONS: Record<string, boolean[][]> = {
  plus: cross(7, 7, 5, 2),

  duplicate: or(rectOutline(2, 2, 11, 11), rectOutline(5, 5, 14, 14)),

  pencil: or(
    grid((x, y) => x + y >= 10 && x + y <= 12 && x <= 13 && y <= 11),
    grid((x, y) => x === 14 && y === 12),
    grid((x, y) => x === 13 && y === 13),
  ),

  trash: or(
    rectFill(4, 2, 11, 3),
    rectOutline(3, 4, 12, 14),
    grid((x, y) => (x === 6 || x === 8 || x === 10) && y >= 6 && y <= 12),
  ),

  gear: or(
    ring(8, 8, 5, 2),
    grid((x, y) => {
      const d = Math.hypot(x - 8, y - 8);
      if (d < 6 || d > 8) return false;
      const angle = (Math.atan2(y - 8, x - 8) * 180) / Math.PI;
      const norm = ((angle % 45) + 45) % 45;
      return norm < 12;
    }),
    grid((x, y) => Math.hypot(x - 8, y - 8) <= 1.5),
  ),

  info: or(
    ring(8, 8, 7, 1),
    rectFill(7, 4, 8, 5),
    rectFill(7, 7, 8, 11),
  ),

  close: or(diagonalX(1), diagonalX(1, true)),

  check: grid((x, y) => (x - 3 === y - 9 && x >= 3 && x <= 6) || (x - 12 === 9 - y && x >= 7 && x <= 12)),

  pen: or(
    grid((x, y) => x + y >= 9 && x + y <= 10 && x >= 3 && x <= 12 && y >= 3 && y <= 11),
    grid((x, y) => x === 13 && y === 12),
    grid((x, y) => x === 12 && y === 13),
  ),

  eraser: or(rectOutline(3, 5, 12, 12), rectFill(3, 9, 12, 12)),

  fill: or(
    rectOutline(4, 7, 11, 13),
    grid((x, y) => y === 6 && x >= 7 && x <= 12),
    grid((x, y) => x === 12 && (y === 5 || y === 4)),
  ),

  eyedropper: or(
    grid((x, y) => x + y >= 9 && x + y <= 10 && x >= 3 && x <= 11 && y >= 3 && y <= 10),
    ring(11, 3, 2, 1),
  ),

  select: rectOutline(2, 2, 13, 13),

  chevronDown: grid((x, y) => Math.abs(x - 8) + Math.abs(y - 6) <= 3 && y >= 5 && y <= 9 && x - 8 <= y - 5 && 8 - x <= y - 5),
};

function diagonalX(thickness: number, flip = false): boolean[][] {
  return grid((x, y) => {
    const yy = flip ? 15 - y : y;
    return Math.abs(x - yy) <= thickness && x >= 3 && x <= 12 && y >= 3 && y <= 12;
  });
}

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 32, title }: { name: IconName; size?: number; title?: string }) {
  const bits = ICONS[name];
  const rects: JSX.Element[] = [];
  bits.forEach((row, y) => {
    let runStart = -1;
    for (let x = 0; x <= N; x++) {
      const on = x < N && row[x];
      if (on && runStart === -1) runStart = x;
      if (!on && runStart !== -1) {
        rects.push(<rect key={`${y}-${runStart}`} x={runStart} y={y} width={x - runStart} height={1} />);
        runStart = -1;
      }
    }
  });
  return (
    <svg
      viewBox={`0 0 ${N} ${N}`}
      width={size}
      height={size}
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
