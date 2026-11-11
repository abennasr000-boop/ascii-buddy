// Per-grid-cell statistics computed from an indexed cel buffer. See
// ASCII_BUDDY_SPEC.md §5.2. Pure, framework-free — shared by the on-screen
// ASCII view and every future export format.
//
// Coverage and dominant color depend only on the pixel buffer and the grid
// geometry (columns/rows), not on threshold/density/ramp — so these stats
// are computed once and reused across every conversion-setting change; only
// a columns change or a cel edit invalidates them.

/** Sub-grid used for shape matching (§5.2): S columns × 2S rows of coverage bins inside every grid cell. */
export const BIN_S = 6;
export const BIN_COLS = BIN_S;
export const BIN_ROWS = BIN_S * 2;
export const BIN_COUNT = BIN_COLS * BIN_ROWS;

export interface GridStats {
  columns: number;
  rows: number;
  /** Per-grid-cell sub-grid coverage, BIN_COUNT bytes per cell (0..255 = 0..100% of the bin inked).
   * Only computed when a shape-matching style needs it — absent/null otherwise. */
  bins?: Uint8Array | null;
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
const binScratch = new Int32Array(BIN_COUNT);

/** Writes one cell's quantised bins (from `binScratch`) into `out` at `offset`, then clears the scratch. */
function flushBins(out: Uint8Array, offset: number, cellPixels: number) {
  const binArea = Math.max(1, cellPixels / BIN_COUNT);
  for (let b = 0; b < BIN_COUNT; b++) {
    const v = binScratch[b];
    out[offset + b] = v === 0 ? 0 : Math.min(255, Math.round((v / binArea) * 255));
    binScratch[b] = 0;
  }
}

function computeOneCell(
  buf: Uint8Array,
  celWidth: number,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  collectBins = false,
): { coverage: number; dominant: number } {
  touched.length = 0;
  let ink = 0;
  const cw = x1 - x0;
  const ch = y1 - y0;
  for (let y = y0; y < y1; y++) {
    const rowOffset = y * celWidth;
    const by = collectBins ? Math.min(BIN_ROWS - 1, Math.floor(((y - y0) * BIN_ROWS) / ch)) * BIN_COLS : 0;
    for (let x = x0; x < x1; x++) {
      const v = buf[rowOffset + x];
      if (v !== 0) {
        ink++;
        if (scratch[v] === 0) touched.push(v);
        scratch[v]++;
        if (collectBins) binScratch[by + Math.min(BIN_COLS - 1, Math.floor(((x - x0) * BIN_COLS) / cw))]++;
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
  withBins = false,
): GridStats {
  const coverage = new Float32Array(columns * rows);
  const dominantColor = new Uint8Array(columns * rows);
  const bins = withBins ? new Uint8Array(columns * rows * BIN_COUNT) : null;
  for (let row = 0; row < rows; row++) {
    const [y0, y1] = cellPixelRangeY(row, rows, celHeight);
    for (let col = 0; col < columns; col++) {
      const [x0, x1] = cellPixelRangeX(col, columns, celWidth);
      const { coverage: cov, dominant } = computeOneCell(buf, celWidth, x0, x1, y0, y1, withBins);
      const idx = row * columns + col;
      coverage[idx] = cov;
      dominantColor[idx] = dominant;
      if (bins) flushBins(bins, idx * BIN_COUNT, (x1 - x0) * (y1 - y0));
    }
  }
  return { columns, rows, coverage, dominantColor, bins };
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
      const { coverage, dominant } = computeOneCell(buf, celWidth, x0, x1, y0, y1, !!stats.bins);
      const idx = row * columns + col;
      stats.coverage[idx] = coverage;
      stats.dominantColor[idx] = dominant;
      if (stats.bins) flushBins(stats.bins, idx * BIN_COUNT, (x1 - x0) * (y1 - y0));
    }
  }
}
