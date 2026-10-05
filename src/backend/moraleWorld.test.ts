import { describe, expect, test } from "bun:test";
import { clubMatchSummary, marketAfterRequests } from "@/backend/moraleWorld";
import { emptyMarket } from "@/backend/negotiationWorld";
import type { MatchEvent } from "@/types/dayLogTypes";

describe("moraleWorld", () => {
  test("a manual listing is never flagged nor removed by a transfer request", () => {
    const m = { ...emptyMarket(), playerSellList: [{ playerId: "manual", priority: 1 }, { playerId: "asked", priority: 1, requested: true as const }] };
    const added = marketAfterRequests(m, ["manual", "new"], []);
    expect(added.playerSellList.find((c) => c.playerId === "manual")).toEqual({ playerId: "manual", priority: 1 });
    expect(added.playerSellList.find((c) => c.playerId === "new")?.requested).toBe(true);
    const removed = marketAfterRequests(added, [], ["manual", "asked"]);
    expect(removed.playerSellList.map((c) => c.playerId)).toEqual(["manual", "new"]);
  });

  test("minutes use the synthetic exits: sent off and injured without a sub stop the clock", () => {
    const stats = { passesAttempted: 0, passesCompleted: 0, passesFailed: 0, shots: 0, goals: 0, assists: 0, interceptions: 0, tackles: 0 };
    const event = {
      kind: "match", fixtureId: "f", competition: "x", round: 1, home: "h", away: "a",
      score: { home: 1, away: 0 }, teamStats: {} as MatchEvent["teamStats"],
      playerStats: { r: stats, i: stats, n: stats }, playerRatings: {}, playerNames: {},
      playerTeams: { r: "home", i: "home", n: "home" }, scorers: [], substitutions: [],
      injuries: [{ team: "home", playerId: "i", playerName: "i", severity: "light", matchMinute: 30, energy: 50 }],
      cards: [{ team: "home", playerId: "r", playerName: "r", card: "red", secondYellow: false, matchMinute: 60 }],
      developmentChanges: [], durationMs: 0,
    } as unknown as MatchEvent;
    const s = clubMatchSummary(event, "h")!;
    expect(s.result).toBe("W");
    expect(s.minutes).toEqual({ r: 60, i: 30, n: 90 });
  });
});
