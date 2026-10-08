import { describe, expect, test } from "bun:test";
import { awardsOfHistory } from "@/GameInterface/Awards/PlayerAwards";
import { goalOfSeasonText, xiLines } from "@/GameInterface/Awards/awardsText";
import type { AwardedPlayer, GoalOfSeasonCandidate } from "@/types/awardTypes";
import type { PlayerHistoryRow } from "@/types/playerTypes";

const row = (season: string, awards?: PlayerHistoryRow["awards"]): PlayerHistoryRow => ({
  season, squadId: "s", clubName: "C", league: "premier_league", apps: 30, goals: 0, assists: 0, avgRating: 7,
  cupApps: 0, cupGoals: 0, contApps: 0, contGoals: 0, yellowCards: 0, redCards: 0, injuries: 0, daysInjured: 0, titles: [],
  ...(awards ? { awards } : {}),
});

describe("awards screens helpers", () => {
  test("awardsOfHistory: most recent first, league + season or the world year", () => {
    const list = awardsOfHistory([
      row("2026-27", [{ kind: "team_of_season", league: "premier_league" }]),
      row("2027-28"),
      row("2028-29", [{ kind: "best_player", league: "premier_league" }, { kind: "world_player", year: 2029 }]),
    ], (slug) => slug.toUpperCase());
    expect(list.map((a) => [a.kind, a.title])).toEqual([
      ["world_player", "2029"], ["best_player", "PREMIER_LEAGUE 2028-29"], ["team_of_season", "PREMIER_LEAGUE 2026-27"],
    ]);
    expect(awardsOfHistory(undefined, (s) => s)).toEqual([]);
  });

  test("xiLines groups the 4-3-3 slots by line", () => {
    const p = (slot: string): AwardedPlayer => ({ playerId: slot + Math.random(), name: slot, squadId: "s", clubName: "C", value: 7, leagueApps: 30, slot });
    const xi = ["GK", "LB", "CB", "CB", "RB", "CM", "CM", "CAM", "LW", "ST", "RW"].map(p);
    expect(xiLines(xi).map(([l, ps]) => [l, ps.length])).toEqual([["GK", 1], ["DEF", 4], ["MID", 3], ["FWD", 3]]);
  });

  test("goal text: header or distance, with or without the opponent", () => {
    const t = (k: string, o?: Record<string, unknown>) => `${k}${o ? JSON.stringify(o) : ""}`;
    const g: GoalOfSeasonCandidate = {
      key: "k", fixtureId: "f", date: "2027-01-01", playerId: "p", playerName: "Ana", squadId: "s", opponentId: "o",
      minute: 34, header: false, distance: 27.4,
    };
    expect(goalOfSeasonText(g, t)).toContain("awards.goal.textNoOpponent");
    expect(goalOfSeasonText(g, t)).toContain('awards.goal.distance{\\"yards\\":27}');
    expect(goalOfSeasonText({ ...g, header: true, opponentName: "X" }, t)).toContain("awards.goal.text{");
  });
});
