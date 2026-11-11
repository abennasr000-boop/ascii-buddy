// Runs an export: renders the chosen frames at the chosen size and encodes them in the chosen format.
// See ASCII_BUDDY_SPEC.md §15. Runs on the main thread in small awaited steps (yielding between frames,
// so the progress bar moves and Cancel works) rather than in a worker — canvas text rendering and the
// WebCodecs encoder are the parts that don't move to a worker reliably on iPad Safari.
import { zipSync, type Zippable } from 'fflate';
import { GIFEncoder } from 'gifenc';
import type { AsciiFrame, Project } from '../types/model';
import {
  exportFileName,
  expandHolds,
  gifDelaysCs,
  outputSize,
  pad,
  safeFileBase,
  selectFrameIndices,
  sizeProblem,
  spriteSheetLayout,
  videoTimeline,
  type PixelSize,
} from '../engine/exportPlan';
import { indexFrame } from '../engine/gifPalette';
import { frameToText, framesToText } from '../engine/textExport';
import { buildHtmlPlayer } from '../engine/htmlPlayer';
import { framesToAnsi } from '../engine/ansiExport';
import { frameToSvg } from '../engine/svgExport';
import { buildPdf, compressRgb, contactSheetLayout, PAGE_SIZES, type PdfItem, type PdfPage } from '../engine/pdfWriter';
import { fontFamilyFor } from '../canvas/glyphRender';
import { ensureFontReady } from '../canvas/glyphAtlas';
import { createFrameLoader, type ArtFrame, type FrameLoader } from './frameLoader';
import { createFrameRenderer } from './frameRenderer';
import { ExportProblem, checkAbort, needsFor, yieldToUi, type Ctx, type ExportHooks, type ExportOutput } from './context';
import { effectiveOptions, formatInfo, type ExportOptions } from './options';
import departureMonoFont from '../assets/fonts/DepartureMono-Regular.woff2?inline';
import jetbrainsMonoFont from '../assets/fonts/JetBrainsMono-Regular-latin.woff2?inline';

function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png'): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new ExportProblem('The image could not be created. Try a smaller size.'))), type);
  });
}

async function blobBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

function zipBlob(files: Zippable): Blob {
  return new Blob([zipSync(files) as BlobPart], { type: 'application/zip' });
}

function toBlobPart(bytes: Uint8Array): BlobPart {
  return bytes as unknown as BlobPart;
}

/** Walks the chosen frames: loads each one, hands it on, frees it, reports progress and honours Cancel. */
async function forEachFrame(
  project: Project,
  indices: number[],
  needs: { ascii: boolean; raster: boolean },
  hooks: ExportHooks,
  fn: (art: ArtFrame, position: number) => Promise<void> | void,
  loader?: FrameLoader,
): Promise<void> {
  const own = !loader;
  const l = loader ?? createFrameLoader(project);
  try {
    for (let pos = 0; pos < indices.length; pos++) {
      checkAbort(hooks);
      const art = await l.load(indices[pos], needs);
      try {
        await fn(art, pos);
      } finally {
        art.release();
      }
      hooks.onProgress(pos + 1, indices.length);
      await yieldToUi();
    }
  } finally {
    if (own) l.dispose();
  }
}

export async function runExport(project: Project, rawOptions: ExportOptions, hooks: ExportHooks): Promise<ExportOutput> {
  const opts = effectiveOptions(rawOptions);
  const info = formatInfo(opts.format);
  const currentIndex = Math.max(0, project.frames.findIndex((f) => f.id === project.ui.currentFrameId));
  const indices = selectFrameIndices(project.frames.length, opts.frames, currentIndex, opts.from, opts.to);
  if (indices.length === 0) throw new ExportProblem('There are no frames to export.');
  const durations = indices.map((i) => project.frames[i].duration);
  const size = outputSize(project.canvas.width, project.canvas.height, opts.size, opts.format === 'mp4');
  if (info.sizeChoice) {
    const problem = sizeProblem(size);
    if (problem) throw new ExportProblem(problem);
  }
  const single = indices.length === 1 ? indices[0] + 1 : undefined;
  const name = (ext: string) => exportFileName(project.name, opts.content, ext, single);
  const ctx: Ctx = { project, opts, indices, durations, size, hooks, name };

  switch (opts.format) {
    case 'png':
      return exportPng(ctx);
    case 'png-seq':
      return exportPngSequence(ctx);
    case 'gif':
      return exportGif(ctx);
    case 'mp4':
      return exportMp4(ctx);
    case 'pdf':
      return exportPdf(ctx);
    case 'txt':
      return exportTxt(ctx);
    case 'copy':
      return exportCopy(ctx);
    case 'html':
      return exportHtml(ctx);
    case 'sprite':
      return exportSprite(ctx);
    case 'ansi':
      return exportAnsi(ctx);
    case 'svg':
      return exportSvg(ctx);
  }
}

