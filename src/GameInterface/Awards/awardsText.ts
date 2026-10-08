import type { AwardedManager, AwardedPlayer, GoalOfSeasonCandidate } from "@/types/awardTypes";

type T = (key: string, opts?: Record<string, unknown>) => string;

export type XiLine = "GK" | "DEF" | "MID" | "FWD";

const LINE_OF_SLOT: Record<string, XiLine> = {
  GK: "GK", LB: "DEF", CB: "DEF", RB: "DEF", CM: "MID", CAM: "MID", CDM: "MID", LW: "FWD", ST: "FWD", RW: "FWD",
};

/** Team of the season grouped by line (GK, DEF, MID, FWD), in slot order. */
export function xiLines(xi: AwardedPlayer[]): [XiLine, AwardedPlayer[]][] {
  const out: [XiLine, AwardedPlayer[]][] = [];
  for (const line of ["GK", "DEF", "MID", "FWD"] as const) {
    const ps = xi.filter((p) => (LINE_OF_SLOT[p.slot ?? ""] ?? "MID") === line);
    if (ps.length) out.push([line, ps]);
  }
  return out;
}

/** "34' against X · header" / "34' against X · from 27 yards". */
export function goalOfSeasonText(g: GoalOfSeasonCandidate, t: T): string {
  const how = g.header ? t("awards.goal.header") : t("awards.goal.distance", { yards: Math.round(g.distance) });
  return g.opponentName
    ? t("awards.goal.text", { player: g.playerName, minute: g.minute, opponent: g.opponentName, how })
    : t("awards.goal.textNoOpponent", { player: g.playerName, minute: g.minute, how });
}

/** "Finished 2nd, target 6th". */
export function managerResultText(m: AwardedManager, t: T): string {
  return t("awards.managerResult", { position: m.position, target: m.target });
}
