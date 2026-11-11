// The export dialog's choices (§15.1) and which of them apply to each format (§15.2).
import type { ExportSize, FrameSelection } from '../engine/exportPlan';
import type { ExportContent } from './frameRenderer';

export type ExportFormat = 'png' | 'png-seq' | 'gif' | 'mp4' | 'pdf' | 'txt' | 'copy' | 'html' | 'sprite' | 'ansi' | 'svg';

export interface ExportOptions {
  format: ExportFormat;
  content: ExportContent;
  frames: FrameSelection;
  from: number; // 1-based, for frames === 'range'
  to: number;
  size: ExportSize;
  transparent: boolean;
  // PNG sequence
  repeatHeldFrames: boolean;
  // GIF
  gifLoop: 'forever' | 'once';
  // MP4
  mp4Quality: 'standard' | 'high';
  mp4Repeat: number;
  // PDF
  pdfLayout: 'pages' | 'contact';
  pdfPage: 'a4' | 'letter' | 'fit';
  pdfOrientation: 'auto' | 'portrait' | 'landscape';
  // TXT
  txtSeparator: 'marker' | 'formfeed';
  txtTrim: boolean;
  // ANSI
  ansiBackground: boolean;
  // Sprite sheet
  spriteColumns: number; // 0 = automatic
  spriteJson: boolean;
}

export interface FormatInfo {
  id: ExportFormat;
  label: string;
  hint: string;
  animated: boolean;
  /** Offers the Frames choice (a single-image format is always one frame). */
  frameChoice: boolean;
  /** Offers the Content (ASCII / Raster) choice; text-like formats are always ASCII. */
  contentChoice: boolean;
  /** Offers the Size choice. */
  sizeChoice: boolean;
  /** Offers the transparent-background option. */
  transparency: boolean;
  ext: string;
}

export const FORMATS: FormatInfo[] = [
  { id: 'png', label: 'PNG', hint: 'One frame as an image.', animated: false, frameChoice: false, contentChoice: true, sizeChoice: true, transparency: true, ext: 'png' },
  { id: 'png-seq', label: 'PNG sequence', hint: 'A zip of numbered PNG files.', animated: true, frameChoice: true, contentChoice: true, sizeChoice: true, transparency: true, ext: 'zip' },
  { id: 'gif', label: 'GIF', hint: 'An animated GIF.', animated: true, frameChoice: true, contentChoice: true, sizeChoice: true, transparency: true, ext: 'gif' },
  { id: 'mp4', label: 'MP4', hint: 'An H.264 video.', animated: true, frameChoice: true, contentChoice: true, sizeChoice: true, transparency: false, ext: 'mp4' },
  { id: 'pdf', label: 'PDF', hint: 'One frame per page, or a contact sheet.', animated: true, frameChoice: true, contentChoice: true, sizeChoice: true, transparency: false, ext: 'pdf' },
  { id: 'txt', label: 'TXT', hint: 'Plain ASCII text (UTF-8).', animated: true, frameChoice: true, contentChoice: false, sizeChoice: false, transparency: false, ext: 'txt' },
  { id: 'copy', label: 'Copy text', hint: 'The current frame as text on the clipboard.', animated: false, frameChoice: false, contentChoice: false, sizeChoice: false, transparency: false, ext: 'txt' },
  { id: 'html', label: 'HTML player', hint: 'One .html file with the colored ASCII animation.', animated: true, frameChoice: true, contentChoice: false, sizeChoice: false, transparency: false, ext: 'html' },
  { id: 'ansi', label: 'ANSI text', hint: 'Colored terminal text (24-bit escape codes).', animated: true, frameChoice: true, contentChoice: false, sizeChoice: false, transparency: false, ext: 'ans' },
  { id: 'svg', label: 'SVG', hint: 'One ASCII frame as real <text> elements.', animated: false, frameChoice: false, contentChoice: false, sizeChoice: true, transparency: true, ext: 'svg' },
  { id: 'sprite', label: 'Sprite sheet', hint: 'A PNG grid of frames, plus optional JSON.', animated: true, frameChoice: true, contentChoice: true, sizeChoice: true, transparency: true, ext: 'png' },
];

export function formatInfo(id: ExportFormat): FormatInfo {
  return FORMATS.find((f) => f.id === id)!;
}

export function defaultExportOptions(format: ExportFormat = 'gif', frameCount = 1): ExportOptions {
  return {
    format,
    content: 'ascii',
    frames: formatInfo(format).animated ? 'all' : 'current',
    from: 1,
    to: Math.max(1, frameCount),
    size: { kind: 'scale', scale: 1 },
    transparent: false,
    repeatHeldFrames: false,
    gifLoop: 'forever',
    mp4Quality: 'standard',
    mp4Repeat: 1,
    pdfLayout: 'pages',
    pdfPage: 'a4',
    pdfOrientation: 'auto',
    txtSeparator: 'marker',
    txtTrim: true,
    ansiBackground: true,
    spriteColumns: 0,
    spriteJson: false,
  };
}

/** What the export actually uses once the format's fixed choices are applied. */
export function effectiveOptions(o: ExportOptions): ExportOptions {
  const info = formatInfo(o.format);
  return {
    ...o,
    content: info.contentChoice ? o.content : 'ascii',
    frames: info.frameChoice ? o.frames : 'current',
    transparent: info.transparency ? o.transparent : false,
  };
}
