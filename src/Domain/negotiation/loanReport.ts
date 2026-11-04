import { historyRowFromLog } from "@/Domain/history/history";
import { attrDisplay } from "@/Domain/attributes";
import { overallAvg } from "@/Domain/playerRating";
import type { RosterPlayer } from "@/types/playerTypes";
import type { ActiveLoan } from "@/types/transferMarketTypes";

/** What a player has done since the human club lent him (`.claude/rules/game/negotiation.md`). */
export interface LoanReport {
  apps: number;
  goals: number;
  assists: number;
  avgRating: number | null;
  yellowCards: number;
  redCards: number;
  injuries: number;
  daysInjured: number;
  /** Overall ×10 now and when the loan started (absent for a loan older than this data). */
  overall: number;
  overallAtStart?: number;
  /** The attributes that moved, ×10, biggest change first. */
  changes: { attribute: string; delta: number }[];
}

export function loanReport(player: RosterPlayer, loan: Pick<ActiveLoan, "toClubId" | "toClubName" | "startOverall" | "startStats">): LoanReport {
  const history = player.history ?? [];
  const closed = history.filter((r) => r.squadId === loan.toClubId && r.loan);
  const current = historyRowFromLog(player.seasonLog, { squadId: loan.toClubId, clubName: loan.toClubName, league: "" }, "", [], history);
  const rows = current ? [...closed, current] : closed;
  const sum = (k: "apps" | "goals" | "assists" | "yellowCards" | "redCards" | "injuries" | "daysInjured") =>
    rows.reduce((n, r) => n + (r[k] ?? 0), 0);
  const apps = sum("apps");
  const rated = rows.filter((r) => r.avgRating !== null && r.apps > 0);
  const ratedApps = rated.reduce((n, r) => n + r.apps, 0);
  const now = player.stats as unknown as Record<string, number>;
  const was = loan.startStats as unknown as Record<string, number> | undefined;
  const changes = was
    ? Object.keys(now)
      .map((attribute) => ({ attribute, delta: attrDisplay(now[attribute] ?? 0) - attrDisplay(was[attribute] ?? 0) }))
      .filter((c) => c.delta !== 0)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    : [];
  return {
    apps,
    goals: sum("goals"),
    assists: sum("assists"),
    avgRating: ratedApps > 0 ? +(rated.reduce((n, r) => n + (r.avgRating ?? 0) * r.apps, 0) / ratedApps).toFixed(2) : null,
    yellowCards: sum("yellowCards"),
    redCards: sum("redCards"),
    injuries: sum("injuries"),
    daysInjured: sum("daysInjured"),
    overall: attrDisplay(overallAvg(player)),
    ...(loan.startOverall !== undefined ? { overallAtStart: attrDisplay(loan.startOverall) } : {}),
    changes,
  };
}

/** A recall clause costs part of the wage the borrower would pay. */
export const RECALL_WAGE_COST = 0.2;

export function shareWithRecall(wageShare: number): number {
  return Math.max(0, +(wageShare - RECALL_WAGE_COST).toFixed(2));
}
