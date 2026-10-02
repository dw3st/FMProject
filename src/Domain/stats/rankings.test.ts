import { describe, expect, test } from "bun:test";
import { buildCompetitionRankings } from "@/Domain/stats/rankings";
import { emptySeasonLog, type RosterPlayer, type Squad } from "@/types/playerTypes";

const player = (id: string, log: Partial<ReturnType<typeof emptySeasonLog>>): RosterPlayer =>
  ({ id, name: id, age: 25, positions: ["CM"], seasonLog: { ...emptySeasonLog(), ...log } }) as unknown as RosterPlayer;
const squad = (id: string, players: RosterPlayer[]): Squad =>
  ({ id, name: id.toUpperCase(), colors: ["#000", "#fff"], money: 0, players }) as Squad;

describe("buildCompetitionRankings", () => {
  const squads = [
    squad("a", [
      player("a1", { appearances: 10, goals: 8, assists: 1, avgRating: 7.5, cup: { appearances: 2, goals: 3, assists: 0 } }),
      player("a2", { appearances: 4, goals: 1, assists: 4, avgRating: 8 }),
    ]),
    squad("b", [player("b1", { appearances: 10, goals: 2, assists: 2, avgRating: 6.5, continental: { appearances: 3, goals: 2, assists: 1 } })]),
    squad("out", [player("o1", { appearances: 30, goals: 30, assists: 30, avgRating: 9 })]),
  ];

  test("league excludes cup and continental games and non-members", () => {
    const r = buildCompetitionRankings(squads, { kind: "league", clubIds: new Set(["a", "b"]) });
    expect(r.scorers.map((x) => [x.playerId, x.value])).toEqual([["a1", 5], ["a2", 1]]);
    expect(r.appearances[0]).toMatchObject({ playerId: "a1", value: 8 });
    expect(r.assists[0]?.playerId).toBe("a2");
  });

  test("world ranking (all leagues) combines every club with league-only numbers", () => {
    const r = buildCompetitionRankings(squads, { kind: "league", clubIds: new Set(["a", "b", "out"]) });
    expect(r.scorers.map((x) => [x.playerId, x.value])).toEqual([["o1", 30], ["a1", 5], ["a2", 1]]);
    expect(r.ratings[0]?.playerId).toBe("o1");
  });

  test("ratings need 5 league games", () => {
    const r = buildCompetitionRankings(squads, { kind: "league", clubIds: new Set(["a", "b"]) });
    expect(r.ratings.map((x) => x.playerId)).toEqual(["a1", "b1"]);
  });

  test("cup uses only cup counts and has no ratings", () => {
    const r = buildCompetitionRankings(squads, { kind: "cup", clubIds: new Set(["a", "b"]) });
    expect(r.scorers).toEqual([expect.objectContaining({ playerId: "a1", value: 3 })]);
    expect(r.ratings).toEqual([]);
  });

  test("continental uses continental counts", () => {
    const r = buildCompetitionRankings(squads, { kind: "continental", clubIds: new Set(["b"]) });
    expect(r.scorers[0]).toMatchObject({ playerId: "b1", value: 2, games: 3 });
  });

  test("caps at 20 rows", () => {
    const many = squad("a", Array.from({ length: 30 }, (_, i) => player(`p${i}`, { appearances: 5, goals: i + 1 })));
    expect(buildCompetitionRankings([many], { kind: "league", clubIds: new Set(["a"]) }).scorers).toHaveLength(20);
  });
});
