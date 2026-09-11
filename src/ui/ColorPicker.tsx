// Saturation/value square + hue strip + hex field. See ASCII_BUDDY_SPEC.md §7.2.
import { useEffect, useRef, useState } from 'preact/hooks';
import { hexToRgb, hsvToRgb, isValidHex, normalizeHex, rgbToHex, rgbToHsv, type HSV } from '../engine/color';
import { safeSetPointerCapture } from './pointerCapture';

const SQUARE_SIZE = 160;
const HUE_HEIGHT = 20;

export function ColorPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const [hsv, setHsv] = useState<HSV>(() => rgbToHsv(hexToRgb(value)));
  const [hexInput, setHexInput] = useState(value);
  const squareRef = useRef<HTMLCanvasElement>(null);
  const draggingRef = useRef<'square' | 'hue' | null>(null);

  // Re-sync from an externally-changed value (e.g. picking a palette swatch),
  // without fighting the user's own drag.
  useEffect(() => {
    if (draggingRef.current) return;
    setHsv(rgbToHsv(hexToRgb(value)));
    setHexInput(value);
  }, [value]);

  useEffect(() => {
    const canvas = squareRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    const { r, g, b } = hsvToRgb({ h: hsv.h, s: 1, v: 1 });
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.fillRect(0, 0, w, h);
    const white = ctx.createLinearGradient(0, 0, w, 0);
    white.addColorStop(0, 'rgba(255,255,255,1)');
    white.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = white;
    ctx.fillRect(0, 0, w, h);
    const black = ctx.createLinearGradient(0, 0, 0, h);
    black.addColorStop(0, 'rgba(0,0,0,0)');
    black.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = black;
    ctx.fillRect(0, 0, w, h);
  }, [hsv.h]);

  function commit(next: HSV) {
    setHsv(next);
    const hex = rgbToHex(hsvToRgb(next));
    setHexInput(hex);
    onChange(hex);
  }

  function handleSquarePoint(clientX: number, clientY: number) {
    const canvas = squareRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const s = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const v = 1 - Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    commit({ ...hsv, s, v });
  }

  function handleHuePoint(clientX: number, el: HTMLElement) {
    const rect = el.getBoundingClientRect();
    const h = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * 360;
    commit({ ...hsv, h });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <canvas
        ref={squareRef}
        width={SQUARE_SIZE}
        height={SQUARE_SIZE}
        style={{ width: SQUARE_SIZE, height: SQUARE_SIZE, border: '1px solid var(--ink)', touchAction: 'none', cursor: 'crosshair' }}
        onPointerDown={(e) => {
          safeSetPointerCapture(e.currentTarget as HTMLCanvasElement, e.pointerId);
          draggingRef.current = 'square';
          handleSquarePoint(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (draggingRef.current !== 'square') return;
          handleSquarePoint(e.clientX, e.clientY);
        }}
        onPointerUp={() => {
          draggingRef.current = null;
        }}
      />
      <div
        style={{
          position: 'relative',
          height: HUE_HEIGHT,
          border: '1px solid var(--ink)',
          touchAction: 'none',
          cursor: 'crosshair',
          background:
            'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)',
        }}
        onPointerDown={(e) => {
          safeSetPointerCapture(e.currentTarget as HTMLElement, e.pointerId);
          draggingRef.current = 'hue';
          handleHuePoint(e.clientX, e.currentTarget as HTMLElement);
        }}
        onPointerMove={(e) => {
          if (draggingRef.current !== 'hue') return;
          handleHuePoint(e.clientX, e.currentTarget as HTMLElement);
        }}
        onPointerUp={() => {
          draggingRef.current = null;
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: -2,
            left: `${(hsv.h / 360) * 100}%`,
            width: 4,
            height: HUE_HEIGHT + 4,
            background: 'var(--paper)',
            border: '1px solid var(--ink)',
            transform: 'translateX(-2px)',
            pointerEvents: 'none',
          }}
        />
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span
          style={{ width: 24, height: 24, background: value, border: '1px solid var(--ink)', flexShrink: 0 }}
        />
        <input
          class="ab-input"
          style={{ flex: 1 }}
          value={hexInput}
          onInput={(e) => setHexInput((e.target as HTMLInputElement).value)}
          onBlur={() => {
            if (isValidHex(hexInput)) {
              const hex = normalizeHex(hexInput);
              setHsv(rgbToHsv(hexToRgb(hex)));
              setHexInput(hex);
              onChange(hex);
            } else {
              setHexInput(value);
            }
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        <input
          type="color"
          value={value}
          onInput={(e) => {
            const hex = (e.target as HTMLInputElement).value.toUpperCase();
            setHsv(rgbToHsv(hexToRgb(hex)));
            setHexInput(hex);
            onChange(hex);
          }}
          title="System color picker"
          style={{ width: 32, height: 32 }}
        />
      </div>
    </div>
  );
}
