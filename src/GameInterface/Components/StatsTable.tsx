import type { KeyboardEvent, ReactNode } from "react";
import { ClubLogo, squadLogoUrl } from "@/GameInterface/Components/ClubLogo";

/**
 * Shared table pieces for every Stats tab (Rankings, My team, Retired, Managers) so they look the
 * same (`.claude/rules/ui-standard.md`): label-style header row, text-sm, 44px rows, a 32px crest
 * column and the name in the same weight everywhere.
 */

const TH = "px-2 py-2 font-display font-bold uppercase tracking-[0.08em] text-xs text-muted-foreground";
const TD = "px-2 py-1.5";

export type Align = "left" | "right" | "center";
const alignClass = (a: Align) => (a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left");

export function StatsTable({ head, children, className = "" }: { head: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`overflow-x-auto border border-border rounded-lg ${className}`}>
      <table className="w-full text-sm">
        <thead className="border-b border-border">
          <tr>{head}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function StatsHead({ children, align = "left", className = "" }: { children?: ReactNode; align?: Align; className?: string }) {
  return <th className={`${TH} ${alignClass(align)} ${className}`}>{children}</th>;
}

export function StatsRow({
  children, highlight, onActivate, expanded,
}: {
  children: ReactNode;
  highlight?: boolean;
  /** Makes the whole row clickable (and Enter/Space operable), e.g. to expand details. */
  onActivate?: () => void;
  expanded?: boolean;
}) {
  const onKeyDown = onActivate
    ? (e: KeyboardEvent<HTMLTableRowElement>) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onActivate(); }
      }
    : undefined;
  return (
    <tr
      className={`h-11 border-b border-border last:border-0 ${highlight ? "bg-primary/10" : ""} ${
        onActivate ? "cursor-pointer hover:bg-white/5" : ""
      }`}
      onClick={onActivate}
      onKeyDown={onKeyDown}
      tabIndex={onActivate ? 0 : undefined}
      aria-expanded={onActivate ? expanded : undefined}
    >
      {children}
    </tr>
  );
}

/** Full-width detail row under an expanded row. */
export function StatsDetailRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr className="border-b border-border last:border-0">
      <td colSpan={colSpan} className="px-4 py-3">{children}</td>
    </tr>
  );
}

export function StatsCell({ children, align = "left", className = "" }: { children?: ReactNode; align?: Align; className?: string }) {
  return <td className={`${TD} ${alignClass(align)} ${className}`}>{children}</td>;
}

export function RankCell({ rank }: { rank: number }) {
  return <td className={`w-10 ${TD} text-center text-muted-foreground tabular-nums`}>{rank}</td>;
}

export function CrestCell({ squadId }: { squadId: string | null | undefined }) {
  return (
    <td className="w-10 px-1 py-1.5">
      <ClubLogo logoUrl={squadId ? squadLogoUrl(squadId) : undefined} className="w-8 h-8 rounded-full" />
    </td>
  );
}

/** Name column: same weight everywhere; `href` makes it a link, `highlight` colours the player's own row. */
export function NameCell({ children, href, highlight }: { children: ReactNode; href?: string; highlight?: boolean }) {
  const cls = `inline-flex items-center gap-1.5 max-w-full font-medium ${highlight ? "text-primary" : "text-foreground"}`;
  return (
    <td className={`${TD} max-w-[14rem]`}>
      {href
        ? <a href={href} className={`${cls} no-underline hover:underline`} onClick={(e) => e.stopPropagation()}>{children}</a>
        : <span className={cls}>{children}</span>}
    </td>
  );
}

export function ClubCell({ children }: { children: ReactNode }) {
  return <td className={`${TD} text-muted-foreground truncate max-w-[12rem]`}>{children}</td>;
}

export function NumberCell({ children, strong }: { children: ReactNode; strong?: boolean }) {
  return <td className={`${TD} text-right tabular-nums ${strong ? "font-display font-bold" : ""}`}>{children}</td>;
}
