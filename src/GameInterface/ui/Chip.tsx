import type { ButtonHTMLAttributes } from "react";

/**
 * The game's option chip (`.claude/rules/ui-standard.md` → Chip): the look of the Training
 * "Intensidade" chips — condensed bold uppercase, 14px, rounded pill with a subtle border; muted
 * when off, primary text + tinted fill + primary border when on. Class strings live here so
 * nothing re-creates them by hand.
 */
const CHIP_STYLE = {
  base:
    "inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 font-display text-sm font-bold uppercase tracking-[0.08em] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
  on: "border-primary bg-primary/15 text-primary",
  off: "border-border/60 bg-card/40 text-muted-foreground hover:border-primary/40 hover:text-foreground",
} as const;

function chipClass(selected: boolean, className = ""): string {
  return `${CHIP_STYLE.base} ${selected ? CHIP_STYLE.on : CHIP_STYLE.off} ${className}`;
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected: boolean;
}

/** One option chip (a filter toggle, a single choice). For a group of choices use `OptionChips`. */
export function Chip({ selected, className = "", type = "button", ...rest }: Props) {
  return <button type={type} aria-pressed={selected} className={chipClass(selected, className)} {...rest} />;
}
