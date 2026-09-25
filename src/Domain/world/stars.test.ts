import { describe, expect, test } from "bun:test";
import { topPlayerIds } from "@/Domain/world/stars";
import type { PlayerStatsRecord, RosterPlayer, Squad } from "@/types/playerTypes";

const stats = (overall: number): PlayerStatsRecord => ({
  passing: overall, vision: overall, finishing: overall, dribbling: overall, speed: overall,
  acceleration: overall, tackling: overall, pressing: overall, stamina: overall, heading: overall,
  strength: overall, reflex: overall, jump: overall,
});

const player = (id: string, overall: number): RosterPlayer => ({
  id, name: id, age: 25, squadId: "s", preferredFoot: "right", positions: ["CM"],
  stats: stats(overall), profile: { summary: "", archetype: "" },
});

const squad = (id: string, players: RosterPlayer[]): Squad => ({
  id, name: id, colors: ["#000", "#fff"], money: 0, players,
});

describe("topPlayerIds", () => {
  test("orders by overall AVG descending", () => {
    const squads = [squad("a", [player("low", 4), player("high", 9)]), squad("b", [player("mid", 6)])];
    const ids = topPlayerIds(squads, 2);
    expect(ids).toEqual(new Set(["high", "mid"]));
  });

  test("ties break by id ascending", () => {
    const squads = [squad("a", [player("z", 7), player("a", 7), player("m", 7)])];
    const ids = topPlayerIds(squads, 2);
    expect(ids).toEqual(new Set(["a", "m"]));
  });

  test("caps at n even with many equally-rated players", () => {
    const players = Array.from({ length: 10 }, (_, i) => player(`p${i}`, 8));
    const squads = [squad("a", players)];
    expect(topPlayerIds(squads, 3).size).toBe(3);
    expect(topPlayerIds(squads, 50).size).toBe(10);
  });

  test("defaults n to 50", () => {
    const players = Array.from({ length: 60 }, (_, i) => player(`p${i}`, 5 + (i % 5)));
    const squads = [squad("a", players)];
    expect(topPlayerIds(squads).size).toBe(50);
  });

  test("empty squads yields an empty set", () => {
    expect(topPlayerIds([]).size).toBe(0);
  });
});