// ---------------------------------------------------------------- PNG

async function exportPng({ project, opts, indices, size, hooks, name }: Ctx): Promise<ExportOutput> {
  const renderer = await createFrameRenderer(project, opts.content, size, opts.transparent);
  try {
    await forEachFrame(project, indices, needsFor(opts), hooks, (art) => renderer.render(art));
    return { kind: 'file', blob: await canvasToBlob(renderer.canvas), filename: name('png') };
  } finally {
    renderer.dispose();
  }
}

async function exportPngSequence({ project, opts, indices, durations, size, hooks }: Ctx): Promise<ExportOutput> {
  const renderer = await createFrameRenderer(project, opts.content, size, opts.transparent);
  const base = safeFileBase(project.name);
  const files: Zippable = {};
  const frameBytes: Uint8Array[] = [];
  try {
    await forEachFrame(project, indices, needsFor(opts), hooks, async (art) => {
      renderer.render(art);
      frameBytes.push(await blobBytes(await canvasToBlob(renderer.canvas)));
    });
  } finally {
    renderer.dispose();
  }
  // "Repeat held frames as duplicate files, or one file per frame."
  const sequence = opts.repeatHeldFrames ? expandHolds(frameBytes, durations) : frameBytes;
  sequence.forEach((bytes, i) => {
    files[`${base}_${pad(i + 1)}.png`] = [bytes, { level: 0 }]; // PNG is already compressed
  });
  return { kind: 'file', blob: zipBlob(files), filename: exportFileName(project.name, opts.content, 'zip') };
}

// ---------------------------------------------------------------- GIF

async function exportGif({ project, opts, indices, durations, size, hooks, name }: Ctx): Promise<ExportOutput> {
  const renderer = await createFrameRenderer(project, opts.content, size, opts.transparent);
  const delays = gifDelaysCs(durations, project.fps);
  const gif = GIFEncoder();
  const rctx = renderer.canvas.getContext('2d', { willReadFrequently: true })!;
  try {
    await forEachFrame(project, indices, needsFor(opts), hooks, (art, pos) => {
      renderer.render(art);
      const { data } = rctx.getImageData(0, 0, size.width, size.height);
      const f = indexFrame(data, size.width, size.height, opts.transparent);
      gif.writeFrame(f.index, size.width, size.height, {
        palette: f.palette,
        delay: delays[pos] * 10,
        transparent: f.transparentIndex !== undefined,
        transparentIndex: f.transparentIndex ?? 0,
        // Transparent frames must each clear to the background, or the previous frame shows through the holes.
        dispose: opts.transparent ? 2 : -1,
        repeat: opts.gifLoop === 'once' ? -1 : 0,
      });
    });
  } finally {
    renderer.dispose();
  }
  gif.finish();
  return { kind: 'file', blob: new Blob([toBlobPart(gif.bytes())], { type: 'image/gif' }), filename: name('gif') };
}

// ---------------------------------------------------------------- MP4

