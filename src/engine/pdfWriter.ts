// A minimal PDF 1.4 writer — just enough for the PDF export (§15.2): pages holding flate-compressed RGB
// images plus text (an invisible, selectable text layer over ASCII art, and visible frame numbers).
// Written by hand rather than pulling in a PDF library: the art is always a bitmap, so none of a
// library's font-embedding or drawing machinery is needed. Coordinates are in points with the origin at
// the TOP-left, which is what page layout wants; the writer flips them to PDF's bottom-left.
import { zlibSync } from 'fflate';

export interface PdfImage {
  width: number;
  height: number;
  /** width × height × 3 bytes of RGB, already zlib-compressed (see compressRgb) so a long document never holds raw frames. */
  flate: Uint8Array;
}

/** RGBA pixels (as from getImageData) → the flate-compressed RGB stream a PdfImage carries. Alpha is dropped. */
export function compressRgb(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): PdfImage {
  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0, o = 0; i < width * height * 4; i += 4, o += 3) {
    rgb[o] = rgba[i];
    rgb[o + 1] = rgba[i + 1];
    rgb[o + 2] = rgba[i + 2];
  }
  return { width, height, flate: zlibSync(rgb, { level: 6 }) };
}

export type PdfItem =
  | { kind: 'image'; image: PdfImage; x: number; y: number; w: number; h: number }
  | {
      kind: 'text';
      text: string;
      x: number;
      y: number; // baseline
      size: number;
      font: 'Helvetica' | 'Courier';
      visible: boolean;
      /** Horizontal scaling in percent (Tz), used to make invisible text line up with the picture. */
      hScale?: number;
      gray?: number; // 0 = black … 1 = white (visible text only)
    };

export interface PdfPage {
  width: number;
  height: number;
  items: PdfItem[];
}

const enc = new TextEncoder();

function num(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

/** A PDF literal string, restricted to printable ASCII (anything else becomes a space). */
export function pdfString(s: string): string {
  let out = '(';
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c < 32 || c > 126) out += ' ';
    else if (ch === '(' || ch === ')' || ch === '\\') out += '\\' + ch;
    else out += ch;
  }
  return out + ')';
}

