// Thin grid-cell boundary lines over the raster view. See ASCII_BUDDY_SPEC.md
// §11. Approximated as low-opacity solid lines rather than literally dotted
// (see DECISIONS.md) — pure CSS, so it scales for free with the stage's own
// pan/zoom transform.
export function GridOverlay({ columns, rows, canvasWidth, canvasHeight }: { columns: number; rows: number; canvasWidth: number; canvasHeight: number }) {
  const cellW = canvasWidth / columns;
  const cellH = canvasHeight / rows;
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        backgroundImage:
          `repeating-linear-gradient(to right, rgba(0,0,0,0.35) 0, rgba(0,0,0,0.35) 1px, transparent 1px, transparent ${cellW}px),` +
          `repeating-linear-gradient(to bottom, rgba(0,0,0,0.35) 0, rgba(0,0,0,0.35) 1px, transparent 1px, transparent ${cellH}px)`,
      }}
    />
  );
}
