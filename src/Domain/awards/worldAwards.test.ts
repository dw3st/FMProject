import { describe, expect, test } from "bun:test";
import { computeWorldAwards } from "@/Domain/awards/worldAwards";
import type { LeagueSeasonAwards } from "@/types/awardTypes";
import type { ManagerRecord } from "@/types/managerTypes";

function league(slug: string, weight: number, players: [string, number][], managers: [string, number][] = []): LeagueSeasonAwards {
  return {
    league: slug, season: "x", closedOn: "2027-05-01", country: null, tier: 1, weight, teamOfSeason: [],
    shortlist: {
      players: players.map(([id, s]) => ({ playerId: id, name: id, squadId: `c-${slug}`, clubName: "C", value: 7, leagueApps: 30, seasonScore: s })),
      managers: managers.map(([id, score]) => ({ managerId: id, name: id, squadId: `c-${slug}`, clubName: "C", position: 1, target: 3, score })),
    },
  };
}

function manager(id: string, titles: { on?: string; points: number }[]): ManagerRecord {
  return {
    id, name: id, squadId: "club", isPlayer: false, seasons: 1, points: titles.reduce((s, t) => s + t.points, 0),
    titles: titles.map((t) => ({ season: "2026-27", kind: "league" as const, competition: "pl", squadId: "club", points: t.points, ...(t.on ? { on: t.on } : {}) })),
  };
}

describe("computeWorldAwards", () => {
  test("world player: weight × (seasonScore − 5), two entries of the same player add up", () => {
    const w = computeWorldAwards({
      year: 2027, on: "2028-01-01",
      leagues: [league("pl", 1, [["a", 7.6], ["b", 7.5]]), league("ke", 0.2, [["c", 9.0]]), league("sw", 0.4, [["b", 7.4]])],
      managers: [],
    });
    expect(w.year).toBe(2027);
    expect(w.on).toBe("2028-01-01");
    expect(w.player[0]!.id).toBe("b"); // 2.5 + 0.96 > a's 2.6
    expect(w.player[0]!.league).toBe("pl"); // the larger share
    expect(w.player[0]!.score).toBeCloseTo(3.46);
    expect(w.player.map((p) => p.id)).toEqual(["b", "a", "c"]);
  });
  test("world manager: shortlist score × weight + title points of the year / 200", () => {
    const w = computeWorldAwards({
      year: 2027, on: "2028-01-01",
      leagues: [league("pl", 1, [], [["over", 0.5]]), league("fr", 0.8, [], [["champ", 0.3]])],
      managers: [
        manager("champ", [{ on: "2027-06-01", points: 150 }, { on: "2026-05-01", points: 100 }]),
        manager("cupOnly", [{ on: "2027-04-01", points: 50 }]),
        manager("old", [{ points: 300 }]),
      ],
    });
    // champ: 0.8 × 0.3 + 150 / 200 = 0.99; over: 0.5; cupOnly: 0.25; old: no dated title
    expect(w.manager.map((m) => m.id)).toEqual(["champ", "over", "cupOnly"]);
    expect(w.manager[0]!.score).toBeCloseTo(0.99);
  });
  test("empty year", () => {
    expect(computeWorldAwards({ year: 2027, on: "2028-01-01", leagues: [], managers: [] })).toEqual({ year: 2027, on: "2028-01-01", player: [], manager: [] });
  });
});
