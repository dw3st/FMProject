import { describe, expect, test } from "bun:test";
import { computeStars } from "@/Domain/world/stars";
import { emptySeasonLog, type PlayerStatsRecord, type RosterPlayer, type Squad } from "@/types/playerTypes";

const stats = (o: number): PlayerStatsRecord => ({
  passing: o, vision: o, finishing: o, dribbling: o, speed: o, acceleration: o, tackling: o,
  pressing: o, stamina: o, heading: o, strength: o, reflex: o, jump: o,
});

const player = (id: string, overall: number, age = 25, log: Partial<ReturnType<typeof emptySeasonLog>> = {}): RosterPlayer => ({
  id, name: id, age, squadId: "s", preferredFoot: "right", positions: ["CM"],
  stats: stats(overall), profile: { summary: "", archetype: "" }, seasonLog: { ...emptySeasonLog(), ...log },
});

const squad = (players: RosterPlayer[]): Squad => ({ id: "a", name: "a", colors: ["#000", "#fff"], money: 0, players });

describe("computeStars", () => {
  test("gold is the top 25 by overall, ties by id", () => {
    const players = Array.from({ length: 30 }, (_, i) => player(`p${String(i).padStart(2, "0")}`, 8));
    const stars = computeStars([squad(players)]);
    const gold = Object.entries(stars).filter(([, k]) => k === "gold").map(([id]) => id).sort();
    expect(gold).toEqual(players.slice(0, 25).map((p) => p.id));
  });

  test("blue needs rating >= 7.2 with >= 8 games; gold wins over blue", () => {
    const players = [
      player("top", 9, 25, { avgRating: 8, appearances: 20 }),
      ...Array.from({ length: 25 }, (_, i) => player(`f${i}`, 8)),
      player("form", 3, 28, { avgRating: 7.2, appearances: 8 }),
      player("fewGames", 3, 28, { avgRating: 9, appearances: 7 }),
      player("lowRating", 3, 28, { avgRating: 7.1, appearances: 30 }),
    ];
    const stars = computeStars([squad(players)]);
    expect(stars.top).toBe("gold");
    expect(stars.form).toBe("blue");
    expect(stars.fewGames).toBeUndefined();
    expect(stars.lowRating).toBeUndefined();
  });

  test("green: age <= 19 within the 30 best of that age group", () => {
    const young = Array.from({ length: 32 }, (_, i) => player(`y${String(i).padStart(2, "0")}`, 5 + i / 100, 18));
    const adults = Array.from({ length: 25 }, (_, i) => player(`ad${i}`, 9));
    const stars = computeStars([squad([...young, ...adults, player("old", 5, 20)])]);
    const green = Object.values(stars).filter((k) => k === "green").length;
    expect(green).toBe(30);
    expect(stars.y00).toBeUndefined();
    expect(stars.y31).toBe("green");
    expect(stars.old).toBeUndefined();
  });

  test("empty world", () => {
    expect(computeStars([])).toEqual({});
  });
});
