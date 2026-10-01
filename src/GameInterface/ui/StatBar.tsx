import type { ReactNode } from "react";

/** Strength/fitness bar: 6px track, primary fill, always with the number beside it. */
export function StatBar({
  value,
  max = 10,
  label,
  display,
  className = "",
}: {
  value: number;
  max?: number;
  label?: ReactNode;
  /** Text shown beside the bar; defaults to the value with one decimal. */
  display?: ReactNode;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={`flex items-center gap-3 text-sm ${className}`}>
      {label != null && <span className="w-16 shrink-0 text-muted-foreground">{label}</span>}
      <div className="flex-1 min-w-16 h-1.5 rounded bg-border overflow-hidden" role="presentation">
        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-9 text-right tabular-nums">{display ?? value.toFixed(1)}</span>
    </div>
  );
}
