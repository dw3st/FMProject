import { describe, expect, test } from "bun:test";
import { Player } from "@/Domain/Player";
import type { PlayerStatsRecord } from "@/types/playerTypes";

const stats = (over: Partial<PlayerStatsRecord>): PlayerStatsRecord => ({
  passing: 3, vision: 3, finishing: 3, dribbling: 3, speed: 3, acceleration: 3, tackling: 3,
  pressing: 3, stamina: 3, heading: 3, strength: 3, reflex: 1, jump: 1, ...over,
});

describe("Player.bestSpecificRole", () => {
  test("GK is always GK", () => {
    expect(Player.bestSpecificRole(stats({ reflex: 8 }), "GK")).toBe("GK");
  });
  test("a finisher forward fits ST", () => {
    expect(Player.bestSpecificRole(stats({ finishing: 9, heading: 8, strength: 8 }), "Forward")).toBe("ST");
  });
  test("accepts a detailed position and searches its main role", () => {
    const r = Player.bestSpecificRole(stats({ tackling: 9, heading: 9 }), "LB");
    expect(["CB", "LB", "RB", "LWB", "RWB"]).toContain(r);
  });
});

describe("Player.computeOverallAvg with a curated natural position", () => {
  const base = {
    id: "p", name: "P", age: 25, squadId: "s", preferredFoot: "left" as const, positions: ["Defender"],
    stats: stats({ tackling: 9, heading: 9, strength: 9, speed: 2, acceleration: 2 }),
    profile: {} as never,
  };
  test("uses the fixed role's score, not the best of the line", () => {
    const best = Player.computeOverallAvg(base);
    expect(best).toBeCloseTo(Player.weightedScore(base.stats, "CB"), 10);
    const rb = Player.computeOverallAvg({ ...base, naturalPosition: "RB" });
    expect(rb).toBeCloseTo(Player.weightedScore(base.stats, "RB"), 10);
    expect(rb).toBeLessThan(best);
  });
  test("a position outside the line is ignored", () => {
    expect(Player.computeOverallAvg({ ...base, naturalPosition: "ST" })).toBe(Player.computeOverallAvg(base));
  });
});
