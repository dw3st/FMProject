import type { ReactNode } from "react";
import { Chip } from "@/GameInterface/ui/Chip";

interface OptionChip<K extends string> {
  key: K;
  label: ReactNode;
  /** Tooltip (e.g. what a training intensity does). */
  title?: string;
  disabled?: boolean;
}

interface Props<K extends string> {
  options: OptionChip<K>[];
  value: K | null;
  onChange: (key: K) => void;
  disabled?: boolean;
  className?: string;
  /**
   * Grid columns (e.g. `"grid-cols-2 sm:grid-cols-3"`): the chips line up in equal-width columns
   * instead of wrapping as a row (long lists such as nationalities).
   */
  columns?: string;
  "aria-label"?: string;
}

/**
 * A row of mutually exclusive option chips (training intensity, style focus, scope filters…).
 * The standard chip group of the game (`.claude/rules/ui-standard.md` → Chip).
 */
export function OptionChips<K extends string>({
  options, value, onChange, disabled, className = "", columns, "aria-label": ariaLabel,
}: Props<K>) {
  const layout = columns ? `grid ${columns}` : "flex flex-wrap";
  return (
    <div role="group" aria-label={ariaLabel} className={`${layout} gap-1.5 ${className}`}>
      {options.map((o) => (
        <Chip
          key={o.key}
          selected={o.key === value}
          title={o.title}
          disabled={disabled || o.disabled}
          onClick={() => onChange(o.key)}
          className={columns ? "w-full h-full min-w-0" : ""}
        >
          {o.label}
        </Chip>
      ))}
    </div>
  );
}