async function exportMp4(c: Ctx): Promise<ExportOutput> {
  const { opts, size } = c;
  // Loaded on demand: the video library is large and only MP4 export needs it.
  const mp4 = await import('./mp4');
  if (await mp4.canEncodeAvc(size.width, size.height, opts.mp4Quality)) return mp4.encodeMp4(c);
  if (typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function') return recordVideo(c);
  throw new ExportProblem("This browser can't encode MP4 video at this size. Try a smaller size, or GIF, which works everywhere.");
}

/** Fallback when WebCodecs can't do H.264: record a canvas with MediaRecorder. It runs in real time, so a
 * long animation takes as long to export as it does to play. */
async function recordVideo({ project, opts, indices, durations, size, hooks, name }: Ctx): Promise<ExportOutput> {
  const candidates = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  const mimeType = candidates.find((m) => MediaRecorder.isTypeSupported(m));
  if (!mimeType) throw new ExportProblem("This browser can't record video. Try GIF instead — it works everywhere.");
  const renderer = await createFrameRenderer(project, opts.content, size, false);
  const stream = renderer.canvas.captureStream(0);
  const track = stream.getVideoTracks()[0] as MediaStreamTrack & { requestFrame?: () => void };
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: opts.mp4Quality === 'high' ? 16_000_000 : 8_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
  const stopped = new Promise<void>((resolve) => (recorder.onstop = () => resolve()));
  const timeline = videoTimeline(durations, project.fps, opts.mp4Repeat);
  const loader = createFrameLoader(project);
  try {
    recorder.start();
    let drawn = -1;
    for (let t = 0; t < timeline.length; t++) {
      checkAbort(hooks);
      const entry = timeline[t];
      if (drawn !== entry.index) {
        const art = await loader.load(indices[entry.index], needsFor(opts));
        renderer.render(art);
        art.release();
        drawn = entry.index;
      }
      track.requestFrame?.();
      hooks.onProgress(t + 1, timeline.length);
      await new Promise((r) => setTimeout(r, entry.duration * 1000));
    }
    recorder.stop();
    await stopped;
  } catch (err) {
    if (recorder.state !== 'inactive') recorder.stop();
    throw err;
  } finally {
    loader.dispose();
    renderer.dispose();
  }
  const ext = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
  return { kind: 'file', blob: new Blob(chunks, { type: mimeType.split(';')[0] }), filename: name(ext) };
}

// ---------------------------------------------------------------- PDF

/** Printable-ASCII text of one grid row, for the invisible text layer (anything else becomes a space). */
function asciiRow(frame: AsciiFrame, row: number): string {
  let out = '';
  for (let col = 0; col < frame.columns; col++) {
    const cp = frame.chars[row * frame.columns + col];
    out += cp >= 33 && cp <= 126 ? String.fromCharCode(cp) : ' ';
  }
  return out;
}

/** Invisible Courier text laid over the picture, so the ASCII art can be selected, searched and copied. */
function textLayer(frame: AsciiFrame, x: number, y: number, w: number, h: number): PdfItem[] {
  const cellW = w / frame.columns;
  const cellH = h / frame.rows;
  const fontSize = cellH * 0.85;
  const items: PdfItem[] = [];
  for (let row = 0; row < frame.rows; row++) {
    const text = asciiRow(frame, row);
    if (text.trim() === '') continue;
    items.push({
      kind: 'text',
      text,
      x,
      y: y + (row + 1) * cellH - cellH * 0.22,
      size: fontSize,
      font: 'Courier',
      visible: false,
      hScale: (cellW / (0.6 * fontSize)) * 100,
    });
  }
  return items;
}

async function exportPdf({ project, opts, indices, size, hooks, name }: Ctx): Promise<ExportOutput> {
  const aspect = size.width / size.height;
  const isAscii = opts.content === 'ascii';
  const pages: PdfPage[] = [];

  if (opts.pdfLayout === 'contact') {
    const base = opts.pdfPage === 'letter' ? PAGE_SIZES.letter : PAGE_SIZES.a4;
    const landscape = opts.pdfOrientation === 'landscape' || (opts.pdfOrientation === 'auto' && aspect > 1.2);
    const page = landscape ? { width: base.height, height: base.width } : base;
    const layout = contactSheetLayout(indices.length, page, aspect);
    const cell = layout.pages[0][0];
    // Frames only need about 200 dpi at their size on the page — far less than a full-size export.
    const cellPx: PixelSize = { width: Math.min(size.width, Math.ceil(cell.w * 2.8)), height: 0 };
    cellPx.height = Math.max(1, Math.round((cellPx.width * size.height) / size.width));
    const renderer = await createFrameRenderer(project, opts.content, cellPx, false);
    try {
      const flat = layout.pages.flat();
      await forEachFrame(project, indices, needsFor(opts), hooks, (art, pos) => {
        renderer.render(art);
        const { data } = renderer.canvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, cellPx.width, cellPx.height);
        const image = compressRgb(data, cellPx.width, cellPx.height);
        const slot = flat[pos];
        const pageIndex = Math.floor(pos / layout.perPage);
        const pdfPage = (pages[pageIndex] ??= { width: page.width, height: page.height, items: [] });
        pdfPage.items.push({ kind: 'image', image, x: slot.x, y: slot.y, w: slot.w, h: slot.h });
        if (isAscii && art.ascii) pdfPage.items.push(...textLayer(art.ascii, slot.x, slot.y, slot.w, slot.h));
        const label = String(indices[pos] + 1);
        pdfPage.items.push({ kind: 'text', text: label, x: slot.labelX - label.length * 2.5, y: slot.labelY, size: 9, font: 'Helvetica', visible: true, gray: 0.35 });
      });
    } finally {
      renderer.dispose();
    }
  } else {
    let page: { width: number; height: number };
    let margin = 36;
    if (opts.pdfPage === 'fit') {
      const k = Math.min(0.75, 14_400 / Math.max(size.width, size.height));
      page = { width: size.width * k, height: size.height * k };
      margin = 0;
    } else {
      const base = opts.pdfPage === 'letter' ? PAGE_SIZES.letter : PAGE_SIZES.a4;
      const landscape = opts.pdfOrientation === 'landscape' || (opts.pdfOrientation === 'auto' && aspect > 1);
      page = landscape ? { width: base.height, height: base.width } : base;
    }
    const fitW = Math.min(page.width - margin * 2, (page.height - margin * 2) * aspect);
    const fitH = fitW / aspect;
    const x = (page.width - fitW) / 2;
    const y = (page.height - fitH) / 2;
    const renderer = await createFrameRenderer(project, opts.content, size, false);
    try {
      await forEachFrame(project, indices, needsFor(opts), hooks, (art) => {
        renderer.render(art);
        const { data } = renderer.canvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, size.width, size.height);
        const items: PdfItem[] = [{ kind: 'image', image: compressRgb(data, size.width, size.height), x, y, w: fitW, h: fitH }];
        if (isAscii && art.ascii) items.push(...textLayer(art.ascii, x, y, fitW, fitH));
        pages.push({ width: page.width, height: page.height, items });
      });
    } finally {
      renderer.dispose();
    }
  }

  const bytes = buildPdf(pages, { title: project.name });
  return { kind: 'file', blob: new Blob([toBlobPart(bytes)], { type: 'application/pdf' }), filename: name('pdf') };
}

