import type { LabelHTMLAttributes } from "react";

/** Condensed uppercase label above a field or a group of values. */
export function Label({ className = "", ...rest }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={`block font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground ${className}`}
      {...rest}
    />
  );
}
