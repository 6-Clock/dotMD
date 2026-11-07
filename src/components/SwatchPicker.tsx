import { Check } from "lucide-react";
import { SWATCHES } from "../subjects";

/** Row of iOS colour swatches; `value` is the selected swatch name. */
export function SwatchPicker({ value, onChange }: { value?: string; onChange: (name: string) => void }) {
  return (
    <div className="swatches" role="radiogroup" aria-label="Subject colour">
      {SWATCHES.map((s) => (
        <button
          key={s.name}
          type="button"
          role="radio"
          aria-checked={value === s.name}
          aria-label={s.label}
          title={s.label}
          className={`swatch ${value === s.name ? "on" : ""}`}
          style={{ "--subj": s.hex, "--subj-on": s.on } as React.CSSProperties}
          onClick={() => onChange(s.name)}
        >
          {value === s.name && <Check size={12} strokeWidth={3.5} />}
        </button>
      ))}
    </div>
  );
}