// ---------------------------------------------------------------- Text

async function collectAscii(project: Project, indices: number[], hooks: ExportHooks): Promise<Array<{ number: number; frame: AsciiFrame }>> {
  const out: Array<{ number: number; frame: AsciiFrame }> = [];
  await forEachFrame(project, indices, { ascii: true, raster: false }, hooks, (art, pos) => {
    if (art.ascii) out.push({ number: indices[pos] + 1, frame: art.ascii });
  });
  return out;
}

async function exportTxt({ project, opts, indices, hooks, name }: Ctx): Promise<ExportOutput> {
  const frames = await collectAscii(project, indices, hooks);
  const text =
    frames.length === 1
      ? frameToText(frames[0].frame, opts.txtTrim) + '\n'
      : framesToText(frames, { separator: opts.txtSeparator, trimTrailing: opts.txtTrim });
  return { kind: 'file', blob: new Blob([text], { type: 'text/plain;charset=utf-8' }), filename: name('txt') };
}

async function exportCopy({ project, indices, hooks }: Ctx): Promise<ExportOutput> {
  const frames = await collectAscii(project, indices, hooks);
  return { kind: 'text', text: frameToText(frames[0].frame, true) };
}

// ---------------------------------------------------------------- HTML player

function base64Of(dataUrl: string): string {
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}

async function exportHtml({ project, indices, durations, hooks, name }: Ctx): Promise<ExportOutput> {
  const frames = await collectAscii(project, indices, hooks);
  const family = fontFamilyFor(project.asciiFont);
  await ensureFontReady(family);
  const advance = measureAdvance(family);
  const fonts = [{ family: 'Departure Mono', base64: base64Of(departureMonoFont) }];
  if (project.asciiFont === 'smooth') fonts.unshift({ family: 'JetBrains Mono', base64: base64Of(jetbrainsMonoFont) });
  const html = buildHtmlPlayer({
    title: project.name,
    background: project.background,
    colors: project.colors,
    frames: frames.map((f) => f.frame),
    durations,
    fps: project.fps,
    mode: project.playbackMode,
    fonts,
    fontStack: family,
    advanceEm: advance,
  });
  return { kind: 'file', blob: new Blob([html], { type: 'text/html;charset=utf-8' }), filename: name('html') };
}

