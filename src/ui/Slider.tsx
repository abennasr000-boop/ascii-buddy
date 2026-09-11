export function Slider({
  label,
  readout,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  readout?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <div class="ab-slider-row">
      <div class="ab-slider-row__label">
        <span>{label}</span>
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
