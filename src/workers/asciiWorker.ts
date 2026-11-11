// Converts one frame's grid statistics to an AsciiFrame off the main thread
// (full-frame shape matching is the expensive part — §5.5: "run full-frame
// shape conversion in a worker"). It runs exactly the same pure engine code as
// the main thread, so results are identical either way.
import { resolveOccupancy, type OccupancyTrack } from '../engine/occupancy';
import type { GridStats } from '../engine/gridStats';
import type { ConvertContext } from '../engine/asciiConvert';
import type { AsciiFrame, ConversionSettings } from '../types/model';

export interface FrameRequest {
  id: number;
  columns: number;
  rows: number;
  tracks: OccupancyTrack[];
  stats: Array<[string, GridStats]>;
  projectConversion: ConversionSettings;
  ctx: ConvertContext;
}

export interface FrameResponse {
  id: number;
  frame?: AsciiFrame;
  error?: string;
}

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<FrameRequest>) => void) | null;
  postMessage(message: FrameResponse, transfer?: Transferable[]): void;
};

scope.onmessage = (e) => {
  const req = e.data;
  try {
    const frame = resolveOccupancy(req.columns, req.rows, req.tracks, new Map(req.stats), req.projectConversion, req.ctx);
    scope.postMessage({ id: req.id, frame }, [frame.chars.buffer, frame.colors.buffer, frame.owner.buffer]);
  } catch (err) {
    scope.postMessage({ id: req.id, error: err instanceof Error ? err.message : String(err) });
  }
};
