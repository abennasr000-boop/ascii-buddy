export function Slider({
  label,
  readout,
  value,
  min,
  max,
  step = 1,
  onChange,
  overridden,
  onReset,
}: {
  label: string;
  readout?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  /** Shows the "set at this level" dot (§5.7); tapping it resets the field to inherited. */
  overridden?: boolean;
  onReset?: () => void;
}) {
  return (
    <div class="ab-slider-row">
      <div class="ab-slider-row__label">
        <span>
          {label}
          {overridden ? (
            <button type="button" class="ab-override-dot" title="Overridden here — tap to inherit again" onClick={onReset}>
              ●
            </button>
          ) : null}
        </span>
        <span>{readout ?? value}</span>
      </div>
      <input
        class="ab-slider"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onInput={(e) => onChange(Number((e.target as HTMLInputElement).value))}
      />
    </div>
  );
}
