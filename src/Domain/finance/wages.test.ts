import { describe, expect, test } from "bun:test";
import { playerWeeklyWage, squadWeeklyWages, weeklyWage } from "@/Domain/finance/wages";
import { WAGE_CONFIG } from "@/Domain/finance/wageConfig";
import { Player } from "@/Domain/Player";
import type { RosterPlayer } from "@/types/playerTypes";

function makePlayer(overrides: Partial<RosterPlayer> = {}): RosterPlayer {
  return {
    id: "p1",
    name: "Test Player",
    age: 24,
    squadId: "sq1",
    preferredFoot: "right",
    positions: ["CM"],
    stats: {
      passing: 5, vision: 5, finishing: 5, dribbling: 5, speed: 5, acceleration: 5,
      tackling: 5, pressing: 5, stamina: 5, heading: 5, strength: 5, reflex: 5, jump: 5,
    },
    profile: { summary: "" } as RosterPlayer["profile"],
    ...overrides,
  };
}

describe("weeklyWage", () => {
  test("monotonic in rating", () => {
    for (let r = 0; r < 10; r += 0.5) expect(weeklyWage(r + 0.5)).toBeGreaterThanOrEqual(weeklyWage(r));
  });

  test("floor for youngsters / very low ratings", () => {
    expect(weeklyWage(0)).toBe(WAGE_CONFIG.FLOOR);
  });

  test("whole euros", () => expect(Number.isInteger(weeklyWage(6.3))).toBe(true));

  test("never below the floor at any rating", () => {
    for (let r = 0; r <= 10; r += 0.25) expect(weeklyWage(r)).toBeGreaterThanOrEqual(WAGE_CONFIG.FLOOR);
  });

  test("a top rating pays substantially more than a mid rating", () => {
    expect(weeklyWage(9)).toBeGreaterThan(weeklyWage(6) * 2);
  });
});

describe("playerWeeklyWage", () => {
  test("uses the same rating estimateWeeklyWage uses today (Player.overallAvg)", () => {
    const p = makePlayer();
    expect(playerWeeklyWage(p)).toBe(weeklyWage(Player.overallAvg(p)));
  });
});

describe("squadWeeklyWages", () => {
  test("sums every player's weekly wage", () => {
    const players = [makePlayer({ id: "a" }), makePlayer({ id: "b" })];
    const expected = playerWeeklyWage(players[0]!) + playerWeeklyWage(players[1]!);
    expect(squadWeeklyWages(players)).toBe(expected);
  });

  test("empty squad has zero wage bill", () => {
    expect(squadWeeklyWages([])).toBe(0);
  });
});
