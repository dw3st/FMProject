import type { ButtonHTMLAttributes } from "react";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected: boolean;
}

/** Option button (nationality, filter): outlined, primary when selected. */
export function Chip({ selected, className = "", type = "button", ...rest }: Props) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={`inline-flex items-center gap-2 rounded border bg-transparent px-3 py-1.5 text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
        selected ? "border-primary text-primary" : "border-border text-foreground hover:border-primary/50"
      } ${className}`}
      {...rest}
    />
  );
}