export function buildPdf(pages: PdfPage[], info: { title: string }): Uint8Array {
  const parts: Uint8Array[] = [];
  const offsets: number[] = []; // offsets[objectNumber - 1]
  let length = 0;
  const push = (data: Uint8Array | string) => {
    const bytes = typeof data === 'string' ? enc.encode(data) : data;
    parts.push(bytes);
    length += bytes.length;
  };
  const beginObject = (n: number) => {
    offsets[n - 1] = length;
    push(`${n} 0 obj\n`);
  };
  const endObject = () => push('\nendobj\n');

  // Object numbers: 1 catalog, 2 page tree, 3 Helvetica, 4 Courier, 5 info, then per-image and per-page objects.
  const imageIds = new Map<PdfImage, number>();
  let nextId = 6;
  for (const page of pages) for (const item of page.items) if (item.kind === 'image' && !imageIds.has(item.image)) imageIds.set(item.image, nextId++);
  const pageIds = pages.map(() => {
    const id = nextId;
    nextId += 2; // page + its content stream
    return id;
  });

  push('%PDF-1.4\n%âãÏÓ\n');

  beginObject(1);
  push('<< /Type /Catalog /Pages 2 0 R >>');
  endObject();
  beginObject(2);
  push(`<< /Type /Pages /Count ${pages.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`);
  endObject();
  beginObject(3);
  push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  endObject();
  beginObject(4);
  push('<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>');
  endObject();
  beginObject(5);
  push(`<< /Title ${pdfString(info.title)} /Producer (ascii_buddy) >>`);
  endObject();

  for (const [image, id] of imageIds) {
    const data = image.flate;
    beginObject(id);
    push(`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${data.length} >>\nstream\n`);
    push(data);
    push('\nendstream');
    endObject();
  }

  pages.forEach((page, pi) => {
    const pageId = pageIds[pi];
    const contentId = pageId + 1;
    const xobjects: string[] = [];
    let content = '';
    let imageCount = 0;
    for (const item of page.items) {
      if (item.kind === 'image') {
        const name = `Im${++imageCount}`;
        xobjects.push(`/${name} ${imageIds.get(item.image)} 0 R`);
        content += `q ${num(item.w)} 0 0 ${num(item.h)} ${num(item.x)} ${num(page.height - item.y - item.h)} cm /${name} Do Q\n`;
      } else {
        const font = item.font === 'Courier' ? '/F2' : '/F1';
        content += 'BT\n';
        content += item.visible ? `${num(item.gray ?? 0)} g\n0 Tr\n` : '3 Tr\n';
        content += `${font} ${num(item.size)} Tf\n${num(item.hScale ?? 100)} Tz\n1 0 0 1 ${num(item.x)} ${num(page.height - item.y)} Tm\n${pdfString(item.text)} Tj\nET\n`;
      }
    }
    const contentBytes = enc.encode(content);
    beginObject(pageId);
    push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(page.width)} ${num(page.height)}] /Contents ${contentId} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> /XObject << ${xobjects.join(' ')} >> >> >>`,
    );
    endObject();
    beginObject(contentId);
    push(`<< /Length ${contentBytes.length} >>\nstream\n`);
    push(contentBytes);
    push('\nendstream');
    endObject();
  });

  const xrefOffset = length;
  const total = nextId - 1;
  push(`xref\n0 ${total + 1}\n0000000000 65535 f \n`);
  for (let n = 1; n <= total; n++) push(`${String(offsets[n - 1]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${total + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const MIN_CELL_W = 60;

export const PAGE_SIZES = {
  a4: { width: 595.28, height: 841.89 },
  letter: { width: 612, height: 792 },
} as const;

export interface CellRect {
  x: number;
  y: number;
  w: number;
  h: number;
  labelX: number; // centre of the frame-number label
  labelY: number; // its baseline
}

/** Lays `count` frames of the given aspect ratio out in a grid, page after page. It picks the column count
 * that needs the fewest pages and, among those, gives the frames the most room. Positions are from the top-left. */
export function contactSheetLayout(
  count: number,
  page: { width: number; height: number },
  aspect: number,
  opts: { margin?: number; gap?: number; labelHeight?: number } = {},
): { columns: number; perPage: number; pages: CellRect[][] } {
  const margin = opts.margin ?? 36;
  const gap = opts.gap ?? 10;
  const labelH = opts.labelHeight ?? 14;
  const usableW = page.width - margin * 2;
  const usableH = page.height - margin * 2;
  let best: { columns: number; cellW: number; cellH: number; perPage: number; rowsPerPage: number; pages: number } | null = null;
  for (let columns = 1; columns <= Math.max(1, count); columns++) {
    const cellW = (usableW - gap * (columns - 1)) / columns;
    if (cellW < MIN_CELL_W && columns > 1) break; // keep frames recognisable: go to another page instead
    const cellH = cellW / aspect;
    const rowsPerPage = Math.floor((usableH + gap) / (cellH + labelH + gap));
    if (rowsPerPage < 1) continue;
    const perPage = columns * rowsPerPage;
    const pages = Math.ceil(count / perPage);
    if (!best || pages < best.pages || (pages === best.pages && cellW > best.cellW)) best = { columns, cellW, cellH, perPage, rowsPerPage, pages };
  }
  if (!best) {
    // Frames so wide/tall that even one doesn't fit: shrink a single column to the page.
    const cellH = Math.max(8, usableH - labelH - gap);
    const cellW = Math.min(usableW, cellH * aspect);
    best = { columns: 1, cellW, cellH: cellW / aspect, perPage: 1, rowsPerPage: 1, pages: count };
  }
  const pagesOut: CellRect[][] = [];
  for (let start = 0; start < count; start += best.perPage) {
    const cells: CellRect[] = [];
    for (let k = 0; k < best.perPage && start + k < count; k++) {
      const col = k % best.columns;
      const row = Math.floor(k / best.columns);
      const x = margin + col * (best.cellW + gap);
      const y = margin + row * (best.cellH + labelH + gap);
      cells.push({ x, y, w: best.cellW, h: best.cellH, labelX: x + best.cellW / 2, labelY: y + best.cellH + labelH - 3 });
    }
    pagesOut.push(cells);
  }
  return { columns: best.columns, perPage: best.perPage, pages: pagesOut };
}
