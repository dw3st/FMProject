import { describe, expect, test } from "bun:test";
import { addManagerAward, applyAwardBoost, awardKindsByPlayer, clearAwardBoost, withAwardsOnRows } from "@/Domain/awards/awardEffects";
import type { LeagueSeasonAwards } from "@/types/awardTypes";
import type { ManagerRecord } from "@/types/managerTypes";
import type { RosterPlayer } from "@/types/playerTypes";

function mk(id: string, extraRows = 0): RosterPlayer {
  const row = (season: string, partial = false) => ({
    season, squadId: "c1", clubName: "C1", league: "pl", apps: 30, goals: 0, assists: 0, avgRating: 7,
    cupApps: 0, cupGoals: 0, contApps: 0, contGoals: 0, yellowCards: 0, redCards: 0, injuries: 0, daysInjured: 0, titles: [],
    ...(partial ? { partial: true as const } : {}),
  });
  return {
    id, name: id, age: 26, positions: ["Forward"], stats: {},
    history: [...Array.from({ length: extraRows }, (_, i) => row(`202${i}-2${i + 1}`)), row("2026-27"), row("2026-27", true)],
  } as never;
}

describe("withAwardsOnRows", () => {
  test("adds the award to the closing row only (never the partial), no duplicate", () => {
    const p = mk("a", 1);
    const once = withAwardsOnRows(p, "pl", "2026-27", [{ kind: "best_player", league: "pl" }]);
    expect(once.history![1]!.awards).toEqual([{ kind: "best_player", league: "pl" }]);
    expect(once.history![0]!.awards).toBeUndefined();
    expect(once.history![2]!.awards).toBeUndefined();
    expect(withAwardsOnRows(once, "pl", "2026-27", [{ kind: "best_player", league: "pl" }])).toBe(once);
    const two = withAwardsOnRows(once, "pl", "2026-27", [{ kind: "team_of_season", league: "pl" }, { kind: "team_of_season", league: "pl" }]);
    expect(two.history![1]!.awards).toEqual([{ kind: "best_player", league: "pl" }, { kind: "team_of_season", league: "pl" }]);
  });
  test("no row of that league/season → same player", () => {
    const p = mk("a");
    expect(withAwardsOnRows(p, "other", "2026-27", [{ kind: "best_player", league: "other" }])).toBe(p);
  });
});

describe("award boost", () => {
  test("the largest multiplier, cleared at the next rollover of the league", () => {
    const p = applyAwardBoost(mk("a"), ["team_of_season", "top_scorer"], "pl", "2026-27");
    expect(p.awardBoost).toEqual({ season: "2026-27", league: "pl", mult: 1.12 });
    expect(clearAwardBoost(p).awardBoost).toBeUndefined();
    expect("awardBoost" in clearAwardBoost(p)).toBe(false);
    const plain = mk("b");
    expect(clearAwardBoost(plain)).toBe(plain);
  });
  test("an award without value bonus changes nothing", () => {
    const p = mk("a");
    expect(applyAwardBoost(p, ["goal_of_season", "best_manager"], "pl", "2026-27")).toBe(p);
    expect(applyAwardBoost(p, [], "pl", "2026-27")).toBe(p);
  });
  test("a later award never lowers the boost", () => {
    const best = applyAwardBoost(mk("a"), ["best_player"], "pl", "2026-27");
    expect(applyAwardBoost(best, ["team_of_season"], "pl", "2026-27").awardBoost!.mult).toBe(1.15);
  });
});

describe("manager awards", () => {
  test("once per season/kind/competition", () => {
    const ms: ManagerRecord[] = [{ id: "m", name: "m", squadId: "c", isPlayer: false, points: 0, seasons: 0, titles: [] }];
    const once = addManagerAward(ms, "m", { season: "2026-27", kind: "best_manager", competition: "pl", squadId: "c" });
    expect(once[0]!.awards).toHaveLength(1);
    expect(addManagerAward(once, "m", { season: "2026-27", kind: "best_manager", competition: "pl", squadId: "c" })).toBe(once);
    expect(addManagerAward(once, "x", { season: "2026-27", kind: "best_manager", competition: "pl", squadId: "c" })).toBe(once);
    expect(addManagerAward(once, "m", { season: "2027", kind: "world_manager", competition: "world", squadId: "c", year: 2027 })[0]!.awards).toHaveLength(2);
  });
});

describe("awardKindsByPlayer", () => {
  test("every player award of the league season; the manager award is not a player's", () => {
    const ap = (id: string) => ({ playerId: id, name: id, squadId: "c", clubName: "C", value: 7, leagueApps: 30 });
    const a: LeagueSeasonAwards = {
      league: "pl", season: "2026-27", closedOn: "2027-05-20", country: null, tier: 1, weight: 1,
      bestPlayer: ap("a"), youngPlayer: ap("b"), topScorer: ap("a"), bestGoalkeeper: ap("g"),
      teamOfSeason: [ap("a"), ap("g")],
      bestManager: { managerId: "m", name: "m", squadId: "c", clubName: "C", position: 1, target: 2, score: 0.4 },
      goalOfSeason: { key: "k", fixtureId: "f", date: "d", playerId: "z", playerName: "z", squadId: "c", opponentId: "o", minute: 1, header: true, distance: 9 },
      shortlist: { players: [], managers: [] },
    };
    const m = awardKindsByPlayer(a);
    expect(m.get("a")).toEqual(["best_player", "top_scorer", "team_of_season"]);
    expect(m.get("g")).toEqual(["best_goalkeeper", "team_of_season"]);
    expect(m.get("z")).toEqual(["goal_of_season"]);
    expect(m.has("m")).toBe(false);
  });
});
