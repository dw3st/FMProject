import type { ReactNode } from "react";

export type StatTone = "gold" | "good" | "bad" | "primary" | "muted";

const TONE: Record<StatTone, string> = {
  gold: "text-star-gold",
  good: "text-star-green",
  bad: "text-destructive",
  primary: "text-primary",
  muted: "text-muted-foreground",
};

/** Columns at full width by the number of items (static class names for Tailwind). */
const COLS: Record<number, string> = {
  1: "lg:grid-cols-1", 2: "lg:grid-cols-2", 3: "lg:grid-cols-3", 4: "lg:grid-cols-4", 5: "lg:grid-cols-5", 6: "lg:grid-cols-6",
};

export interface StatItem {
  key: string;
  label: ReactNode;
  value: ReactNode;
  /** A small line under the value. */
  detail?: ReactNode;
  tone?: StatTone;
}

/**
 * Row of headline numbers under a `ProfileHero` (12.19): label above, big number below, cells split by thin lines.
 * `attached` joins it to the banner above (square top corners, no top border).
 */
export function StatStrip({ items, attached = false }: { items: StatItem[]; attached?: boolean }) {
  return (
    <div
      className={`grid grid-cols-2 sm:grid-cols-3 ${COLS[Math.min(6, Math.max(1, items.length))]} gap-px bg-border border border-border overflow-hidden ${
        attached ? "rounded-b-md border-t-0" : "rounded-md"}`}
    >
      {items.map((it) => (
        <div key={it.key} className="bg-card px-4 py-3 phone:px-3 phone:py-2 min-w-0 flex flex-col gap-1">
          <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground truncate">{it.label}</span>
          <span className={`font-display font-bold tabular-nums text-3xl phone:text-2xl leading-none truncate ${it.tone ? TONE[it.tone] : "text-foreground"}`}>
            {it.value}
          </span>
          {it.detail && <span className="text-sm text-muted-foreground tabular-nums truncate">{it.detail}</span>}
        </div>
      ))}
    </div>
  );
}

/** A card with a label, a big value and a context line (records, facts). `dim` for a value not set yet. */
export function InfoCard({ label, value, detail, tone, dim = false }: {
  label: ReactNode; value: ReactNode; detail?: ReactNode; tone?: StatTone; dim?: boolean;
}) {
  const color = dim ? "text-muted-foreground" : tone ? TONE[tone] : "text-foreground";
  return (
    <div className={`rounded-md border border-border bg-card p-4 min-w-0 flex flex-col gap-1.5 ${dim ? "opacity-70" : ""}`}>
      <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground truncate">{label}</span>
      <span className={`font-display font-bold tabular-nums text-3xl leading-none truncate ${color}`}>{value}</span>
      {detail && <span className="text-sm text-muted-foreground truncate">{detail}</span>}
    </div>
  );
}
