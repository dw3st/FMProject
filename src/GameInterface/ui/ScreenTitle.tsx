import type { ReactNode } from "react";
import { TitleParts } from "@/GameInterface/ui/TitleParts";

/** One per screen, top-left: big heavy condensed uppercase, with an optional one-line subtitle. */
export function ScreenTitle({
  children,
  accent,
  subtitle,
  trailing,
  className = "",
}: {
  children: ReactNode;
  /** Second part of the title, in primary (in-game screens always pass it; entry screens don't). */
  accent?: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-end justify-between gap-x-6 gap-y-2 ${className}`}>
      <div className="min-w-0">
        <h1 className="font-display font-black uppercase tracking-tight text-3xl md:text-4xl leading-none m-0">
          <TitleParts accent={accent}>{children}</TitleParts>
        </h1>
        {subtitle != null && subtitle !== false && (
          <p className="text-sm text-muted-foreground mt-2 mb-0">{subtitle}</p>
        )}
      </div>
      {trailing}
    </div>
  );
}
