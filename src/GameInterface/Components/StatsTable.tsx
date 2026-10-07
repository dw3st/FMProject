import type { KeyboardEvent, ReactNode } from "react";
import { ClubLogo, squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
import { TABLE_CELL, TABLE_STYLE } from "@/GameInterface/ui/leagueTableStyle";

/**
 * Shared table pieces for every Stats tab (Rankings, My team, Retired, Managers). They use the
 * Leagues table look (`TABLE_STYLE`, `.claude/rules/ui-standard.md` → Tabela): card box, tinted
 * label-style header, base-size semibold names, 32px crests, muted numbers and the key column in
 * primary.
 */

export type Align = "left" | "right" | "center";
const alignClass = (a: Align) => (a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left");

export function StatsTable({ head, children, className = "" }: { head: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`${TABLE_STYLE.shell} overflow-x-auto ${className}`}>
      <table className="w-full">
        <thead className={TABLE_STYLE.head}>
          <tr>{head}</tr>
        </thead>
        <tbody className={TABLE_STYLE.body}>{children}</tbody>
      </table>
    </div>
  );
}

export function StatsHead({ children, align = "left", className = "", title }: { children?: ReactNode; align?: Align; className?: string; title?: string }) {
  return <th title={title} className={`${TABLE_CELL.head} font-bold ${alignClass(align)} ${className}`}>{children}</th>;
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
      className={`${TABLE_STYLE.row} ${highlight ? TABLE_STYLE.rowHighlight : ""} ${onActivate ? TABLE_STYLE.rowClickable : ""}`}
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
    <tr className="bg-secondary/10">
      <td colSpan={colSpan} className="px-4 py-3 text-sm">{children}</td>
    </tr>
  );
}

export function StatsCell({ children, align = "left", className = "" }: { children?: ReactNode; align?: Align; className?: string }) {
  return <td className={`${TABLE_CELL.body} ${alignClass(align)} ${className}`}>{children}</td>;
}

export function RankCell({ rank }: { rank: number }) {
  return <td className={`w-12 ${TABLE_CELL.body} ${TABLE_STYLE.rank} tabular-nums`}>{rank}</td>;
}

export function CrestCell({ squadId }: { squadId: string | null | undefined }) {
  return (
    <td className={`w-12 ${TABLE_CELL.body}`}>
      <ClubLogo
        logoUrl={squadId ? squadLogoUrl(squadId) : undefined}
        className={TABLE_STYLE.crest}
        imgClassName="w-full h-full object-contain"
      />
    </td>
  );
}

/** Name column: same weight everywhere; `href` makes it a link, `highlight` colours the player's own row. */
export function NameCell({ children, href, highlight }: { children: ReactNode; href?: string; highlight?: boolean }) {
  const cls = `inline-flex items-center gap-1.5 max-w-full ${highlight ? TABLE_STYLE.nameHighlight : TABLE_STYLE.name}`;
  return (
    <td className={`${TABLE_CELL.body} max-w-[16rem]`}>
      {href
        ? <a href={href} className={`${cls} no-underline hover:underline`} onClick={(e) => e.stopPropagation()}>{children}</a>
        : <span className={cls}>{children}</span>}
    </td>
  );
}

export function ClubCell({ children }: { children: ReactNode }) {
  return <td className={`${TABLE_CELL.body} text-muted-foreground truncate max-w-[12rem]`}>{children}</td>;
}

/** Numeric column: muted, centred; `strong` marks the table's key value (primary, display font). */
export function NumberCell({ children, strong }: { children: ReactNode; strong?: boolean }) {
  return <td className={`${TABLE_CELL.body} ${strong ? TABLE_STYLE.key : TABLE_STYLE.number}`}>{children}</td>;
}

/** "Load more" under a paginated Stats table; a failed page shows the error next to the button and keeps the rows. */
export function LoadMoreButton({ onClick, loading, failed, label, loadingLabel, failedLabel }: {
  onClick: () => void;
  loading: boolean;
  failed: boolean;
  label: string;
  loadingLabel: string;
  failedLabel: string;
}) {
  return (
    <div className="mt-3 flex items-center gap-3">
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className="h-10 px-5 bg-transparent border-0 text-sm font-semibold text-muted-foreground hover:text-foreground cursor-pointer disabled:opacity-50"
      >
        {loading ? loadingLabel : label}
      </button>
      {failed && !loading && <span role="alert" className="text-sm text-destructive">{failedLabel}</span>}
    </div>
  );
}
