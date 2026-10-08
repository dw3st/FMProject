import type { ReactNode } from "react";

/**
 * Small "trump card" fact: a label on top and the value below (player screen header: position,
 * foot, age, nationality, birth date, height). `tone` replaces the neutral card colours
 * (border + background + text), e.g. the position colour.
 */
export function FactCard({
  label,
  children,
  tone,
  title,
}: {
  label: string;
  children: ReactNode;
  tone?: string;
  title?: string;
}) {
  return (
    <div
      title={title}
      className={`rounded-md border px-3 py-2 min-w-[84px] text-left ${tone ?? "border-border bg-card text-foreground"}`}
    >
      <p className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground m-0 leading-tight">
        {label}
      </p>
      <div className="font-display font-bold tabular-nums text-lg leading-tight mt-0.5 flex items-center gap-1.5 whitespace-nowrap">
        {children}
      </div>
    </div>
  );
}

export interface IdentityFact {
  /** Where the fact goes in the header order (#117); absent = after the fixed facts. */
  kind?: "height" | "birthDate";
  label: string;
  value: string;
}
