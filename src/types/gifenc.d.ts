// gifenc ships no type declarations; this covers the parts ascii_buddy uses.
declare module 'gifenc' {
  export type PaletteColor = number[];
  export interface WriteFrameOptions {
    palette?: PaletteColor[];
    delay?: number; // milliseconds
    transparent?: boolean;
    transparentIndex?: number;
    repeat?: number; // -1 once, 0 forever
    dispose?: number;
  }
  export interface GIFEncoderInstance {
    writeFrame(index: Uint8Array, width: number, height: number, options?: WriteFrameOptions): void;
    finish(): void;
    bytes(): Uint8Array;
  }
  export function GIFEncoder(options?: { auto?: boolean; initialCapacity?: number }): GIFEncoderInstance;
  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    options?: { format?: 'rgb565' | 'rgb444' | 'rgba4444'; oneBitAlpha?: boolean | number; clearAlpha?: boolean; clearAlphaThreshold?: number; clearAlphaColor?: number },
  ): PaletteColor[];
  export function applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: PaletteColor[], format?: 'rgb565' | 'rgb444' | 'rgba4444'): Uint8Array;
}
