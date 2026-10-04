import type { ReactNode } from "react";
import { TitleParts } from "@/GameInterface/ui/TitleParts";

const TITLE_CLASS = {
  lg: "font-display font-black uppercase tracking-tight text-3xl md:text-4xl leading-none text-foreground m-0",
  md: "text-xl font-black font-display text-foreground m-0 uppercase tracking-[0.08em]",
} as const;

const TRAILING_ALIGN = { start: "sm:items-start", center: "sm:items-center", end: "sm:items-end" } as const;

/**
 * One per screen, top-left: big heavy condensed uppercase title (two parts, the second — `accent` —
 * in primary on in-game screens), an optional one-line subtitle and an optional trailing block on
 * the right (stacked under the title on phones).
 */
export function ScreenTitle({
  children,
  accent,
  subtitle,
  trailing,
  trailingAlign,
  className,
  size = "lg",
}: {
  children?: ReactNode;
  /** Second part of the title, in primary (in-game screens always pass it; entry screens don't). */
  accent?: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  /** Vertical alignment of `trailing` from `sm` up; defaults to top with a subtitle, centre without. */
  trailingAlign?: keyof typeof TRAILING_ALIGN;
  className?: string;
  size?: keyof typeof TITLE_CLASS;
}) {
  const titleCol = (
    <div className="min-w-0 flex-1">
      {((children != null && children !== false) || accent != null) && (
        <h1 className={TITLE_CLASS[size]}>
          <TitleParts accent={accent}>{children}</TitleParts>
        </h1>
      )}
      {subtitle != null && subtitle !== false && (
        <div className="text-sm text-muted-foreground mt-2 m-0">{subtitle}</div>
      )}
    </div>
  );

  const rowAlign = subtitle != null ? "items-start" : "items-center";
  const extra = className ? ` ${className}` : "";

  if (trailing) {
    const align = TRAILING_ALIGN[trailingAlign ?? (subtitle != null ? "start" : "center")];
    return (
      <div className={`flex flex-col gap-4 sm:flex-row ${align} sm:justify-between w-full${extra}`}>
        <div className={`flex gap-4 min-w-0 flex-1 ${rowAlign}`}>{titleCol}</div>
        <div className="shrink-0">{trailing}</div>
      </div>
    );
  }

  return <div className={`flex gap-4 w-full ${rowAlign}${extra}`}>{titleCol}</div>;
}
