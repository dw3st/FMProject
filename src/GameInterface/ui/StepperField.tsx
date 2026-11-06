import { useEffect, useState } from "react";
import { StepButton } from "@/GameInterface/ui/StepButton";
import { formSelectBoxClass } from "@/GameInterface/Components/SelectListbox";

interface Props {
  value: number;
  onChange: (v: number) => void;
  /** The next value one step up or down. */
  step: (v: number, dir: 1 | -1) => number;
  min: number;
  max: number;
  /** The text of a value; also what is shown after the field loses focus. */
  format?: (v: number) => string;
  /** A typed text as a value, or null while it is not one. */
  parse?: (text: string) => number | null;
  downLabel: string;
  upLabel: string;
  ariaLabel?: string;
}

const defaultParse = (s: string) => {
  const t = s.trim().replace(",", ".");
  return /^-?\d+(\.\d+)?$/.test(t) ? Number.parseFloat(t) : null;
};

/**
 * A number with − and + buttons (tester report, 8.8.2: the browser's spin arrows were too small). The field keeps what
 * is typed, so it can be cleared and typed again; a valid number goes out at once, clamped on blur.
 */
export function StepperField({ value, onChange, step, min, max, format = String, parse = defaultParse, downLabel, upLabel, ariaLabel }: Props) {
  const [draft, setDraft] = useState(format(value));
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (!editing) setDraft(format(value)); }, [value, editing, format]);
  const clamp = (v: number) => Math.min(max, Math.max(min, v));

  return (
    <div className="flex items-center gap-1 min-w-0">
      <StepButton dir={-1} label={downLabel} disabled={value <= min} onClick={() => onChange(clamp(step(value, -1)))} />
      <input
        type="text"
        inputMode="decimal"
        aria-label={ariaLabel}
        value={draft}
        onFocus={() => setEditing(true)}
        onChange={(e) => {
          setDraft(e.target.value);
          const v = parse(e.target.value);
          if (v !== null) onChange(clamp(v));
        }}
        onBlur={() => { setEditing(false); setDraft(format(value)); }}
        className={`${formSelectBoxClass} text-center tabular-nums px-1 min-w-0`}
      />
      <StepButton dir={1} label={upLabel} disabled={value >= max} onClick={() => onChange(clamp(step(value, 1)))} />
    </div>
  );
}