// ---------------------------------------------------------------- ANSI and SVG

async function exportAnsi({ project, opts, indices, hooks, name }: Ctx): Promise<ExportOutput> {
  const frames = await collectAscii(project, indices, hooks);
  const text = framesToAnsi(
    frames.map((f) => f.frame),
    { colors: project.colors, background: project.background, paintBackground: opts.ansiBackground },
  );
  return { kind: 'file', blob: new Blob([text], { type: 'text/plain;charset=utf-8' }), filename: name('ans') };
}

async function exportSvg({ project, opts, indices, size, hooks, name }: Ctx): Promise<ExportOutput> {
  const frames = await collectAscii(project, indices, hooks);
  const family = fontFamilyFor(project.asciiFont);
  await ensureFontReady(family);
  const advance = measureAdvance(family);
  const fonts = [{ family: 'Departure Mono', base64: base64Of(departureMonoFont) }];
  if (project.asciiFont === 'smooth') fonts.unshift({ family: 'JetBrains Mono', base64: base64Of(jetbrainsMonoFont) });
  const svg = frameToSvg(frames[0].frame, {
    colors: project.colors,
    background: project.background,
    transparent: opts.transparent,
    width: size.width,
    height: size.height,
    fontStack: family,
    advanceEm: advance,
    fonts,
  });
  return { kind: 'file', blob: new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), filename: name('svg') };
}

/** The font's advance width as a fraction of its size (0.6 if it can't be measured). */
function measureAdvance(family: string): number {
  const measure = document.createElement('canvas').getContext('2d')!;
  measure.font = `100px ${family}`;
  const advance = measure.measureText('M').width / 100;
  return advance > 0.2 && advance < 1.2 ? advance : 0.6;
}

// ---------------------------------------------------------------- Sprite sheet

async function exportSprite({ project, opts, indices, durations, size, hooks, name }: Ctx): Promise<ExportOutput> {
  const layout = spriteSheetLayout(indices.length, opts.spriteColumns, size.width, size.height);
  const problem = sizeProblem({ width: layout.width, height: layout.height });
  if (problem) {
    throw new ExportProblem(`The sheet would be ${layout.width} × ${layout.height} pixels, too big for this device. Use a smaller size or fewer frames. (${problem})`);
  }
  const renderer = await createFrameRenderer(project, opts.content, size, opts.transparent);
  const sheet = document.createElement('canvas');
  sheet.width = layout.width;
  sheet.height = layout.height;
  const sctx = sheet.getContext('2d');
  if (!sctx) throw new ExportProblem('This device could not create a canvas that large. Try a smaller size.');
  try {
    await forEachFrame(project, indices, needsFor(opts), hooks, (art, pos) => {
      renderer.render(art);
      sctx.drawImage(renderer.canvas, layout.rects[pos].x, layout.rects[pos].y);
    });
    const png = await canvasToBlob(sheet);
    const pngName = name('png');
    if (!opts.spriteJson) return { kind: 'file', blob: png, filename: pngName };
    const json = {
      image: pngName,
      width: layout.width,
      height: layout.height,
      frameWidth: size.width,
      frameHeight: size.height,
      columns: layout.columns,
      fps: project.fps,
      frames: layout.rects.map((r, i) => ({
        frame: indices[i] + 1,
        x: r.x,
        y: r.y,
        w: r.w,
        h: r.h,
        duration: Math.round((durations[i] / Math.max(1, project.fps)) * 1000), // ms
      })),
    };
    const jsonName = pngName.replace(/\.png$/, '.json');
    const zip = zipBlob({ [pngName]: [await blobBytes(png), { level: 0 }], [jsonName]: new TextEncoder().encode(JSON.stringify(json, null, 2)) });
    return { kind: 'file', blob: zip, filename: name('zip') };
  } finally {
    renderer.dispose();
    sheet.width = 0;
    sheet.height = 0;
  }
}
