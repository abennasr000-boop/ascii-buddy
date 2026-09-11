// Per-grid-cell statistics computed from an indexed cel buffer. See
// ASCII_BUDDY_SPEC.md §5.2. Pure, framework-free — shared by the on-screen
// ASCII view and every future export format.
//
// Coverage and dominant color depend only on the pixel buffer and the grid
// geometry (columns/rows), not on threshold/density/ramp — so these stats
// are computed once and reused across every conversion-setting change; only
// a columns change or a cel edit invalidates them.

export interface GridStats {
  columns: number;
  rows: number;
  /** Fraction of each grid cell's pixels that are ink (non-transparent), 0..1. */
  coverage: Float32Array; // length columns*rows, row-major
  /** Dominant color table index per grid cell (0 = none/unused when coverage is 0). */
  dominantColor: Uint8Array; // length columns*rows, row-major
}

export interface PixelBBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

function cellPixelRangeX(col: number, columns: number, celWidth: number): [number, number] {
  const cellW = celWidth / columns;
  const x0 = Math.floor(col * cellW);
  const x1 = col === columns - 1 ? celWidth : Math.floor((col + 1) * cellW);
  return [x0, x1];
}

function cellPixelRangeY(row: number, rows: number, celHeight: number): [number, number] {
  const cellH = celHeight / rows;
  const y0 = Math.floor(row * cellH);
  const y1 = row === rows - 1 ? celHeight : Math.floor((row + 1) * cellH);
  return [y0, y1];
}

// Reused scratch buffer for per-cell color tallies, avoiding an allocation per cell.
const scratch = new Int32Array(256);
const touched: number[] = [];

function computeOneCell(
  buf: Uint8Array,
  celWidth: number,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
): { coverage: number; dominant: number } {
  touched.length = 0;
  let ink = 0;
  for (let y = y0; y < y1; y++) {
    const rowOffset = y * celWidth;
    for (let x = x0; x < x1; x++) {
      const v = buf[rowOffset + x];
      if (v !== 0) {
        ink++;
        if (scratch[v] === 0) touched.push(v);
        scratch[v]++;
      }
    }
  }
  const cellPixels = (x1 - x0) * (y1 - y0);
  let dominant = 0;
  if (touched.length > 0) {
    let best = touched[0];
    let bestCount = scratch[best];
    for (const c of touched) {
      const count = scratch[c];
      if (count > bestCount || (count === bestCount && c < best)) {
        best = c;
        bestCount = count;
      }
    }
    dominant = best;
    for (const c of touched) scratch[c] = 0; // reset for next cell
  }
  return { coverage: cellPixels > 0 ? ink / cellPixels : 0, dominant };
}

export function computeFullGridStats(
  buf: Uint8Array,
  celWidth: number,
  celHeight: number,
  columns: number,
  rows: number,
): GridStats {
  const coverage = new Float32Array(columns * rows);
  const dominantColor = new Uint8Array(columns * rows);
  for (let row = 0; row < rows; row++) {
    const [y0, y1] = cellPixelRangeY(row, rows, celHeight);
    for (let col = 0; col < columns; col++) {
      const [x0, x1] = cellPixelRangeX(col, columns, celWidth);
      const { coverage: cov, dominant } = computeOneCell(buf, celWidth, x0, x1, y0, y1);
      const idx = row * columns + col;
      coverage[idx] = cov;
      dominantColor[idx] = dominant;
    }
  }
  return { columns, rows, coverage, dominantColor };
}

/** Recomputes just the grid cells overlapping `dirty` (a pixel-space bbox from a stroke), in place. */
export function recomputeGridStatsRegion(
  stats: GridStats,
  buf: Uint8Array,
  celWidth: number,
  celHeight: number,
  dirty: PixelBBox,
): void {
  const { columns, rows } = stats;
  const cellW = celWidth / columns;
  const cellH = celHeight / rows;
  const colStart = Math.max(0, Math.floor(dirty.x / cellW));
  const colEnd = Math.min(columns - 1, Math.floor((dirty.x + dirty.w - 1) / cellW));
  const rowStart = Math.max(0, Math.floor(dirty.y / cellH));
  const rowEnd = Math.min(rows - 1, Math.floor((dirty.y + dirty.h - 1) / cellH));

  for (let row = rowStart; row <= rowEnd; row++) {
    const [y0, y1] = cellPixelRangeY(row, rows, celHeight);
    for (let col = colStart; col <= colEnd; col++) {
      const [x0, x1] = cellPixelRangeX(col, columns, celWidth);
      const { coverage, dominant } = computeOneCell(buf, celWidth, x0, x1, y0, y1);
      const idx = row * columns + col;
      stats.coverage[idx] = coverage;
      stats.dominantColor[idx] = dominant;
    }
  }
}
