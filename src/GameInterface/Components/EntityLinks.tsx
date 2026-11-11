import type { ReactNode } from "react";
import { followLinkOnly } from "@/GameInterface/router/navigation";

/**
 * The club page from its id alone (9.6.3, tester report: every club name opens the club). `league` when known;
 * without it the squad screen finds the club's league and corrects the address.
 */
export function clubHref(clubId: string, league?: string | null): string {
  return `/squad/${encodeURIComponent(league || "club")}/${encodeURIComponent(clubId)}`;
}

/** A club name that opens the club; a national team (`nat_…`) or an empty id stays plain text. */
export function ClubLink({ id, league, children, className = "" }: {
  id: string; league?: string | null; children: ReactNode; className?: string;
}) {
  if (!id || id.startsWith("nat_")) return <span className={className}>{children}</span>;
  return (
    <a href={clubHref(id, league)} onClick={followLinkOnly} className={`no-underline hover:underline text-inherit ${className}`}>
      {children}
    </a>
  );
}

/** "Vasco 0–3 Bahia" with both clubs opening their page (home side first, as `scoreLineOf`). */
export function ScoreLineLinks({ r }: {
  r: { home: boolean; clubId: string; clubName: string; opponentId: string; opponentName: string; score: { for: number; against: number } };
}) {
  const mine = <ClubLink id={r.clubId}>{r.clubName}</ClubLink>;
  const theirs = <ClubLink id={r.opponentId}>{r.opponentName}</ClubLink>;
  return r.home
    ? <>{mine} {r.score.for}–{r.score.against} {theirs}</>
    : <>{theirs} {r.score.against}–{r.score.for} {mine}</>;
}
