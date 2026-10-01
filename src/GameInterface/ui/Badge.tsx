import type { HTMLAttributes } from "react";

export type BadgeTone = "neutral" | "good" | "warning" | "bad" | "primary";

const TONE: Record<BadgeTone, string> = {
  neutral: "text-muted-foreground border-border",
  good: "text-chart-2 border-chart-2/40",
  warning: "text-chart-4 border-chart-4/40",
  bad: "text-destructive border-destructive/40",
  primary: "text-primary border-primary/40",
};

/** State pill (morale, form, status): at least 14px, readable padding. */
export function Badge({ tone = "neutral", className = "", ...rest }: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-sm ${TONE[tone]} ${className}`}
      {...rest}
    />
  );
}
